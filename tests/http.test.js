import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import net from 'node:net';
import path from 'path';
import { execFile } from 'node:child_process';
import { cliPath, repoRoot, makeTempDir, createNoisyImage } from './helpers/images.js';

const SERVER_READY_TIMEOUT_MS = 15000;
const SERVER_STOP_TIMEOUT_MS = 5000;

/** 借系统分配一个空闲端口（短暂监听后释放，碰撞概率极低） */
function getFreePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.on('error', reject);
    srv.listen(0, () => {
      const port = srv.address().port;
      srv.close(() => resolve(port));
    });
  });
}

function startServer(port) {
  // IMGMIN_NO_BROWSER=1 避免测试期间弹浏览器
  return execFile(process.execPath, [cliPath, 'ui', '-p', String(port)], {
    cwd: repoRoot,
    env: { ...process.env, IMGMIN_NO_BROWSER: '1' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

async function waitForServer(base) {
  const deadline = Date.now() + SERVER_READY_TIMEOUT_MS;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(base + '/');
      if (res.ok) return;
    } catch {}
    await new Promise(r => setTimeout(r, 100));
  }
  throw new Error(`UI server did not become ready at ${base}`);
}

function stopServer(child) {
  return new Promise(resolve => {
    if (!child || child.killed) return resolve();
    child.kill('SIGTERM');
    const timer = setTimeout(() => {
      try { child.kill('SIGKILL'); } catch {}
      resolve();
    }, SERVER_STOP_TIMEOUT_MS);
    child.on('exit', () => { clearTimeout(timer); resolve(); });
  });
}

function fileBlob(filePath, type) {
  return new Blob([fs.readFileSync(filePath)], { type });
}

let base;
let child;
const state = { child: null, dir: null, compressedPath: null };

test.before(async () => {
  const port = await getFreePort();
  base = `http://localhost:${port}`;
  child = startServer(port);
  state.child = child;
  await waitForServer(base);

  state.dir = makeTempDir('imgmin-http-');
  await createNoisyImage(path.join(state.dir, 'photo.jpg'), { width: 400, height: 300 });
});

test.after(async () => {
  await stopServer(child);
});

test('GET / 返回 UI 页面', async () => {
  const res = await fetch(base + '/');
  assert.equal(res.status, 200);
  const text = await res.text();
  assert.ok(text.length > 0, '首页不应为空');
});

test('POST /api/info 返回尺寸/格式与压缩潜力', async () => {
  const fd = new FormData();
  fd.append('image', fileBlob(path.join(state.dir, 'photo.jpg'), 'image/jpeg'), 'photo.jpg');

  const res = await fetch(base + '/api/info', { method: 'POST', body: fd });
  assert.equal(res.status, 200, 'info 应返回 200');
  const info = await res.json();

  assert.equal(info.fileName, 'photo.jpg');
  assert.equal(info.width, 400);
  assert.equal(info.height, 300);
  assert.equal(info.format, 'jpeg');
  assert.ok(info.analysis && typeof info.analysis.suggestedQuality === 'number', '应附带压缩潜力分析');
});

test('POST /api/compress 压缩并产出可下载文件', async () => {
  const fd = new FormData();
  fd.append('images', fileBlob(path.join(state.dir, 'photo.jpg'), 'image/jpeg'), 'photo.jpg');
  fd.append('quality', '60');
  fd.append('formats', 'webp');

  const res = await fetch(base + '/api/compress', { method: 'POST', body: fd });
  assert.equal(res.status, 200, 'compress 应返回 200');
  const body = await res.json();
  const result = body.results[0];

  assert.equal(result.success, true);
  assert.equal(result.format, 'webp');
  assert.equal(result.originalName, 'photo.jpg');
  assert.ok(result.downloadUrl.startsWith('/api/download/'), `downloadUrl=${result.downloadUrl}`);

  // 下载产物并校验是图片
  const dl = await fetch(base + result.downloadUrl);
  assert.equal(dl.status, 200);
  assert.ok((dl.headers.get('content-type') || '').startsWith('image/'));
  const buf = Buffer.from(await dl.arrayBuffer());
  assert.ok(buf.length > 0, '下载产物不应为空');

  state.compressedPath = result.outputPath;
});

test('POST /api/smart-analyze 对已有产物给出格式建议', async () => {
  assert.ok(state.compressedPath, '前置用例应生成 compressed 产物');

  const res = await fetch(base + '/api/smart-analyze', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ files: [path.basename(state.compressedPath)], metric: 'ssim' }),
  });
  assert.equal(res.status, 200, 'smart-analyze 应返回 200');
  const body = await res.json();
  const suggestion = body.suggestions[0];

  assert.equal(suggestion.filename, path.basename(state.compressedPath));
  assert.ok(!suggestion.error, `smart-analyze 应成功，实际: ${suggestion.error}`);
  assert.ok(['webp', 'png', 'avif'].includes(suggestion.format));
  assert.equal(typeof suggestion.quality, 'number');
});

test('POST /api/download-zip 打包产物为 zip', async () => {
  assert.ok(state.compressedPath, '前置用例应生成 compressed 产物');

  const res = await fetch(base + '/api/download-zip', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ files: [path.basename(state.compressedPath)] }),
  });
  assert.equal(res.status, 200, 'download-zip 应返回 200');
  assert.ok((res.headers.get('content-type') || '').includes('zip'));
  const buf = Buffer.from(await res.arrayBuffer());
  assert.equal(buf[0], 0x50); // 'P'
  assert.equal(buf[1], 0x4b); // 'K'
});
