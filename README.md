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
# - 非 WebP 格式：转换为 WebP 并压缩
# - WebP 格式：仅压缩优化
# - 自动处理文件名冲突
```

**特性：**
- 零配置运行，无需任何参数
- 递归扫描当前目录及所有子目录
- 自动转换为 WebP 格式（节省最多 80% 体积）
- 智能文件名管理，避免覆盖原文件
- 显示详细统计信息

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
| `recursive` | boolean | false | 是否递归处理目录 |
| `outputDir` | string | - | 默认输出目录 |

配置文件位于 `~/.imgminrc`

### compress / c - 压缩图片

```bash
imgmin compress [source] [output] [options]
imgmin c [source] [output] [options]          # 使用别名

# 示例
imgmin c                                      # 压缩当前目录所有图片（默认行为）
imgmin c .                                    # 同上
imgmin c input.jpg                            # 压缩单张图片
imgmin c input.png -q 85                      # 设置质量
imgmin c input.jpg -f webp                    # 输出为 webp 格式
imgmin c ./images ./output -r                 # 批量压缩目录
imgmin c . --force                            # 直接替换原文件（不添加 _compressed 后缀）
imgmin c . --no-webp                          # 不生成 webp 版本
imgmin c . --force --no-webp                  # 只替换原文件，不生成 webp
```

**选项：**
- `-q, --quality <number>` - 质量 1-100（默认使用配置值 80）
- `-r, --recursive` - 递归处理子目录（默认开启）
- `-f, --format <type>` - 输出格式（jpeg, png, webp, avif）
- `--force` - 直接替换原文件，不添加 `_compressed` 后缀
- `--no-webp` - 不生成 WebP 版本

**默认行为：**
- 不指定 source 时，自动扫描当前目录及子目录下所有图片
- 压缩后生成 `xxx_compressed.jpg`（保留原文件）
- 同时生成 `xxx.webp` 版本
- 已存在压缩文件或 webp 文件的图片会自动跳过

**`--force` 模式：**
- 用压缩后的文件直接替换原文件（不保留原文件）
- 不添加 `_compressed` 后缀
- webp 生成逻辑不变

**别名：**
- `c` - `compress` 的简短形式

### webp - 转换为 WebP

```bash
imgmin webp <source> [output] [options]

# 示例
imgmin webp input.png                        # 转换为 input.webp
imgmin webp input.jpg -q 75                  # 设置质量
imgmin webp ./images ./output -r             # 批量转换
```

**选项：**
- `-q, --quality <number>` - 质量 1-100
- `-r, --recursive` - 递归处理子目录

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
