# imgmin-cli

图片压缩与格式转换 CLI 工具，基于 sharp 实现。支持 WebP 和 AVIF 等现代图片格式。

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

# 或者使用 Web UI（推荐新手）
imgmin ui                 # 启动浏览器界面，拖拽即可压缩

# 或者使用具体命令
imgmin c photo.jpg        # 压缩并生成 webp
imgmin c .                # 压缩当前目录所有图片
imgmin webp ./images -r   # 批量转换为 webp
imgmin avif ./images -r   # 批量转换为 avif
imgmin resize photo.jpg -w 1200  # 等比缩放到宽 1200
```

## 测试

```bash
npm test                  # 运行 node --test（模块单元测试 + CLI 端到端测试）
```

## 命令

### 默认命令 - 快速批量处理

```bash
imgmin
imgmin -q 85               # 设置质量
imgmin -f avif              # 默认转换为 AVIF（而非 WebP）

# 直接运行，自动处理当前目录及其子目录下的所有图片
# - 非 WebP/AVIF 格式：转换为指定格式并压缩（默认 WebP，可通过 -f avif 改为 AVIF）
# - WebP 格式：压缩优化
# - AVIF 格式：压缩优化
# - 并发处理（4 线程），加快处理速度
# - 自动处理文件名冲突（添加 _1, _2 等后缀）
```

**选项：**
- `-q, --quality <number>` - 压缩质量 1-100（默认使用配置值 80）
- `-f, --format <type>` - 目标转换格式（webp 或 avif，默认 webp）
- `-j, --concurrency <number>` - 并发数（默认 4，上限 32）

**特性：**
- 零配置运行，无需任何参数
- 递归扫描当前目录及所有子目录
- 自动转换为 WebP/AVIF 格式（可通过 `-f` 切换）
- WebP 和 AVIF 格式文件也会被压缩优化
- 并发处理加速（默认 4 线程）
- 智能文件名管理，避免覆盖原文件
- 显示详细统计信息（处理数量、转换数量、优化数量、总节省大小和百分比）

**输出说明：**
- 生成的 `.webp`/`.avif` 文件保存在**原图片所在目录**
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
| `recursive` | boolean | false | 是否递归处理目录（注：compress/webp/avif 命令实际默认递归，此配置仅影响其他命令） |
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
- `--smart` - 智能模式：内容感知选格式 + 自适应质量（SSIM/Butteraugli）
- `--metric <type>` - 智能模式指标：`ssim`（默认）或 `butteraugli`
- `--threshold <number>` - 智能模式质量阈值（SSIM≥0.95、Butteraugli≤1.2 为默认）
- `-j, --concurrency <number>` - 目录并发数（默认 4，上限 32）

**输出行为：**
- **无 output 参数时**：在原目录生成 `<filename>_compressed.<ext>` 和 `<filename>.webp`
- **有 output 参数时**：输出到指定文件或目录
- **使用 `--force` 时**：直接替换原文件（如果压缩后更小）
- **默认同时生成 WebP**：除非使用 `--no-webp` 禁用
- **智能跳过**：如果压缩后文件更大，自动删除生成的文件并跳过（正常模式和 `--force` 模式均适用）

**目录处理输出统计：**
- `Compressed X files` - 成功处理的文件数
- `Skipped: X files` - 跳过的文件数（已存在压缩文件或 WebP）
- `Skipped (larger after compress): X files` - 因压缩后更大而跳过的文件数
- `WebP generated: X files` - 生成的 WebP 文件数
- `Failed: X files` - 处理失败的文件数

**提示：** 
- 使用 `imgmin` 默认命令可以快速批量转换整个目录
- `c` 是 `compress` 的简短形式，两者功能完全相同
- 如果压缩后文件更大，会自动跳过并删除生成的文件（正常模式和 `--force` 模式均适用），避免浪费磁盘空间
- **PNG 格式注意**：对于小尺寸或已优化的 PNG 文件，压缩后可能会变大（这是 PNG 无损格式的特性）。工具会自动检测并跳过此类文件。如需更好压缩效果，建议转换为 WebP 格式或使用 `--format webp` 选项。

### webp - 转换为 WebP

```bash
imgmin webp <source> [output] [options]

