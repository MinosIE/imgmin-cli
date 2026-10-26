// 验证原生 Butteraugli 插件：same≈0、q90 应很小、q20 更大；并对比近似实现量纲。
import sharp from 'sharp';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { toLabPlanes, butteraugliDistance } from '../src/smart.js';

const require = createRequire(import.meta.url);
const addon = require('../native/butteraugli/build/Release/butteraugli.node');

const file = process.argv[2] || 'screenshots/shot.png';
const orig = fs.readFileSync(file);
const a = await sharp(orig).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
const origLab = await toLabPlanes(orig);
const lowQ = await sharp(orig).webp({ quality: 20 }).toBuffer();
const highQ = await sharp(orig).webp({ quality: 90 }).toBuffer();

async function both(label, compBuf) {
  const c = await sharp(compBuf).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const native = addon.butteraugliDistance(a.data, a.info.width, a.info.height, c.data, c.info.width, c.info.height);
  const approx = butteraugliDistance(origLab, await toLabPlanes(compBuf));
  console.log(`${label.padEnd(10)} native=${String(native).padStart(8)}  approx=${approx.toFixed(3)}`);
}

console.log(`image: ${file} (${a.info.width}x${a.info.height})  channels=${a.info.channels}`);
await both('same   ', orig);
await both('lowQ q20', lowQ);
await both('highQ q90', highQ);
