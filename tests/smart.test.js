import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import fs from 'node:fs';
import sharp from 'sharp';
import { analyzeImage, smartSuggest, findOptimalQuality, butteraugliDistance, toLabPlanes } from '../src/smart.js';
import { makeTempDir, createSolidImage, createNoisyImage, createAlphaImage } from './helpers/images.js';

const SUPPORTED_FORMATS = ['webp', 'png', 'avif'];

test('analyzeImage: 纯色图走「纯色」分支推荐 webp', async () => {
  const dir = makeTempDir();
  const file = await createSolidImage(path.join(dir, 'flat.png'), {
    width: 128,
    height: 128,
    format: 'png',
    color: { r: 20, g: 140, b: 240 }
  });

  const analysis = await analyzeImage(file);

  assert.equal(analysis.format, 'webp');
  assert.equal(analysis.hasAlpha, false);
  assert.equal(analysis.isPhoto, false);
  assert.ok(analysis.colorfulness < 60, `纯色图 colorfulness=${analysis.colorfulness} 应小于 60`);
  assert.equal(analysis.width, 128);
  assert.equal(analysis.height, 128);
  assert.ok(analysis.size > 0);
});

test('analyzeImage: 高频富彩内容判定为照片并推荐 avif', async () => {
  const dir = makeTempDir();
  const file = await createNoisyImage(path.join(dir, 'photo.jpg'), { width: 256, height: 256 });

  const analysis = await analyzeImage(file);

  assert.equal(analysis.isPhoto, true);
  assert.equal(analysis.format, 'avif');
  assert.ok(analysis.avgEdge > 18);
});

test('analyzeImage: 带透明通道时 hasAlpha 为 true 且推荐 webp', async () => {
  const dir = makeTempDir();
  const file = await createAlphaImage(path.join(dir, 'alpha.png'), { width: 64, height: 64 });

  const analysis = await analyzeImage(file);

  assert.equal(analysis.hasAlpha, true);
  assert.equal(analysis.format, 'webp');
});

test('smartSuggest: 返回结构完整且质量落在合法区间', async () => {
  const dir = makeTempDir();
  const file = await createSolidImage(path.join(dir, 'flat.png'), { width: 128, height: 128, format: 'png' });

  const suggestion = await smartSuggest(file, { metric: 'ssim' });

  assert.ok(SUPPORTED_FORMATS.includes(suggestion.format), `意外格式 ${suggestion.format}`);
  assert.ok(suggestion.quality >= 1 && suggestion.quality <= 82, `quality=${suggestion.quality} 应在 1-82 之间`);
  assert.equal(suggestion.qualityMetric, 'ssim');
  assert.equal(typeof suggestion.qualityScore, 'number');
  assert.ok(suggestion.compressedSize > 0);
  assert.ok(suggestion.originalSize > 0);
  assert.equal(suggestion.size, suggestion.originalSize, 'size 与 originalSize 应一致（CLI 依赖 originalSize）');
  assert.equal(typeof suggestion.savedPercent, 'string');
  assert.ok(suggestion.reason.length > 0);
});

test('findOptimalQuality: 支持 butteraugli 指标并返回指标名', async () => {
  const dir = makeTempDir();
  const file = await createNoisyImage(path.join(dir, 'photo.jpg'), { width: 128, height: 128 });

  const result = await findOptimalQuality(file, { format: 'webp', metric: 'butteraugli' });

  assert.equal(result.metric, 'butteraugli');
  assert.ok(result.quality >= 1 && result.quality <= 82);
  assert.equal(typeof result.score, 'number');
  assert.ok(result.compressedSize > 0);

  // savedPercent 应与 originalSize / compressedSize 自洽
  const expected = Number(((result.originalSize - result.compressedSize) / result.originalSize * 100).toFixed(1));
  assert.equal(Number(result.savedPercent), expected);
});

test('butteraugli: 相同图距离≈0，低质量距离 > 高质量距离（CIELAB 多尺度加权）', async () => {
  const dir = makeTempDir();
  const file = await createNoisyImage(path.join(dir, 'photo.png'), { width: 96, height: 96 });
  const orig = await toLabPlanes(fs.readFileSync(file));

  const lowQ = await sharp(fs.readFileSync(file)).webp({ quality: 20 }).toBuffer();
  const highQ = await sharp(fs.readFileSync(file)).webp({ quality: 90 }).toBuffer();

  const dSame = butteraugliDistance(orig, orig);
  const dLow = butteraugliDistance(orig, await toLabPlanes(lowQ));
  const dHigh = butteraugliDistance(orig, await toLabPlanes(highQ));

  assert.ok(Math.abs(dSame) < 1e-6, `相同图距离应≈0，实际 ${dSame}`);
  assert.ok(dLow > dHigh, `低质量距离(${dLow.toFixed(3)}) 应大于高质量(${dHigh.toFixed(3)})`);
  assert.ok(dHigh >= 0 && dLow >= 0, '距离应非负');
  // 量纲标定：高质量压缩应处于「几乎无感」区间（<1.2），重度压缩应明显更大
  assert.ok(dHigh < 1.2, `高质量 webp 距离应 < 1.2（达标），实际 ${dHigh.toFixed(3)}`);
  assert.ok(dLow > dHigh * 1.5, `重度压缩距离应显著大于高质量，实际 low=${dLow.toFixed(3)} high=${dHigh.toFixed(3)}`);
});
