import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { cliPath, repoRoot, makeTempDir, createNoisyImage, readMetadata, exists } from './helpers/images.js';

const ANSI_PATTERN = /\u001b\[[0-9;]*m/g;

/**
 * 以子进程方式运行 CLI
 * @param {string[]} args - CLI 参数
 * @param {Object} [options] - cwd / env 覆盖
 * @returns {string} stdout（已去除 ANSI 颜色码）
 */
function runCli(args, options = {}) {
  const stdout = execFileSync(process.execPath, [cliPath, ...args], {
    encoding: 'utf-8',
    cwd: options.cwd || repoRoot,
    env: { ...process.env, ...(options.env || {}) },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  return stdout.replace(ANSI_PATTERN, '');
}

test('CLI: --help 列出全部子命令', () => {
  const out = runCli(['--help']);

  for (const command of ['compress', 'smart', 'webp', 'avif', 'convert', 'resize', 'info', 'ui', 'config']) {
    assert.ok(out.includes(command), `--help 应包含 ${command}`);
  }
});

test('CLI: resize --help 暴露宽高/fit/并发选项', () => {
  const out = runCli(['resize', '--help']);

  for (const option of ['--width', '--height', '--fit', '--quality', '--concurrency', '--force']) {
    assert.ok(out.includes(option), `resize --help 应包含 ${option}`);
  }
});

test('CLI: resize 未指定宽高时以非零码退出', () => {
  assert.throws(
    () => runCli(['resize', 'whatever.jpg']),
    err => {
      assert.equal(err.status, 1);
      return true;
    }
  );
});

test('CLI: resize 单文件生成 _resized 副本且保留原图', async () => {
  const dir = makeTempDir();
  const src = path.join(dir, 'photo.jpg');
  await createNoisyImage(src, { width: 800, height: 600 });

  const out = runCli(['resize', src, '-w', '400']);

  const resized = path.join(dir, 'photo_resized.jpg');
  assert.ok(exists(resized), `应生成 ${resized}`);
  assert.equal(exists(src), true, '原图必须保留');

  const meta = await readMetadata(resized);
  assert.equal(meta.width, 400);
  assert.equal(meta.height, 300);
  assert.ok(out.includes('400×300'), `输出应包含新尺寸，实际：${out}`);
});

test('CLI: resize 目录批量并生效 -j 并发', async () => {
  const dir = makeTempDir();
  await createNoisyImage(path.join(dir, 'a.jpg'), { width: 800, height: 600 });
  await createNoisyImage(path.join(dir, 'b.jpg'), { width: 600, height: 400 });

  const out = runCli(['resize', dir, '-w', '200', '-j', '2']);

  assert.ok(out.includes('Resized 2 files'), `应处理 2 个文件，实际：${out}`);
  for (const name of ['a_resized.jpg', 'b_resized.jpg']) {
    assert.ok(exists(path.join(dir, name)), `应生成 ${name}`);
  }
});

test('CLI: resize 目标大于原图时跳过，不放大也不产生副本', async () => {
  const dir = makeTempDir();
  const src = path.join(dir, 'small.jpg');
  await createNoisyImage(src, { width: 120, height: 90 });

  const out = runCli(['resize', src, '-w', '2000']);

  assert.ok(out.includes('Skipped'), `应提示跳过，实际：${out}`);
  assert.equal(exists(path.join(dir, 'small_resized.jpg')), false);
});

test('CLI: resize --force 原地替换且尺寸生效', async () => {
  const dir = makeTempDir();
  const src = path.join(dir, 'photo.jpg');
  await createNoisyImage(src, { width: 800, height: 600 });

  runCli(['resize', src, '-w', '300', '--force']);

  const meta = await readMetadata(src);
  assert.equal(meta.width, 300);
  assert.equal(meta.height, 225);
  assert.equal(exists(path.join(dir, 'photo_resized.jpg')), false, '--force 不应留下副本');
});

test('CLI: compress -j 并发处理目录', async () => {
  const dir = makeTempDir();
  await createNoisyImage(path.join(dir, 'a.jpg'), { width: 400, height: 300 });
  await createNoisyImage(path.join(dir, 'b.jpg'), { width: 400, height: 300 });

  const out = runCli(['compress', dir, '-q', '40', '-j', '2', '--no-webp']);

  assert.ok(out.includes('Compressed 2 files'), `应压缩 2 个文件，实际：${out}`);
  assert.ok(exists(path.join(dir, 'a_compressed.jpg')));
  assert.ok(exists(path.join(dir, 'b_compressed.jpg')));
  assert.equal(exists(path.join(dir, 'a.webp')), false, '--no-webp 不应生成 WebP');
});

test('CLI: config 在隔离的 HOME 下读写 ~/.imgminrc', () => {
  const home = makeTempDir('imgmin-home-');
  const env = { HOME: home, USERPROFILE: home };

  const setOut = runCli(['config', 'quality', '88'], { env });
  assert.ok(setOut.includes('88'), `应提示写入成功，实际：${setOut}`);

  const rcPath = path.join(home, '.imgminrc');
  assert.ok(exists(rcPath), `应生成 ${rcPath}`);
  assert.equal(JSON.parse(fs.readFileSync(rcPath, 'utf-8')).quality, 88);

  const getOut = runCli(['config', 'quality'], { env });
  assert.ok(getOut.includes('88'), `应回读 88，实际：${getOut}`);
});
