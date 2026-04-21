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
      console.log(chalk.white(`  Skipped (already WebP): ${results.skipped} files`));
      if (results.failed > 0) {
        console.log(chalk.red(`  Failed: ${results.failed} files`));
      }
      console.log(chalk.green(`  Total saved: ${results.totalSavedPercent}%`));
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
  .description('Compress image files')
  .argument('<source>', 'Source image file or directory')
  .argument('[output]', 'Output file or directory')
  .option('-q, --quality <number>', 'JPEG/WebP quality (1-100)')
  .option('-r, --recursive', 'Process directories recursively')
  .option('-f, --format <type>', 'Output format (jpeg, png, webp, avif)')
  .action(async (source, output, options) => {
    const spinner = ora('Processing...').start();
    const config = getConfig();
    
    // 合并配置
    const quality = options.quality ?? config.quality;
    const recursive = options.recursive ?? config.recursive;
    const format = options.format ?? config.format;
    
    try {
      const stats = fs.statSync(source);
      
      if (stats.isDirectory()) {
        spinner.text = 'Processing directory...';
        const results = await processDirectory(source, output, { quality, recursive, format });
        spinner.succeed(chalk.green(`\n✓ Compressed ${results.success} files`));
        if (results.failed > 0) {
          console.log(chalk.red(`✗ Failed: ${results.failed} files`));
        }
      } else {
        const result = await compressSingleFile(source, output, { quality, format });
        if (result.success) {
          spinner.succeed(chalk.green(`\n✓ Compressed successfully!`));
          console.log(chalk.gray(`  Original: ${result.originalSize} bytes`));
          console.log(chalk.gray(`  Compressed: ${result.compressedSize} bytes`));
          console.log(chalk.green(`  Saved: ${result.savedPercent}%`));
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
  .description('Convert images to WebP format')
  .argument('<source>', 'Source image file or directory')
  .argument('[output]', 'Output file or directory')
  .option('-q, --quality <number>', 'WebP quality (1-100)')
  .option('-r, --recursive', 'Process directories recursively')
  .action(async (source, output, options) => {
    const spinner = ora('Converting to WebP...').start();
    const config = getConfig();
    
    const quality = options.quality ?? config.quality;
    const recursive = options.recursive ?? config.recursive;
    
    try {
      const stats = fs.statSync(source);
      
      if (stats.isDirectory()) {
        spinner.text = 'Processing directory...';
        const results = await processDirectoryToWebp(source, output, { quality, recursive });
        spinner.succeed(chalk.green(`\n✓ Converted ${results.success} files to WebP`));
        if (results.failed > 0) {
          console.log(chalk.red(`✗ Failed: ${results.failed} files`));
        }
      } else {
        const result = await convertToWebpSingle(source, output, { quality });
        if (result.success) {
          spinner.succeed(chalk.green(`\n✓ Converted to WebP successfully!`));
          console.log(chalk.gray(`  Original: ${result.originalSize} bytes`));
          console.log(chalk.gray(`  WebP: ${result.convertedSize} bytes`));
          console.log(chalk.green(`  Saved: ${result.savedPercent}%`));
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
  const pattern = `${sourceDir}/**/*.{jpg,jpeg,png,gif,tiff,bmp,webp}`;
  const files = await glob(pattern, { nodir: true });
  
  const results = { 
    success: 0, 
    converted: 0,
    skipped: 0,
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
        results.skipped++;
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
  
  // 检查文件名是否已被使用
  while (processedFiles.has(originalPath) || fs.existsSync(outputPath)) {
    outputPath = path.join(dir, `${baseName}_${counter}${targetExt}`);
    counter++;
  }
  
  return outputPath;
}

async function processDirectory(sourceDir, outputDir, options) {
  const { quality, recursive, format } = options;
  const pattern = recursive 
    ? `${sourceDir}/**/*.{jpg,jpeg,png,gif,tiff,bmp}`
    : `${sourceDir}/*.{jpg,jpeg,png,gif,tiff,bmp}`;
  
  const files = await glob(pattern, { nodir: true });
  const results = { success: 0, failed: 0 };
  
  for (const file of files) {
    try {
      const relativePath = path.relative(sourceDir, file);
      let outputPath;
      
      if (outputDir) {
        outputPath = path.join(outputDir, relativePath);
        const outDir = path.dirname(outputPath);
        if (!fs.existsSync(outDir)) {
          fs.mkdirSync(outDir, { recursive: true });
        }
      } else {
        const ext = format ? `.${format}` : path.extname(file);
        const baseName = path.basename(file, path.extname(file));
        outputPath = path.join(path.dirname(file), `${baseName}_compressed${ext}`);
      }
      
      await compressImage(file, outputPath, {
        quality: parseInt(quality),
        format: format || undefined
      });
      results.success++;
    } catch (error) {
      console.log(chalk.yellow(`\n⚠ Failed: ${file} - ${error.message}`));
      results.failed++;
    }
  }
  
  return results;
}

async function processDirectoryToWebp(sourceDir, outputDir, options) {
  const { quality, recursive } = options;
  const pattern = recursive 
    ? `${sourceDir}/**/*.{jpg,jpeg,png,gif,tiff,bmp}`
    : `${sourceDir}/*.{jpg,jpeg,png,gif,tiff,bmp}`;
  
  const files = await glob(pattern, { nodir: true });
  const results = { success: 0, failed: 0 };
  
  for (const file of files) {
    try {
      const relativePath = path.relative(sourceDir, file);
      let outputPath;
      
      if (outputDir) {
        outputPath = path.join(outputDir, relativePath.replace(/\.[^.]+$/, '.webp'));
        const outDir = path.dirname(outputPath);
        if (!fs.existsSync(outDir)) {
          fs.mkdirSync(outDir, { recursive: true });
        }
      } else {
        const baseName = path.basename(file, path.extname(file));
        outputPath = path.join(path.dirname(file), `${baseName}.webp`);
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
  const { quality, format } = options;
  
  if (!output) {
    const ext = format ? `.${format}` : path.extname(source);
    const baseName = path.basename(source, path.extname(source));
    output = path.join(path.dirname(source), `${baseName}_compressed${ext}`);
  }
  
  await compressImage(source, output, {
    quality: parseInt(quality),
    format: format || undefined
  });
  
  const originalSize = stats.size;
  const compressedSize = fs.statSync(output).size;
  const savedPercent = ((originalSize - compressedSize) / originalSize * 100).toFixed(1);
  
  return {
    success: true,
    originalSize,
    compressedSize,
    savedPercent: `${savedPercent}%`
  };
}

async function convertToWebpSingle(source, output, options) {
  const stats = fs.statSync(source);
  const { quality } = options;
  
  if (!output) {
    const baseName = path.basename(source, path.extname(source));
    output = path.join(path.dirname(source), `${baseName}.webp`);
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
