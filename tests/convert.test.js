import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { convertImage, convertToWebp, convertToPng } from '../src/convert.js';
import { makeTempDir, createSolidImage, createNoisyImage, readMetadata, exists } from './helpers/images.js';

test('convertImage: png → jpeg 返回字段与输出格式正确', async () => {
  const dir = makeTempDir();
  const src = await createNoisyImage(path.join(dir, 'in.png'), { width: 120, height: 90, format: 'png' });
  const out = path.join(dir, 'out.jpg');

  const result = await convertImage(src, out, { format: 'jpeg', quality: 80 });

  assert.equal(result.input, src);
  assert.equal(result.output, out);
  assert.equal(result.format, 'jpeg');
  assert.ok(result.originalSize > 0);
  assert.ok(result.convertedSize > 0);
  assert.equal(Number.isNaN(Number(result.savedPercent)), false, 'savedPercent 应可转成数字');

  const meta = await readMetadata(out);
  assert.equal(meta.format, 'jpeg');
});

test('convertImage: 目标格式由 output 扩展名推断', async () => {
  const dir = makeTempDir();
  const src = await createSolidImage(path.join(dir, 'in.jpg'), { width: 80, height: 60 });
  const out = path.join(dir, 'out.webp');

  const result = await convertImage(src, out, {});

  assert.equal(result.format, 'webp');
  assert.ok(exists(out));
});

test('convertImage: 不支持的格式抛错', async () => {
  const dir = makeTempDir();
  const src = await createSolidImage(path.join(dir, 'in.jpg'));
  const out = path.join(dir, 'out.bmp');

  await assert.rejects(() => convertImage(src, out, { format: 'bmp' }), /Unsupported format/);
});

test('便捷函数 convertToWebp / convertToPng 写入预期格式', async () => {
  const dir = makeTempDir();
  const src = await createNoisyImage(path.join(dir, 'in.jpg'), { width: 100, height: 100 });

  const webpPath = path.join(dir, 'a.webp');
  const webpResult = await convertToWebp(src, webpPath, { quality: 60 });
  assert.equal(webpResult.format, 'webp');
  assert.equal((await readMetadata(webpPath)).format, 'webp');

  const pngPath = path.join(dir, 'b.png');
  const pngResult = await convertToPng(src, pngPath, {});
  assert.equal(pngResult.format, 'png');
  assert.equal((await readMetadata(pngPath)).format, 'png');
});
