import fs from 'fs';
import os from 'os';
import path from 'path';
import sharp from 'sharp';

export const repoRoot = path.resolve(import.meta.dirname, '..', '..');
export const cliPath = path.join(repoRoot, 'bin', 'cli.js');

/**
 * 创建一次性临时目录
 * @param {string} [prefix] - 目录名前缀
 * @returns {string} 临时目录绝对路径
 */
export function makeTempDir(prefix = 'imgmin-test-') {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

/**
 * 按目标格式套用编码参数
 * @param {import('sharp').Sharp} pipeline - sharp 实例
 * @param {string} format - 目标格式
 * @param {number} quality - 质量
 * @returns {import('sharp').Sharp}
 */
export function encode(pipeline, format = 'jpeg', quality = 90) {
  switch (String(format).toLowerCase()) {
    case 'png': return pipeline.png();
    case 'webp': return pipeline.webp({ quality });
    case 'avif': return pipeline.avif({ quality });
    case 'gif': return pipeline.gif();
    default: return pipeline.jpeg({ quality });
  }
}

/**
 * 生成纯色图片
 * @param {string} filePath - 输出路径
 * @param {Object} [options] - width/height/format/quality/color
 * @returns {Promise<string>} 输出路径
 */
export async function createSolidImage(filePath, options = {}) {
  const {
    width = 128,
    height = 96,
    format = 'jpeg',
    quality = 90,
    color = { r: 200, g: 100, b: 50 }
  } = options;

  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const pipeline = sharp({ create: { width, height, channels: 3, background: color } });
  await encode(pipeline, format, quality).toFile(filePath);
  return filePath;
}

/**
 * 生成随机噪声图片（模拟照片：高频细节 + 丰富色彩）
 * @param {string} filePath - 输出路径
 * @param {Object} [options] - width/height/format/quality
 * @returns {Promise<string>} 输出路径
 */
export async function createNoisyImage(filePath, options = {}) {
  const { width = 256, height = 256, format = 'jpeg', quality = 90 } = options;
  const channels = 3;

  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const buffer = Buffer.alloc(width * height * channels);
  for (let i = 0; i < buffer.length; i++) {
    buffer[i] = Math.floor(Math.random() * 256);
  }

  const pipeline = sharp(buffer, { raw: { width, height, channels } });
  await encode(pipeline, format, quality).toFile(filePath);
  return filePath;
}

/**
 * 生成带透明通道的 PNG（整图半透明 + 平滑渐变，细节少、颜色集中）
 * @param {string} filePath - 输出路径
 * @param {Object} [options] - width/height
 * @returns {Promise<string>} 输出路径
 */
export async function createAlphaImage(filePath, options = {}) {
  const { width = 64, height = 64 } = options;
  const channels = 4;

  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const buffer = Buffer.alloc(width * height * channels);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * channels;
      buffer[i] = 100 + Math.round((x / width) * 40);
      buffer[i + 1] = 100 + Math.round((y / height) * 40);
      buffer[i + 2] = 150;
      buffer[i + 3] = 128; // 半透明：全部像素 alpha < 250
    }
  }

  await sharp(buffer, { raw: { width, height, channels } }).png().toFile(filePath);
  return filePath;
}

/**
 * 读取图片元信息
 * @param {string} filePath - 图片路径
 * @returns {Promise<import('sharp').Metadata>}
 */
export function readMetadata(filePath) {
  return sharp(filePath).metadata();
}

/**
 * 文件字节数
 * @param {string} filePath - 文件路径
 * @returns {number}
 */
export function sizeOf(filePath) {
  return fs.statSync(filePath).size;
}

/**
 * 文件是否存在
 * @param {string} filePath - 文件路径
 * @returns {boolean}
 */
export function exists(filePath) {
  return fs.existsSync(filePath);
}
