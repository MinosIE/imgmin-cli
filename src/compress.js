import sharp from 'sharp';
import fs from 'fs';
import path from 'path';
import { glob } from './utils.js';

/**
 * 可编码输出的格式（与 applyEncoder 的 switch 保持一致）
 */
const ENCODABLE_FORMATS = ['jpeg', 'jpg', 'png', 'webp', 'avif', 'tiff', 'gif'];

/**
 * 判断字符串是否为可编码的目标格式
 * @param {string} format - 格式名（不含点，大小写不敏感）
 * @returns {boolean}
 */
export function isEncodableFormat(format) {
  return ENCODABLE_FORMATS.includes(String(format || '').toLowerCase());
}

/**
 * 给 sharp pipeline 套上目标格式的编码参数
 * @param {import('sharp').Sharp} pipeline - sharp 实例
 * @param {string} format - 目标格式 (jpeg, jpg, png, webp, avif, tiff, gif)
 * @param {number} quality - 质量 (1-100)
 * @returns {import('sharp').Sharp} 套用编码参数后的 pipeline
 */
export function applyEncoder(pipeline, format, quality = 80) {
  const numeric = Number(quality);
  const q = Number.isFinite(numeric) ? Math.min(100, Math.max(1, Math.round(numeric))) : 80;
  
  switch (String(format || '').toLowerCase()) {
    case 'jpeg':
    case 'jpg':
      return pipeline.jpeg({ quality: q, mozjpeg: true });
    case 'png':
      return pipeline.png({
        compressionLevel: Math.floor((100 - q) / 10),
        palette: q < 80
      });
    case 'webp':
      return pipeline.webp({ quality: q });
    case 'avif':
      return pipeline.avif({ quality: q });
    case 'tiff':
      return pipeline.tiff({ quality: q });
    case 'gif':
      return pipeline.gif();
    default:
      // 默认使用 JPEG
      return pipeline.jpeg({ quality: q, mozjpeg: true });
  }
}

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
  
  // 根据格式或自动检测设置输出格式
  const targetFormat = format || path.extname(outputPath).toLowerCase().replace('.', '') || 'jpeg';
  
  const pipeline = applyEncoder(sharp(inputPath), targetFormat, quality);
  
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
 * sharp 支持的 fit 取值
 */
export const RESIZE_FITS = ['cover', 'contain', 'fill', 'inside', 'outside'];

/**
 * 调整图片尺寸
 * @param {string} inputPath - 输入文件路径
 * @param {string} outputPath - 输出文件路径
 * @param {Object} options - 调整选项
 * @param {number} options.width - 目标宽度
 * @param {number} options.height - 目标高度
 * @param {string} options.fit - 适应方式 (cover, contain, fill, inside, outside)
 * @param {number} [options.quality] - 重编码质量 (1-100)，省略则沿用 sharp 默认编码
 * @param {string} [options.format] - 输出格式，省略则按输出文件扩展名推断
 * @param {boolean} [options.withoutEnlargement] - 是否禁止放大（默认 true）
 */
export async function resizeImage(inputPath, outputPath, options = {}) {
  const {
    width,
    height,
    fit = 'inside',
    quality,
    format,
    withoutEnlargement = true
  } = options;
  
  const targetWidth = width === undefined || width === null ? undefined : parseInt(width, 10);
  const targetHeight = height === undefined || height === null ? undefined : parseInt(height, 10);
  
  if (targetWidth === undefined && targetHeight === undefined) {
    throw new Error('resizeImage: width or height is required');
  }
  if (targetWidth !== undefined && (!Number.isFinite(targetWidth) || targetWidth < 1)) {
    throw new Error(`resizeImage: invalid width "${width}"`);
  }
  if (targetHeight !== undefined && (!Number.isFinite(targetHeight) || targetHeight < 1)) {
    throw new Error(`resizeImage: invalid height "${height}"`);
  }
  if (!RESIZE_FITS.includes(fit)) {
    throw new Error(`resizeImage: invalid fit "${fit}". Supported: ${RESIZE_FITS.join(', ')}`);
  }
  
  // 确保输出目录存在
  const outputDir = path.dirname(outputPath);
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }
  
  const inputMeta = await sharp(inputPath).metadata();
  
  let pipeline = sharp(inputPath).resize(targetWidth ?? null, targetHeight ?? null, {
    fit,
    withoutEnlargement
  });
  
  // 指定 quality 时显式套用编码参数，否则沿用 sharp 对扩展名的默认推断
  if (quality !== undefined && quality !== null) {
    const targetFormat = format || path.extname(outputPath).toLowerCase().replace('.', '');
    pipeline = applyEncoder(pipeline, targetFormat, quality);
  }
  
  await pipeline.toFile(outputPath);
  
  const outputMeta = await sharp(outputPath).metadata();
  const resized = outputMeta.width !== inputMeta.width || outputMeta.height !== inputMeta.height;
  
  return {
    input: inputPath,
    output: outputPath,
    originalSize: fs.statSync(inputPath).size,
    newSize: fs.statSync(outputPath).size,
    originalWidth: inputMeta.width,
    originalHeight: inputMeta.height,
    width: outputMeta.width,
    height: outputMeta.height,
    resized
  };
}

/**
 * 压缩并转换为 AVIF 格式
 * @param {string} inputPath - 输入文件路径
 * @param {string} outputPath - 输出文件路径
 * @param {number} quality - 质量 (1-100)
 */
export async function compressImageToAvif(inputPath, outputPath, quality = 80) {
  // 确保输出目录存在
  const outputDir = path.dirname(outputPath);
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }
  
  // 将 .avif 扩展名添加到输出路径（如果不是）
  if (!outputPath.toLowerCase().endsWith('.avif')) {
    outputPath = outputPath + '.avif';
  }
  
  await sharp(inputPath)
    .avif({ quality: Math.min(100, Math.max(1, quality)) })
    .toFile(outputPath);
  
  return {
    input: inputPath,
    output: outputPath,
    originalSize: fs.statSync(inputPath).size,
    compressedSize: fs.statSync(outputPath).size
  };
}

/**
 * 压缩并转换为指定格式（通用函数）
 * @param {string} inputPath - 输入文件路径
 * @param {string} outputPath - 输出文件路径
 * @param {string} format - 目标格式 (webp, avif)
 * @param {number} quality - 质量 (1-100)
 */
export async function compressImageToFormat(inputPath, outputPath, format, quality = 80) {
  const formatMap = {
    webp: compressImageToWebp,
    avif: compressImageToAvif
  };
  
  const handler = formatMap[format];
  if (!handler) {
    throw new Error(`Unsupported format for conversion: ${format}. Supported: webp, avif`);
  }
  
  return handler(inputPath, outputPath, quality);
}

/**
 * 批量压缩目录下所有图片
 * @param {string} inputDir - 输入目录
 * @param {string} outputDir - 输出目录
 * @param {Object} options - 压缩选项
 */
export async function compressDirectory(inputDir, outputDir, options = {}) {
  const pattern = `${inputDir}/**/*.{jpg,jpeg,png,gif,tiff,tif,bmp,svg,avif,webp}`;
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
