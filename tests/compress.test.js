import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import sharp from 'sharp';
import { compressImage, compressImageToWebp, applyEncoder, isEncodableFormat } from '../src/compress.js';
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

test('compressImage: 默认保留元数据，keepMetadata=false(--strip) 移除元数据', async () => {
  const dir = makeTempDir();
  const src = path.join(dir, 'src.jpg');
  // 源图嵌入 density=300 元数据
  await sharp({ create: { width: 64, height: 64, channels: 3, background: { r: 9, g: 18, b: 27 } } })
    .withMetadata({ density: 300 })
    .jpeg()
    .toFile(src);

  const outKeep = path.join(dir, 'keep.jpg');
  const outStrip = path.join(dir, 'strip.jpg');
  await compressImage(src, outKeep, { quality: 80, format: 'jpeg' });
  await compressImage(src, outStrip, { quality: 80, format: 'jpeg', keepMetadata: false });

  const mKeep = await readMetadata(outKeep);
  const mStrip = await readMetadata(outStrip);
  assert.equal(mKeep.density, 300, 'keepMetadata 应保留 density');
  assert.notEqual(mStrip.density, 300, 'keepMetadata=false 应移除 density');
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

test('applyEncoder: WebP 无损编码不抛错且产出 WebP', async () => {
  const dir = makeTempDir();
  const src = await createNoisyImage(path.join(dir, 'src.jpg'), { width: 200, height: 200 });

  const losslessOut = path.join(dir, 'lossless.webp');
  await applyEncoder(sharp(src), 'webp', 80, { lossless: true }).toFile(losslessOut);
  const meta = await readMetadata(losslessOut);
  assert.equal(meta.format, 'webp');
  assert.ok(sizeOf(losslessOut) > 0);
});

test('compressImage: lossless 透传到 WebP 编码', async () => {
  const dir = makeTempDir();
  const src = await createNoisyImage(path.join(dir, 'photo.jpg'), { width: 256, height: 256 });

  const lossy = path.join(dir, 'lossy.webp');
  const lossless = path.join(dir, 'lossless.webp');
  await compressImage(src, lossy, { quality: 80 });
  await compressImage(src, lossless, { quality: 80, lossless: true });

  // 无损保留全部像素，通常体积不小于有损（同尺寸噪声图）
  assert.ok(sizeOf(lossless) >= sizeOf(lossy), `期望无损(${sizeOf(lossless)}) ≥ 有损(${sizeOf(lossy)})`);
});

test('compressImageToWebp: lossless 参数生成 WebP', async () => {
  const dir = makeTempDir();
  const src = await createNoisyImage(path.join(dir, 's.jpg'));
  const out = path.join(dir, 'out.webp');
  await compressImageToWebp(src, out, 80, true);
  assert.equal((await readMetadata(out)).format, 'webp');
});
