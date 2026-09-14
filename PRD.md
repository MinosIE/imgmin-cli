# imgmin — 产品需求文档（PRD）

> **文档性质**：本文档基于 `imgmin` 仓库**当前已实现代码**反向整理而成，并非新需求规格。功能描述严格对照源码（`src/index.js`、`src/compress.js`、`src/convert.js`、`src/smart.js`、`src/utils.js`、`src/config.js`、`src/ui.js`、`src/ui-public/index.html`），作为后续迭代的契约基线。
> 标记为「候选 / 未实现」的章节属于未来可能方向，当前不视为承诺范围。

---

## 1. 产品概述

### 1.1 定位
`imgmin` 是一款面向开发者的**图片压缩与格式转换工具**，同时提供 CLI 与浏览器 Web UI 两种形态，图像处理底层统一基于 [`sharp`](https://sharp.pixelplus.io/)。

### 1.2 一句话价值
零配置批量把图片压成 WebP / AVIF，并提供「内容感知选格式 + 自适应质量」的智能模式，最大化体积节省且尽量保持视觉质量。

### 1.3 目标用户
- 需要批量优化站点 / App 图片资源的开发者、运维。
- 不熟悉图像编码参数、希望「丢进去就压好」的普通用户（Web UI 形态）。
- 需要把压缩能力嵌入 Node 脚本的开发者（模块 API）。

### 1.4 核心价值主张
- **双形态**：同一引擎，CLI 批量 + 浏览器拖拽。
- **现代格式优先**：WebP / AVIF 一等公民，JPEG / PNG / TIFF / GIF 等兼容。
- **智能模式**：自动判断「照片 / 图标 / 透明图 / 纯色图」并选格式、用 SSIM / Butteraugli 二分搜索最优质量。
- **安全不破坏**：压缩后更大自动跳过 / 保留原图；不擅自删除源文件（除非 `--force`）。
- **可配置**：`~/.imgminrc` 持久化默认质量 / 格式等。

---

## 2. 技术栈与架构

### 2.1 技术栈
| 包 | 版本 | 角色 |
|---|---|---|
| sharp | ^0.33 | 图像处理引擎（压缩 / 转码 / 元信息） |
| commander | ^12 | CLI 子命令与参数解析 |
| express | ^5 | Web UI 服务器 |
| multer | ^2 | 文件上传中间件 |
| archiver | ^8 | Download All 的 ZIP 打包（纯 ESM，命名导入 `ZipArchive`） |
| chalk | ^5 | 终端彩色输出 |
| ora | ^8 | 终端 spinner |
| 运行时 | Node ≥ 18 | 纯 ESM（`"type": "module"`） |

### 2.2 架构与数据流
```
bin/cli.js ──▶ src/index.js (CLI 编排)
                 ├─▶ src/compress.js  (压缩/转 WebP/AVIF/通用格式/尺寸)
                 ├─▶ src/convert.js   (格式转换封装)
                 ├─▶ src/smart.js     (内容感知 + 自适应质量)
                 ├─▶ src/utils.js     (glob/info/分析/工具)
                 └─▶ src/config.js    (~/.imgminrc)
                 └─▶ src/ui.js        (express + /api/*)
                          └─▶ serves src/ui-public/index.html (单文件 SPA)
```
- CLI：`bin/cli.js → index.js → compress.js/convert.js → sharp → 落盘`
- Web：`浏览器 → /api/compress → ui.js → compress.js → /tmp/imgmin-ui-output → 下载`

### 2.3 关键约束
- 纯 ESM，禁止 `require()`；archiver / chalk / ora 须命名导入。
- Web UI 为单文件内联 HTML（`src/ui-public/index.html`），无构建步骤，改完重启 `imgmin ui` 即生效。
- `/api/compress`（前端）与 `compress.js`（后端）、`ui.js`（端点）字段名必须同步。

---

## 3. 功能范围总览

| 形态 | 能力 | 状态 |
|---|---|---|
| CLI | 默认批量命令 / config / compress(c) / smart / webp / avif / convert / info / ui | 已实现 |
| Web UI | 拖拽上传、文件夹上传、格式多选、质量滑块、智能开关、单图压缩潜力分析、结果卡片、Download All(zip) | 已实现 |
| 智能模式 | 内容感知选格式 + SSIM/Butteraugli 自适应质量 | 已实现（指标为近似实现） |
| 模块 API | `compressImage` / `convertImage` / `getImageInfo` / `glob` 等 | 已实现 |
| 自动化测试 | `npm test`（node --test） | 暂空，未实现 |

---

## 4. CLI 功能规格

> 全局：`imgmin [子命令] [选项]`；`program.version('1.0.0')`。
> 默认值（无 config 时）`quality=80`、`format=webp`、`recursive=true`（compress/webp/avif 默认递归）。

### 4.1 默认命令（无子命令）
- 对当前工作目录递归处理所有图片（`**/*.{jpg,jpeg,png,gif,tiff,tif,bmp,svg,avif,webp}`）。
- 已是 WebP → 优化 WebP；已是 AVIF → 优化 AVIF；其他 → 转目标格式（默认 webp，可用 `-f avif`）。
- 并发 4 线程（`batchProcess`）。文件名冲突自动加 `_1/_2`。
- 输出：打印处理数 / 转换数 / 优化数 / 跳过数 / 失败数 / 总节省%。
- 选项：`-q, --quality <n>`、`-f, --format <webp|avif>`。

### 4.2 config
- 读写 `~/.imgminrc`（JSON）；缓存于内存。
- 子命令：`config [key] [value] [options]`
- 选项：`-g/--global`（显示配置路径）、`-r/--reset`（重置全部）、`-d/--delete <key>`（删除单项）。
- 可配置项（默认值）：`quality=80`、`format=''`、`recursive=false`（注：对 compress/webp/avif 实际仍默认递归）、`outputDir=''`。
- 值解析：布尔 `true/false`、数字自动 Number，其余按字符串。

### 4.3 compress / c
- 用途：压缩并默认额外生成 WebP 版本。
- 语法：`imgmin compress|c [source] [output] [options]`（无 source 用 cwd）。
- 选项：
  - `-q, --quality <n>`（默认取 config）
  - `-r, --recursive`（默认 true）
  - `-f, --format <jpeg|png|webp|avif|tiff|gif>`
  - `--no-webp`（不生成 WebP 版本）
  - `--force`（替换原文件，无 `_compressed` 后缀）
  - `--smart`、`--metric <ssim|butteraugli>`、`--threshold <n>`（智能模式）
- 输出行为：
  - 无 output：同目录生成 `<filename>_compressed.<ext>` + `<filename>.webp`（除非 `--no-webp`）。
  - 有 output：输出到文件/目录。
  - `--force`：更小才替换原图。
  - **智能跳过**：压缩后 ≥ 原大小则删除产物并跳过（常规与 `--force` 均适用）。
  - 目录统计：Compressed / Skipped / Skipped(larger) / WebP generated / Failed。

### 4.4 smart
- 用途：**仅分析不压缩**，输出推荐格式 / 质量 / 理由 / 预计节省。
- 语法：`imgmin smart <source>`（文件或目录）。
- 选项：`-m/--metric`、`-t/--threshold`。
- 输出：每张打印 `尺寸 · alpha · photo · format · Q · 指标分数 · 理由 · 预计节省%`。
- 通过 `smartSuggest(file, {metric, threshold})` 实现。

### 4.5 webp / 4.6 avif
- 工厂命令 `createFormatCommand(format)`。
- 语法：`imgmin webp|avif [source] [output] [options]`。
- 默认质量：webp=80、avif=65。
- 选项：`-q`、`-r/--recursive`、`--force`。
- 行为：无 output 在同目录生成 `.webp/.avif`；存在则跳过（除非 `--force`）；并发 4。
- AVIF 质量 >70 时打印建议降低提示（推荐 50-65）。
- 输出：转换数 / 总节省% / 原总→目标总 / 跳过 / 失败。

### 4.7 convert
- 用途：任意格式间转换（需显式 source + output）。
- 语法：`imgmin convert <source> <output> -q <n>`（目标格式由 output 扩展名决定）。

### 4.8 info
- 用途：打印单图信息（文件、大小、格式、尺寸；有 alpha 显示 Alpha；有 density 显示 DPI）。
- 底层 `getImageInfo` 还返回 `channels/space/depth/orientation`（CLI 仅展示部分，Web 用全量）。

### 4.9 ui
- 语法：`imgmin ui [-p <port>]`（默认 3000）。
- 启动 express，托管 `src/ui-public`，自动打开浏览器；端口被占用自动 +1。

---

## 5. 格式与编解码支持

| 方向 | 格式 |
|---|---|
| 输入（解码） | JPEG, JPG, PNG, GIF, WebP, TIFF, TIF, BMP, SVG, AVIF |
| 输出（编码） | JPEG, JPG, PNG, WebP, AVIF, TIFF, GIF |
| **不支持** | HEIC / HEIF（sharp 解码不支持；Web UI 前端已拦截，CLI 会因 sharp 报错） |

> 注：压缩/转换的 PNG 走 `compressionLevel=(100-quality)/10`、`quality<80` 时启用调色板；JPEG 启用 `mozjpeg`。

---

## 6. 智能模式（src/smart.js）

### 6.1 内容感知格式选择 `analyzeImage`
- 对图片下采样 256px 做内容分析（性能）。
- 检测：透明像素占比（>0.5% 视为有透明）、相邻像素高频强度 `avgEdge`、量化颜色数 `colorfulness`、主色。
- 决策树：
  - 有透明 + 高频少色（图标）→ **PNG**（无损保边）
  - 有透明（其他）→ **WebP**（保留透明且压缩优）
  - 照片（`avgEdge>18` 且 `colorfulness>400`）→ **AVIF**（体积最小）
  - 图标（高频少色）→ **PNG**
  - 纯色/简单图（`colorfulness<60`）→ **WebP**（纯色高效）
  - 其他常规图形 → **WebP**
- 返回：`format, reason, hasAlpha, isPhoto, colorfulness, avgEdge, dominantColor, channels, width, height, size`。

### 6.2 自适应质量 `findOptimalQuality`
- 以指标驱动，在 `[1, maxQuality=82]` 区间二分，找「刚好满足阈值」的最小质量（体积最大）。
- 指标：
  - **SSIM（默认）**：自实现简化版（亮度通道高斯近似），阈值 `≥0.95`，越大越好。
  - **Butteraugli（近似）**：感知加权逐像素色差，暗部更敏感，阈值 `≤1.2`，越小越好（非 Google 原生实现）。
- 上限质量仍不达标时退回最高质量。

### 6.3 一体化 `smartSuggest`
- `analyzeImage` + `findOptimalQuality` → `{...analysis, quality, qualityMetric, qualityScore, compressedSize, savedPercent}`。
- 双入口：CLI（`smart` 命令、`compress --smart`）；Web（`/api/smart-analyze`、`/api/compress` 的 `smart=1`）。

---

## 7. Web UI 功能规格（src/ui.js + src/ui-public/index.html）

### 7.1 页面结构
- 拖放区（支持点击选文件 / 选文件夹；递归遍历文件夹用 `webkitGetAsEntry`）。
- 设置面板：格式多选（WebP / AVIF / JPEG / PNG / 原格式）、质量滑块、智能模式开关（含指标下拉 SSIM/Butteraugli）。
- 压缩按钮 + 进度条。
- 结果区：统计摘要卡（图片×格式 / 输出数 / 总节省%）+ 每张原图的结果卡片（含各格式 chip、智能理由）。
- 主题切换（深色 / 浅色，localStorage 记忆）。
- Toast 提示。
- 已选文件面板（位于拖放区**下方，独立展示、不替换拖放区**）：单张时渲染压缩潜力分析卡（缩略图 + 格式/等级徽章 + 文件名 + 指标网格 + 说明/建议 + 「应用建议质量」按钮 + 右上角删除）；多张时渲染文件行列表（缩略图 + 名称 + 大小 + 右侧删除按钮），可逐项移除。

### 7.2 上传与限制
- multer：单文件字段 `images`，最多 50 个，单文件 ≤ 50MB（超限返回 413 / 400）。
- **HEIC 前端拦截**：`SUPPORTED_EXT` 不含 heic，不支持文件被过滤并 toast 提示，不进入后端。

### 7.3 单图压缩潜力分析（`/api/info`）
- 仅当选择**单张**图片时，在拖放区**下方**的分析面板内展示分析卡片；多张图片时，下方面板改为展示可逐项删除的文件列表（缩略图 + 名称 + 大小 + 右侧删除按钮）。拖放区本身始终保持「拖入图片到此处」，不被上传内容替换。
- 字段：格式、压缩状态(等级)、尺寸、大小、**每像素比特(bpp)**、色彩空间、通道、位深、分辨率(DPI)、透明、方向、**分析原因**、**建议质量**（含「应用建议质量」按钮）。
- 后端：`getImageInfo` + `analyzeCompressibility(info)`（按 bpp 推断原图压缩程度，给等级/建议质量）。
- 若 `info.analysis` 缺失，仅保留基本信息，不整卡隐藏。

### 7.4 API 端点契约
| 端点 | 方法 | 入参 | 返回 |
|---|---|---|---|
| `/api/compress` | POST | `images`(multer)、`formats[]`/`format`、`quality`、`smart('1')`、`metric` | `{ results: [{success, format, savedPercent, outputPath, downloadUrl, width, height, smart?, quality?, reason?, ...}] }` |
| `/api/info` | POST | `image`(单) | 全量 `getImageInfo` + `analysis` |
| `/api/download/:filename` | GET | 路径参数 | 文件下载 |
| `/api/output-file/*` | static | 预览图 | 静态文件 |
| `/api/download-zip` | POST | `{ files: [...] }` | ZIP 流（archiver `ZipArchive`） |
| `/api/smart-analyze` | POST | `{ files:[...], metric, threshold }` | `{ suggestions: [...] }` |

### 7.5 结果交互
- 每张原图按所选格式展开 chip，显示节省% / 大小；同格式变大时标记「已保留原图」并可下载。
- 「下载全部」→ `/api/download-zip` 打包到浏览器（含 re-entry 防重 + loading 态）。

---

## 8. 配置（src/config.js）

- 存储：`~/.imgminrc`（JSON），读取带缓存。
- 默认值：`{ quality:80, format:'', recursive:false, outputDir:'' }`。
- 读写接口：`getConfig / setConfigValue / resetConfigValue / resetConfig / getConfigPath / hasConfigFile`。
- CLI 选项优先于配置；配置可由 `imgmin config` 命令管理。

---

## 9. 非功能性需求

- **性能**：批量默认 4 并发；目录处理分批更新 spinner。
- **兼容**：Node ≥ 18；纯 ESM；无前端打包器。
- **安全/稳健**：
  - 压缩后更大则自动跳过 / 保留原图，避免「越压越大」。
  - 不擅自删除源文件（除非 `--force`）。
  - 文件名冲突自动加后缀，避免覆盖。
  - 后端全局错误处理器；multer 超限返回 413/400；`/tmp/imgmin-ui-output` 定时清理（>10 分钟）。
  - `unhandledRejection` / `uncaughtException` 不崩溃进程。
- **可观测**：CLI 用 chalk/ora；后端 `console.error` 带前缀（如 `Compress endpoint error`）便于复现。

---

## 10. 已知限制与技术债务

- **HEIC / HEIF 不支持**：sharp 解码能力缺失；Web UI 已前端拦截，但 CLI 直接传 HEIC 会因 sharp 报错。
- **Butteraugli 为近似实现**：非 Google 原生，仅用于驱动质量二分，结果仅供近似参考。
- **`analyzeImage` 阈值经验化**：照片/图标/纯色判定为启发式，复杂图可能选错格式。
- **智能模式 CLI 目录汇总不展示 per-file 理由**：仅终端打印，未结构化汇总。
- **极小透明 PNG 转 PNG 可能变大**：已默认转 WebP 缓解。
- **无自动化测试**：`npm test` 空跑，缺 `*.test.js`。
- **`processDirectory` 智能模式不写 `_compressed` 后缀**：与常规模式命名不一致。

---

## 11. 路线图（候选 / 当前未实现）

> 以下为可能的演进方向，**非当前承诺需求**，落地前需评审：
- 补充 `*.test.js` 单元 / 集成测试。
- Web UI 智能模式结果展示 per-file 决策卡片。
- 扩展有损格式（除 AVIF 外）的自适应质量。
- 支持 HEIC 导入（需引入额外解码依赖）。
- 批量目录智能模式在 CLI 结构化汇总每张理由。

---

## 12. 合规说明

本文档为「代码 → 文档」反向整理，现状即契约：任何后续改动若与第 4–9 节行为不一致，视为行为变更，需同步更新本 PRD 与 `AGENTS.md` 的对应小节（见 AGENTS.md 第 0 节维护约定）。
