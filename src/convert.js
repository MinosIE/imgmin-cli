import sharp from 'sharp';
import fs from 'fs';
import path from 'path';
import { compressImageMaxSize, losslessNoteFor, applyMeta, applyTransforms } from './compress.js';

/**
 * 图片格式转换
 * @param {string} inputPath - 输入文件路径
 * @param {string} outputPath - 输出文件路径
 * @param {Object} options - 转换选项
 * @param {string} options.format - 目标格式 (jpeg, png, webp, avif)
 * @param {number} options.quality - 质量 (1-100)
 * @param {boolean} [options.lossless] - 无损编码（WebP/AVIF/TIFF；PNG 拉满压缩级别；JPEG 退回最高质量）
 * @param {number} [options.maxSize] - 目标体积（字节），指定后二分搜索最高质量使产物 ≤ 该体积
 */
export async function convertImage(inputPath, outputPath, options = {}) {
  const { format, quality = 80, lossless = false, maxSize, keepMetadata = true, rotateExif = false } = options;
  
  // 确保输出目录存在
  const outputDir = path.dirname(outputPath);
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }
  
  // 确定目标格式
  const targetFormat = format || path.extname(outputPath).toLowerCase().replace('.', '');
  
  // 目标体积优先：二分搜索最高质量使产物 ≤ maxSize
  if (maxSize && maxSize > 0 && !lossless) {
    const res = await compressImageMaxSize(inputPath, outputPath, { format: targetFormat, targetBytes: maxSize, lossless, keepMetadata, rotateExif });
    return {
      input: inputPath,
      output: outputPath,
      format: targetFormat,
      originalSize: res.originalSize,
      compressedSize: res.compressedSize,
      quality: res.quality,
      metTarget: res.metTarget,
      savedPercent: ((res.originalSize - res.compressedSize) / res.originalSize * 100).toFixed(1)
    };
  }
  
  let pipeline = applyTransforms(sharp(inputPath), { rotateExif });
  pipeline = applyMeta(pipeline, { keepMetadata });
  
  switch (targetFormat) {
    case 'jpeg':
    case 'jpg':
      pipeline = pipeline.jpeg({ 
        quality: lossless ? 100 : Math.min(100, Math.max(1, quality)),
        mozjpeg: true 
      });
      break;
    case 'png':
      pipeline = pipeline.png({ 
        compressionLevel: lossless ? 9 : Math.floor((100 - quality) / 10),
        palette: quality < 80 
      });
      break;
    case 'webp':
      pipeline = pipeline.webp(lossless ? { lossless: true } : { quality });
      break;
    case 'avif':
      pipeline = pipeline.avif(lossless ? { lossless: true } : { quality: Math.min(100, Math.max(1, quality)) });
      break;
    case 'tiff':
      pipeline = pipeline.tiff(lossless ? { lossless: true, quality } : { quality });
      break;
    case 'gif':
      pipeline = pipeline.gif();
      break;
    default:
      throw new Error(`Unsupported format: ${targetFormat}`);
  }
  
  await pipeline.toFile(outputPath);
  
  const originalSize = fs.statSync(inputPath).size;
  const convertedSize = fs.statSync(outputPath).size;
  
  return {
    input: inputPath,
    output: outputPath,
    format: targetFormat,
    originalSize,
    convertedSize,
    savedPercent: ((originalSize - convertedSize) / originalSize * 100).toFixed(1),
    losslessNote: losslessNoteFor(targetFormat, lossless)
  };
}

/**
 * 转换为 PNG
 */
export async function convertToPng(inputPath, outputPath, options = {}) {
  return convertImage(inputPath, outputPath, { ...options, format: 'png' });
}

/**
 * 转换为 JPEG
 */
export async function convertToJpeg(inputPath, outputPath, options = {}) {
  return convertImage(inputPath, outputPath, { ...options, format: 'jpeg' });
}

/**
 * 转换为 WebP
 */
export async function convertToWebp(inputPath, outputPath, options = {}) {
  return convertImage(inputPath, outputPath, { ...options, format: 'webp' });
}

/**
 * 转换为 AVIF
 */
export async function convertToAvif(inputPath, outputPath, options = {}) {
  return convertImage(inputPath, outputPath, { ...options, format: 'avif' });
}

/**
 * GIF 转 WebP/PNG
 */
export async function extractGifFrame(inputPath, outputPath, options = {}) {
  const { frameIndex = 0 } = options;
  
  // 确保输出目录存在
  const outputDir = path.dirname(outputPath);
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }
  
  await sharp(inputPath, { animated: true })
    .gif()
    .toFile(outputPath);
  
  return {
    input: inputPath,
    output: outputPath
  };
}

/**
 * 获取支持的格式列表
 */
export function getSupportedFormats() {
  return {
    input: ['jpeg', 'jpg', 'png', 'webp', 'gif', 'tiff', 'tif', 'bmp', 'svg', 'avif'],
    output: ['jpeg', 'jpg', 'png', 'webp', 'avif', 'tiff', 'gif']
  };
}
