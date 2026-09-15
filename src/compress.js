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
/**
 * 按 EXIF Orientation 自动旋转像素（在编码 / 元数据之前执行）。
 * @param {import('sharp').Sharp} pipeline
 * @param {Object} [opts]
 * @param {boolean} [opts.rotateExif=false] - 按 EXIF Orientation 自动旋转像素
 * @returns {import('sharp').Sharp}
 */
export function applyTransforms(pipeline, { rotateExif = false } = {}) {
  let p = pipeline;
  if (rotateExif) p = p.rotate();
  return p;
}

/**
 * 决定是否保留原图元数据（EXIF/IPTC/ICC/XMP）。
 * @param {import('sharp').Sharp} pipeline
 * @param {Object} [opts]
 * @param {boolean} [opts.keepMetadata=true]
 * @returns {import('sharp').Sharp}
 */
export function applyMeta(pipeline, { keepMetadata = true } = {}) {
  return keepMetadata ? pipeline.withMetadata() : pipeline;
}

/**
 * 仅套用目标格式的编码参数（不含变换/元数据）。
 * @param {import('sharp').Sharp} pipeline
 * @param {string} format - 目标格式
 * @param {number} quality - 质量 (1-100)
 * @param {Object} [opts]
 * @param {boolean} [opts.lossless=false]
 * @returns {import('sharp').Sharp}
 */
export function encodeFormat(pipeline, format, quality = 80, { lossless = false } = {}) {
  const numeric = Number(quality);
  const q = Number.isFinite(numeric) ? Math.min(100, Math.max(1, Math.round(numeric))) : 80;

  switch (String(format || '').toLowerCase()) {
    case 'jpeg':
    case 'jpg':
      // JPEG 不支持无损，lossless 时退回最高质量
      return pipeline.jpeg({ quality: lossless ? 100 : q, mozjpeg: true });
    case 'png':
      // PNG 本身无损；lossless 时拉满压缩级别
      return pipeline.png({
        compressionLevel: lossless ? 9 : Math.floor((100 - q) / 10),
        palette: q < 80
      });
    case 'webp':
      return pipeline.webp(lossless ? { lossless: true } : { quality: q });
    case 'avif':
      return pipeline.avif(lossless ? { lossless: true } : { quality: q });
    case 'tiff':
      return pipeline.tiff(lossless ? { lossless: true, quality: q } : { quality: q });
    case 'gif':
      return pipeline.gif();
    default:
      // 默认使用 JPEG
      return pipeline.jpeg({ quality: q, mozjpeg: true });
  }
}

export function applyEncoder(pipeline, format, quality = 80, { lossless = false, keepMetadata = true, rotateExif = false } = {}) {
  pipeline = applyTransforms(pipeline, { rotateExif });
  pipeline = applyMeta(pipeline, { keepMetadata });
  return encodeFormat(pipeline, format, quality, { lossless });
}

/**
 * 压缩图片
 * @param {string} inputPath - 输入文件路径
 * @param {string} outputPath - 输出文件路径
 * @param {Object} options - 压缩选项
 * @param {number} options.quality - 质量 (1-100)
 * @param {string} options.format - 输出格式 (jpeg, png, webp, avif)
 */
/**
 * JPEG 无原生无损编码：开启 lossless 时退回最高质量 q100，并非真正无损。
 * 在结果中附一行提示，避免用户误以为得到无损 JPEG。
 * @param {string} format - 目标格式
 * @param {boolean} lossless - 是否无损
 * @returns {string|undefined} 提示文案；不冲突时返回 undefined
 */
export function losslessNoteFor(format, lossless) {
  if (!lossless) return undefined;
  const f = String(format || '').toLowerCase();
  if (f === 'jpeg' || f === 'jpg') {
    return 'JPEG 无原生无损，已退回最高质量 q100（非真正无损）';
  }
  return undefined;
}