# 示例
imgmin webp input.png                        # 转换为 input.webp
imgmin webp input.jpg -q 75                  # 设置质量
imgmin webp ./images ./output -r             # 批量转换到输出目录
imgmin webp ./images --force                 # 强制覆盖已存在的 WebP 文件
```

**选项：**
- `-q, --quality <number>` - 质量 1-100（默认 80）
- `-r, --recursive` - 递归处理子目录（默认启用，使用 --no-recursive 关闭）
- `-j, --concurrency <number>` - 目录并发数（默认 4，上限 32）
- `--force` - 强制覆盖已存在的目标文件

**输出行为：**
- **无 output 参数时**：在原目录生成 `<filename>.webp`
- **有 output 参数时**：输出到指定文件或目录
- **跳过已存在的文件**：默认跳过已存在的 `.webp`，使用 `--force` 覆盖
- **并发处理**：默认 4 线程并发转换

**目录处理输出统计：**
- `Converted X files to WebP` - 成功转换的文件数
- `Total saved: XX% (XX KB)` - 总节省百分比和大小
- `Original total → WebP total` - 原始总大小 vs WebP 总大小
- `Skipped: X files` - 跳过的文件数（WebP 已存在）
- `Failed: X files` - 转换失败的文件数

**提示：** 使用 `imgmin c` 命令会同时压缩并生成 webp，更方便！

### avif - 转换为 AVIF

```bash
imgmin avif <source> [output] [options]

# 示例
imgmin avif input.png                        # 转换为 input.avif
imgmin avif input.jpg -q 65                  # 设置质量（推荐 50-65）
imgmin avif ./images ./output -r             # 批量转换到输出目录
imgmin avif ./images --force                 # 强制覆盖已存在的 AVIF 文件
```

**选项：**
- `-q, --quality <number>` - 质量 1-100（默认 65，AVIF 推荐使用较低质量值）
- `-r, --recursive` - 递归处理子目录（默认启用，使用 --no-recursive 关闭）
- `-j, --concurrency <number>` - 目录并发数（默认 4，上限 32）
- `--force` - 强制覆盖已存在的目标文件

**输出行为：**
- **无 output 参数时**：在原目录生成 `<filename>.avif`
- **有 output 参数时**：输出到指定文件或目录
- **跳过已存在的文件**：默认跳过已存在的 `.avif`，使用 `--force` 覆盖
- **并发处理**：默认 4 线程并发转换

**目录处理输出统计：**
- `Converted X files to AVIF` - 成功转换的文件数
- `Total saved: XX% (XX KB)` - 总节省百分比和大小
- `Original total → AVIF total` - 原始总大小 vs AVIF 总大小
- `Skipped: X files` - 跳过的文件数（AVIF 已存在）
- `Failed: X files` - 转换失败的文件数

**提示：** 
- AVIF 通常比 WebP 压缩率更高（节省约 20-50% 体积），但编码速度较慢
- AVIF 推荐质量范围为 50-65，相当于 WebP 80 的视觉效果
- 设置质量 >70 时会显示提示建议降低质量

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

### resize - 调整尺寸

```bash
imgmin resize <source> [output] [options]

