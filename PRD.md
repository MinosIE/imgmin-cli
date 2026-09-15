# imgmin — 产品需求文档（PRD）

> **文档性质**：本文档基于 `imgmin` 仓库**当前已实现代码**反向整理而成，并非新需求规格。功能描述严格对照源码（`src/index.js`、`src/compress.js`、`src/convert.js`、`src/smart.js`、`src/utils.js`、`src/config.js`、`src/ui.js`、`src/ui-public/index.html`），作为后续迭代的契约基线。
> 标记为「候选 / 未实现」的章节属于未来可能方向，当前不视为承诺范围。
> **执行进度统一记录在第 11 节**（能力缺口与路线图，含状态标记）；每完成一项需同步更新该节状态与 §13 变更记录。

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
- **智能模式**：自动判断「照片 / 图标 / 透明图 / 纯色图」并选格式、用 SSIM / Butteraugli / PSNR 二分搜索最优质量。
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
| CLI | 默认批量命令 / config / compress(c) / smart / webp / avif / convert / resize / info / ui | 已实现 |
| Web UI | 拖拽上传、文件夹上传、格式多选、质量滑块、智能开关、单图压缩潜力分析、结果卡片、Download All(zip) | 已实现 |
| 智能模式 | 内容感知选格式 + SSIM/Butteraugli/PSNR 自适应质量 | 已实现（Butteraugli 为近似，规划真值化见 §11.2） |
| 模块 API | `compressImage` / `resizeImage` / `convertImage` / `getImageInfo` / `glob` 等 | 已实现 |
| 批量并发 | `-j, --concurrency`（1-32，默认 4） | 已实现 |
| 自动化测试 | `npm test`（`node --test`，`tests/*.test.js` 单元 + CLI 端到端） | 已实现（首批） |

---

## 4. CLI 功能规格

> 全局：`imgmin [子命令] [选项]`；`program.version('1.0.0')`。
> 默认值（无 config 时）`quality=80`、`format=webp`、`recursive=true`（compress/webp/avif/resize 默认递归）。
> 批量并发：默认 4，可用 `-j, --concurrency <n>` 调整（下限 1、上限 32）；支持该选项的命令为默认命令、compress、webp、avif、resize。

### 4.1 默认命令（无子命令）
- 对当前工作目录递归处理所有图片（`**/*.{jpg,jpeg,png,gif,tiff,tif,bmp,svg,avif,webp}`）。
- 已是 WebP → 优化 WebP；已是 AVIF → 优化 AVIF；其他 → 转目标格式（默认 webp，可用 `-f avif`）。
- 并发 4 线程（`batchProcess`）。文件名冲突自动加 `_1/_2`。
- 输出：打印处理数 / 转换数 / 优化数 / 跳过数 / 失败数 / 总节省%。
- 选项：`-q, --quality <n>`、`-f, --format <webp|avif>`、`-j, --concurrency <n>`（默认 4）。

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
  - `-j, --concurrency <n>`（目录并发数，默认 4，上限 32）
  - `--smart`、`--metric <ssim|butteraugli|psnr>`、`--threshold <n>`（智能模式）
- 输出行为：
  - 无 output：同目录生成 `<filename>_compressed.<ext>` + `<filename>.webp`（除非 `--no-webp`）。
  - 有 output：输出到文件/目录。
  - `--force`：更小才替换原图。
  - **智能跳过**：压缩后 ≥ 原大小则删除产物并跳过（常规与 `--force` 均适用）。
  - **重复输出跳过**：并发下多个源文件映射到同一输出路径（如 `photo.jpg`/`photo.png` 都指向 `photo.webp`）时，后到者跳过并提示 `Skip (duplicate output)`，避免并发写同一文件。
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
- 选项：`-q`、`-r/--recursive`、`-j/--concurrency`（默认 4）、`--force`。
- 行为：无 output 在同目录生成 `.webp/.avif`；存在则跳过（除非 `--force`）；并发 4。
- AVIF 质量 >70 时打印建议降低提示（推荐 50-65）。
- 输出：转换数 / 总节省% / 原总→目标总 / 跳过 / 失败。

### 4.7 convert
- 用途：任意格式间转换（需显式 source + output）。
- 语法：`imgmin convert <source> <output> -q <n>`（目标格式由 output 扩展名决定）。

