# imgmin-cli

图片压缩与格式转换 CLI 工具，基于 sharp 实现。

## 安装

```bash
npm install
npm link
```

## 快速开始

```bash
# 1. 安装
npm install
npm link

# 2. 使用 - 零配置运行
cd /path/to/images
imgmin                    # 自动处理所有图片！

# 或者使用具体命令
imgmin c photo.jpg        # 压缩并生成 webp
imgmin c .                # 压缩当前目录所有图片
imgmin webp ./images -r   # 批量转换为 webp
```

## 命令

### 默认命令 - 快速批量处理

```bash
imgmin

# 直接运行，自动处理当前目录及其子目录下的所有图片
# - 非 WebP 格式：转换为 WebP 并压缩（输出到原目录）
# - WebP 格式：压缩优化
# - 自动处理文件名冲突（添加 _1, _2 等后缀）
```

**特性：**
- 零配置运行，无需任何参数
- 递归扫描当前目录及所有子目录
- 自动转换为 WebP 格式（节省最多 80% 体积）
- WebP 格式文件也会被压缩优化
- 智能文件名管理，避免覆盖原文件
- 显示详细统计信息

**输出说明：**
- 生成的 `.webp` 文件保存在**原图片所在目录**
- 如果同名文件已存在，自动添加数字后缀（如 `photo_1.webp`, `photo_2.webp`）
- 不会删除或修改原始图片文件

### config - 配置管理

```bash
imgmin config [key] [value] [options]

# 示例
imgmin config                 # 查看所有配置
imgmin config quality         # 查看单个配置项
imgmin config quality 85      # 设置质量为 85
imgmin config quality true     # 设置为布尔值
imgmin config -g               # 显示配置文件路径
imgmin config -d quality       # 删除配置项（恢复默认值）
imgmin config -r               # 重置所有配置
```

**选项：**
- `-g, --global` - 显示配置文件路径
- `-d, --delete <key>` - 删除指定配置项
- `-r, --reset` - 重置所有配置

**可配置项：**
| 键 | 类型 | 默认值 | 说明 |
|---|---|---|---|
| `quality` | number | 80 | 压缩质量 1-100 |
| `format` | string | - | 默认输出格式 |
| `recursive` | boolean | false | 是否递归处理目录（注：compress/webp 命令实际默认递归，此配置仅影响其他命令） |
| `outputDir` | string | - | 默认输出目录 |

配置文件位于 `~/.imgminrc`

### compress / c - 压缩图片

```bash
imgmin compress <source> [output] [options]
imgmin c <source> [output] [options]          # 使用别名

# 示例
imgmin c input.jpg                            # 压缩单张图片，生成 input_compressed.jpg 和 input.webp
imgmin c input.png -q 85                      # 设置质量
imgmin c input.jpg output.webp -f webp        # 输出为 webp
imgmin c ./images ./output -r                 # 批量压缩目录到输出文件夹
imgmin c input.jpg --force                    # 强制替换原文件（不生成 _compressed 后缀）
imgmin c input.jpg --no-webp                  # 只压缩，不生成 WebP 版本
```

**选项：**
- `-q, --quality <number>` - 质量 1-100（默认使用配置）
- `-r, --recursive` - 递归处理子目录（默认启用，使用 --no-recursive 关闭）
- `-f, --format <type>` - 输出格式（jpeg, png, webp, avif, tiff, gif）
- `--no-webp` - 不生成 WebP 版本
- `--force` - 用压缩后的文件替换原文件（无 `_compressed` 后缀）

**输出行为：**
- **无 output 参数时**：在原目录生成 `<filename>_compressed.<ext>` 和 `<filename>.webp`
- **有 output 参数时**：输出到指定文件或目录
- **使用 `--force` 时**：直接替换原文件（如果压缩后更小）
- **默认同时生成 WebP**：除非使用 `--no-webp` 禁用

**提示：** 
- 使用 `imgmin` 默认命令可以快速批量转换整个目录
- `c` 是 `compress` 的简短形式，两者功能完全相同
- 如果压缩后文件更大，会自动跳过替换（`--force` 模式下）

### webp - 转换为 WebP

```bash
imgmin webp <source> [output] [options]

# 示例
imgmin webp input.png                        # 转换为 input.webp
imgmin webp input.jpg -q 75                  # 设置质量
imgmin webp ./images ./output -r             # 批量转换到输出目录
```

**选项：**
- `-q, --quality <number>` - 质量 1-100
- `-r, --recursive` - 递归处理子目录（默认启用，使用 --no-recursive 关闭）

