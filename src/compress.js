import sharp from 'sharp';
import fs from 'fs';
import path from 'path';
import { glob } from './utils.js';

/**
 * 压缩图片
 * @param {string} inputPath - 输入文件路径
 * @param {string} outputPath - 输出文件路径
 * @param {Object} options - 压缩选项
 * @param {number} options.quality - 质量 (1-100)
 * @param {string} options.format - 输出格式 (jpeg, png, webp, avif)
 */
export async function compressImage(inputPath, outputPath, options = {}) {
  const { quality = 80, format } = options;
  
  // 确保输出目录存在
  const outputDir = path.dirname(outputPath);
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }
  
  let pipeline = sharp(inputPath);
  
  // 根据格式或自动检测设置输出格式
  const targetFormat = format || path.extname(outputPath).toLowerCase().replace('.', '') || 'jpeg';
  
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
      pipeline = pipeline.avif({ quality });
      break;
    case 'tiff':
      pipeline = pipeline.tiff({ quality });
      break;
    case 'gif':
      pipeline = pipeline.gif();
      break;
    default:
      // 默认使用 JPEG
      pipeline = pipeline.jpeg({ quality: Math.min(100, Math.max(1, quality)) });
  }
  
  await pipeline.toFile(outputPath);
  
  return {
    input: inputPath,
    output: outputPath,
    originalSize: fs.statSync(inputPath).size,
    compressedSize: fs.statSync(outputPath).size
  };
}

/**
 * 压缩并转换为 WebP 格式
 * @param {string} inputPath - 输入文件路径
 * @param {string} outputPath - 输出文件路径
 * @param {number} quality - 质量 (1-100)
 */
export async function compressImageToWebp(inputPath, outputPath, quality = 80) {
  // 确保输出目录存在
  const outputDir = path.dirname(outputPath);
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }
  
  // 将 .webp 扩展名添加到输出路径（如果不是）
  if (!outputPath.toLowerCase().endsWith('.webp')) {
    outputPath = outputPath + '.webp';
  }
  
  await sharp(inputPath)
    .webp({ quality: Math.min(100, Math.max(1, quality)) })
    .toFile(outputPath);
  
  return {
    input: inputPath,
    output: outputPath,
    originalSize: fs.statSync(inputPath).size,
    compressedSize: fs.statSync(outputPath).size
  };
}

/**
 * 调整图片尺寸
 * @param {string} inputPath - 输入文件路径
 * @param {string} outputPath - 输出文件路径
 * @param {Object} options - 调整选项
 * @param {number} options.width - 目标宽度
 * @param {number} options.height - 目标高度
 * @param {number} options.fit - 适应方式 (cover, contain, fill, inside, outside)
 */
export async function resizeImage(inputPath, outputPath, options = {}) {
  const { width, height, fit = 'inside' } = options;
  
  // 确保输出目录存在
  const outputDir = path.dirname(outputPath);
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }
  
  let pipeline = sharp(inputPath);
  
  if (width || height) {
    pipeline = pipeline.resize(width, height, { 
      fit,
      withoutEnlargement: true 
    });
  }
  
  await pipeline.toFile(outputPath);
  
  return {
    input: inputPath,
    output: outputPath,
    originalSize: fs.statSync(inputPath).size,
    newSize: fs.statSync(outputPath).size
  };
}

/**
 * 批量压缩目录下所有图片
 * @param {string} inputDir - 输入目录
 * @param {string} outputDir - 输出目录
 * @param {Object} options - 压缩选项
 */
export async function compressDirectory(inputDir, outputDir, options = {}) {
  const pattern = `${inputDir}/**/*.{jpg,jpeg,png,gif,tiff,bmp,webp}`;
  const files = await glob(pattern, { nodir: true });
  
  const results = [];
  
  for (const file of files) {
    const relativePath = path.relative(inputDir, file);
    const outputPath = path.join(outputDir, relativePath);
    
    try {
      const result = await compressImage(file, outputPath, options);
      results.push({ ...result, status: 'success' });
    } catch (error) {
      results.push({ 
        file, 
        error: error.message, 
        status: 'failed' 
      });
    }
  }
  
  return results;
}