# 示例
imgmin resize photo.jpg -w 1200                          # 等比缩到宽 1200，生成 photo_resized.jpg
imgmin resize photo.jpg --height 800                     # 只给高度，宽度按比例算
imgmin resize photo.jpg -w 800 --height 800 --fit cover  # 裁剪为 800×800
imgmin resize photo.jpg -w 1200 -q 75 -f webp            # 缩放并重编码为 WebP
imgmin resize ./images ./out -w 800 -j 8                 # 批量缩放到输出目录，8 并发
imgmin resize photo.jpg -w 1200 --force                  # 原地替换（仅尺寸真正变化时）
```

**选项：**
- `-w, --width <number>` - 目标宽度（像素）
- `--height <number>` - 目标高度（像素）；`-h` 已被 help 占用，只能使用长选项
- `--fit <type>` - 适应方式：`cover`、`contain`、`fill`、`inside`（默认）、`outside`
- `-q, --quality <number>` - 重编码质量 1-100（不传则沿用原编码器的默认值）
- `-f, --format <type>` - 输出格式（jpeg, png, webp, avif, tiff, gif）
- `-r, --recursive` - 递归处理子目录（默认启用，使用 --no-recursive 关闭）
- `-j, --concurrency <number>` - 目录并发数（默认 4，上限 32）
- `--force` - 原地替换原文件（仅当尺寸真正变化时）

**输出行为：**
- **无 output 参数时**：原目录生成 `<filename>_resized.<ext>`；使用 `--force` 时原地替换
- **有 output 参数时**：输出到指定文件或目录（目录模式保留相对目录结构）
- **默认禁止放大**：目标尺寸大于原图时保持原尺寸，不做插值放大
- **尺寸未变化时跳过**：不产生无意义的副本（目录模式提示 `Skip (unchanged)`）
- **原图安全**：除 `--force` 外不修改、不删除原图

**提示：** 只给 `-w` 或 `--height` 之一时，另一边按原始宽高比自动计算。

### info - 查看图片信息

```bash
imgmin info <file>

# 示例
imgmin info input.jpg
```

### ui - Web 图形界面

```bash
imgmin ui                  # 启动 UI（默认端口 3000）
imgmin ui -p 8080          # 自定义端口

# 启动后自动打开浏览器，支持：
# - 拖拽上传图片（最多 50 张）
# - 格式选择（WebP、AVIF、JPEG、PNG、保留原格式）
# - 质量滑块调节
# - 实时压缩结果和统计
# - 单张/批量下载压缩后的图片
```

**选项：**
- `-p, --port <number>` - 服务端口（默认 3000）

**特性：**
- 深色专业风格 UI
- 拖拽或点击上传图片
- 格式和质量实时切换
- 压缩后即时显示节省百分比和大小
- 单图自动分析压缩潜力（含建议质量），已选文件可逐项删除
- 图片缩略图预览
- AVIF 高质量自动提醒

<p align="center">
  <img src="screenshots/shot.png" alt="imgmin Web UI 演示" style="max-width:900px;width:100%;border-radius:10px;border:1px solid #2a2a35">
</p>

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

#### 批量转换为 AVIF

```javascript
import { compressImageToAvif } from 'imgmin-cli/src/compress.js';

// 转换并指定质量
const result = await compressImageToAvif('input.png', 'output.avif', 65);

console.log(result);
// {
//   input: 'input.png',
//   output: 'output.avif',
//   originalSize: 1234567,
//   compressedSize: 234567
// }
```

#### 调整图片尺寸

```javascript
import { resizeImage } from 'imgmin-cli/src/compress.js';

// 等比缩小（只给一边即可，另一边自动计算）
const resized = await resizeImage('input.jpg', 'output.jpg', { width: 800 });

// 裁剪为固定尺寸，并重编码为 WebP
await resizeImage('input.png', 'output.webp', {
  width: 800,
  height: 600,
  fit: 'cover',    // cover, contain, fill, inside, outside
  quality: 75,     // 省略则沿用 sharp 对该扩展名的默认编码
  format: 'webp'
});

console.log(resized.width, resized.height, resized.resized);
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
//   savedPercent: '20.0'  // API 返回不带 % 符号的字符串
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
- [express](https://expressjs.com/) - Web UI 服务
- [multer](https://github.com/expressjs/multer) - 文件上传处理