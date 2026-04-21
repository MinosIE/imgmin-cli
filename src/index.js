import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import { compressImage, compressImageToWebp } from './compress.js';
import { convertImage } from './convert.js';
import { getImageInfo, glob } from './utils.js';
import { getConfig, setConfigValue, resetConfigValue, resetConfig, getConfigPath, hasConfigFile } from './config.js';
import path from 'path';
import fs from 'fs';

const program = new Command();

program
  .name('imgmin')
  .description('A powerful CLI tool for compressing and converting images')
  .version('1.0.0');

// 默认命令 - 当没有提供子命令时执行
program
  .action(async () => {
    const spinner = ora('Scanning and processing images...').start();
    const config = getConfig();
    
    try {
      const currentDir = process.cwd();
      const results = await processAllImagesToWebp(currentDir, config);
      
      spinner.succeed(chalk.green(`\n✓ Processing complete!`));
      console.log(chalk.cyan('\n📊 Summary:\n'));
      console.log(chalk.white(`  Processed: ${results.success} files`));
      console.log(chalk.white(`  Converted to WebP: ${results.converted} files`));
      if (results.webpOptimized > 0) {
        console.log(chalk.white(`  WebP optimized: ${results.webpOptimized} files`));
      }
      if (results.skipped > 0) {
        console.log(chalk.gray(`  Skipped: ${results.skipped} files`));
      }
      if (results.failed > 0) {
        console.log(chalk.red(`  Failed: ${results.failed} files`));
      }
      console.log(chalk.green(`  Total saved: ${results.totalSavedPercent}`));
      console.log();
    } catch (error) {
      spinner.fail(chalk.red(`\n✗ Error: ${error.message}`));
    }
  });

// 配置命令
program
  .command('config')
  .description('Manage configuration')
  .argument('[key]', 'Configuration key to view or set')
  .argument('[value]', 'Value to set (omit to view)')
  .option('-g, --global', 'Show global config file path')
  .option('-r, --reset', 'Reset all configuration')
  .option('-d, --delete <key>', 'Delete a specific configuration key')
  .action((key, value, options) => {
    if (options.global) {
      console.log(chalk.cyan(`\n📁 Config file: ${getConfigPath()}\n`));
      return;
    }
    
    if (options.reset) {
      resetConfig();
      console.log(chalk.green(`\n✓ Configuration reset to defaults\n`));
      return;
    }
    
    if (options.delete) {
      const deleted = resetConfigValue(options.delete);
      if (deleted) {
        console.log(chalk.green(`\n✓ Deleted config: ${options.delete}\n`));
      } else {
        console.log(chalk.red(`\n✗ Unknown config key: ${options.delete}\n`));
      }
      return;
    }
    
    if (key) {
      if (value !== undefined) {
        // 设置值
        let parsedValue = value;
        
        // 布尔值转换
        if (value === 'true') parsedValue = true;
        else if (value === 'false') parsedValue = false;
        // 数字转换
        else if (!isNaN(value) && value !== '') parsedValue = Number(value);
        
        setConfigValue(key, parsedValue);
        console.log(chalk.green(`\n✓ Set ${key} = ${chalk.bold(value)}\n`));
      } else {
        // 查看单个值
        const config = getConfig();
        if (key in config) {
          console.log(chalk.cyan(`\n${key} = ${chalk.bold(config[key])}\n`));
        } else {
          console.log(chalk.red(`\n✗ Unknown config key: ${key}\n`));
        }
      }
    } else {
      // 查看所有配置
      const config = getConfig();
      console.log(chalk.cyan('\n⚙️  Configuration\n'));
      for (const [k, v] of Object.entries(config)) {
        const displayValue = v === '' ? '(none)' : v;
        const color = v === '' ? 'gray' : 'white';
        console.log(chalk[color](`  ${chalk.bold(k.padEnd(12))} ${displayValue}`));
      }
      console.log(chalk.gray(`\n  Config file: ${getConfigPath()}`));
      console.log();
    }
  });

