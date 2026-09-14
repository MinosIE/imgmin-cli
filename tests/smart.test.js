import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { analyzeImage, smartSuggest, findOptimalQuality } from '../src/smart.js';
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