### 4.8 resize
- 用途：等比 / 裁剪缩放，可同时重编码为其他格式。
- 语法：`imgmin resize [source] [output] [options]`（无 source 用 cwd）。
- 选项：
  - `-w, --width <n>`、`--height <n>`：至少给一个，另一边按原始宽高比自动计算。
  - `--fit <type>`：`cover` / `contain` / `fill` / `inside`（默认）/ `outside`，非法值直接报错退出（exitCode 1）。
  - `-q, --quality <n>`：省略时不套用编码参数，沿用 sharp 对目标扩展名的默认编码。
  - `-f, --format <type>`：jpeg / png / webp / avif / tiff / gif。
  - `-r, --recursive`、`-j, --concurrency <n>`（默认 4）、`--force`。
- 行为：
  - 无 output：生成 `<filename>_resized.<ext>`；`--force` 时先写临时文件再原地替换。
  - 有 output：写到指定文件或目录（目录模式保留相对目录结构）。
  - `withoutEnlargement` 默认开启：目标大于原图时不放大。
  - **尺寸未变化则跳过**：非 output 目录模式删除产物并计 `skippedNoop`（提示 `Skip (unchanged)`）；output 目录模式保留副本（复制语义）。
  - 目录统计：Resized / Total saved / Skipped / Skipped(dimensions unchanged) / Failed。

### 4.9 info
- 用途：打印单图信息（文件、大小、格式、尺寸；有 alpha 显示 Alpha；有 density 显示 DPI）。
- 底层 `getImageInfo` 还返回 `channels/space/depth/orientation`（CLI 仅展示部分，Web 用全量）。

### 4.10 ui
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
  - **Butteraugli（真值化规划中）**：感知加权逐像素色差，暗部更敏感，阈值 `≤1.2`，越小越好。当前为自实现近似；规划改用 `@squoosh-kit/visdif`（Emscripten/WASM 版 Google Butteraugli）计算真实分数，见 §11.2 / §13。
  - **PSNR**：基于 RGB 通道 MSE 的峰值信噪比（dB），阈值 `≥38`，越大越好；零新依赖，补全「误差 / 结构 / 感知」三类指标谱系。
- 上限质量仍不达标时退回最高质量。

### 6.3 一体化 `smartSuggest`
- `analyzeImage` + `findOptimalQuality` → `{...analysis, quality, qualityMetric, qualityScore, compressedSize, savedPercent}`。
- 双入口：CLI（`smart` 命令、`compress --smart`）；Web（`/api/smart-analyze`、`/api/compress` 的 `smart=1`）。
- **与无损 / 目标体积互斥（Web UI）**：智能模式已接管「格式 + 质量」决策，而 `--lossless`（忽略质量）与 `--max-size`（二分搜质量）同样决定质量，三者叠加会静默覆盖智能的自适应质量。故 Web 端开启智能模式时禁用并置灰「无损模式」与「目标体积」、自动关闭已开启的无损模式，并显示互斥提示条；提交时对 `lossless` / `maxSize` 增加 `!smart` 守卫。结果卡片回显 `compressImage` 实际生效的 `quality`（无损 / 目标体积命中时以返回值为准）。「移除元数据」「按 EXIF 自动旋转」与智能模式正交，不受影响。

---

## 7. Web UI 功能规格（src/ui.js + src/ui-public/index.html）

### 7.1 页面结构
- 拖放区（支持点击选文件 / 选文件夹；递归遍历文件夹用 `webkitGetAsEntry`）。
- 设置面板：格式多选（WebP / AVIF / JPEG / PNG / 原格式）、质量滑块、智能模式开关（含指标竖向单选 SSIM/Butteraugli/PSNR，智能未勾选时整组置灰禁用）。
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

- **性能**：批量默认 4 并发（`-j/--concurrency` 可调，上限 32）；目录处理分批更新 spinner；`-j 1` 时退化为顺序处理，便于排查。
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
- **Butteraugli 近似实现（规划替换）**：当前为自实现近似，非 Google 原生，仅用于驱动质量二分；规划以 `@squoosh-kit/visdif`（WASM 真值 Butteraugli）替换，见 §11.2。
- **`analyzeImage` 阈值经验化**：照片/图标/纯色判定为启发式，复杂图可能选错格式。
- **智能模式 CLI 目录汇总不展示 per-file 理由**：仅终端打印，未结构化汇总。
- **极小透明 PNG 转 PNG 可能变大**：已默认转 WebP 缓解。
- **测试覆盖不完整**：已补 `tests/*.test.js`（utils / compress / resize / convert / smart + CLI 端到端），但 Web UI 与 `/api/*` 端点仍无测试。
- **`resize` 不处理动画**：sharp 默认只取首帧，动图（GIF / 动画 WebP）缩放后会丢帧。
- **`processDirectory` 智能模式不写 `_compressed` 后缀**：与常规模式命名不一致。

---

## 11. 能力缺口与路线图（含执行进度）