// 压缩图片命令
program
  .command('compress')
  .alias('c')
  .description('Compress image files and generate WebP (default: current directory)')
  .argument('[source]', 'Source image file or directory (default: current directory)')
  .argument('[output]', 'Output file or directory')
  .option('-q, --quality <number>', 'JPEG/WebP quality (1-100)')
  .option('-r, --recursive', 'Process directories recursively')
  .option('-f, --format <type>', 'Output format (jpeg, png, webp, avif, tiff, gif)')
  .option('--no-webp', 'Do not generate WebP versions')
  .option('--force', 'Replace original file with compressed version (no _compressed suffix)')
  .action(async (source, output, options) => {
    const config = getConfig();
    
    // 如果没有提供 source，使用当前目录
    const sourcePath = source || process.cwd();
    // recursive 默认 true，除非用户明确设置 --no-recursive
    const recursive = options.recursive !== undefined ? options.recursive : true;
    const quality = options.quality ?? config.quality;
    const format = options.format ?? config.format;
    const generateWebp = options.webp !== false; // 默认生成 webp
    const forceReplace = options.force || false;
    
    const spinner = ora('Processing...').start();
    
    try {
      const stats = fs.statSync(sourcePath);
      
      if (stats.isDirectory()) {
        spinner.text = 'Processing directory...';
        const results = await processDirectory(sourcePath, output, { quality, recursive, format, generateWebp, forceReplace }, spinner);
        
        if (results.success === 0 && results.failed === 0 && results.skipped === 0) {
          spinner.stop();
          console.log(chalk.yellow(`\n⚠ No images found in ${sourcePath}`));
          return;
        }
        
        spinner.succeed(chalk.green(`\n✓ Compressed ${results.success} files`));
        if (results.skipped > 0) {
          console.log(chalk.gray(`  Skipped: ${results.skipped} files`));
        }
        if (results.skippedLarger > 0) {
          console.log(chalk.gray(`  Skipped (larger after compress): ${results.skippedLarger} files`));
        }
        if (results.webpGenerated > 0) {
          console.log(chalk.cyan(`  WebP generated: ${results.webpGenerated} files`));
        }
        if (results.failed > 0) {
          console.log(chalk.red(`✗ Failed: ${results.failed} files`));
        }
      } else {
        const result = await compressSingleFile(sourcePath, output, { quality, format, generateWebp, forceReplace });
        if (result.skipped) {
          spinner.stop();
          console.log(chalk.yellow(`\n⚠ Skipped: ${result.message}`));
        } else if (result.success) {
          spinner.succeed(chalk.green(`\n✓ Compressed successfully!`));
          console.log(chalk.gray(`  Original: ${result.originalSize} bytes`));
          console.log(chalk.gray(`  Compressed: ${result.compressedSize} bytes`));
          console.log(chalk.green(`  Saved: ${result.savedPercent}`));
          if (result.webpPath) {
            console.log(chalk.cyan(`  WebP: ${result.webpPath}`));
          }
        } else {
          spinner.fail(chalk.red(`\n✗ ${result.error}`));
        }
      }
    } catch (error) {
      spinner.fail(chalk.red(`\n✗ Error: ${error.message}`));
    }
  });

// 转换为 WebP 命令
program
  .command('webp')
  .description('Convert images to WebP format (default: current directory)')
  .argument('[source]', 'Source image file or directory (default: current directory)')
  .argument('[output]', 'Output file or directory')
  .option('-q, --quality <number>', 'WebP quality (1-100)')
  .option('-r, --recursive', 'Process directories recursively')
  .action(async (source, output, options) => {
    const spinner = ora('Converting to WebP...').start();
    const config = getConfig();
    
    const sourcePath = source || process.cwd();
    const quality = options.quality ?? config.quality;
    const recursive = options.recursive !== undefined ? options.recursive : true;
    
    try {
      const stats = fs.statSync(sourcePath);
      
      if (stats.isDirectory()) {
        spinner.text = 'Processing directory...';
        const results = await processDirectoryToWebp(sourcePath, output, { quality, recursive }, spinner);
        
        if (results.success === 0 && results.failed === 0 && results.skipped === 0) {
          spinner.stop();
          console.log(chalk.yellow(`\n⚠ No images found in ${sourcePath}`));
          return;
        }
        
        spinner.succeed(chalk.green(`\n✓ Converted ${results.success} files to WebP`));
        if (results.skipped > 0) {
          console.log(chalk.gray(`  Skipped: ${results.skipped} files`));
        }
        if (results.failed > 0) {
          console.log(chalk.red(`✗ Failed: ${results.failed} files`));
        }
      } else {
        const result = await convertToWebpSingle(sourcePath, output, { quality });
        if (result.skipped) {
          spinner.stop();
          console.log(chalk.yellow(`\n⚠ Skipped: ${result.message}`));
        } else if (result.success) {
          spinner.succeed(chalk.green(`\n✓ Converted to WebP successfully!`));
          console.log(chalk.gray(`  Original: ${result.originalSize} bytes`));
          console.log(chalk.gray(`  WebP: ${result.convertedSize} bytes`));
          console.log(chalk.green(`  Saved: ${result.savedPercent}`));
        } else {
          spinner.fail(chalk.red(`\n✗ ${result.error}`));
        }
      }
    } catch (error) {
      spinner.fail(chalk.red(`\n✗ Error: ${error.message}`));
    }
  });