export async function compressImage(inputPath, outputPath, options = {}) {
  const { quality = 80, format, lossless = false, maxSize, keepMetadata = true, rotateExif = false } = options;

  // 目标体积优先：二分搜索最高质量使产物 ≤ maxSize
  if (maxSize && maxSize > 0 && !lossless) {
    const res = await compressImageMaxSize(inputPath, outputPath, { format, targetBytes: maxSize, lossless, keepMetadata, rotateExif });
    return {
      input: res.input,
      output: res.output,
      originalSize: res.originalSize,
      compressedSize: res.compressedSize,
      quality: res.quality,
      metTarget: res.metTarget
    };
  }
  
  // 确保输出目录存在
  const outputDir = path.dirname(outputPath);
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }
  
  // 根据格式或自动检测设置输出格式
  const targetFormat = format || path.extname(outputPath).toLowerCase().replace('.', '') || 'jpeg';
  
  const pipeline = applyEncoder(sharp(inputPath), targetFormat, quality, { lossless, keepMetadata, rotateExif });
  
  await pipeline.toFile(outputPath);
  
  return {
    input: inputPath,
    output: outputPath,
    originalSize: fs.statSync(inputPath).size,
    compressedSize: fs.statSync(outputPath).size,
    losslessNote: losslessNoteFor(targetFormat, lossless)
  };
}

/**
 * 按目标体积压缩：二分搜索最高质量，使产物体积 ≤ targetBytes。
 * 质量越高体积越大，故以质量作为单调变量做二分；若质量 1 仍超限，退回质量 1（最小体积）并接受超限。
 * @param {string} inputPath - 输入文件路径
 * @param {string} outputPath - 输出文件路径
 * @param {Object} options
 * @param {string} [options.format] - 目标格式（缺省按输出扩展名）
 * @param {number} options.targetBytes - 目标体积（字节）
 * @param {boolean} [options.lossless] - 是否无损编码（与原生无损共用同一编码分支）
 * @returns {Promise<Object>} 含 quality / compressedSize / metTarget 等
 */
export async function compressImageMaxSize(inputPath, outputPath, options = {}) {
  const { format, targetBytes, lossless = false, keepMetadata = true, rotateExif = false } = options;
  if (!targetBytes || targetBytes <= 0) {
    throw new Error('compressImageMaxSize: targetBytes required and must be > 0');
  }

  // 确保输出目录存在
  const outputDir = path.dirname(outputPath);
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const targetFormat = format || path.extname(outputPath).toLowerCase().replace('.', '') || 'jpeg';

  // 二分搜索：质量越高体积越大，找到「体积≤目标」的最高质量
  let lo = 1, hi = 100, chosen = null;
  for (let i = 0; i < 16 && lo <= hi; i++) {
    const mid = Math.round((lo + hi) / 2);
    const buf = await applyEncoder(sharp(inputPath), targetFormat, mid, { lossless, keepMetadata, rotateExif }).toBuffer();
    if (buf.length <= targetBytes) {
      chosen = { quality: mid, size: buf.length };
      lo = mid + 1; // 还能更高画质，继续往大搜
    } else {
      hi = mid - 1;
    }
  }

  // 即便质量 1 仍超限：退回质量 1（最小体积），接受超限
  const finalQuality = chosen ? chosen.quality : 1;

  await applyEncoder(sharp(inputPath), targetFormat, finalQuality, { lossless, keepMetadata, rotateExif }).toFile(outputPath);
  const finalSize = fs.statSync(outputPath).size;

  return {
    input: inputPath,
    output: outputPath,
    originalSize: fs.statSync(inputPath).size,
    compressedSize: finalSize,
    quality: finalQuality,
    targetBytes,
    metTarget: finalSize <= targetBytes
  };
}

/**
 * 压缩并转换为 WebP 格式
 * @param {string} inputPath - 输入文件路径
 * @param {string} outputPath - 输出文件路径
 * @param {number} quality - 质量 (1-100)
 */
export async function compressImageToWebp(inputPath, outputPath, quality = 80, lossless = false, maxSize, keepMetadata = true, rotateExif = false) {
  // 目标体积优先
  if (maxSize && maxSize > 0 && !lossless) {
    return compressImageMaxSize(inputPath, outputPath, { format: 'webp', targetBytes: maxSize, lossless, keepMetadata, rotateExif });
  }

  // 确保输出目录存在
  const outputDir = path.dirname(outputPath);
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }
  
  // 将 .webp 扩展名添加到输出路径（如果不是）
  if (!outputPath.toLowerCase().endsWith('.webp')) {
    outputPath = outputPath + '.webp';
  }
  
  let pipeline = applyTransforms(sharp(inputPath), { rotateExif });
  pipeline = applyMeta(pipeline, { keepMetadata });
  await pipeline
    .webp(lossless ? { lossless: true } : { quality: Math.min(100, Math.max(1, quality)) })
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
 * @param {boolean} [options.lossless] - 无损重编码（WebP/AVIF/TIFF）
 * @param {boolean} [options.withoutEnlargement] - 是否禁止放大（默认 true）
 */