> 本节汇总「当前还不具备 / 可继续做」的能力，并标注执行进度。
> 状态取值：**已完成** / **部分完成** / **未开始** / **搁置**。
> 维护约定：某项落地后必须把状态改为「已完成」并写明落地方式与对应小节，同时在 §13 追加变更记录；本节优先级为建议排序，非承诺排期。

### 11.1 执行进度总览（最近更新：2026-09-14）

| 优先级 | 能力 | 缺口描述 | 进度 | 落地情况 / 备注 |
|---|---|---|---|---|
| 高 | `imgmin resize` 子命令 | `resizeImage` 已实现且导出，但 CLI 无入口 | **已完成** | 见 §4.8：`-w/--width`、`--height`、`--fit`、`-q`、`-f`、`-r`、`-j`、`--force`；库层 `resizeImage` 同步扩展（`quality` / `format` / `resized`） |
| 高 | 批量并发可调 `-j, --concurrency` | `batchProcess` 支持该参数，但 CLI 硬编码为 4 | **已完成** | 默认命令 / compress / webp / avif / resize 均已支持（1-32，默认 4）；`-j 1` 退化为顺序处理 |
| 高 | 自动化测试 | `npm test` 空跑，无 `*.test.js` | **部分完成** | 已补 `tests/*.test.js`：utils / compress / resize / convert / smart 模块用例（35 项已验证通过）+ CLI 端到端用例（已编写，待执行验证）+ `tests/http.test.js` 覆盖 `/api/compress`、`/api/info`、`/api/smart-analyze`、`/api/download-zip`（启动真实 UI 服务，需本地执行验证）；Web API 用例因派生子进程，本环境被跳过 |
| 中 | WebP / AVIF 无损 `--lossless` | sharp 的 `lossless` 选项未暴露 | **已完成** | `applyEncoder` 按格式分流：WebP/AVIF/TIFF 走原生 `lossless`，PNG 拉满压缩级别，JPEG 退回最高质量；CLI(默认/compress/webp/avif/convert/resize)与 UI(无损模式开关，开启后禁用质量滑块并接 `/api/compress?lossless=1`)双入口 |
| 中 | 体积 / 尺寸预算 `--max-size 200kb` | 无 | **已完成** | `compressImageMaxSize` 二分搜质量使产物 ≤ 目标体积（`200kb`/`1.5mb` 等单位经 `parseSizeToBytes` 解析）；CLI(默认/compress/webp/avif/convert/resize)与 UI(目标体积输入框，接 `/api/compress?maxSize=`)双入口；与 `--lossless` 互斥（无损优先，忽略 max-size） |
| 中 | CI 友好输出 `--json` / `--dry-run` / `--quiet` | 无，只能解析彩色文本 | 未开始 | `--dry-run` 可与现有「跳过判定」逻辑复用，`--json` 需统一各命令结果结构 |
| 中 | `imgmin ui --host 0.0.0.0` | 仅支持 `-p` | 未开始 | 容器 / 局域网场景；需同步 §7.1 与 `startUIServer` |
| 中 | 元数据控制 `--strip` / EXIF 自动旋转 | 未显式处理 | **已完成** | 引擎新增 `applyMeta`（先 `rotate()` 后 `withMetadata()`）；`keepMetadata` 默认 `true`（保留 EXIF/IPTC/ICC/XMP），`--strip` 置 false；`--rotate-exif` 按 EXIF Orientation 转正并清方向标记；CLI(默认/compress/webp/avif/convert/resize)与 UI(移除元数据 / 按 EXIF 自动旋转开关)双入口 |
| 中 | 像素变换（转灰度 / 透明铺底 / 手动旋转） | 属编辑范畴，与压缩/优化定位冲突 | **已移除（2026-09-15 复审）** | `--greyscale` / `--flatten` / `--rotate <deg>` 经复审均归类为纯编辑能力，与 P2「编辑类全部不做」口径冲突，已从引擎 / CLI / UI 全量回退；方向修正由既有 `--rotate-exif`（EXIF 自动旋转）承担。`imgmin` 定位收口为压缩 / 格式转换 / 元数据 / 无损 / 目标体积 / EXIF 自动旋转，不做像素编辑类变换 |
| 中 | 高级编码 / 画质参数（`--progressive` / `--effort` / `--near-lossless` / `--sharpen`） | sharp 对应编码与像素变换参数未暴露 | 未开始 | 规划与冲突分析见 §11.4；`--greyscale` / `--flatten` / `--rotate <deg>` 经复审移除（归类编辑类，已从引擎/CLI/UI 回退）；剩余 `--progressive` / `--effort`（编码类，复用 `applyEncoder`）与 `--near-lossless` / `--sharpen`（语义类，复用 `applyTransforms`）待开发 |
| 低 | watch 增量模式 | 无 | 未开始 | 可结合 mtime + 内容 hash 跳过未变更文件 |
| 低 | SVG 优化（svgo） | 当前被 sharp 栅格化，丢失矢量特性 | 未开始 | 需引入 svgo，并纳入 §5 输入格式说明 |
| 低 | HEIC / HEIF 导入 | sharp 解码不支持 | 未开始 | 见 §5、§10；需额外解码依赖 |
| 低 | 生态集成（GitHub Action / pre-commit 钩子 / Vite·Webpack 插件） | 无 | 未开始 | 依赖 CLI 输出稳定（建议先做 `--json`） |
| 低 | 智能模式增强 | 指标为近似实现；CLI 目录无 per-file 结构化汇总；UI 无决策卡片 | 未开始 | 细项见 §11.2 |
| 低 | `docs/` 目录为空 | PRD / AGENTS 均在根目录 | 未开始 | 可选：迁入 `docs/` 需同步 AGENTS.md §4 文档索引 |