// 格式转换命令
program
  .command('convert')
  .description('Convert images between formats')
  .argument('<source>', 'Source image file')
  .argument('<output>', 'Output file path')
  .option('-q, --quality <number>', 'Quality (1-100)')
  .action(async (source, output, options) => {
    const spinner = ora('Converting...').start();
    const config = getConfig();
    
    const quality = options.quality ?? config.quality;
    
    try {
      const ext = path.extname(output).toLowerCase().replace('.', '');
      const result = await convertImage(source, output, { 
        format: ext,
        quality: parseInt(quality)
      });
      
      spinner.succeed(chalk.green(`\n✓ Converted successfully!`));
      console.log(chalk.gray(`  Original: ${result.originalSize} bytes`));
      console.log(chalk.gray(`  Converted: ${result.convertedSize} bytes`));
      console.log(chalk.green(`  Saved: ${result.savedPercent}%`));
    } catch (error) {
      spinner.fail(chalk.red(`\n✗ Error: ${error.message}`));
    }
  });

// 查看图片信息命令
program
  .command('info')
  .description('Show image information')
  .argument('<file>', 'Image file to inspect')
  .action(async (file) => {
    try {
      const info = await getImageInfo(file);
      console.log(chalk.cyan('\n📷 Image Information\n'));
      console.log(chalk.white(`  File: ${chalk.bold(info.fileName)}`));
      console.log(chalk.white(`  Size: ${info.size} bytes (${(info.size / 1024).toFixed(2)} KB)`));
      console.log(chalk.white(`  Format: ${chalk.green(info.format)}`));
      console.log(chalk.white(`  Dimensions: ${info.width} x ${info.height} px`));
      if (info.hasAlpha) {
        console.log(chalk.white(`  Alpha: Yes`));
      }
      if (info.density) {
        console.log(chalk.white(`  Density: ${info.density} dpi`));
      }
      console.log();
    } catch (error) {
      console.log(chalk.red(`✗ Error: ${error.message}`));
    }
  });

// 批量处理函数 - 处理所有图片并转换为 WebP
async function processAllImagesToWebp(sourceDir, config) {
  const pattern = `${sourceDir}/**/*.{jpg,jpeg,png,gif,tiff,tif,bmp,svg,avif,webp}`;
  const files = await glob(pattern, { nodir: true });
  
  // 过滤掉已经是 webp 的文件（只压缩不转换）
  const imageFiles = files.filter(f => !f.toLowerCase().endsWith('.webp'));
  const webpFiles = files.filter(f => f.toLowerCase().endsWith('.webp'));
  
  // 检查是否有可处理的图片
  if (imageFiles.length === 0 && webpFiles.length === 0) {
    console.log(chalk.yellow(`\n⚠ No images found in current directory`));
    console.log(chalk.gray(`  Supported formats: jpg, jpeg, png, gif, tiff, tif, bmp, svg, avif, webp`));
    console.log(chalk.gray(`  Run 'imgmin --help' for usage information\n`));
    return { 
      success: 0, 
      converted: 0,
      skipped: 0,
      webpOptimized: 0,
      failed: 0,
      totalSavedPercent: '0.0'
    };
  }
  
  const results = { 
    success: 0, 
    converted: 0,
    skipped: 0,
    webpOptimized: 0,
    failed: 0,
    totalOriginalSize: 0,
    totalConvertedSize: 0
  };
  
  // 用于跟踪已处理的文件名，避免重复
  const processedFiles = new Map();
  
  for (const file of files) {
    try {
      const ext = path.extname(file).toLowerCase();
      const isAlreadyWebp = ext === '.webp';
      
      // 生成输出路径（确保唯一性）
      let outputPath = generateUniqueOutputPath(file, '.webp', processedFiles);
      
      if (isAlreadyWebp) {
        // 已经是 WebP 格式，只压缩不转换
        await compressImageToWebp(file, outputPath, config.quality);
        results.webpOptimized++;
      } else {
        // 转换为 WebP
        await compressImageToWebp(file, outputPath, config.quality);
        results.converted++;
      }
      
      const originalSize = fs.statSync(file).size;
      const compressedSize = fs.statSync(outputPath).size;
      
      results.totalOriginalSize += originalSize;
      results.totalConvertedSize += compressedSize;
      results.success++;
      
      // 记录已处理的文件
      processedFiles.set(file, outputPath);
    } catch (error) {
      console.log(chalk.yellow(`\n⚠ Failed: ${file} - ${error.message}`));
      results.failed++;
    }
  }
  
  // 计算总节省百分比
  if (results.totalOriginalSize > 0) {
    const savedPercent = ((results.totalOriginalSize - results.totalConvertedSize) / results.totalOriginalSize * 100).toFixed(1);
    results.totalSavedPercent = savedPercent;
  } else {
    results.totalSavedPercent = '0.0';
  }
  
  return results;
}

