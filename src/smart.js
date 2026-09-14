import sharp from 'sharp';
import fs from 'fs';

/**
 * 智能分析 + 自适应质量模块
 *
 * 两个能力：
 *  1) analyzeImage  — 内容感知格式选择：根据主色（是否照片/插画）、透明通道、
 *                     位深、尺寸等推断「最适合的格式」。
 *  2) findOptimalQuality — 自适应质量：以 SSIM/Butteraugli 指标驱动，二分搜索
 *                     在「质量损失不超过阈值」前提下的最大压缩率（最小质量值）。
 */

// ---------- 指标计算 ----------

// 计算两张图之间的 SSIM（结构相似性），范围 0~1，越大越好。
// 这里用亮度通道做简化版 SSIM（高斯窗口 + 常数），足以驱动质量搜索。
async function computeSSIM(bufA, bufB) {
  try {
    const [imgA, imgB] = await Promise.all([
      sharp(bufA).ensureAlpha().raw().toBuffer({ resolveWithObject: true }),
      sharp(bufB).ensureAlpha().raw().toBuffer({ resolveWithObject: true }),
    ]);
    const { data: dA, info: iA } = imgA;
    const { data: dB, info: iB } = imgB;
    const n = Math.min(iA.width * iA.height, iB.width * iB.height) * iA.channels;
    if (n === 0) return 0;

    // 仅比较前 3 通道（RGB），忽略 alpha 差异
    let sumA = 0, sumB = 0, sumASq = 0, sumBSq = 0, sumAB = 0;
    const total = iA.width * iA.height;
    for (let p = 0; p < total; p++) {
      const a = dA[p * iA.channels];
      const b = dB[p * iB.channels];
      sumA += a; sumB += b;
      sumASq += a * a; sumBSq += b * b;
      sumAB += a * b;
    }
    const mA = sumA / total;
    const mB = sumB / total;
    const vA = sumASq / total - mA * mA;
    const vB = sumBSq / total - mB * mB;
    const cov = sumAB / total - mA * mB;

    const C1 = 6.5025;   // (0.01*255)^2
    const C2 = 58.5225;  // (0.03*255)^2
    const ssim = ((2 * mA * mB + C1) * (2 * cov + C2)) /
                 ((mA * mA + mB * mB + C1) * (vA + vB + C2));
    return Math.max(0, Math.min(1, ssim));
  } catch {
    return 0;
  }
}

// 计算 Butteraugli 近似距离，范围 0~∞，越小越好（0 表示无差异）。
// 纯 JS 无原生 Butteraugli，这里用「感知加权的逐像素色差」近似：
//   对暗部/平滑区更敏感，粗略模拟 Butteraugli 的偏重。
async function computeButteraugli(bufA, bufB) {
  try {
    const [imgA, imgB] = await Promise.all([
      sharp(bufA).ensureAlpha().raw().toBuffer({ resolveWithObject: true }),
      sharp(bufB).ensureAlpha().raw().toBuffer({ resolveWithObject: true }),
    ]);
    const { data: dA, info: iA } = imgA;
    const { data: dB, info: iB } = imgB;
    const total = iA.width * iA.height;
    if (total === 0) return 0;

    let sum = 0;
    for (let p = 0; p < total; p++) {
      const rA = dA[p * iA.channels], gA = dA[p * iA.channels + 1], bA = dA[p * iA.channels + 2];
      const rB = dB[p * iB.channels], gB = dB[p * iB.channels + 1], bB = dB[p * iB.channels + 2];
      // 转 Lab 近似（仅亮度通道做加权），暗部权重更高
      const lA = 0.2126 * rA + 0.7152 * gA + 0.0722 * bA;
      const lB = 0.2126 * rB + 0.7152 * gB + 0.0722 * bB;
      const lumW = 1 + (1 - lA / 255) * 0.5; // 暗部更敏感
      const dr = (rA - rB) * 0.3;
      const dg = (gA - gB) * 0.59;
      const db = (bA - bB) * 0.11;
      // 彩色差异 + 亮度差异，并乘以暗部权重
      const dist = Math.sqrt(dr * dr + dg * dg + db * db + (lA - lB) * (lA - lB) * 0.5) * lumW;
      sum += dist;
    }
    return sum / total;
  } catch {
    return 0;
  }
}