export async function resizeImage(inputPath, outputPath, options = {}) {
  const {
    width,
    height,
    fit = 'inside',
    quality,
    format,
    lossless = false,
    maxSize,
    keepMetadata = true,
    rotateExif = false,
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
  
  const targetFormat = format || path.extname(outputPath).toLowerCase().replace('.', '');
  
  // 目标体积优先：先按比例缩放（含变换）写临时文件，再按目标体积二分搜质量
  if (quality !== undefined && quality !== null && maxSize && maxSize > 0 && !lossless) {
    const tmpPath = path.join(outputDir, `.imgmin_tmp_${Date.now()}_${path.basename(outputPath)}`);
    let t = applyTransforms(sharp(inputPath), { rotateExif });
    t = t.resize(targetWidth ?? null, targetHeight ?? null, { fit, withoutEnlargement });
    await t.toFile(tmpPath);
    await compressImageMaxSize(tmpPath, outputPath, { format: targetFormat, targetBytes: maxSize, lossless, keepMetadata, rotateExif });
    try { fs.unlinkSync(tmpPath); } catch {}
  } else {
    let pipeline = applyTransforms(sharp(inputPath), { rotateExif });
    pipeline = pipeline.resize(targetWidth ?? null, targetHeight ?? null, {
      fit,
      withoutEnlargement
    });
    // 指定 quality 时显式套用编码参数，否则沿用 sharp 对扩展名的默认推断
    if (quality !== undefined && quality !== null) {
      pipeline = applyMeta(pipeline, { keepMetadata });
      pipeline = encodeFormat(pipeline, targetFormat, quality, { lossless });
    } else {
      pipeline = applyMeta(pipeline, { keepMetadata });
    }
    await pipeline.toFile(outputPath);
  }
  
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
    resized,
    losslessNote: losslessNoteFor(targetFormat, lossless)
  };
}

/**
 * 压缩并转换为 AVIF 格式
 * @param {string} inputPath - 输入文件路径
 * @param {string} outputPath - 输出文件路径
 * @param {number} quality - 质量 (1-100)
 */
export async function compressImageToAvif(inputPath, outputPath, quality = 80, lossless = false, maxSize, keepMetadata = true, rotateExif = false) {
  // 目标体积优先
  if (maxSize && maxSize > 0 && !lossless) {
    return compressImageMaxSize(inputPath, outputPath, { format: 'avif', targetBytes: maxSize, lossless, keepMetadata, rotateExif });
  }

  // 确保输出目录存在
  const outputDir = path.dirname(outputPath);
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }
  
  // 将 .avif 扩展名添加到输出路径（如果不是）
  if (!outputPath.toLowerCase().endsWith('.avif')) {
    outputPath = outputPath + '.avif';
  }
  
  let pipeline = applyTransforms(sharp(inputPath), { rotateExif });
  pipeline = applyMeta(pipeline, { keepMetadata });
  await pipeline
    .avif(lossless ? { lossless: true } : { quality: Math.min(100, Math.max(1, quality)) })
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
export async function compressImageToFormat(inputPath, outputPath, format, quality = 80, lossless = false, maxSize, keepMetadata = true, rotateExif = false) {
  // 目标体积优先
  if (maxSize && maxSize > 0 && !lossless) {
    return compressImageMaxSize(inputPath, outputPath, { format, targetBytes: maxSize, lossless, keepMetadata, rotateExif });
  }

  const formatMap = {
    webp: (i, o, q) => compressImageToWebp(i, o, q, lossless, undefined, keepMetadata, rotateExif),
    avif: (i, o, q) => compressImageToAvif(i, o, q, lossless, undefined, keepMetadata, rotateExif)
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