### 11.2 待细化项（原路线图，未开始）

- **智能模式 · CLI 汇总**：批量目录模式下结构化汇总每张图的决策理由（当前仅逐行打印到终端）。
- **智能模式 · UI 决策卡片**：Web 结果区展示 per-file 决策（格式 / 质量 / 指标分数 / 理由）。
- **智能模式 · 指标精度 · Butteraugli 近似升级（执行中）**：原生 Butteraugli 在 Node 下无可用依赖（`@squoosh-kit/visdif` 实测 WASM 加载失败、`butteraugli`@0.0.2 年久风险高，见 §13），故不引入原生依赖；改为**升级现有近似**为更接近真值的实现——sRGB→CIELAB 正确转换 + 多尺度（1x/0.5x/0.25x）误差 + 暗部敏感权重 + 对比度掩蔽 + Minkowski(p≈0.6) 空间池化并兼顾最差区域，输出标定到 ~Butteraugli 量纲（0=相同，≤1.2 视为达标）。指标名 `butteraugli` 与 CLI/UI 契约不变，SSIM 本次不替换。
- **智能模式 · 指标精度 · SSIM**：维持当前自实现简化版（阈值 `≥0.95`），本次不替换；如后续需要更精确 SSIM 可单独规划（不在本次范围）。
- **智能模式 · 自适应质量扩展**：把自适应质量扩展到 AVIF 之外的有损格式（当前 JPEG / PNG 走固定质量）。
- **并发模型**：当前为分批 `Promise.allSettled`，如需精细限流可引入 `p-limit` 风格调度。
- **测试**：补充 Web UI 与 `/api/*` 端点的集成测试（`/api/compress`、`/api/info`、`/api/smart-analyze`、`/api/download-zip`）——**已完成**，见 `tests/http.test.js`（派生子进程启动真实 UI 服务，待本地执行验证）。

### 11.3 本次迭代（2026-09-14）完成情况

| 计划项 | 状态 | 交付物 |
|---|---|---|
| `resize` 子命令 | 已完成 | `src/compress.js`（`resizeImage` 扩展）、`src/index.js`（`resize` 命令 + `resizeSingleFile` + `processDirectoryResize`） |
| `-j/--concurrency` | 已完成 | `src/index.js`（`parseConcurrency`、各批量命令选项、`processDirectory` 并发化） |
| 首批自动化测试 | 部分完成 | `tests/`（helpers + 6 个用例文件）；仍缺 Web API 测试 |
| 文档同步 | 已完成 | README（resize / 并发 / 测试章节）、PRD（§4.8、§11、§13）、AGENTS.md（测试规范与踩坑） |

### 11.4 高级编码与画质参数（待开发）· 冲突分析

> 本节为规划与冲突分析区。`--greyscale` / `--flatten` / `--rotate <deg>` 经复审均归类为纯编辑能力、与 P2「编辑类全部不做」口径冲突，已于 2026-09-15 全量回退（引擎 `applyTransforms` 现仅保留 EXIF 自动旋转）；其余 `--progressive` / `--effort` / `--near-lossless` / `--sharpen` 仍为待开发规划项。
> 复用点：编码类参数统一进 `applyEncoder(pipeline, format, quality, { lossless, keepMetadata, rotateExif, ... })`；EXIF 自动旋转统一进 `applyTransforms`（先于 `applyMeta` 执行，仅处理 `rotateExif`）。
> 执行顺序约定：`applyTransforms`（仅 `--rotate-exif` 自动转正）→ `withMetadata()`（元数据）→ 编码（quality / lossless / effort / progressive）。

