import sharp from 'sharp';
import fs from 'fs';
import path from 'path';

const IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.tiff', '.tif', '.bmp', '.svg', '.avif'];

/**
 * 简单的 glob 实现
 * @param {string} pattern - 文件模式
 * @param {Object} options - 选项
 * @returns {Promise<string[]>} 匹配的文件列表
 */
/**
 * 解析 glob 中的扩展名片段，支持 `.{jpg,png}` 与 `.png` 两种写法
 * @param {string} extPart - 形如 `.{jpg,png}` / `.png` / `{jpg,png}`
 * @returns {string[]} 小写、不带点的扩展名数组
 */
function parseExtensions(extPart = '') {
  const braceMatch = extPart.match(/^\.?\{(.+)\}$/);
  if (braceMatch) {
    return braceMatch[1]
      .split(',')
      .map(e => e.trim().toLowerCase().replace(/^\./, ''))
      .filter(Boolean);
  }
  return [extPart.replace(/^\./, '').toLowerCase()].filter(Boolean);
}

export async function glob(pattern, options = {}) {
  const files = [];
  const { nodir = true } = options;
  
  // 解析 pattern，提取目录和扩展名
  let baseDir = pattern;
  let extensions = [];
  let recursive = true; // 默认递归
  
  // 检查是否是递归模式 img/**/*.{ext1,ext2}
  if (pattern.includes('/**/*')) {
    baseDir = pattern.split('/**/*')[0];
    extensions = parseExtensions(pattern.split('/**/*')[1]);
  } else if (pattern.includes('/*.')) {
    // 非递归模式 img/*.png 或 img/*.{jpg,png}
    const parts = pattern.split('/*.');
    baseDir = parts[0];
    extensions = parseExtensions(parts[1]);
    recursive = false;
  }
  
  if (!fs.existsSync(baseDir)) {
    return files;
  }
  
  await scanDir(baseDir, files, extensions, nodir, recursive);
  
  return files;
}

/**
 * 递归扫描目录
 */
async function scanDir(dir, files, extensions, nodir, recursive) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    
    if (entry.isDirectory() && recursive) {
      await scanDir(fullPath, files, extensions, nodir, recursive);
    } else if (entry.isFile()) {
      if (nodir) {
        const ext = path.extname(entry.name).toLowerCase().slice(1); // 去掉点的扩展名
        if (extensions.length === 0 || extensions.includes(ext)) {
          files.push(fullPath);
        }
      }
    }
  }
}

/**
 * 获取图片信息
 * @param {string} filePath - 图片文件路径
 * @returns {Promise<Object>} 图片信息对象
 */
export async function getImageInfo(filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`File not found: ${filePath}`);
  }
  
  const metadata = await sharp(filePath).metadata();
  const stats = fs.statSync(filePath);
  
  return {
    fileName: path.basename(filePath),
    filePath: filePath,
    size: stats.size,
    format: metadata.format,
    width: metadata.width,
    height: metadata.height,
    hasAlpha: metadata.hasAlpha || false,
    channels: metadata.channels,
    density: metadata.density,
    space: metadata.space,
    depth: metadata.depth,
    orientation: metadata.orientation
  };
}

/**
 * 评估图片「还能不能继续压」——压缩潜力分析
 * 通过计算每像素比特数(bpp)推断原图压缩程度，给出质量建议。
 * @param {Object} info - getImageInfo 返回的对象
 * @returns {Object} 分析结果
 */
const PHOTO_FORMATS = new Set(['jpeg', 'jpg', 'webp', 'avif', 'tiff', 'tif', 'heif', 'heic']);
const LOSSLESS_FORMATS = new Set(['png', 'gif', 'bmp', 'svg']);

