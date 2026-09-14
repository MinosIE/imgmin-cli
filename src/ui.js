import express from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import os from 'os';
import chalk from 'chalk';
import { ZipArchive } from 'archiver';
import { compressImage, compressImageToFormat, losslessNoteFor } from './compress.js';
import { getImageInfo, formatFileSize, analyzeCompressibility, parseSizeToBytes } from './utils.js';
import { smartSuggest } from './smart.js';

const app = express();
const upload = multer({ 
  dest: os.tmpdir(),
  limits: { fileSize: 50 * 1024 * 1024 } // 50MB limit
});

const JPEG_EXTS = new Set(['jpg', 'jpeg']);

// jpg / jpeg 视为同一格式
function sameFormat(a, b) {
  if (!a || !b) return false;
  if (JPEG_EXTS.has(a) && JPEG_EXTS.has(b)) return true;
  return a === b;
}

/**
 * 同格式重编码后反而变大时：丢弃产物，直接以原图作为该格式的结果。
 * @returns {string} 保留后的文件路径
 */
function keepOriginalAsResult(srcPath, discardedPath, outputDir, baseName, ext) {
  if (discardedPath) {
    try { fs.unlinkSync(discardedPath); } catch {}
  }
  const keptPath = path.join(outputDir, `${baseName}_${Date.now()}_kept.${ext}`);
  fs.copyFileSync(srcPath, keptPath);
  return keptPath;
}

// Serve static files from ui-public
app.use(express.static(path.join(import.meta.dirname, 'ui-public')));
app.use(express.json());

// Upload and compress endpoint
app.post('/api/compress', upload.array('images', 50), async (req, res) => {
  try {
    const quality = parseInt(req.body.quality) || 80;
    const files = req.files;
    const smart = req.body.smart === '1';
    const metric = req.body.metric || 'ssim';
    const lossless = req.body.lossless === '1';
    const maxSize = req.body.maxSize ? parseSizeToBytes(req.body.maxSize) : undefined;

    // Support both single format string and formats[] array
    let formats = [];
    if (req.body.formats) {
      // formats[] as array from FormData
      formats = Array.isArray(req.body.formats) ? req.body.formats : [req.body.formats];
    } else if (req.body.format) {
      // Backward compat: single format string
      formats = [req.body.format];
    } else {
      formats = ['original'];
    }
    
    if (!files || files.length === 0) {
      return res.status(400).json({ error: 'No images uploaded' });
    }

    const results = [];
    const outputDir = path.join(os.tmpdir(), 'imgmin-ui-output');
    if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

    for (const file of files) {
      try {
        const sourceExt = path.extname(file.originalname).toLowerCase().replace('.', '');

        if (smart) {
          // Smart mode: content-aware format + adaptive quality
          const sugg = await smartSuggest(file.path, { metric });
          const ext = sugg.format;
          const baseName = path.basename(file.originalname, path.extname(file.originalname));
          const outputPath = path.join(outputDir, `${baseName}_${Date.now()}.${ext}`);

          await compressImage(file.path, outputPath, { quality: sugg.quality, format: ext, lossless, maxSize });

          const originalSize = fs.statSync(file.path).size;
          const compressedSize = fs.statSync(outputPath).size;
          const savedPercent = ((originalSize - compressedSize) / originalSize * 100).toFixed(1);

          const sharp = (await import('sharp')).default;
          const metadata = await sharp(outputPath).metadata();

          // 同格式重编码却没变小时，保留原图，避免「压缩后反而更大」
          if (sameFormat(ext, sourceExt) && compressedSize >= originalSize) {
            const keptPath = keepOriginalAsResult(file.path, outputPath, outputDir, baseName, sourceExt);
            results.push({
              success: true,
              smart: true,
              keptOriginal: true,
              format: sourceExt,
              quality: sugg.quality,
              reason: sugg.reason,
              qualityMetric: sugg.qualityMetric,
              qualityScore: sugg.qualityScore,
              originalName: file.originalname,
              originalSize,
              compressedSize: originalSize,
              savedPercent: '0.0',
              width: metadata.width,
              height: metadata.height,
              outputPath: keptPath,
              downloadUrl: `/api/download/${path.basename(keptPath)}`
            });
          } else {
            results.push({
              success: true,
              smart: true,
              format: ext,
              quality: sugg.quality,
              reason: sugg.reason,
              qualityMetric: sugg.qualityMetric,
              qualityScore: sugg.qualityScore,
              originalName: file.originalname,
              originalSize,
              compressedSize,
              savedPercent,
              losslessNote: losslessNoteFor(ext, lossless),
              width: metadata.width,
              height: metadata.height,
              outputPath,
              downloadUrl: `/api/download/${path.basename(outputPath)}`
            });
          }
        } else {
          for (const fmt of formats) {
            try {
              const ext = fmt === 'original'
                ? path.extname(file.originalname).toLowerCase().replace('.', '')
                : fmt;
              const baseName = path.basename(file.originalname, path.extname(file.originalname));
              const outputPath = path.join(outputDir, `${baseName}_${Date.now()}.${ext}`);

              const result = await compressImage(file.path, outputPath, {
                quality: parseInt(quality),
                format: ext,
                lossless,
                maxSize
              });

              const originalSize = result.originalSize;
              const compressedSize = result.compressedSize;
              const savedPercent = ((originalSize - compressedSize) / originalSize * 100).toFixed(1);

              // Get image dimensions for preview
              const sharp = (await import('sharp')).default;
              const metadata = await sharp(outputPath).metadata();

              // 同格式重编码却没变小时，保留原图，避免「压缩后反而更大」
              if (sameFormat(ext, sourceExt) && compressedSize >= originalSize) {
                const keptPath = keepOriginalAsResult(file.path, outputPath, outputDir, baseName, sourceExt);
                results.push({
                  success: true,
                  keptOriginal: true,
                  originalName: file.originalname,
                  originalSize,
                  compressedSize: originalSize,
                  savedPercent: '0.0',
                  format: sourceExt,
                  width: metadata.width,
                  height: metadata.height,
                  outputPath: keptPath,
                  downloadUrl: `/api/download/${path.basename(keptPath)}`
                });
              } else {
                results.push({
                  success: true,
                  originalName: file.originalname,
                  originalSize,
                  compressedSize,
                  savedPercent,
                  format: ext,
                  losslessNote: losslessNoteFor(ext, lossless),
                  width: metadata.width,
                  height: metadata.height,
                  outputPath,
                  downloadUrl: `/api/download/${path.basename(outputPath)}`
                });
              }
            } catch (err) {
              results.push({
                success: false,
                originalName: file.originalname,
                format: fmt,
                error: err.message
              });
            }
          }
        }
      } catch (err) {
        results.push({
          success: false,
          originalName: file.originalname,
          error: err.message
        });
      }
      // Clean up uploaded temp file
      try { fs.unlinkSync(file.path); } catch {}
    }

    res.json({ results });
  } catch (error) {
    console.error('Compress endpoint error:', error);
    if (!res.headersSent) {
      res.status(500).json({ error: error.message });
    }
  }
});