// 生成唯一的输出路径，处理名称重复问题
function generateUniqueOutputPath(originalPath, targetExt, processedFiles) {
  const dir = path.dirname(originalPath);
  const baseName = path.basename(originalPath, path.extname(originalPath));
  
  let outputPath = path.join(dir, `${baseName}${targetExt}`);
  let counter = 1;
  
  // 检查输出文件名是否已被使用（检查已生成的输出文件或磁盘上已存在的文件）
  while (Array.from(processedFiles.values()).includes(outputPath) || fs.existsSync(outputPath)) {
    outputPath = path.join(dir, `${baseName}_${counter}${targetExt}`);
    counter++;
  }
  
  return outputPath;
}

async function processDirectory(sourceDir, outputDir, options, spinner) {
  const { quality, recursive, format, generateWebp, forceReplace } = options;
  const pattern = recursive 
    ? `${sourceDir}/**/*.{jpg,jpeg,png,gif,tiff,tif,bmp,svg,avif}`
    : `${sourceDir}/*.{jpg,jpeg,png,gif,tiff,tif,bmp,svg,avif}`;
  
  const files = await glob(pattern, { nodir: true });
  // 过滤掉 _compressed 等已处理过的文件，避免重复压缩
  const filteredFiles = files.filter(f => !path.basename(f).includes('_compressed'));
  const results = { success: 0, failed: 0, webpGenerated: 0, skipped: 0, skippedLarger: 0 };
  const total = filteredFiles.length;
  
  for (let i = 0; i < filteredFiles.length; i++) {
    const file = filteredFiles[i];
    if (spinner) {
      spinner.text = `Processing [${i + 1}/${total}] ${path.basename(file)}`;
    }
    try {
      const relativePath = path.relative(sourceDir, file);
      const ext = path.extname(file);
      const baseName = path.basename(file, ext);
      const dirName = path.dirname(file);
      
      // 检查是否需要跳过（文件已处理过）
      if (outputDir) {
        // 有输出目录时，只检查输出文件是否存在
        const targetExt = format ? `.${format}` : ext;
        const outputPath = path.join(outputDir, relativePath.replace(/\.[^.]+$/, targetExt));
        if (fs.existsSync(outputPath)) {
          console.log(chalk.gray(`  Skip (exists): ${file}`));
          results.skipped++;
          continue;
        }
      } else if (!forceReplace) {
        // 非强制替换模式，检查压缩文件和 webp 是否存在
        const compressedPath = path.join(dirName, `${baseName}_compressed${ext}`);
        if (fs.existsSync(compressedPath)) {
          console.log(chalk.gray(`  Skip (compressed): ${file}`));
          results.skipped++;
          continue;
        }
        
        if (generateWebp) {
          const webpPath = path.join(dirName, `${baseName}.webp`);
          if (fs.existsSync(webpPath)) {
            console.log(chalk.gray(`  Skip (WebP exists): ${file}`));
            results.skipped++;
            continue;
          }
        }
      } else if (generateWebp) {
        // 强制替换模式下，只检查 webp 是否存在
        const webpPath = path.join(dirName, `${baseName}.webp`);
        if (fs.existsSync(webpPath)) {
          console.log(chalk.gray(`  Skip (WebP exists): ${file}`));
          results.skipped++;
          continue;
        }
      }
      
      let outputPath;
      if (outputDir) {
        outputPath = path.join(outputDir, relativePath);
        const outDir = path.dirname(outputPath);
        if (!fs.existsSync(outDir)) {
          fs.mkdirSync(outDir, { recursive: true });
        }
      } else if (forceReplace) {
        // 强制替换模式：先输出到临时文件，再替换原文件
        const outExt = format ? `.${format}` : ext;
        outputPath = path.join(dirName, `${baseName}_imgmin_tmp${outExt}`);
      } else {
        const outExt = format ? `.${format}` : ext;
        outputPath = path.join(dirName, `${baseName}_compressed${outExt}`);
      }
      
      await compressImage(file, outputPath, {
        quality: parseInt(quality),
        format: format || undefined
      });
      
      // 检查压缩后文件大小，如果更大则跳过（仅适用于生成 _compressed 文件的场景）
      if (!forceReplace && !outputDir) {
        const originalSize = fs.statSync(file).size;
        const compressedSize = fs.statSync(outputPath).size;
        
        if (compressedSize >= originalSize) {
          // 压缩后更大，删除生成的文件
          fs.unlinkSync(outputPath);
          console.log(chalk.gray(`  Skip (larger): ${file} (${originalSize} → ${compressedSize})`));
          results.skippedLarger++;
          continue;
        }
      }
      
      // 强制替换模式：用压缩后的文件替换原文件
      if (forceReplace && !outputDir) {
        const originalSize = fs.statSync(file).size;
        const compressedSize = fs.statSync(outputPath).size;
        
        if (compressedSize >= originalSize) {
          // 压缩后更大，删除临时文件，保留原文件
          fs.unlinkSync(outputPath);
          console.log(chalk.gray(`  Skip (larger): ${file} (${originalSize} → ${compressedSize})`));
          results.skippedLarger++;
          results.success++;
          continue;
        }
        
        const targetExt = format ? `.${format}` : ext;
        const finalPath = path.join(dirName, `${baseName}${targetExt}`);
        fs.unlinkSync(file);
        fs.renameSync(outputPath, finalPath);
        outputPath = finalPath;
      }
      
      results.success++;
      
      // 同时生成 WebP 版本
      if (generateWebp) {
        try {
          const webpPath = path.join(dirName, `${baseName}.webp`);
          // 读取源文件用于 webp 转换（forceReplace 下源文件可能已被替换）
          await compressImageToWebp(forceReplace ? outputPath : file, webpPath, parseInt(quality));
          results.webpGenerated++;
        } catch (webpError) {
          console.log(chalk.yellow(`\n⚠ WebP skipped: ${file} - ${webpError.message}`));
        }
      }
    } catch (error) {
      console.log(chalk.yellow(`\n⚠ Failed: ${file} - ${error.message}`));
      results.failed++;
    }
  }
  
  return results;
}

