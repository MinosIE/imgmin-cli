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
export async function glob(pattern, options = {}) {
  const files = [];
  const { nodir = true } = options;
  
  // 解析 pattern，提取目录和扩展名
  let baseDir = pattern;
  let extensions = [];
  
  // 检查是否是递归模式 img/**/*.{ext1,ext2}
  if (pattern.includes('/**/*')) {
    const parts = pattern.split('/**/*');
    baseDir = parts[0];
    const extPart = parts[1];
    
    // 提取 {ext1,ext2,...} 格式，如 .{jpg,png}
    const braceMatch = extPart.match(/^\.\{(.+)\}$/);
    if (braceMatch) {
      extensions = braceMatch[1].split(',').map(e => e.toLowerCase());
    } else {
      // 单扩展名如 .png
      extensions = [extPart.startsWith('.') ? extPart.slice(1) : extPart];
    }
  } else if (pattern.includes('/*.')) {
    // 非递归模式 img/*.png
    const parts = pattern.split('/*.');
    baseDir = parts[0];
    extensions = [parts[1].toLowerCase()];
  }
  
  if (!fs.existsSync(baseDir)) {
    return files;
  }
  
  await scanDir(baseDir, files, extensions, nodir);
  
  return files;
}

/**
 * 递归扫描目录
 */
async function scanDir(dir, files, extensions, nodir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    
    if (entry.isDirectory()) {
      await scanDir(fullPath, files, extensions, nodir);
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