// Get image info endpoint
app.post('/api/info', upload.single('image'), async (req, res) => {
  try {
    const file = req.file;
    if (!file) return res.status(400).json({ error: 'No image uploaded' });

    const info = await getImageInfo(file.path);
    try { fs.unlinkSync(file.path); } catch {}
    // 压缩潜力分析：评估原图还能不能继续压
    info.analysis = analyzeCompressibility(info);
    res.json(info);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Download compressed file
app.get('/api/download/:filename', (req, res) => {
  const filePath = path.join(os.tmpdir(), 'imgmin-ui-output', req.params.filename);
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: 'File not found' });
  }
  res.download(filePath);
});

// Serve compressed output files for preview
app.use('/api/output-file', express.static(path.join(os.tmpdir(), 'imgmin-ui-output')));

// Download all as zip
app.post('/api/download-zip', (req, res) => {
  try {
    const { files } = req.body;
    if (!files || !Array.isArray(files) || files.length === 0) {
      return res.status(400).json({ error: 'No files specified' });
    }

    const outputDir = path.join(os.tmpdir(), 'imgmin-ui-output');
    
    // Verify all files exist
    const validFiles = files.filter(f => {
      const filePath = path.join(outputDir, path.basename(f));
      return fs.existsSync(filePath);
    });

    if (validFiles.length === 0) {
      return res.status(404).json({ error: 'No valid files found' });
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="imgmin_${timestamp}.zip"`);

    const archive = new ZipArchive({ zlib: { level: 1 } });
    
    archive.on('error', (err) => {
      console.error('Archive error:', err);
      if (!res.headersSent) res.status(500).json({ error: 'Zip creation failed' });
    });

    archive.pipe(res);

    // Create a flat folder inside the zip
    for (const f of validFiles) {
      const filePath = path.join(outputDir, path.basename(f));
      archive.file(filePath, { name: path.basename(f) });
    }

    archive.finalize();
  } catch (err) {
    console.error('Download-zip error:', err);
    if (!res.headersSent) res.status(500).json({ error: err.message });
  }
});

// Smart analyze endpoint: content-aware format + adaptive quality
app.post('/api/smart-analyze', async (req, res) => {
  try {
    const { files, metric = 'ssim', threshold } = req.body || {};
    if (!Array.isArray(files) || files.length === 0) {
      return res.status(400).json({ error: 'files array required' });
    }
    const thresholdNum = threshold ? parseFloat(threshold) : undefined;
    const outputDir = path.join(os.tmpdir(), 'imgmin-ui-output');

    const suggestions = [];
    for (const filename of files) {
      const filePath = path.join(outputDir, path.basename(filename));
      if (!fs.existsSync(filePath)) {
        suggestions.push({ filename, error: 'File not found' });
        continue;
      }
      try {
        const sugg = await smartSuggest(filePath, { metric, threshold: thresholdNum });
        suggestions.push({
          filename,
          format: sugg.format,
          reason: sugg.reason,
          quality: sugg.quality,
          qualityMetric: sugg.qualityMetric,
          qualityScore: sugg.qualityScore,
          hasAlpha: sugg.hasAlpha,
          isPhoto: sugg.isPhoto,
          width: sugg.width,
          height: sugg.height,
          originalSize: sugg.size,
          compressedSize: sugg.compressedSize,
          savedPercent: sugg.savedPercent,
        });
      } catch (e) {
        suggestions.push({ filename, error: e.message });
      }
    }

    res.json({ suggestions });
  } catch (err) {
    console.error('Smart-analyze error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Cleanup old temp files periodically
setInterval(() => {
  const dirs = [
    path.join(os.tmpdir(), 'imgmin-ui-output'),
    path.join(os.tmpdir(), 'imgmin-ui-preview')
  ];
  for (const dir of dirs) {
    if (fs.existsSync(dir)) {
      const files = fs.readdirSync(dir);
      const now = Date.now();
      for (const file of files) {
        const filePath = path.join(dir, file);
        try {
          const stat = fs.statSync(filePath);
          if (now - stat.mtimeMs > 10 * 60 * 1000) {
            try { fs.unlinkSync(filePath); } catch {}
          }
        } catch {}
      }
    }
  }
}, 60 * 1000);

// Global error handler for multer
app.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({ error: 'File too large (max 50MB)' });
    }
    if (err.code === 'LIMIT_FILE_COUNT') {
      return res.status(400).json({ error: 'Too many files (max 50)' });
    }
    return res.status(400).json({ error: err.message });
  }
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

// Prevent process crash from unhandled errors
process.on('unhandledRejection', (reason) => {
  console.error('Unhandled Rejection:', reason);
});
process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err);
});

export async function startUIServer(port = 3000) {
  const { exec } = await import('child_process');
  
  return new Promise((resolve, reject) => {
    let server;
    let resolved = false;

    const tryListen = (p) => {
      server = app.listen(p);
      server.keepAliveTimeout = 65000;
      server.headersTimeout = 66000;
      return server;
    };

    server = tryListen(port);

    server.on('listening', () => {
      if (resolved) return;
      resolved = true;

      const addr = server.address();
      const actualPort = addr.port;

      console.log(`\n  ${chalk.green.bold('imgmin UI is running!')}\n`);
      console.log(`  ${chalk.cyan('Local:')}   ${chalk.cyan.underline(`http://localhost:${actualPort}`)}`);
      console.log(`  ${chalk.gray('Press Ctrl+C to stop')}\n`);
      console.log(`  ${chalk.gray('TIP:')} ${chalk.gray('Keep this terminal window open while using the UI.')}\n`);

      // Try to open browser（IMGMIN_NO_BROWSER=1 时跳过，便于测试 / CI）
      if (process.env.IMGMIN_NO_BROWSER !== '1') {
        const platform = os.platform();
        let command;
        if (platform === 'darwin') command = `open http://localhost:${actualPort}`;
        else if (platform === 'win32') command = `start http://localhost:${actualPort}`;
        else command = `xdg-open http://localhost:${actualPort}`;

        exec(command, (err) => {
          if (err) console.log(`  ${chalk.gray(`Could not auto-open browser. Visit: http://localhost:${actualPort}`)}`);
        });
      }

      resolve(server);
    });

    server.on('error', (err) => {
      if (resolved) return; // Already started successfully

      if (err.code === 'EADDRINUSE') {
        console.log(`  ${chalk.yellow(`Port ${port} is in use, trying port ${port + 1}...`)}`);
        server.close(() => {
          tryListen(port + 1);
        });
      } else {
        reject(err);
      }
    });

    // Graceful shutdown
    const shutdown = () => {
      console.log(`\n  ${chalk.yellow('Shutting down imgmin UI...')}`);
      server.close(() => process.exit(0));
      setTimeout(() => process.exit(0), 3000);
    };
    
    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
  });
}