async function processDirectoryToWebp(sourceDir, outputDir, options, spinner) {
  const { quality, recursive } = options;
  const pattern = recursive 
    ? `${sourceDir}/**/*.{jpg,jpeg,png,gif,tiff,tif,bmp,svg,avif}`
    : `${sourceDir}/*.{jpg,jpeg,png,gif,tiff,tif,bmp,svg,avif}`;
  
  const files = await glob(pattern, { nodir: true });
  const filteredFiles = files.filter(f => !path.basename(f).includes('_compressed'));
  const results = { success: 0, failed: 0, skipped: 0 };
  const total = filteredFiles.length;
  
  for (let i = 0; i < filteredFiles.length; i++) {
    const file = filteredFiles[i];
    if (spinner) {
      spinner.text = `Converting [${i + 1}/${total}] ${path.basename(file)}`;
    }
    try {
      const relativePath = path.relative(sourceDir, file);
      const baseName = path.basename(file, path.extname(file));
      const dirName = path.dirname(file);
      let outputPath;
      
      if (outputDir) {
        outputPath = path.join(outputDir, relativePath.replace(/\.[^.]+$/, '.webp'));
        const outDir = path.dirname(outputPath);
        if (!fs.existsSync(outDir)) {
          fs.mkdirSync(outDir, { recursive: true });
        }
        if (fs.existsSync(outputPath)) {
          console.log(chalk.gray(`  Skip (exists): ${file}`));
          results.skipped++;
          continue;
        }
      } else {
        outputPath = path.join(dirName, `${baseName}.webp`);
        if (fs.existsSync(outputPath)) {
          console.log(chalk.gray(`  Skip (WebP exists): ${file}`));
          results.skipped++;
          continue;
        }
      }
      
      await compressImageToWebp(file, outputPath, parseInt(quality));
      results.success++;
    } catch (error) {
      console.log(chalk.yellow(`\n⚠ Failed: ${file} - ${error.message}`));
      results.failed++;
    }
  }
  
  return results;
}

