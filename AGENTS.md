# AGENTS.md

> 面向 AI Agent 的项目开发指南。最后更新：2026-09-14 · 适用分支：`main` · Node ≥ 18（当前开发环境 v22 via nvm）
> 维护约定：改动架构 / CLI 接口 / UI 字段契约 / 依赖后，必须同步更新本文件对应小节。

## 0. 快速上手（30 秒版）

- **项目一句话**：`imgmin` 是一个图片压缩 / 格式转换 CLI + Web UI 工具，核心引擎是 `sharp`，支持 WebP / AVIF / JPEG / PNG 等格式，并带「内容感知选格式 + 自适应质量」的智能模式。
- **技术栈**：Node.js ESM（纯原生，无前端框架 / 无打包器）· `sharp@0.33` · `commander@12` · `express@5` · `archiver@8` · `chalk@5` · `ora@8` · `multer@2`。
- **安装 / 起服务 / 跑命令**：
  - 全局链接（否则 `imgmin` 命令不存在）：`npm link`（或 `pnpm link --global`）
  - 启动 Web UI：`imgmin ui`（默认端口 3000，可 `-p <port>`）
  - 压缩当前目录：`imgmin compress`（别名 `c`）；智能模式：`imgmin smart <file|dir>` 仅分析不压缩
  - 跑测试：`npm test`（= `node --test`，目前仓库无测试文件）
- **改代码前必读**：第 3 节（禁止项 / 依赖契约 / 常见错误）。

## 1. 项目全局认知

### 1.1 定位
图片批处理工具，双形态：① CLI（commander 子命令）② 浏览器 Web UI（express 托管的单文件 SPA）。压缩与格式转换统一走 `sharp`。

### 1.2 整体架构
```
bin/cli.js ──import──▶ src/index.js        (CLI 入口 + 子命令定义 + 编排)
                              │
        ┌─────────────────────┼─────────────────────┐
        ▼                     ▼                     ▼
  src/compress.js      src/convert.js        src/smart.js
  (压缩/转 WebP/AVIF)  (格式转换封装)        (内容感知 + 自适应质量)
        │                     │                     │
        └─────────┬───────────┴─────────┬───────────┘
                  ▼                     ▼
            src/utils.js          src/config.js
            (glob/info/工具)       (~/.imgminrc 配置)
                              │
                    src/ui.js  (express 服务 + /api/*)
                              │ serves
                    src/ui-public/index.html  (单文件 SPA：HTML+CSS+JS 全内联)
```
数据流（CLI）：`bin/cli.js → index.js → compress.js/convert.js → sharp → 落盘`
数据流（UI）：`浏览器 index.html → fetch /api/compress → ui.js → compress.js → sharp → /tmp/imgmin-ui-output → 下载`

### 1.3 技术栈说明（带版本）
| 包 | 版本 | 角色 | 注意 |
|---|---|---|---|
| sharp | ^0.33 | 图像处理引擎（压缩/转码/元信息） | 核心，所有图像操作都经它 |
| commander | ^12 | CLI 参数与子命令 | |
| express | ^5 | Web UI 服务器 | v5 路由 API |
| archiver | ^8 | ZIP 打包（Download All） | **纯 ESM，必须命名导入 `ZipArchive`** |
| chalk | ^5 | 终端彩色输出 | 纯 ESM |
| ora | ^8 | 终端 spinner | 纯 ESM |
| multer | ^2 | 文件上传中间件 | |

### 1.4 核心模块职责
| 模块 | 路径 | 负责 | 不负责 |
|---|---|---|---|
| 入口 | `bin/cli.js` | 仅 `import '../src/index.js'`，无逻辑 | 不放业务逻辑 |
| CLI 编排 | `src/index.js` | 定义全部子命令、解析参数、调用压缩/转换、目录遍历 `processDirectory` / `compressSingleFile`、智能命令 | 不直接调 sharp（委托 compress.js） |
| 压缩 | `src/compress.js` | `compressImage` / `compressImageToWebp` / `compressImageToAvif` / `compressImageToFormat` / `resizeImage` / `compressDirectory` | 不发网络请求 |
| 转换 | `src/convert.js` | `convertImage` 及 per-format helper、`getSupportedFormats` | |
| 工具 | `src/utils.js` | `glob`、`getImageInfo`、`formatFileSize`、`isImageFile`、`ensureDir`、`batchProcess` | 不含业务逻辑 |
| 配置 | `src/config.js` | 读写 `~/.imgminrc`（JSON） | |
| 智能 | `src/smart.js` | `analyzeImage`（主色/透明/类型→推荐格式）、`findOptimalQuality`（SSIM/Butteraugli 二分搜索）、`smartSuggest` | 纯本地，无 IO 依赖 UI |
| Web 服务 | `src/ui.js` | express 服务、`/api/compress`、`/api/info`、`/api/download`、`/api/download-zip`、`/api/smart-analyze`、`startUIServer` | 不写前端样式 |
| 前端 | `src/ui-public/index.html` | 单文件 SPA：拖放区 / 格式多选 / 质量滑块 / 智能开关 / 结果展示 | 无构建步骤，改完即生效 |