| 参数 | 作用 / 适用格式 | 与现有功能冲突判定 | 采用的处理规则（拟） |
|---|---|---|---|
| `--progressive` | 渐进式 / 交错：JPEG（`progressive`）、PNG（`progressive` / Adam7）、WebP 无此选项 | **无冲突**（与 `lossless`、`max-size` 正交） | 全程透传；`--max-size` 二分搜索的每次试编码与最终编码都携带该开关，保证收敛对象一致 |
| `--effort <n>` | 编码耗时 ↔ 质量权衡：AVIF 0-9、WebP 0-6、PNG 0-10 | **无冲突** | 按目标格式校验并夹取范围；对不支持的格式忽略；WebP / AVIF 无损模式下同样接受 effort |
| `--near-lossless [0-100]` | WebP 专用「近无损」预测 | **语义重叠**（与 `--lossless` 同属无损族，非硬冲突） | 仅对 WebP 生效，其它格式忽略并提示；与 `--lossless` 同时给出时以 near-lossless 为准；与 `--max-size` 沿用无损族规则（**忽略 max-size**）以消除二义 |
| `--flatten [color]` | 去除 alpha 并按指定底色（默认 `#ffffff`）铺底 | **与透明语义冲突**（PNG / WebP 透明将被丢弃） | **已移除（2026-09-15 复审）**：归类为纯编辑能力，与 P2「编辑类全部不做」口径冲突，已从引擎 / CLI / UI 全量回退；透明处理交由用户前期或外部工具 |
| `--greyscale` | 转灰度（R=G=B），适用于所有输出格式 | **与 `--lossless` 正交**（仅改像素、不影响无损判定） | **已移除（2026-09-15 复审）**：归类为纯编辑能力，与 P2「编辑类全部不做」口径冲突，已从引擎 / CLI / UI 全量回退；若日后定位扩展为「轻量变换」工具可再纳入 |
| `--rotate <deg>` | 按度数旋转（90 / 180 / 270 等），适用于所有输出格式 | **覆盖 `--rotate-exif`**（手动旋转优先于 EXIF 转正） | **已移除（2026-09-15 复审）**：归类为纯编辑能力，与 P2「编辑类全部不做」口径冲突，已从引擎 / CLI / UI 全量回退；方向修正由 `--rotate-exif` 承担 |
| `--sharpen [sigma]` | 锐化（USM）；适用于所有有损 / 无损输出 | **与 `--lossless` 硬冲突**（改变像素 → 相对原图不再无损） | 像素变换类与 `--lossless` 互斥：同时给出时以 `--lossless` 优先并忽略锐化（附提示），或 CLI 直接报错退出（实现时二选一，倾向「忽略 + 提示」）；与 SSIM 自适应质量搜索有交互（锐化会拉低相对原图的 SSIM，需按变换后基准比较或提示） |

**通用结论**

- **编码类（`--progressive` / `--effort`）**：与现有功能**不冲突**，可直接沿用 `lossless` / `maxSize` 的既有透传模式补齐（含 CLI 各命令与 UI）。
- **语义类（`--near-lossless` / `--sharpen`）**：**存在需要显式裁决的交集**——无损族归属、像素变换 vs 无损；`--greyscale` / `--flatten` / `--rotate <deg>` 经 2026-09-15 复审均归类为纯编辑能力、已全量回退；剩余 `--near-lossless` / `--sharpen` 规则同上表，实现时必须同步 CLI 提示与 UI 开关的禁用 / 联动。
- **通用像素变换（后续扩展）**：凡改变像素的参数（blur / normalize / modulate / tint 等）与本节的 `--sharpen` 同属「与 `--lossless` 互斥」一类，统一按同一规则处理。

---

## 12. 合规说明

本文档为「代码 → 文档」反向整理，现状即契约：任何后续改动若与第 4–9 节行为不一致，视为行为变更，需同步更新本 PRD 与 `AGENTS.md` 的对应小节（见 AGENTS.md 第 0 节维护约定）。

第 11 节是本文档**唯一带执行进度标记**的章节：完成某项能力后，必须把状态从「未开始 / 部分完成」改为「已完成」，写明落地方式与对应小节，并在 §13 追加变更记录；引入新的待办方向也应追加到 §11.2，保持「缺口清单」与实际代码一致。

---

## 13. 变更记录