async function compressSingleFile(source, output, options) {
  const stats = fs.statSync(source);
  const { quality, format, generateWebp, forceReplace } = options;
  const ext = path.extname(source);
  const baseName = path.basename(source, ext);
  const dirName = path.dirname(source);
  
  // 检查是否需要跳过
  if (!output && !forceReplace) {
    const compressedPath = path.join(dirName, `${baseName}_compressed${ext}`);
    if (fs.existsSync(compressedPath)) {
      return { success: true, skipped: true, message: 'Compressed file already exists' };
    }
    
    if (generateWebp) {
      const webpPath = path.join(dirName, `${baseName}.webp`);
      if (fs.existsSync(webpPath)) {
        return { success: true, skipped: true, message: 'WebP file already exists' };
      }
    }
  } else if (!output && forceReplace && generateWebp) {
    const webpPath = path.join(dirName, `${baseName}.webp`);
    if (fs.existsSync(webpPath)) {
      return { success: true, skipped: true, message: 'WebP file already exists' };
    }
  }
  
  let finalOutput;
  if (output) {
    finalOutput = output;
  } else if (forceReplace) {
    // 强制替换模式：先输出到临时文件
    const outExt = format ? `.${format}` : ext;
    finalOutput = path.join(dirName, `${baseName}_imgmin_tmp${outExt}`);
  } else {
    finalOutput = path.join(dirName, `${baseName}_compressed${ext}`);
  }
  
  await compressImage(source, finalOutput, {
    quality: parseInt(quality),
    format: format || undefined
  });
  
  const compressedSize = fs.statSync(finalOutput).size;
  
  // 检查压缩后文件大小，如果更大则跳过（仅适用于生成 _compressed 文件的场景）
  if (!forceReplace && !output) {
    if (compressedSize >= stats.size) {
      // 压缩后更大，删除生成的文件
      fs.unlinkSync(finalOutput);
      return { 
        success: true, 
        skipped: true, 
        message: `Compressed file is larger (${stats.size} → ${compressedSize}), kept original` 
      };
    }
  }
  
  // 强制替换模式：用压缩后的文件替换原文件
  if (forceReplace && !output) {
    if (compressedSize >= stats.size) {
      // 压缩后更大，删除临时文件，保留原文件
      fs.unlinkSync(finalOutput);
      return { 
        success: true, 
        skipped: true, 
        message: `Compressed file is larger (${stats.size} → ${compressedSize}), kept original` 
      };
    }
    
    const targetExt = format ? `.${format}` : ext;
    const originalPath = path.join(dirName, `${baseName}${targetExt}`);
    fs.unlinkSync(source);
    fs.renameSync(finalOutput, originalPath);
    finalOutput = originalPath;
  }
  
  const savedPercent = ((stats.size - compressedSize) / stats.size * 100).toFixed(1);
  
  const result = {
    success: true,
    originalSize: stats.size,
    compressedSize,
    savedPercent: `${savedPercent}%`
  };
  
  // 同时生成 WebP 版本
  if (generateWebp) {
    try {
      const webpPath = path.join(dirName, `${baseName}.webp`);
      
      await compressImageToWebp(forceReplace ? finalOutput : source, webpPath, parseInt(quality));
      result.webpPath = webpPath;
    } catch (webpError) {
      console.log(chalk.yellow(`\n⚠ WebP skipped: ${source} - ${webpError.message}`));
    }
  }
  
  return result;
}

async function convertToWebpSingle(source, output, options) {
  const stats = fs.statSync(source);
  const { quality } = options;
  const baseName = path.basename(source, path.extname(source));
  const dirName = path.dirname(source);
  
  if (!output) {
    output = path.join(dirName, `${baseName}.webp`);
  }
  
  // 检查是否已存在 webp
  if (fs.existsSync(output)) {
    return { success: true, skipped: true, message: 'WebP file already exists' };
  }
  
  await compressImageToWebp(source, output, parseInt(quality));
  
  const originalSize = stats.size;
  const convertedSize = fs.statSync(output).size;
  const savedPercent = ((originalSize - convertedSize) / originalSize * 100).toFixed(1);
  
  return {
    success: true,
    originalSize,
    convertedSize,
    savedPercent: `${savedPercent}%`
  };
}

program.parse();
