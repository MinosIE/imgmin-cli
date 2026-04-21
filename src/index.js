import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import { compressImage, compressImageToWebp } from './compress.js';
import { convertImage } from './convert.js';
import { getImageInfo, glob } from './utils.js';
import path from 'path';
import fs from 'fs';

const program = new Command();

program
  .name('imgmin')
  .description('A powerful CLI tool for compressing and converting images')
  .version('1.0.0');

// 压缩图片命令
program
  .command('compress')
  .description('Compress image files')
  .argument('<source>', 'Source image file or directory')
  .argument('[output]', 'Output file or directory (default: same location with _compressed suffix)')
  .option('-q, --quality <number>', 'JPEG/WebP quality (1-100)', '80')
  .option('-r, --recursive', 'Process directories recursively', false)
  .option('-f, --format <type>', 'Output format (jpeg, png, webp, avif)', '')
  .action(async (source, output, options) => {
    const spinner = ora('Processing...').start();
    
    try {
      const stats = fs.statSync(source);
      
      if (stats.isDirectory()) {
        spinner.text = 'Processing directory...';
        const results = await processDirectory(source, output, options);
        spinner.succeed(chalk.green(`\n✓ Compressed ${results.success} files`));
        if (results.failed > 0) {
          console.log(chalk.red(`✗ Failed: ${results.failed} files`));
        }
      } else {
        const result = await compressSingleFile(source, output, options);
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
  .option('-q, --quality <number>', 'WebP quality (1-100)', '80')
  .option('-r, --recursive', 'Process directories recursively', false)
  .action(async (source, output, options) => {
    const spinner = ora('Converting to WebP...').start();
    
    try {
      const stats = fs.statSync(source);
      
      if (stats.isDirectory()) {
        spinner.text = 'Processing directory...';
        const results = await processDirectoryToWebp(source, output, options);
        spinner.succeed(chalk.green(`\n✓ Converted ${results.success} files to WebP`));
        if (results.failed > 0) {
          console.log(chalk.red(`✗ Failed: ${results.failed} files`));
        }
      } else {
        const result = await convertToWebpSingle(source, output, options);
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
  .option('-q, --quality <number>', 'Quality (1-100)', '80')
  .action(async (source, output, options) => {
    const spinner = ora('Converting...').start();
    
    try {
      const ext = path.extname(output).toLowerCase().replace('.', '');
      const result = await convertImage(source, output, { 
        format: ext,
        quality: parseInt(options.quality)
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

// 批量处理函数
async function processDirectory(sourceDir, outputDir, options) {
  const pattern = options.recursive 
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
        const ext = options.format ? `.${options.format}` : path.extname(file);
        const baseName = path.basename(file, path.extname(file));
        outputPath = path.join(path.dirname(file), `${baseName}_compressed${ext}`);
      }
      
      await compressImage(file, outputPath, {
        quality: parseInt(options.quality),
        format: options.format || undefined
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
  const pattern = options.recursive 
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
      
      await compressImageToWebp(file, outputPath, parseInt(options.quality));
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
  
  if (!output) {
    const ext = options.format ? `.${options.format}` : path.extname(source);
    const baseName = path.basename(source, path.extname(source));
    output = path.join(path.dirname(source), `${baseName}_compressed${ext}`);
  }
  
  await compressImage(source, output, {
    quality: parseInt(options.quality),
    format: options.format || undefined
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
  
  if (!output) {
    const baseName = path.basename(source, path.extname(source));
    output = path.join(path.dirname(source), `${baseName}.webp`);
  }
  
  await compressImageToWebp(source, output, parseInt(options.quality));
  
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