export function analyzeCompressibility(info) {
  const { format, width, height, size } = info;
  const fmt = (format || '').toLowerCase();
  const px = (width || 0) * (height || 0);
  const bpp = px > 0 ? (size * 8) / px : 0; // bits per pixel

  const isPhoto = PHOTO_FORMATS.has(fmt);
  const isLossless = LOSSLESS_FORMATS.has(fmt);

  let level, levelKey, note, recommendation;
  let suggestedQuality = null;       // 同格式重编码的建议质量
  let canShrinkWithFormat = false;   // 转 WebP/AVIF 是否值得

  if (isLossless) {
    level = '无损格式';
    levelKey = 'lossless';
    if (bpp > 4) {
      note = `当前为 ${fmt.toUpperCase()} 无损格式，体积明显偏大`;
      recommendation = '若原图是照片 / 插画，转 WebP 或 AVIF 通常可减小 50% 以上（需透明则选 WebP）';
      canShrinkWithFormat = true;
    } else {
      note = `PNG 体积较小，可能是图标 / 截图 / 线条图`;
      recommendation = '这类内容用 PNG 已合适；转 WebP 还能再小一点，但收益有限';
      canShrinkWithFormat = bpp > 2;
    }
  } else if (isPhoto) {
    if (bpp < 0.75) {
      level = '已高度压缩';
      levelKey = 'aggressive';
      note = `每像素仅 ${bpp.toFixed(2)} bit，相当于质量极低（约 q40 以下）`;
      recommendation = '按 q80 重编码几乎必然变大；想变小请把质量降到 40–55，或开启智能模式';
      suggestedQuality = 45;
    } else if (bpp < 1.5) {
      level = '压缩较充分';
      levelKey = 'moderate';
      note = `每像素 ${bpp.toFixed(2)} bit，原图已压得比较透`;
      recommendation = 'q80 可能只微缩甚至略增；建议降到 50–65 再看效果';
      suggestedQuality = 55;
    } else if (bpp < 3) {
      level = '压缩适中';
      levelKey = 'ok';
      note = `每像素 ${bpp.toFixed(2)} bit，仍有优化空间`;
      recommendation = '按 q80 通常可再减小一些';
      suggestedQuality = 75;
    } else {
      level = '质量较高';
      levelKey = 'high';
      note = `每像素 ${bpp.toFixed(2)} bit，原图质量较高`;
      recommendation = '按 q80 应能明显减小';
      suggestedQuality = 80;
    }
  } else {
    level = '未知类型';
    levelKey = 'unknown';
    note = `格式 ${fmt || '?'} 暂无法评估`;
    recommendation = '可尝试压缩，或开启智能模式自动选格式';
  }

  return {
    bpp: +bpp.toFixed(2),
    isPhoto,
    isLossless,
    level,
    levelKey,
    note,
    recommendation,
    suggestedQuality,
    canShrinkWithFormat
  };
}

/**
 * 格式化文件大小
 * @param {number} bytes - 字节数
 * @returns {string} 格式化后的大小字符串
 */
export function formatFileSize(bytes) {
  if (bytes === 0) return '0 B';
  
  const units = ['B', 'KB', 'MB', 'GB'];
  const k = 1024;
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return `${(bytes / Math.pow(k, i)).toFixed(2)} ${units[i]}`;
}

/**
 * 检查文件是否为图片
 * @param {string} filePath - 文件路径
 * @returns {boolean} 是否为图片
 */
export function isImageFile(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  return IMAGE_EXTENSIONS.includes(ext);
}

/**
 * 获取支持的图片扩展名
 * @returns {string[]} 扩展名数组
 */
export function getSupportedExtensions() {
  return IMAGE_EXTENSIONS;
}

/**
 * 计算压缩率
 * @param {number} originalSize - 原始大小
 * @param {number} compressedSize - 压缩后大小
 * @returns {string} 压缩率百分比
 */
export function calculateSavedPercent(originalSize, compressedSize) {
  if (originalSize === 0) return '0%';
  return `${((originalSize - compressedSize) / originalSize * 100).toFixed(1)}%`;
}

/**
 * 确保目录存在
 * @param {string} dirPath - 目录路径
 */
export function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

/**
 * 批量处理文件列表
 * @param {string[]} files - 文件路径数组
 * @param {Function} processor - 处理函数
 * @param {Object} options - 选项
 * @param {boolean} options.parallel - 是否并行处理
 * @param {number} options.concurrency - 并发数
 */
export async function batchProcess(files, processor, options = {}) {
  const { parallel = true, concurrency = 4 } = options;
  const results = [];
  
  if (parallel) {
    // 分批并行处理
    for (let i = 0; i < files.length; i += concurrency) {
      const batch = files.slice(i, i + concurrency);
      const batchResults = await Promise.allSettled(batch.map(processor));
      results.push(...batchResults);
    }
  } else {
    // 顺序处理
    for (const file of files) {
      try {
        const result = await processor(file);
        results.push({ status: 'fulfilled', value: result });
      } catch (error) {
        results.push({ status: 'rejected', reason: error });
      }
    }
  }
  
  return results;
}