**输出行为：**
- **无 output 参数时**：在原目录生成 `<filename>.webp`
- **有 output 参数时**：输出到指定文件或目录
- **跳过已存在的文件**：如果目标 `.webp` 文件已存在，自动跳过

**提示：** 使用 `imgmin c` 命令会同时压缩并生成 webp，更方便！

### convert - 格式转换

```bash
imgmin convert <source> <output> [options]

# 示例
imgmin convert input.png output.webp -q 80
imgmin convert photo.jpg photo.tiff
```

**选项：**
- `-q, --quality <number>` - 质量 1-100

**支持的格式：**
- **输入：** JPEG, JPG, PNG, GIF, WebP, TIFF, TIF, BMP, SVG, AVIF
- **输出：** JPEG, JPG, PNG, WebP, AVIF, TIFF, GIF

### info - 查看图片信息

```bash
imgmin info <file>

# 示例
imgmin info input.jpg
```

## 支持格式

**输入：** JPEG, JPG, PNG, GIF, WebP, TIFF, TIF, BMP, SVG, AVIF

**输出：** JPEG, JPG, PNG, WebP, AVIF, TIFF, GIF

## 📚 API 使用（Node.js 模块）

除了 CLI 工具，你还可以在代码中使用 imgmin-cli 的 API：

### 安装

```bash
npm install imgmin-cli
```

### 示例

#### 压缩图片

```javascript
import { compressImage } from 'imgmin-cli/src/compress.js';

// 压缩单张图片
const result = await compressImage('input.jpg', 'output.jpg', { 
  quality: 80,
  format: 'jpeg' 
});

console.log(result);
// {
//   input: 'input.jpg',
//   output: 'output.jpg',
//   originalSize: 1234567,
//   compressedSize: 987654
// }

// 转换为 WebP
await compressImage('input.png', 'output.webp', { 
  quality: 75 
});
```

#### 批量转换为 WebP

```javascript
import { compressImageToWebp } from 'imgmin-cli/src/compress.js';

// 转换并指定质量
const result = await compressImageToWebp('input.png', 'output.webp', 80);

console.log(result);
// {
//   input: 'input.png',
//   output: 'output.webp',
//   originalSize: 1234567,
//   compressedSize: 456789
// }
```

#### 调整图片尺寸

```javascript
import { resizeImage } from 'imgmin-cli/src/compress.js';

// 调整尺寸
await resizeImage('input.jpg', 'output.jpg', {
  width: 800,
  height: 600,
  fit: 'inside'  // cover, contain, fill, inside, outside
});
```

#### 批量压缩目录

```javascript
import { compressDirectory } from 'imgmin-cli/src/compress.js';

// 批量压缩目录下所有图片
const results = await compressDirectory('./input', './output', {
  quality: 80,
  format: 'webp'
});

console.log(results);
// [
//   { input: '...', output: '...', originalSize: ..., compressedSize: ..., status: 'success' },
//   { file: '...', error: '...', status: 'failed' }
// ]
```

#### 格式转换

```javascript
import { convertImage } from 'imgmin-cli/src/convert.js';

// PNG 转 JPEG
const result = await convertImage('input.png', 'output.jpg', { 
  quality: 90 
});

console.log(result);
// {
//   input: 'input.png',
//   output: 'output.jpg',
//   format: 'jpeg',
//   originalSize: 1234567,
//   convertedSize: 987654,
//   savedPercent: '20.0'
// }
```

#### 获取图片信息

```javascript
import { getImageInfo } from 'imgmin-cli/src/utils.js';

const info = await getImageInfo('photo.jpg');
console.log(info);
// {
//   fileName: 'photo.jpg',
//   filePath: '/path/to/photo.jpg',
//   size: 1234567,
//   format: 'jpeg',
//   width: 1920,
//   height: 1080,
//   hasAlpha: false,
//   channels: 3,
//   density: 72,
//   space: 'srgb',
//   depth: 'uchar',
//   orientation: undefined
// }
```

#### 文件匹配工具

```javascript
import { glob } from 'imgmin-cli/src/utils.js';

// 匹配所有图片文件
const files = await glob('./images/**/*.{jpg,png,gif}', { nodir: true });
console.log(files);
// ['/path/to/image1.jpg', '/path/to/image2.png', ...]
```

## 依赖

- [sharp](https://sharp.pixel.plus/) - 图片处理
- [commander](https://github.com/tj/commander.js) - CLI 框架
- [chalk](https://github.com/chalk/chalk) - 终端着色
- [ora](https://github.com/sindresorhus/ora) - 加载动画