### 2026-09-14 · 智能模式与无损 / 目标体积互斥收口
- 背景：智能模式做「选格式 + 自适应质量」，而 `--lossless`（忽略质量）、`--max-size`（二分搜质量）同样决定质量，叠加时会静默覆盖智能的自适应质量，且结果卡片回显的是建议质量而非实际产物质量。
- Web UI（`ui-public/index.html`）：`syncEditableState` 收口——开启智能模式时禁用并置灰「无损模式」（`#losslessRow`）与「目标体积」（`#maxSizeBlock`）、自动关闭已开启的无损模式，显示互斥提示条（`#mutexNote`）；提交时 `lossless` / `maxSize` 加 `!smart` 守卫。
- 结果回显（`src/ui.js`）：智能分支改为捕获 `compressImage` 返回值并回显实际生效质量（`quality: effectiveQuality`）。
- 规则：智能模式与「无损模式」「目标体积」互斥（均决定质量）；「移除元数据」「按 EXIF 自动旋转」与智能模式正交，保持可用。

### 2026-09-14 · PRD 增补「高级编码与画质参数」规划（未实现）
- 新增 §11.4：对 `--progressive` / `--effort` / `--near-lossless` / `--flatten` / `--sharpen` 五项做冲突分析并锁定拟采用规则。
- 结论：**编码类（`--progressive` / `--effort`）与现有功能不冲突**，可按 `--lossless` / `--max-size` 既有透传模式补齐；**语义类**（`--near-lossless` 与 `--lossless` 归属、`--flatten` 丢透明、`--sharpen` 与 `--lossless` 硬冲突）需显式裁决，规则已写入 §11.4。
- §11.1 增补对应规划行（进度：未开始，指向 §11.4）。

### 2026-09-14 · resize / 并发 / 测试
- **新增 `resize` 命令**（§4.8）：`-w/--width`、`--height`、`--fit`、`-q`、`-f`、`-r`、`-j`、`--force`；库层 `resizeImage` 扩展为支持 `quality` / `format` / `withoutEnlargement`，并返回 `resized` 与前后尺寸。
- **批量并发可调**：默认命令、compress、webp、avif、resize 新增 `-j, --concurrency`（1-32，默认 4）；`processDirectory` 重构为「单文件 worker + 顺序/并发双驱动」，行为与顺序模式保持一致。
- **并发写冲突防护**：新增输出路径认领集合，重复映射到同一路径的源文件会被跳过（`Skip (duplicate output)`）。
- **新增测试**：`tests/*.test.js`（helpers 现场用 sharp 生成夹具，无二进制快照），覆盖 utils / compress / resize / convert / smart 与 CLI 端到端（含 `config` 的隔离 HOME）。
- **缺陷修复**：
  - `glob` 非递归分支无法解析 `{jpg,png}` 花括号扩展名，导致 `--no-recursive` 匹配不到任何文件。
  - `smartSuggest` 未返回 `originalSize`，导致 `imgmin smart` 打印 `NaN undefined`。
  - `resizeImage` 的「参数缺失」与「参数非法」校验顺序错误（`width/height` 为 0 时被误判为未传）。
- **`compress.js` 结构调整**：抽出 `applyEncoder`（编码参数统一收口，质量统一夹取到 1-100）并新增 `isEncodableFormat` / `RESIZE_FITS` 导出。

### 2026-09-14 · Web API 集成测试 + 修复 smart-analyze
- 新增 `tests/http.test.js`：派生子进程启动真实 UI 服务（`IMGMIN_NO_BROWSER=1`），端到端覆盖 `/api/compress`、`/api/info`、`/api/smart-analyze`、`/api/download-zip`（含产物下载与 zip 头 `PK` 校验）。
- 修复 `/api/smart-analyze`：该 handler 引用了 `outputDir`，但只声明在 `/api/compress` 闭包内，自身作用域未声明，命中即抛 `ReferenceError`；现显式声明 `const outputDir = path.join(os.tmpdir(), 'imgmin-ui-output')`。
- `startUIServer` 支持 `IMGMIN_NO_BROWSER=1` 跳过自动打开浏览器，便于测试 / CI。

### 2026-09-14 · 无损编码 --lossless
- 新增 CLI 选项 `--lossless`（覆盖默认命令 / compress / webp / avif / convert / resize），以及 UI「无损模式」开关（勾选后禁用质量滑块，并以 `lossless=1` 接入 `/api/compress`）。
- `src/compress.js`：`applyEncoder` 增加 `{ lossless }` 参数，按格式分流——WebP / AVIF / TIFF 走原生 `lossless: true`；PNG 拉满 `compressionLevel: 9`（本身无损）；JPEG 不支持无损，退回最高质量 100。`compressImage` / `compressImageToWebp` / `compressImageToAvif` / `compressImageToFormat` / `resizeImage` 同步透传。
- `src/convert.js`：`convertImage` 同样按格式分流无损编码。
- `src/index.js`：各命令 action 读取 `options.lossless` 并贯穿 `processDirectory` / `processDirectoryToFormat` / `processDirectoryResize` / `compressSingleFile` / `convertToFormatSingle` / `resizeSingleFile`。
- `src/ui.js`：`/api/compress` 读取 `req.body.lossless === '1'`，智能与非智能分支均透传 `compressImage`。
- `tests/compress.test.js`：新增 3 个用例覆盖 `applyEncoder` 无损、`compressImage` lossless 透传、`compressImageToWebp` lossless 参数。

