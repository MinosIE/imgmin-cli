import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  formatFileSize,
  calculateSavedPercent,
  isImageFile,
  analyzeCompressibility,
  getImageInfo,
  batchProcess,
  glob,
  ensureDir
} from '../src/utils.js';
import { makeTempDir, createSolidImage } from './helpers/images.js';

test('formatFileSize: 按单位换算', () => {
  assert.equal(formatFileSize(0), '0 B');
  assert.equal(formatFileSize(512), '512.00 B');
  assert.equal(formatFileSize(1024), '1.00 KB');
  assert.equal(formatFileSize(1024 * 1024), '1.00 MB');
});

test('calculateSavedPercent: 计算节省比例', () => {
  assert.equal(calculateSavedPercent(1000, 250), '75.0%');
  assert.equal(calculateSavedPercent(1000, 1000), '0.0%');
  assert.equal(calculateSavedPercent(1000, 1500), '-50.0%');
  assert.equal(calculateSavedPercent(0, 0), '0%');
});

test('isImageFile: 支持常见扩展名且忽略大小写', () => {
  for (const name of ['a.jpg', 'a.JPEG', 'a.png', 'a.webp', 'a.avif', 'a.svg', 'a.tiff']) {
    assert.equal(isImageFile(name), true, name);
  }
  for (const name of ['a.heic', 'a.txt', 'a.mp4', 'a']) {
    assert.equal(isImageFile(name), false, name);
  }
});

test('analyzeCompressibility: 大体积 PNG 判定为无损且建议转格式', () => {
  const analysis = analyzeCompressibility({ format: 'png', width: 100, height: 100, size: 20000 });

  assert.equal(analysis.isLossless, true);
  assert.equal(analysis.isPhoto, false);
  assert.equal(analysis.levelKey, 'lossless');
  assert.equal(analysis.canShrinkWithFormat, true);
  assert.equal(analysis.bpp, 16);
});

test('analyzeCompressibility: 已高度压缩的 JPEG 给出低建议质量', () => {
  const analysis = analyzeCompressibility({ format: 'jpeg', width: 1000, height: 1000, size: 50000 });

  assert.equal(analysis.isPhoto, true);
  assert.equal(analysis.levelKey, 'aggressive');
  assert.equal(analysis.suggestedQuality, 45);
  assert.equal(analysis.bpp, 0.4);
});

test('analyzeCompressibility: 高质量 JPEG 给出高建议质量', () => {
  const analysis = analyzeCompressibility({ format: 'jpeg', width: 1000, height: 1000, size: 1000000 });

  assert.equal(analysis.levelKey, 'high');
  assert.equal(analysis.suggestedQuality, 80);
});

test('analyzeCompressibility: 未知格式不给出建议质量', () => {
  const analysis = analyzeCompressibility({ format: 'unknownfmt', width: 10, height: 10, size: 100 });

  assert.equal(analysis.levelKey, 'unknown');
  assert.equal(analysis.suggestedQuality, null);
  assert.equal(analysis.canShrinkWithFormat, false);
});

test('getImageInfo: 返回尺寸与格式，文件不存在时抛错', async () => {
  const dir = makeTempDir();
  const file = await createSolidImage(path.join(dir, 'sample.png'), { width: 40, height: 30, format: 'png' });

  const info = await getImageInfo(file);

  assert.equal(info.fileName, 'sample.png');
  assert.equal(info.width, 40);
  assert.equal(info.height, 30);
  assert.equal(info.format, 'png');
  assert.ok(info.size > 0);

  await assert.rejects(() => getImageInfo(path.join(dir, 'missing.png')), /File not found/);
});

test('glob: 递归与非递归均支持花括号扩展名', async () => {
  const dir = makeTempDir();
  fs.mkdirSync(path.join(dir, 'sub'), { recursive: true });
  for (const name of ['a.jpg', 'b.png', 'c.txt']) {
    fs.writeFileSync(path.join(dir, name), '');
  }
  fs.writeFileSync(path.join(dir, 'sub', 'd.jpg'), '');

  const recursive = await glob(`${dir}/**/*.{jpg,png}`, { nodir: true });
  assert.equal(recursive.length, 3, `递归应匹配 3 个文件，实际 ${recursive.length}`);
  assert.ok(recursive.some(f => f.endsWith(path.join('sub', 'd.jpg'))));

  const flat = await glob(`${dir}/*.{jpg,png}`, { nodir: true });
  assert.equal(flat.length, 2, `非递归应匹配 2 个文件，实际 ${flat.length}`);

  const single = await glob(`${dir}/*.jpg`, { nodir: true });
  assert.equal(single.length, 1);
  assert.ok(single[0].endsWith('a.jpg'));
});

test('glob: 目录不存在时返回空数组', async () => {
  const result = await glob('/tmp/imgmin-not-exists-dir-xyz/**/*.jpg', { nodir: true });
  assert.deepEqual(result, []);
});

test('ensureDir: 递归创建目录', () => {
  const dir = makeTempDir();
  const nested = path.join(dir, 'x', 'y', 'z');

  ensureDir(nested);

  assert.equal(fs.existsSync(nested), true);
});

test('batchProcess: 并发受 concurrency 限制，且单个失败不中断', async () => {
  const items = [1, 2, 3, 4, 5, 6];
  let inFlight = 0;
  let peak = 0;

  const results = await batchProcess(items, async (n) => {
    inFlight++;
    peak = Math.max(peak, inFlight);
    try {
      await new Promise(resolve => setTimeout(resolve, 5));
      if (n === 3) throw new Error('boom-3');
      return n * 2;
    } finally {
      inFlight--;
    }
  }, { concurrency: 2 });

  assert.equal(results.length, 6);
  assert.equal(results.filter(r => r.status === 'fulfilled').length, 5);
  assert.equal(results.filter(r => r.status === 'rejected').length, 1);
  assert.ok(peak <= 2, `并发峰值 ${peak} 不应超过 2`);
  assert.equal(peak, 2, '并发峰值应达到 2');
});

test('batchProcess: parallel=false 时顺序执行', async () => {
  const order = [];

  await batchProcess([1, 2, 3], async (n) => {
    order.push(n);
    return n;
  }, { parallel: false });

  assert.deepEqual(order, [1, 2, 3]);
});
