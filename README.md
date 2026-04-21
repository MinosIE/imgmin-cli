# imgmin-cli

图片压缩与格式转换 CLI 工具，基于 sharp 实现。

## 安装

```bash
npm install
npm link
```

## 命令

### compress - 压缩图片

```bash
imgmin compress <source> [output] [options]

# 示例
imgmin compress input.jpg                    # 压缩单张，默认输出为 input_compressed.jpg
imgmin compress input.png -q 85              # 设置质量为 85
imgmin compress input.jpg output.webp -f webp # 输出为 webp 格式
imgmin compress ./images ./output -r         # 批量压缩目录
imgmin compress ./images -r -q 80            # 递归压缩，质量 80
```

**选项：**
- `-q, --quality <number>` - 质量 1-100（默认 80）
- `-r, --recursive` - 递归处理子目录
- `-f, --format <type>` - 输出格式（jpeg, png, webp, avif）

### webp - 转换为 WebP

```bash
imgmin webp <source> [output] [options]

# 示例
imgmin webp input.png                        # 转换为 input.webp
imgmin webp input.jpg -q 75                  # 设置质量为 75
imgmin webp ./images ./output -r             # 批量转换目录
```

**选项：**
- `-q, --quality <number>` - 质量 1-100（默认 80）
- `-r, --recursive` - 递归处理子目录

### convert - 格式转换

```bash
imgmin convert <source> <output> [options]

# 示例
imgmin convert input.png output.webp -q 80
imgmin convert photo.jpg photo.tiff
```

**选项：**
- `-q, --quality <number>` - 质量 1-100（默认 80）

### info - 查看图片信息

```bash
imgmin info <file>

# 示例
imgmin info input.jpg
```

## 支持格式

**输入：** JPEG, PNG, GIF, WebP, TIFF, BMP, SVG, AVIF

**输出：** JPEG, PNG, WebP, AVIF, TIFF, GIF

## 依赖

- [sharp](https://sharp.pixel.plus/) - 图片处理
- [commander](https://github.com/tj/commander.js) - CLI 框架
- [chalk](https://github.com/chalk/chalk) - 终端着色
- [ora](https://github.com/sindresorhus/ora) - 加载动画