### 2026-09-14 · 目标体积 --max-size 与无损冲突收口
- 新增 CLI 选项 `--max-size <size>`（默认 / compress / webp / avif / convert / resize），经 `parseSizeToBytes` 解析 `200kb` / `1.5mb` 等单位；引擎 `compressImageMaxSize` 二分搜索最高质量使产物 ≤ 目标体积。
- UI 新增「目标体积」输入框，以 `maxSize` 接入 `/api/compress`；勾选「无损模式」时该输入框自动禁用（无损优先，忽略 max-size）。
- 冲突规则：① `--lossless` 优先于 `--max-size`，同时传入时忽略 max-size；② JPEG 无原生无损，开启 `--lossless` 退回最高质量 q100，结果附 `losslessNote` 提示（CLI 黄色 ⚠、UI 橙色提示条）。

### 2026-09-14 · 元数据控制 --strip / EXIF 自动旋转
- 引擎新增 `applyMeta(pipeline, { keepMetadata, rotateExif })`：先 `rotate()`（按 EXIF Orientation 自动旋转像素，随后由 `withMetadata()` 清除方向标记避免二次旋转），再 `withMetadata()` 保留 EXIF/IPTC/ICC/XMP；在 `applyEncoder` 与各格式 handler（`compressImageToWebp`/`ToAvif`）及 `convertImage`/`resizeImage` 中统一套用。
- CLI 新增 `--strip`（丢弃元数据，默认 `keepMetadata=true` 即保留）与 `--rotate-exif`（自动旋转），贯穿默认 / compress / webp / avif / convert / resize 全部命令及内部批量/单文件 helper；UI 新增「移除元数据」「按 EXIF 自动旋转」开关，经 `/api/compress` 的 `strip` / `rotateExif` 透传。
- 改变旧行为：此前「压缩即丢元数据」为隐式，现默认保留元数据（与 `--strip` 形成显式控制）。

### 2026-09-15 · 像素变换（--greyscale / --flatten / --rotate）经复审全量回退
- 引擎曾新增 `applyTransforms` 收口 `flatten` / `rotate(deg)`；经复审 `--greyscale` / `--flatten` / `--rotate <deg>` 三者均归类为纯编辑能力，与 P2「编辑类全部不做」口径冲突，已从引擎 / CLI / UI 全量回退；`applyTransforms` 现仅保留 EXIF 自动旋转（`rotateExif`）。
- 引擎 6 个编码入口（`compressImage` / `compressImageMaxSize` / `compressImageToWebp` / `compressImageToAvif` / `compressImageToFormat` / `resizeImage`）与 `convertImage` 均接收并透传这三个字段；`buildEncodeOptions` 把它们并入 options，各格式 handler 通过 `applyTransforms` 套用。
- CLI 曾新增 `--flatten` / `--rotate <deg>`（已回退）；方向修正由既有 `--rotate-exif` 承担。
- UI「编码选项」组的「透明铺底」开关与「旋转角度」输入框已移除；`/api/compress` 不再接收 `flatten` / `rotate`。
- 定位收口：`imgmin` 不做任何像素编辑类变换（转灰度 / 透明铺底 / 手动旋转 / 锐化 / 模糊 / 滤镜 / 水印），仅保留压缩 / 格式转换 / 元数据 / 无损 / 目标体积 / EXIF 自动旋转。

### 2026-09-14 · 进度可视化（第 11 节重构）
- 第 11 节由「路线图（候选 / 当前未实现）」重构为「**能力缺口与路线图（含执行进度）**」：
  - 新增 **11.1 执行进度总览**：15 项能力的优先级 / 缺口描述 / 进度 / 落地情况（`已完成` / `部分完成` / `未开始` / `搁置`）。
  - 新增 **11.2 待细化项**：收纳原路线图 6 条未开始方向，并补充 Web API 集成测试的具体端点清单。
  - 新增 **11.3 本次迭代完成情况**：映射本次交付物到具体文件。
- 文档头部与 §12 增加「进度维护约定」：完成能力后须更新第 11 节状态并追加本节记录。