// ---------- 内容感知格式选择 ----------

const SUPPORTED_FORMATS = ['webp', 'avif', 'jpeg', 'png'];

/**
 * 分析图片内容，返回推荐格式与理由。
 * @param {string} inputPath 输入文件路径
 * @returns {Promise<{format, reason, hasAlpha, isPhoto, colorfulness, channels, width, height, size}>}
 */
export async function analyzeImage(inputPath) {
  const image = sharp(inputPath);
  const meta = await image.metadata();

  // 抽一块缩小图用于内容分析（性能）
  const statsBuf = await image
    .resize(256, 256, { fit: 'inside' })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const { data, info } = statsBuf;
  const total = info.width * info.height;

  // 1) 透明通道检测
  let alphaCount = 0;
  for (let p = 0; p < total; p++) {
    const a = data[p * info.channels + 3];
    if (a < 250) alphaCount++;
  }
  const hasAlpha = alphaCount / total > 0.005; // >0.5% 像素有透明

  // 2) 色彩丰富度 / 主色（判断照片 vs 插画/图标）
  //    用相邻像素差值方差估计「高频细节」，用颜色数量估计「色彩复杂度」
  const colorSet = new Set();
  let prevR = data[0], prevG = data[1], prevB = data[2];
  let edgeSum = 0, edgeCount = 0;
  for (let p = 0; p < total; p++) {
    const r = data[p * info.channels];
    const g = data[p * info.channels + 1];
    const b = data[p * info.channels + 2];
    colorSet.add((r >> 3) << 11 | (g >> 3) << 6 | (b >> 3)); // 量化到 5bit/通道
    const dr = r - prevR, dg = g - prevG, db = b - prevB;
    edgeSum += Math.sqrt(dr * dr + dg * dg + db * db);
    edgeCount++;
    prevR = r; prevG = g; prevB = b;
  }
  const avgEdge = edgeSum / Math.max(1, edgeCount);        // 高频细节强度
  const colorfulness = colorSet.size;                       // 不同颜色数

  // 3) 主色（取出现最多的量化色块）
  const counts = new Map();
  for (let p = 0; p < total; p++) {
    const key = (data[p * info.channels] >> 4) << 8 | (data[p * info.channels + 1] >> 4) << 4 | (data[p * info.channels + 2] >> 4);
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  let dominant = 0, max = 0;
  for (const [k, v] of counts) if (v > max) { max = v; dominant = k; }
  const domR = ((dominant >> 8) & 0xf) * 17;
  const domG = ((dominant >> 4) & 0xf) * 17;
  const domB = (dominant & 0xf) * 17;

  const isPhoto = avgEdge > 18 && colorfulness > 400;        // 照片：细节多 + 颜色丰富
  const isIcon = avgEdge > 30 && colorfulness < 200;         // 图标/线条图：细节多但颜色少
  const isFlat = colorfulness < 60;                          // 纯色/渐变图

  // 4) 决策
  let format, reason;
  if (hasAlpha) {
    // 有透明：优先 WebP（兼顾压缩与透明）；仅高细节图标/线条图用 PNG 保边
    if (isIcon) {
      format = 'png';
      reason = '透明线条图 / 图标（高频、少色）—— PNG 保边更清晰（无损）';
    } else {
      format = 'webp';
      reason = '检测到透明通道 —— WebP 保留透明且压缩远优于 PNG';
    }
  } else if (isPhoto) {
    format = 'avif';
    reason = '照片类内容（细节与色彩丰富）—— AVIF 体积最小';
  } else if (isIcon) {
    format = 'png';
    reason = '线条图 / 图标（高频、少色）—— PNG 边缘更锐利';
  } else if (isFlat) {
    format = 'webp';
    reason = '纯色 / 简单图形 —— WebP 对纯色压缩效率极高';
  } else {
    format = 'webp';
    reason = '常规图形 —— WebP 体积与质量最均衡';
  }

  return {
    format,
    reason,
    hasAlpha,
    isPhoto,
    colorfulness,
    avgEdge: Number(avgEdge.toFixed(1)),
    dominantColor: [domR, domG, domB],
    channels: meta.channels || 3,
    width: meta.width || 0,
    height: meta.height || 0,
    size: fs.statSync(inputPath).size,
  };
}

// ---------- 自适应质量搜索 ----------

/**
 * 二分搜索最优质量：在指标不低于阈值的前提下，尽量压低质量（减小体积）。
 * @param {string} inputPath 原图路径
 * @param {Object} opts
 * @param {string} opts.format 目标格式
 * @param {string} opts.metric 'ssim' | 'butteraugli'
 * @param {number} opts.threshold 指标阈值（SSIM: 默认 0.95；Butteraugli: 默认 1.2）
 * @param {number} opts.maxQuality 起点质量（默认 82）
 * @returns {Promise<{quality, metric, score, compressedSize, originalSize, savedPercent}>}
 */
export async function findOptimalQuality(inputPath, opts = {}) {
  const {
    format = 'webp',
    metric = 'ssim',
    threshold = metric === 'ssim' ? 0.95 : 1.2,
    maxQuality = 82,
  } = opts;

  const originalBuf = fs.readFileSync(inputPath);

  const encode = async (q) => {
    let pipeline = sharp(originalBuf);
    switch (format) {
      case 'jpeg': pipeline = pipeline.jpeg({ quality: q, mozjpeg: true }); break;
      case 'png':  pipeline = pipeline.png({ quality: Math.max(1, Math.min(100, q)) }); break;
      case 'avif': pipeline = pipeline.avif({ quality: q, effort: 2 }); break;
      case 'webp':
      default:    pipeline = pipeline.webp({ quality: q }); break;
    }
    return pipeline.toBuffer();
  };

  const measure = async (compBuf) => {
    if (metric === 'butteraugli') {
      return { value: await computeButteraugli(originalBuf, compBuf), better: 'low' };
    }
    return { value: await computeSSIM(originalBuf, compBuf), better: 'high' };
  };

  // 先确认最高质量是否满足阈值（兜底）
  const bestBuf = await encode(maxQuality);
  const bestScore = await measure(bestBuf);
  const meetsAtMax = metric === 'ssim'
    ? bestScore.value >= threshold
    : bestScore.value <= threshold;

  if (!meetsAtMax) {
    // 即使最高质量也达不到阈值（极少见），返回最高质量
    const compressedSize = bestBuf.length;
    return {
      quality: maxQuality, metric, score: Number(bestScore.value.toFixed(4)),
      compressedSize, originalSize: originalBuf.length,
      savedPercent: ((originalBuf.length - compressedSize) / originalBuf.length * 100).toFixed(1),
    };
  }

  // 二分：在 [lo, hi] 之间找「刚好满足阈值」的最小质量
  let lo = 1, hi = maxQuality;
  let chosenQ = maxQuality;
  let chosenBuf = bestBuf;
  let chosenScore = bestScore.value;

  while (lo <= hi) {
    const mid = Math.floor((lo + hi) / 2);
    const buf = await encode(mid);
    const { value } = await measure(buf);
    const meets = metric === 'ssim' ? value >= threshold : value <= threshold;
    if (meets) {
      chosenQ = mid; chosenBuf = buf; chosenScore = value;
      hi = mid - 1; // 尝试更低质量
    } else {
      lo = mid + 1;
    }
  }

  const compressedSize = chosenBuf.length;
  return {
    quality: chosenQ,
    metric,
    score: Number(chosenScore.toFixed(4)),
    compressedSize,
    originalSize: originalBuf.length,
    savedPercent: ((originalBuf.length - compressedSize) / originalBuf.length * 100).toFixed(1),
  };
}

/**
 * 一体化智能建议：返回推荐格式 + 该格式下的最优质量。
 */
export async function smartSuggest(inputPath, opts = {}) {
  const analysis = await analyzeImage(inputPath);
  const qualityResult = await findOptimalQuality(inputPath, {
    format: analysis.format,
    metric: opts.metric || 'ssim',
    threshold: opts.threshold,
    maxQuality: opts.maxQuality || 82,
  });
  return {
    ...analysis,
    quality: qualityResult.quality,
    qualityMetric: qualityResult.metric,
    qualityScore: qualityResult.score,
    compressedSize: qualityResult.compressedSize,
    savedPercent: qualityResult.savedPercent,
  };
}