### 1.5 数据流 / 业务流程（关键链路）
Web 压缩：`dropZone → FormData(images, formats[] | smart, quality, metric) → fetch /api/compress → ui.js 遍历文件 → compressImage(smartSuggest?) → 写 /tmp/imgmin-ui-output → 返回 {results} → 前端渲染卡片 → Download All → /api/download-zip → ZipArchive 流式 pipe 给浏览器`
CLI 智能：`imgmin smart <src> → index.js → smartSuggest(file) → analyzeImage(256px 下采样) + findOptimalQuality(二分) → 打印 格式/质量/理由/节省%`

### 1.6 关键设计原则（真实约束）
- **纯 ESM**：`package.json` `"type": "module"`。禁止在 `src/*.js` 用 `require()`；archiver/chalk/ora 均为纯 ESM，必须用命名 `import`。
- **无前端构建**：UI 是单个内联 HTML 文件，由 `express.static` 直接托管，修改后**重启服务**即生效，无编译。
- **配置持久化**：`config.js` 读写 `~/.imgminrc`，CLI 选项与默认值合并（`getConfig()`）。
- **智能模式指标为纯 JS 近似**：`findOptimalQuality` 的 SSIM 是自实现简化版；Butteraugli 是感知加权色差近似（非 Google 原生实现），仅用于驱动质量二分，阈值 SSIM≥0.95 / Butteraugli≤1.2。

## 2. 开发规则

- **2.1 代码组织**：CLI 逻辑全在 `index.js`；底层图像能力在 `compress.js`/`convert.js`；通用工具在 `utils.js`；新增 API 端点只在 `ui.js`。
- **2.2 命名**：文件 kebab-case（`compress.js`）；函数 camelCase；导出函数用动词开头（`compressImage`、`analyzeImage`）。
- **2.3 文件结构**：`src/*.js` 顶部 `import` → 导出函数（JSDoc 注释参数）→ 末尾无副作用（除 `index.js` 的 `program.parse()`）。
- **2.4 模块拆分**：图像相关新增能力放 `compress.js`/`convert.js`；跨命令共享逻辑放 `utils.js`；不要在前端写复杂逻辑（保持单文件可读）。
- **2.5 API 契约**：`/api/compress` 接收字段——`images`（multer 多文件）、`formats[]`（多选时）或 `format`（单格式）、`quality`、`smart`（`'1'` 时启用）、`metric`（`ssim`/`butteraugli`）。返回 `{ results: [{ success, format, savedPercent, outputPath, downloadUrl, ... , smart?, quality?, reason? }] }`。**前端 `index.html` 与 `ui.js` 的字段名必须同步。**
- **2.6 错误处理**：CLI 用 `ora` spinner + `try/catch` 打印 `chalk` 错误；UI 用 `express` 全局错误处理器（`ui.js` 末尾），multer 超限返回 413/400。
- **2.7 日志**：CLI 走 `chalk`/`ora`；服务端错误 `console.error`（含 'Compress endpoint error' 等前缀），便于在终端复现。
- **2.8 测试**：当前无测试文件（`npm test` 跑 `node --test` 为空）。新增功能建议补 `*.test.js`。

## 3. AI Agent 开发指导  ★最高优先级★

### 3.1 改动前必读清单
- 改 CLI 子命令 → 先读 `src/index.js` 对应 `.command(...)` 块与 `processDirectory`/`compressSingleFile`。
- 改压缩行为 → 读 `src/compress.js` 的 `switch(targetFormat)`。
- 改 Web API → 读 `src/ui.js` 端点 + 对应 `index.html` 的 `fetch` 调用，保持字段一致。
- 改智能模式 → 读 `src/smart.js`（`analyzeImage` 决策树 + `findOptimalQuality` 二分）。

### 3.2 禁止随意修改的文件 / 点
- **`src/ui-public/index.html` 的 `<style>`/`<script>` 结构**：单文件 SPA，错位会整页崩；改前先定位明确锚点。
- **`bin/cli.js`**：仅入口，移动它要同步改 `package.json` 的 `bin`。
- **`archiver` 的引入方式**：固定 `import { ZipArchive } from 'archiver'`，**不得**改回 `archiver('zip',...)` 工厂或 `new archiver.Archiver(...)`（见 3.4）。
- **锁文件** `package-lock.json` / `pnpm-lock.yaml`：除非依赖变更，否则不手动编辑。

### 3.3 强依赖关系（改动联动表）
| 改 A | 必须同步改 B |
|---|---|
| `index.html` 发给 `/api/compress` 的字段名 | `ui.js` 端点里读取的同名 `req.body.*` |
| `compress.js` 的返回字段 | `index.js` 结果展示 / `ui.js` 前端卡片渲染 |
| `smart.js` 的 `smartSuggest` 返回结构 | `ui.js` `/api/smart-analyze` 与 `/api/compress` smart 分支的映射 |
| `package.json` 的 `bin` | `bin/cli.js` 路径 |
| 新增依赖 | 同步 `package.json` + 重新 `npm link`/`pnpm install` |

