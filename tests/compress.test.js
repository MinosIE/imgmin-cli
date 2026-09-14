import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import sharp from 'sharp';
import { compressImage, applyEncoder, isEncodableFormat } from '../src/compress.js';
import { makeTempDir, createNoisyImage, readMetadata, sizeOf, exists } from './helpers/images.js';

test('compressImage: 按输出扩展名推断格式并落盘', async () => {
  const dir = makeTempDir();
  const src = await createNoisyImage(path.join(dir, 'src.jpg'), { width: 200, height: 150 });
  const out = path.join(dir, 'out.webp');

  const result = await compressImage(src, out, { quality: 70 });

  assert.equal(result.input, src);
  assert.equal(result.output, out);
  assert.ok(result.originalSize > 0);
  assert.ok(result.compressedSize > 0);

  const meta = await readMetadata(out);
  assert.equal(meta.format, 'webp');
});

test('compressImage: 自动创建不存在的输出目录', async () => {
  const dir = makeTempDir();
  const src = await createNoisyImage(path.join(dir, 'src.jpg'));
  const out = path.join(dir, 'nested', 'deep', 'out.jpg');

  await compressImage(src, out, { quality: 80 });

  assert.ok(exists(out));
});

test('compressImage: 质量越低产物体积越小', async () => {
  const dir = makeTempDir();
  const src = await createNoisyImage(path.join(dir, 'photo.jpg'), { width: 256, height: 256 });

  const low = path.join(dir, 'low.jpg');
  const high = path.join(dir, 'high.jpg');
  await compressImage(src, low, { quality: 20 });
  await compressImage(src, high, { quality: 95 });

  assert.ok(sizeOf(low) < sizeOf(high), `期望 q20(${sizeOf(low)}) < q95(${sizeOf(high)})`);
});

test('applyEncoder: 质量越界被夹取到 1-100 且不抛错', async () => {
  const dir = makeTempDir();
  const src = await createNoisyImage(path.join(dir, 'src.jpg'));

  const tooLow = path.join(dir, 'too-low.jpg');
  await applyEncoder(sharp(src), 'jpeg', 0).toFile(tooLow);
  assert.ok(exists(tooLow));

  const tooHigh = path.join(dir, 'too-high.jpg');
  await applyEncoder(sharp(src), 'jpeg', 999).toFile(tooHigh);
  assert.ok(exists(tooHigh));

  // 非法 quality 回落到默认 80，而不是 NaN 导致 sharp 报错
  const invalid = path.join(dir, 'invalid.jpg');
  await applyEncoder(sharp(src), 'jpeg', Number.NaN).toFile(invalid);
  assert.ok(exists(invalid));
});

test('isEncodableFormat: 只接受可编码的输出格式', () => {
  for (const format of ['jpeg', 'jpg', 'png', 'webp', 'avif', 'tiff', 'gif']) {
    assert.equal(isEncodableFormat(format), true, `${format} 应为可编码格式`);
  }

  for (const format of ['heic', 'heif', 'bmp', 'svg', '', undefined, null]) {
    assert.equal(isEncodableFormat(format), false, `${format} 不应被视为可编码格式`);
  }
});
