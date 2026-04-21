import sharp from 'sharp';
import fs from 'fs';
import path from 'path';

/**
 * 图片格式转换
 * @param {string} inputPath - 输入文件路径
 * @param {string} outputPath - 输出文件路径
 * @param {Object} options - 转换选项
 * @param {string} options.format - 目标格式 (jpeg, png, webp, avif)
 * @param {number} options.quality - 质量 (1-100)
 */
export async function convertImage(inputPath, outputPath, options = {}) {
  const { format, quality = 80 } = options;
  
  // 确保输出目录存在
  const outputDir = path.dirname(outputPath);
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }
  
  // 确定目标格式
  const targetFormat = format || path.extname(outputPath).toLowerCase().replace('.', '');
  
  let pipeline = sharp(inputPath);
  
  switch (targetFormat) {
    case 'jpeg':
    case 'jpg':
      pipeline = pipeline.jpeg({ 
        quality: Math.min(100, Math.max(1, quality)),
        mozjpeg: true 
      });
      break;
    case 'png':
      pipeline = pipeline.png({ 
        compressionLevel: Math.floor((100 - quality) / 10),
        palette: quality < 80 
      });
      break;
    case 'webp':
      pipeline = pipeline.webp({ quality });
      break;
    case 'avif':
      pipeline = pipeline.avif({ quality: Math.min(100, Math.max(1, quality)) });
      break;
    case 'tiff':
      pipeline = pipeline.tiff({ quality });
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
    savedPercent: ((originalSize - convertedSize) / originalSize * 100).toFixed(1)
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