### 3.4 常见错误模式（真实踩坑）
- **现象**：`imgmin: command not found` → **根因**：未全局链接 → **正确**：`npm link`（本项目从未预装全局）。
- **现象**：下载 zip 报 `TypeError: self._module.on is not a function` → **根因**：archiver v8 是纯 ESM，`new archiver.Archiver('zip', opts)` 实例化的是未初始化 `_module` 的基类 → **正确**：`import { ZipArchive } from 'archiver'; new ZipArchive({ zlib: { level: 1 } })`（已在 `1f4cd88` 修复，勿回退）。
- **现象**：压缩后文件反而变大 → **根因**：源已高度压缩 / 质量过高 → **正确**：`compressSingleFile`/`processDirectory` 已有「更大则跳过」逻辑；智能模式用低质量目标避免。
- **现象**：拖入文件夹提示「不支持」→ **根因**：`dataTransfer.files` 对文件夹为空 → **正确**：用 `webkitGetAsEntry()` 递归遍历（已在 `288a592` 修复）。
- **现象**：UI 改了没反应 → **根因**：忘了重启 `imgmin ui`，或改错文件（应为 `src/ui-public/index.html` 而非其他） → **正确**：重启服务。

### 3.5 推荐开发流程
1. 改 `src/*.js`（ESM）或 `src/ui-public/index.html`。
2. 本地验证：`node bin/cli.js compress --smart /tmp/xxx.jpg` 或 `node bin/cli.js ui` 手动过。
3. 若改了依赖或 bin，重跑 `npm link`。
4. 提交（commit message 中文 + 类型前缀，如 `feat(ui):`、`fix:`）。

### 3.6 Debug 排查顺序
- Web 问题：看终端里 `ui.js` 的 `console.error` 前缀（Compress endpoint error / Download-zip error）→ 查 `/tmp/imgmin-ui-output` 是否生成 → 核对前端 `fetch` 字段名。
- CLI 问题：加 `console.log` 于 `index.js` 对应命令 action；sharp 报错通常源于不支持的格式/损坏文件。
- 智能模式异常：直接 `node -e "import('./src/smart.js').then(m=>m.smartSuggest('文件'))"` 单测。

### 3.7 如何避免破坏已有功能（回归清单）
- 改 `compress.js`：用 `imgmin compress` 跑一张 jpg + 一张 png，确认产出与「更大则跳过」正常。
- 改 `ui.js` 端点：用浏览器走「上传→压缩→Download All」全链路，确认 zip 头为 `PK`。
- 改 `index.html`：确认拖放、格式多选、质量滑块、智能开关、结果卡片、已选文件列表与删除按钮均正常。
- 改 `smart.js`：跑 `imgmin smart` 验证三种判定（照片→avif、纯色→webp、透明→webp）。

## 4. 文档索引
| 文档 | 路径 | 用途 | 重要度 | 何时查看 |
|---|---|---|---|---|
| 本文件 | `AGENTS.md` | Agent 开发指南 | 🔴必读 | 任何改动前 |
| 项目说明 | `README.md` | 用户向功能/用法介绍 | 🟡常用 | 了解用户视角功能 |
| 配置 | `~/.imgminrc` | 运行时配置（quality/format 等） | 🟢参考 | 排查默认行为 |
| 依赖锁 | `package-lock.json` | 依赖精确版本 | 🟢参考 | 依赖漂移时 |

快捷路由：
- 架构 / 模块边界 → 第 1 节
- CLI 行为 / 命令参数 → `src/index.js`
- 压缩 / 转码逻辑 → `src/compress.js` / `src/convert.js`
- Web API / 前端契约 → `src/ui.js` + `src/ui-public/index.html`
- 智能选格式 / 质量 → `src/smart.js`

## 5. 当前项目状态
- **5.1 已完成**：CLI 全套命令（config/compress/webp/avif/convert/info/ui/smart）；Web UI（拖放/文件夹/多选格式/质量滑块/Download All zip/防重 loading；单图分析卡 + 多图可删文件列表）；智能模式（内容感知格式 + SSIM/Butteraugli 自适应质量，CLI 与 UI 双入口）；宽屏布局（容器 1440px，结果双列网格）。
- **5.2 开发中**：无（相对 `main` 最新提交 `288a592`）。
- **5.3 未完成计划**：批量目录智能模式在 CLI 的结果汇总未展示每张理由（仅打印到终端）；无自动化测试。
- **5.4 技术债务**：`findOptimalQuality` 的 Butteraugli 为近似实现，非 Google 原生；`processDirectory` 智能模式不写 `_compressed` 后缀（与常规模式命名不一致）。
- **5.5 已知问题**：极小透明 PNG 转 PNG 可能变大（已改为默认转 WebP 缓解）；`npm test` 无用例。
- **5.6 路线图**：补充 `*.test.js`；智能模式结果在 UI 汇总卡片展示 per-file 决策；支持 AVIF 之外的有损格式自适应。

## 6. 变更记录（本文件）
- 2026-09-14：初始生成 AGENTS.md。覆盖架构、模块职责、UI 字段契约、archiver v8 / 智能模式 / 拖文件夹等真实踩坑与依赖联动表。
