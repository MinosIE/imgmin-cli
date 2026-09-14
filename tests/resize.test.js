import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { resizeImage, RESIZE_FITS } from '../src/compress.js';
import { makeTempDir, createNoisyImage, createSolidImage, readMetadata } from './helpers/images.js';

test('RESIZE_FITS: 与 sharp 支持的 fit 取值一致', () => {
  assert.deepEqual(RESIZE_FITS, ['cover', 'contain', 'fill', 'inside', 'outside']);
});

test('resizeImage: 按宽度等比缩放', async () => {
  const dir = makeTempDir();
  const src = await createNoisyImage(path.join(dir, 'src.jpg'), { width: 1200, height: 800 });
  const out = path.join(dir, 'out.jpg');

  const result = await resizeImage(src, out, { width: 600 });

  assert.equal(result.originalWidth, 1200);
  assert.equal(result.originalHeight, 800);
  assert.equal(result.width, 600);
  assert.equal(result.height, 400);
  assert.equal(result.resized, true);
  assert.ok(result.newSize > 0);

  const meta = await readMetadata(out);
  assert.equal(meta.width, 600);
  assert.equal(meta.height, 400);
});

test('resizeImage: 按高度等比缩放', async () => {
  const dir = makeTempDir();
  const src = await createNoisyImage(path.join(dir, 'src.jpg'), { width: 1200, height: 800 });
  const out = path.join(dir, 'out.jpg');

  const result = await resizeImage(src, out, { height: 200 });

  assert.equal(result.width, 300);
  assert.equal(result.height, 200);
});

test('resizeImage: 默认禁止放大（withoutEnlargement）', async () => {
  const dir = makeTempDir();
  const src = await createSolidImage(path.join(dir, 'small.jpg'), { width: 100, height: 80 });
  const out = path.join(dir, 'out.jpg');

  const result = await resizeImage(src, out, { width: 500 });

  assert.equal(result.width, 100);
  assert.equal(result.height, 80);
  assert.equal(result.resized, false, '尺寸未变化时应标记 resized=false');
});

test('resizeImage: fit=cover 输出精确尺寸', async () => {
  const dir = makeTempDir();
  const src = await createNoisyImage(path.join(dir, 'src.jpg'), { width: 1200, height: 800 });
  const out = path.join(dir, 'out.jpg');

  const result = await resizeImage(src, out, { width: 400, height: 400, fit: 'cover' });

  assert.equal(result.width, 400);
  assert.equal(result.height, 400);
});

test('resizeImage: 指定 quality/format 时重编码为目标格式', async () => {
  const dir = makeTempDir();
  const src = await createNoisyImage(path.join(dir, 'src.png'), { width: 800, height: 600, format: 'png' });
  const out = path.join(dir, 'out.webp');

  const result = await resizeImage(src, out, { width: 400, quality: 60, format: 'webp' });

  const meta = await readMetadata(out);
  assert.equal(meta.format, 'webp');
  assert.equal(meta.width, 400);
  assert.equal(result.resized, true);
});

test('resizeImage: 未指定 quality 时按扩展名推断输出格式', async () => {
  const dir = makeTempDir();
  const src = await createSolidImage(path.join(dir, 'src.png'), { width: 200, height: 100, format: 'png' });
  const out = path.join(dir, 'out.webp');

  await resizeImage(src, out, { width: 100 });

  const meta = await readMetadata(out);
  assert.equal(meta.format, 'webp');
  assert.equal(meta.width, 100);
});

test('resizeImage: 非法的宽高与 fit 会被拒绝', async () => {
  const dir = makeTempDir();
  const src = await createSolidImage(path.join(dir, 'src.jpg'));
  const out = path.join(dir, 'out.jpg');

  await assert.rejects(() => resizeImage(src, out, {}), /width or height is required/);
  await assert.rejects(() => resizeImage(src, out, { width: -5 }), /invalid width/);
  await assert.rejects(() => resizeImage(src, out, { width: 0 }), /invalid width/);
  await assert.rejects(() => resizeImage(src, out, { height: 0.5 }), /invalid height/);
  await assert.rejects(() => resizeImage(src, out, { width: 10, fit: 'nope' }), /invalid fit/);
});