### 2026-09-15 · PRD 规划：Butteraugli 真值化（替换近似实现）
- 背景：`src/smart.js` 的 `findOptimalQuality` 中 Butteraugli 为自实现近似（非 Google 原生），仅用于驱动质量二分。用户要求改用真实 Butteraugli。
- 关键约束核实：`sharp` / `libvips` 不提供 Butteraugli 指标（libvips 无 `vips_butteraugli` API），故「用 sharp 原生 Butteraugli 替换」不可行；必须引入额外依赖。
- 选型：`@squoosh-kit/visdif`@0.2.10（Emscripten/WASM 版 Google Butteraugli，MIT/Apache-2.0，~267KB，依赖 `@squoosh-kit/runtime`），npm 可直接安装；相对 `butteraugli`@0.0.2（2017 年久）更稳健。
- 规划内容（§6.2 / §10 / §11.2 同步更新）：在 `src/smart.js` 以该 WASM 模块替换近似 Butteraugli，原图与候选压缩图经 `sharp` 解码为 raw RGBA 后求标量分数，阈值 `≤1.2` 语义不变；指标名 `butteraugli` 与 CLI/UI 契约不变；SSIM 本次不替换。
- 进度：PRD 已记录规划；实现阶段 `npm install @squoosh-kit/visdif` 后实测，该包在 Node 下经 `fetch(file://)` 加载 WASM（Node 不支持）且 dist 缺失 Emscripten glue，WASM 无法实例化；`src/smart.js` 改动已撤销、依赖已卸载，维持近似 Butteraugli。真值化方案经用户确认改为「**升级近似算法**」（不引原生依赖），见下条。

### 2026-09-15 · Butteraugli 近似升级（取代原生依赖方案）
- 决策：原生 Butteraugli（真值）在 Node CLI 下无可用依赖——`@squoosh-kit/visdif` 经 `fetch(file://)` 加载 WASM 且其 dist 缺失 Emscripten glue，无法实例化；`butteraugli`@0.0.2（2017 原生 addon）需 node-gyp 构建、年久失修，风险高。用户选定**不引入原生依赖**，改为升级现有近似算法为更接近真值的实现。
- 方案（§6.2 / §11.2 同步更新）：`src/smart.js` 的 `computeButteraugli` 由「Rec.709 亮度加权逐像素色差」升级为 sRGB→CIELAB 正确转换 + 多尺度（1x/0.5x/0.25x）误差 + 暗部敏感权重 + 对比度掩蔽 + Minkowski(p≈0.6) 空间池化（兼顾最差区域），输出标定到 ~Butteraugli 量纲（0=相同、≤1.2 达标）。阈值、指标名、CLI/UI 契约均不变。
- 进度（已完成）：`src/smart.js` 已升级 `computeButteraugli` 为 CIELAB 多尺度加权实现（含 `toLabPlanes` / `butteraugliDistance`，已导出便于测试），原图 Lab 平面只解码一次复用；`tests/smart.test.js` 新增行为用例（相同图≈0、低质量距离>高质量、量纲合理），`node --test tests/smart.test.js` 6/6 通过；CLI 冒烟验证：平滑图 q82 距离 0.34（选低质量省 99.5%）、噪声图始终>1.2（保持高质），符合感知模型。阈值 / 指标名 / CLI·UI 契约均不变。

### 2026-09-15 · 新增 PSNR 质量指标 + 质量指标竖向单选 UI
- 背景：智能模式自适应质量已有 SSIM（结构类）/ Butteraugli（感知类）两类指标，缺「误差 / 保真度类」标准参照系（PSNR dB 数），用户认可仅补 PSNR（MSE/DSSIM 冗余、VMAF/SSIMULACRA2 需训练模型违反离线零依赖约束）。
- 引擎（`src/smart.js`）：新增 `computePSNR`（基于 RGB 通道 MSE，封顶 100dB 防 Infinity）；`findOptimalQuality` 增加 `psnr` 分支，阈值默认 `≥38dB`；用 `higherBetter` 统一 SSIM/PSNR（越大越好）与 Butteraugli（越小越好）的判定，CLI/UI 契约不变。
- 测试（`tests/smart.test.js`）：新增 `findOptimalQuality({metric:'psnr'})` 与 `computePSNR` 行为用例（相同图≈100dB、高质量>低质量），`node --test tests/smart.test.js` 8/8 通过。
- UI（`src/ui-public/index.html`）：质量指标由下拉框改为直接展示的**竖向单选**（SSIM / Butteraugli / PSNR，每行左单选框右名称 + 小字解释），智能模式未勾选时整组置灰禁用、勾选后可点；移除原公共说明块与废弃样式。
- 文档（§6.2 / AGENTS.md §1.5·§2.5·§5.1 同步）：补 PSNR 指标说明与阈值 `≥38dB`，API 契约 `metric` 枚举扩为 `ssim | butteraugli | psnr`。零新依赖，离线可用。
