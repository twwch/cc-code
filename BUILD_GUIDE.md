# Claude Code 源码编译完全指南：从泄露源码到可运行的 CLI

> 手把手教你把 Claude Code 的 TypeScript 源码编译成可以跑起来的完整 CLI 工具。全程踩坑 12 个，历时数小时，终于成功运行。

![编译成功运行截图](https://cdn.jsdelivr.net/gh/twwch/images/claude-code/images/2026/04/源码编译.png)

---

## 前言

Anthropic 的 Claude Code CLI 工具源码被泄露。这份源码是从 Bun 打包产物中提取/反编译出来的 TypeScript 代码，包含了完整的 `src/` 目录（1884 个 TS/TSX 文件），但**缺少所有项目配置文件**（package.json、tsconfig.json、构建脚本），且有 7 个 Anthropic 内部私有包无法从 npm 获取，还有 22 个 feature-gated 源文件在泄露版本中不存在。

本文记录了从零开始补全项目配置、创建 stub 占位包、修复 12 个编译/运行时错误，最终成功编译并运行 Claude Code 的完整过程。

### 你将了解到

- Claude Code 的技术栈：**Bun + React + Ink**（终端 UI 框架）
- 如何从 import 语句逆向提取 76 个 npm 依赖
- 如何为 Anthropic 内部包创建 stub 替代实现
- `bun:bundle` 的 feature flag 机制和 `MACRO` 编译期变量注入
- React 19 的 `useEffectEvent` 与 `react-reconciler` 版本匹配问题
- Commander.js v12 → v13 的破坏性变更
- 以及其他 9 个实际编译/运行中踩过的坑

### 最终成果

- **编译产物**：`dist/cli.js`（约 17MB 单文件 bundle）
- **运行方式**：`bun dist/cli.js` 或通过 `claude.sh` 启动脚本
- **支持功能**：交互模式、非交互模式（`-p`）、自定义模型、API 代理等全部 CLI 功能

---

## 目录

- [1. 环境要求](#1-环境要求)
- [2. 安装 Bun 运行时](#2-安装-bun-运行时)
- [3. 创建项目配置文件](#3-创建项目配置文件)
- [4. 创建 Stub 包（不可公开获取的内部依赖）](#4-创建-stub-包不可公开获取的内部依赖)
- [5. 创建缺失的源码 Stub 文件](#5-创建缺失的源码-stub-文件)
- [6. 安装依赖](#6-安装依赖)
- [7. 编译构建](#7-编译构建)
- [8. 运行](#8-运行)
- [9. 编译过程中遇到的问题和修复](#9-编译过程中遇到的问题和修复)
- [10. 运行脚本 claude.sh](#10-运行脚本-claudesh)
- [11. 补充问题和修复（运行阶段发现）](#11-补充问题和修复运行阶段发现)

---

## 1. 环境要求

| 工具 | 版本要求 | 说明 |
|------|---------|------|
| **Bun** | >= 1.2.0 | 运行时 + 打包器 + 包管理器 |
| **macOS / Linux** | - | 项目目标平台 |

项目使用 Bun 专有的 `bun:bundle` 编译期特性（feature flags），**不能**用 Node.js + webpack/esbuild 替代。

## 2. 安装 Bun 运行时

```bash
curl -fsSL https://bun.sh/install | bash
```

安装完成后刷新 shell 或手动添加到 PATH：

```bash
export PATH="$HOME/.bun/bin:$PATH"
```

验证安装：

```bash
bun --version
# 输出: 1.3.11 (或更高版本)
```

## 3. 创建项目配置文件

源码中没有 `package.json` 和 `tsconfig.json`，需要手动创建。

### 3.1 package.json

在项目根目录创建 `package.json`。依赖列表通过扫描源码中所有 `import` 语句提取得到。

**关键点：**
- 7 个 Anthropic 内部包使用 `file:./stubs/...` 指向本地 stub 实现
- `commander` 必须是 **v12**（v13 不兼容源码中的 `-d2e` 短选项格式）
- `react-reconciler` 必须是 **0.33.0**（0.31.0 不支持 `useEffectEvent`）
- `@opentelemetry/*` 包需要使用较新版本（`resources` 需要 v2.6+ 才有 `resourceFromAttributes`）

```json
{
  "name": "claude-code",
  "version": "1.0.0",
  "description": "Claude Code - AI-powered CLI assistant",
  "type": "module",
  "main": "dist/entrypoints/cli.js",
  "bin": {
    "claude": "dist/entrypoints/cli.js"
  },
  "scripts": {
    "build": "bun run scripts/build.ts",
    "typecheck": "bunx tsc --noEmit",
    "dev": "bun run src/entrypoints/cli.tsx"
  },
  "dependencies": {
    "@alcalzone/ansi-tokenize": "^0.1.0",
    "@ant/claude-for-chrome-mcp": "file:./stubs/@ant/claude-for-chrome-mcp",
    "@ant/computer-use-input": "file:./stubs/@ant/computer-use-input",
    "@ant/computer-use-mcp": "file:./stubs/@ant/computer-use-mcp",
    "@ant/computer-use-swift": "file:./stubs/@ant/computer-use-swift",
    "@anthropic-ai/claude-agent-sdk": "^0.1.0",
    "@anthropic-ai/mcpb": "file:./stubs/@anthropic-ai/mcpb",
    "@anthropic-ai/sandbox-runtime": "file:./stubs/@anthropic-ai/sandbox-runtime",
    "@anthropic-ai/sdk": "^0.52.0",
    "@aws-sdk/client-bedrock-runtime": "^3.700.0",
    "@commander-js/extra-typings": "12",
    "@growthbook/growthbook": "^1.4.0",
    "@modelcontextprotocol/sdk": "^1.12.0",
    "@opentelemetry/api": "^1.9.0",
    "@opentelemetry/api-logs": "^0.214.0",
    "@opentelemetry/core": "^2.6.1",
    "@opentelemetry/resources": "^2.6.1",
    "@opentelemetry/sdk-logs": "^0.214.0",
    "@opentelemetry/sdk-metrics": "^2.6.1",
    "@opentelemetry/sdk-trace-base": "^2.6.1",
    "@opentelemetry/semantic-conventions": "^1.40.0",
    "ajv": "^8.17.0",
    "asciichart": "^1.5.25",
    "auto-bind": "^5.0.1",
    "axios": "^1.7.0",
    "bidi-js": "^1.0.3",
    "chalk": "^5.4.0",
    "chokidar": "^4.0.0",
    "cli-boxes": "^4.0.1",
    "code-excerpt": "^4.0.0",
    "color-diff-napi": "file:./stubs/color-diff-napi",
    "commander": "12",
    "diff": "^7.0.0",
    "emoji-regex": "^10.4.0",
    "env-paths": "^3.0.0",
    "execa": "^9.5.0",
    "figures": "^6.1.0",
    "fuse.js": "^7.0.0",
    "get-east-asian-width": "^1.3.0",
    "google-auth-library": "^9.15.0",
    "highlight.js": "^11.11.0",
    "https-proxy-agent": "^7.0.6",
    "ignore": "^7.0.0",
    "indent-string": "^5.0.0",
    "ink": "^5.2.0",
    "jsonc-parser": "^3.3.0",
    "lodash-es": "^4.17.21",
    "lru-cache": "^11.0.0",
    "marked": "^15.0.0",
    "p-map": "^7.0.0",
    "picomatch": "^4.0.0",
    "proper-lockfile": "^4.1.2",
    "qrcode": "^1.5.4",
    "react": "^19.0.0",
    "react-reconciler": "0.33.0",
    "semver": "^7.6.0",
    "shell-quote": "^1.8.2",
    "signal-exit": "^4.1.0",
    "stack-utils": "^2.0.6",
    "strip-ansi": "^7.1.0",
    "supports-hyperlinks": "^3.1.0",
    "tree-kill": "^1.2.2",
    "type-fest": "^4.30.0",
    "undici": "^7.3.0",
    "usehooks-ts": "^3.1.0",
    "vscode-jsonrpc": "^8.2.1",
    "vscode-languageserver-protocol": "^3.17.5",
    "vscode-languageserver-types": "^3.17.5",
    "wrap-ansi": "^9.0.0",
    "ws": "^8.18.0",
    "xss": "^1.0.15",
    "zod": "^3.24.0"
  },
  "devDependencies": {
    "@types/bun": "^1.2.0",
    "@types/diff": "^7.0.0",
    "@types/lodash-es": "^4.17.12",
    "@types/node": "^22.10.0",
    "@types/proper-lockfile": "^4.1.4",
    "@types/qrcode": "^1.5.5",
    "@types/react": "^19.0.0",
    "@types/react-reconciler": "^0.28.9",
    "@types/semver": "^7.5.8",
    "@types/shell-quote": "^1.7.5",
    "@types/stack-utils": "^2.0.3",
    "@types/ws": "^8.5.13",
    "typescript": "^5.7.0"
  },
  "engines": {
    "bun": ">=1.2.0"
  }
}
```

### 3.2 tsconfig.json

```json
{
  "compilerOptions": {
    "target": "ESNext",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "jsx": "react-jsx",
    "esModuleInterop": true,
    "allowImportingTsExtensions": true,
    "noEmit": true,
    "strict": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "baseUrl": ".",
    "paths": {
      "src/*": ["./src/*"]
    },
    "types": ["bun"]
  },
  "include": ["src/**/*.ts", "src/**/*.tsx"],
  "exclude": ["node_modules", "dist"]
}
```

### 3.3 scripts/build.ts（构建脚本）

```typescript
/**
 * Build script for Claude Code source
 *
 * Handles:
 * - bun:bundle feature flag stubbing
 * - MACRO.VERSION injection
 * - Internal @ant/* package stubbing
 * - Single-file bundle output
 */

const VERSION = process.env.CLAUDE_CODE_VERSION || '1.0.80'

const result = await Bun.build({
  entrypoints: ['./src/entrypoints/cli.tsx'],
  outdir: './dist',
  target: 'bun',
  sourcemap: 'linked',
  minify: false,
  define: {
    'MACRO.VERSION': JSON.stringify(VERSION),
    'process.env.NODE_ENV': '"production"',
  },
  external: [
    // Internal Anthropic packages (resolved via stubs at runtime)
    '@ant/claude-for-chrome-mcp',
    '@ant/computer-use-input',
    '@ant/computer-use-mcp',
    '@ant/computer-use-mcp/types',
    '@ant/computer-use-mcp/sentinelApps',
    '@ant/computer-use-swift',
    '@anthropic-ai/sandbox-runtime',
    '@anthropic-ai/mcpb',
    'color-diff-napi',
    // Optional provider SDKs (dynamic imports)
    '@anthropic-ai/bedrock-sdk',
    '@anthropic-ai/foundry-sdk',
    '@anthropic-ai/vertex-sdk',
    '@azure/identity',
    '@aws-sdk/client-bedrock',
    // Optional OpenTelemetry exporters (dynamic imports)
    '@opentelemetry/exporter-metrics-otlp-grpc',
    '@opentelemetry/exporter-metrics-otlp-http',
    '@opentelemetry/exporter-metrics-otlp-proto',
    '@opentelemetry/exporter-prometheus',
    '@opentelemetry/exporter-logs-otlp-grpc',
    '@opentelemetry/exporter-logs-otlp-http',
    '@opentelemetry/exporter-logs-otlp-proto',
    '@opentelemetry/exporter-trace-otlp-grpc',
    '@opentelemetry/exporter-trace-otlp-http',
    '@opentelemetry/exporter-trace-otlp-proto',
    // Optional npm packages (dynamic imports)
    '@aws-sdk/client-sts',
    'fflate',
    'sharp',
    'turndown',
    'yaml',
    'modifiers-napi',
    // Bun built-ins
    'bun:bundle',
  ],
})

if (!result.success) {
  console.error('Build failed:')
  for (const log of result.logs) {
    console.error(log)
  }
  process.exit(1)
}

console.log(`Build succeeded: ${result.outputs.length} file(s)`)
for (const output of result.outputs) {
  console.log(`  ${output.path} (${(output.size / 1024).toFixed(1)} KB)`)
}
```

### 3.4 claude.sh（启动脚本）

```bash
#!/bin/bash
# Claude Code launcher
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
NODE_ENV=production exec bun "$SCRIPT_DIR/dist/cli.js" "$@"
```

创建后赋予可执行权限：

```bash
chmod +x claude.sh
```

---

## 4. 创建 Stub 包（不可公开获取的内部依赖）

源码引用了 7 个无法从 npm 安装的包。需要在 `stubs/` 目录下创建占位实现，通过 `package.json` 中的 `file:` 协议链接。

### 目录结构

```
stubs/
├── @ant/
│   ├── claude-for-chrome-mcp/
│   │   ├── index.ts
│   │   └── package.json
│   ├── computer-use-input/
│   │   ├── index.ts
│   │   └── package.json
│   ├── computer-use-mcp/
│   │   ├── index.ts
│   │   ├── package.json
│   │   ├── sentinelApps.ts
│   │   └── types.ts
│   └── computer-use-swift/
│       ├── index.ts
│       └── package.json
├── @anthropic-ai/
│   ├── mcpb/
│   │   ├── index.ts
│   │   └── package.json
│   └── sandbox-runtime/
│       ├── index.ts
│       └── package.json
└── color-diff-napi/
    ├── index.ts
    └── package.json
```

### 4.1 @ant/claude-for-chrome-mcp

Chrome 浏览器集成 MCP 服务器（Anthropic 内部）。

**stubs/@ant/claude-for-chrome-mcp/package.json**
```json
{
  "name": "@ant/claude-for-chrome-mcp",
  "version": "0.0.0-stub",
  "type": "module",
  "main": "index.ts"
}
```

**stubs/@ant/claude-for-chrome-mcp/index.ts**
```typescript
// Stub for @ant/claude-for-chrome-mcp (Anthropic internal package)
export const BROWSER_TOOLS: any[] = []
export type ClaudeForChromeContext = any
export type Logger = any
export type PermissionMode = any
export function createClaudeForChromeMcpServer(..._args: any[]): any {
  throw new Error('@ant/claude-for-chrome-mcp is not available in open-source build')
}
```

### 4.2 @ant/computer-use-input

计算机使用输入层（Anthropic 内部）。

**stubs/@ant/computer-use-input/package.json**
```json
{
  "name": "@ant/computer-use-input",
  "version": "0.0.0-stub",
  "type": "module",
  "main": "index.ts"
}
```

**stubs/@ant/computer-use-input/index.ts**
```typescript
// Stub for @ant/computer-use-input (Anthropic internal package)
export type ComputerUseInput = any
export type ComputerUseInputAPI = any
```

### 4.3 @ant/computer-use-mcp

计算机使用 MCP 服务器（Anthropic 内部），有 3 个子路径导出。

**stubs/@ant/computer-use-mcp/package.json**
```json
{
  "name": "@ant/computer-use-mcp",
  "version": "0.0.0-stub",
  "type": "module",
  "main": "index.ts",
  "exports": {
    ".": "./index.ts",
    "./types": "./types.ts",
    "./sentinelApps": "./sentinelApps.ts"
  }
}
```

**stubs/@ant/computer-use-mcp/index.ts**
```typescript
// Stub for @ant/computer-use-mcp (Anthropic internal package)
export type ComputerUseSessionContext = any
export type CuCallToolResult = any
export type CuPermissionRequest = any
export type CuPermissionResponse = any
export type ScreenshotDims = any
export type ComputerExecutor = any
export type DisplayGeometry = any
export type FrontmostApp = any
export type InstalledApp = any
export type ResolvePrepareCaptureResult = any
export type RunningApp = any
export type ScreenshotResult = any

export const DEFAULT_GRANT_FLAGS: any = {}
export const API_RESIZE_PARAMS: any = {}

export function bindSessionContext(..._args: any[]): any {
  throw new Error('@ant/computer-use-mcp is not available in open-source build')
}
export function buildComputerUseTools(..._args: any[]): any[] {
  return []
}
export function createComputerUseMcpServer(..._args: any[]): any {
  throw new Error('@ant/computer-use-mcp is not available in open-source build')
}
export function targetImageSize(..._args: any[]): any {
  return { width: 0, height: 0 }
}
```

**stubs/@ant/computer-use-mcp/types.ts**
```typescript
// Stub for @ant/computer-use-mcp/types
export type CoordinateMode = any
export type CuSubGates = any
export type ComputerUseHostAdapter = any
export type Logger = any
export type CuPermissionRequest = any
export type CuPermissionResponse = any
export const DEFAULT_GRANT_FLAGS: any = {}
```

**stubs/@ant/computer-use-mcp/sentinelApps.ts**
```typescript
// Stub for @ant/computer-use-mcp/sentinelApps
export function getSentinelCategory(..._args: any[]): string {
  return 'unknown'
}
```

### 4.4 @ant/computer-use-swift

macOS 原生计算机使用接口（Anthropic 内部）。

**stubs/@ant/computer-use-swift/package.json**
```json
{
  "name": "@ant/computer-use-swift",
  "version": "0.0.0-stub",
  "type": "module",
  "main": "index.ts"
}
```

**stubs/@ant/computer-use-swift/index.ts**
```typescript
// Stub for @ant/computer-use-swift (Anthropic internal package)
export type ComputerUseAPI = any
```

### 4.5 @anthropic-ai/mcpb

DXT 插件 manifest 解析器（未公开发布）。

**stubs/@anthropic-ai/mcpb/package.json**
```json
{
  "name": "@anthropic-ai/mcpb",
  "version": "0.0.0-stub",
  "type": "module",
  "main": "index.ts"
}
```

**stubs/@anthropic-ai/mcpb/index.ts**
```typescript
// Stub for @anthropic-ai/mcpb
export type McpbManifest = any
export type McpbUserConfigurationOption = any

export function parseManifest(..._args: any[]): any {
  return {}
}
```

### 4.6 @anthropic-ai/sandbox-runtime

沙箱运行时（未公开发布）。**注意**：`SandboxManager` 类必须包含 `isSupportedPlatform` 等静态方法，否则运行时会崩溃。

**stubs/@anthropic-ai/sandbox-runtime/package.json**
```json
{
  "name": "@anthropic-ai/sandbox-runtime",
  "version": "0.0.0-stub",
  "type": "module",
  "main": "index.ts"
}
```

**stubs/@anthropic-ai/sandbox-runtime/index.ts**
```typescript
// Stub for @anthropic-ai/sandbox-runtime
import { z } from 'zod'

export type FsReadRestrictionConfig = any
export type FsWriteRestrictionConfig = any
export type IgnoreViolationsConfig = any
export type NetworkHostPattern = any
export type NetworkRestrictionConfig = any
export type SandboxAskCallback = any
export type SandboxDependencyCheck = any
export type SandboxRuntimeConfig = any
export type SandboxViolationEvent = any

export const SandboxRuntimeConfigSchema = z.any()

export class SandboxManager {
  constructor(..._args: any[]) {}
  static isSupportedPlatform(): boolean { return false }
  static checkDependencies(): any[] { return [] }
  async start(): Promise<void> {}
  async stop(): Promise<void> {}
  isRunning(): boolean { return false }
}

export class SandboxViolationStore {
  constructor(..._args: any[]) {}
  getViolations(): any[] { return [] }
  clear(): void {}
}
```

### 4.7 color-diff-napi

Rust 原生 diff 着色模块。源码中有纯 TS 回退实现 (`src/native-ts/color-diff/`)。

**stubs/color-diff-napi/package.json**
```json
{
  "name": "color-diff-napi",
  "version": "0.0.0-stub",
  "type": "module",
  "main": "index.ts"
}
```

**stubs/color-diff-napi/index.ts**
```typescript
// Stub for color-diff-napi (native module)
// The pure TS fallback in src/native-ts/color-diff/ should be used instead
export type SyntaxTheme = any
export class ColorDiff {
  constructor(..._args: any[]) {}
}
export class ColorFile {
  constructor(..._args: any[]) {}
}
export function getSyntaxTheme(..._args: any[]): any {
  return {}
}
```

---

## 5. 创建缺失的源码 Stub 文件

源码中有部分文件被 feature flags (`bun:bundle` 的 `feature()`) 或环境变量 (`USER_TYPE === 'ant'`) 条件保护，但打包器仍然需要解析它们的 import。这些文件在泄露的源码中不存在，需要创建空实现。

### 5.1 ANT-only 工具（`src/tools/`）

#### src/tools/TungstenTool/TungstenTool.ts
```typescript
// Stub: ANT-only Tungsten session tool
import type { Tool } from '../../Tool.js'

export const TungstenTool: Tool = null as any

export function clearSessionsWithTungstenUsage(): void {}

export function resetInitializationState(): void {}
```

#### src/tools/TungstenTool/TungstenLiveMonitor.ts
```typescript
// Stub: ANT-only TungstenLiveMonitor component
import React from 'react'

export function TungstenLiveMonitor(_props: any): React.ReactElement | null {
  return null
}
```

#### src/tools/REPLTool/REPLTool.ts
```typescript
// Stub: ANT-only REPL tool
import type { Tool } from '../../Tool.js'

export const REPLTool: Tool = null as any
```

#### src/tools/SuggestBackgroundPRTool/SuggestBackgroundPRTool.ts
```typescript
// Stub: ANT-only SuggestBackgroundPR tool
import type { Tool } from '../../Tool.js'

export const SuggestBackgroundPRTool: Tool = null as any
```

#### src/tools/VerifyPlanExecutionTool/VerifyPlanExecutionTool.ts
```typescript
// Stub: VerifyPlanExecution tool (env-gated)
import type { Tool } from '../../Tool.js'

export const VerifyPlanExecutionTool: Tool = null as any
```

#### src/tools/WorkflowTool/constants.ts
```typescript
// Stub: WorkflowTool constants
export const WORKFLOW_TOOL_NAME = 'Workflow'
```

### 5.2 ANT-only UI 组件和命令

#### src/components/agents/SnapshotUpdateDialog.tsx
```typescript
// Stub: ANT-only SnapshotUpdateDialog component
import React from 'react'

export function SnapshotUpdateDialog(_props: any): React.ReactElement | null {
  return null
}
```

#### src/assistant/AssistantSessionChooser.tsx
```typescript
// Stub: ANT-only AssistantSessionChooser component
import React from 'react'

export function AssistantSessionChooser(_props: any): React.ReactElement | null {
  return null
}
```

#### src/commands/assistant/assistant.ts
```typescript
// Stub: ANT-only assistant install wizard
import React from 'react'

export function NewInstallWizard(_props: any): React.ReactElement | null {
  return null
}

export async function computeDefaultInstallDir(): Promise<string> {
  return ''
}
```

#### src/commands/agents-platform/index.ts
```typescript
// Stub: ANT-only agents-platform commands
export default null
```

### 5.3 SDK 生成类型

#### src/entrypoints/sdk/coreTypes.generated.ts
```typescript
// Auto-generated stub: SDK core types
// In the real build, this is generated from coreSchemas.ts by scripts/generate-sdk-types.ts
export type {}
```

#### src/entrypoints/sdk/runtimeTypes.ts
```typescript
// Stub: SDK runtime types
export type AnyZodRawShape = any
export type ForkSessionOptions = any
export type ForkSessionResult = any
export type GetSessionInfoOptions = any
export type GetSessionMessagesOptions = any
export type InferShape = any
export type InternalOptions = any
export type InternalQuery = any
export type ListSessionsOptions = any
export type McpSdkServerConfigWithInstance = any
export type Options = any
export type Query = any
export type SDKSession = any
export type SDKSessionOptions = any
export type SdkMcpToolDefinition = any
export type SessionMessage = any
export type SessionMutationOptions = any
```

#### src/entrypoints/sdk/toolTypes.ts
```typescript
// Stub: SDK tool types
export type {}
```

### 5.4 内部类型定义

#### src/types/connectorText.ts
```typescript
// Stub: connector text types (ANT-only feature)
export interface ConnectorTextBlock {
  type: 'connector_text'
  text: string
  [key: string]: any
}

export interface ConnectorTextDelta {
  type: 'connector_text_delta'
  text: string
  [key: string]: any
}

export function isConnectorTextBlock(block: any): block is ConnectorTextBlock {
  return block?.type === 'connector_text'
}
```

#### src/utils/filePersistence/types.ts
```typescript
// Stub: file persistence types
export const DEFAULT_UPLOAD_CONCURRENCY = 5
export const FILE_COUNT_LIMIT = 100
export const OUTPUTS_SUBDIR = 'outputs'

export type FailedPersistence = {
  path: string
  error: string
}

export type PersistedFile = {
  path: string
  size: number
}

export type FilesPersistedEventData = {
  files: PersistedFile[]
  failures: FailedPersistence[]
}

export type TurnStartTime = number
```

### 5.5 内部服务模块

#### src/utils/protectedNamespace.ts
```typescript
// Stub: ANT-only protected namespace check
export function checkProtectedNamespace(): boolean {
  return false
}
```

#### src/services/compact/cachedMicrocompact.ts
```typescript
// Stub: cached micro-compact state management
export type CachedMCState = any
export type CacheEditsBlock = any

export function createCachedMCState(): any {
  return {}
}
export function getCachedMCConfig(): any {
  return {}
}
export function registerToolResult(_state: any, _toolUseId: string): void {}
export function registerToolMessage(_state: any, _groupIds: string[]): void {}
export function getToolResultsToDelete(_state: any): string[] {
  return []
}
export function createCacheEditsBlock(_state: any, _toolsToDelete: string[]): any {
  return null
}
export function resetCachedMCState(_state: any): void {}
```

#### src/services/compact/snipCompact.ts
```typescript
// Stub: snip compact feature
export function isSnipRuntimeEnabled(): boolean {
  return false
}

export function shouldNudgeForSnips(_messages: any[]): boolean {
  return false
}
```

#### src/services/contextCollapse/index.ts
```typescript
// Stub: context collapse feature
export async function applyCollapsesIfNeeded(messages: any[], _toolUseContext?: any, _querySource?: any): Promise<any[]> {
  return messages
}

export function recoverFromOverflow(messages: any[], _querySource?: any): { committed: number; messages: any[] } {
  return { committed: 0, messages }
}

export function isContextCollapseEnabled(): boolean {
  return false
}

export function isWithheldPromptTooLong(_message: any, _isPromptTooLongMessage: boolean, _querySource?: any): boolean {
  return false
}

export function projectView(messages: any[]): any[] {
  return messages
}

export function getStats(): { collapsedSpans: number; collapsedMessages: number; health: string } {
  return { collapsedSpans: 0, collapsedMessages: 0, health: 'ok' }
}
```

#### src/services/contextCollapse/operations.ts
```typescript
// Stub: context collapse operations
export function projectView(messages: any[]): any[] {
  return messages
}
```

### 5.6 Ink 渲染器相关

#### src/ink/global.d.ts
```typescript
// Global type declarations for Ink components
export {}
```

#### src/ink/devtools.ts
```typescript
// Stub: React DevTools connection (development only)
export function connectToDevTools(_options?: any): void {}
```

### 5.7 资源文件

#### src/skills/bundled/verify/examples/cli.md
```markdown
# CLI verification example
```

#### src/skills/bundled/verify/examples/server.md
```markdown
# Server verification example
```

#### src/skills/bundled/verify/SKILL.md
```markdown
# Verify Skill
```

#### src/utils/ultraplan/prompt.txt
```
You are an AI assistant helping with ultraplan tasks.
```

---

## 6. 安装依赖

```bash
bun install
```

预期输出：

```
376 packages installed
```

可能出现的警告（可忽略）：
- `warn: incorrect peer dependency "commander@2.20.3"` — 其他包拉入的旧 commander，不影响
- `warn: incorrect peer dependency "react@19.2.4"` — ink 的 peer dep，不影响

## 7. 编译构建

```bash
bun run build
```

预期输出：

```
Build succeeded: 2 file(s)
  /path/to/dist/cli.js (17027.8 KB)
  /path/to/dist/cli.js.map (47344.2 KB)
```

构建产物：
- `dist/cli.js` — 约 17MB 的单文件 bundle，包含所有源码和 npm 依赖
- `dist/cli.js.map` — 约 47MB 的 source map

可通过环境变量自定义版本号：

```bash
CLAUDE_CODE_VERSION="2.0.0" bun run build
```

## 8. 运行

```bash
# 查看版本
bun dist/cli.js --version

# 查看帮助
bun dist/cli.js --help

# 交互模式（需要 API key）
ANTHROPIC_API_KEY="sk-ant-xxx" bun dist/cli.js

# 非交互模式
ANTHROPIC_API_KEY="sk-ant-xxx" bun dist/cli.js -p "hello world"

# 或使用启动脚本
./claude.sh --version
ANTHROPIC_API_KEY="sk-ant-xxx" ./claude.sh
```

---

## 9. 编译过程中遇到的问题和修复

### 问题 1：缺少 package.json / tsconfig.json

**现象**：源码是从 bundle 产物中反编译出来的，没有任何项目配置文件。

**原因**：泄露的源码只包含 `src/` 目录，不包含项目骨架文件。

**修复**：通过扫描源码中 1884 个 TypeScript 文件的所有 import 语句，手动提取出 76 个 npm 依赖并创建 `package.json`。

### 问题 2：7 个内部包无法从 npm 安装

**现象**：`bun install` 报错找不到 `@ant/claude-for-chrome-mcp` 等包。

**原因**：这些是 Anthropic 内部的私有包，未发布到 npm。

**修复**：在 `stubs/` 目录下创建每个包的占位实现，通过 `package.json` 的 `"file:./stubs/..."` 协议链接。每个 stub 导出源码中引用的所有符号（类型、函数、类），函数体返回空值或抛出"不可用"异常。

### 问题 3：15+ 个源码文件缺失

**现象**：`bun build` 报错 `Could not resolve: "./tools/TungstenTool/TungstenTool.js"` 等。

**原因**：这些文件受 `feature()` 标记或 `USER_TYPE === 'ant'` 环境变量保护，属于内部功能，不在泄露源码中。但 Bun 打包器在解析 `require()` 和 `import()` 时仍需要找到这些文件。

**修复**：为每个缺失文件创建最小化的 stub 实现。分为以下几类：
- ANT-only 工具（TungstenTool、REPLTool 等）：导出 `null as any`
- React 组件（SnapshotUpdateDialog 等）：返回 `null`
- 服务模块（contextCollapse、snipCompact 等）：返回空数据/false
- 类型文件：导出空类型
- 资源文件（.md、.txt）：最小内容

### 问题 4：可选动态导入的 npm 包找不到

**现象**：`Could not resolve: "@opentelemetry/exporter-metrics-otlp-grpc"` 等。

**原因**：源码通过 `await import(...)` 动态加载这些可选依赖（Bedrock SDK、Vertex SDK、OpenTelemetry exporters、sharp 等），Bun 打包器默认会尝试解析它们。

**修复**：在 `scripts/build.ts` 的 `external` 数组中列出所有可选动态导入的包，让打包器跳过它们：
- `@anthropic-ai/bedrock-sdk`、`@anthropic-ai/foundry-sdk`、`@anthropic-ai/vertex-sdk`
- `@azure/identity`、`@aws-sdk/client-bedrock`、`@aws-sdk/client-sts`
- 10 个 `@opentelemetry/exporter-*` 包
- `fflate`、`sharp`、`turndown`、`yaml`、`modifiers-napi`

### 问题 5：Commander.js v13 不兼容

**现象**：运行时报错 `option creation failed due to '-d2e' in option flags '-d2e, --debug-to-stderr'`

**原因**：Commander.js v13 收紧了短选项格式校验，不允许 `-d2e` 这种多字符短选项。源码是基于 v12 编写的。

**修复**：将 `commander` 和 `@commander-js/extra-typings` 都锁定到 v12：
```json
"commander": "12",
"@commander-js/extra-typings": "12"
```

### 问题 6：React useEffectEvent 不存在

**现象**：运行时报错 `resolveDispatcher().useEffectEvent is not a function`

**原因**：两层原因叠加：
1. **react-reconciler 版本不匹配**：`react@19.2.4` 新增了 `useEffectEvent` hook，但 `react-reconciler@0.31.0`（对应 React 19.0）的 dispatcher 没有实现它。
2. **打包时未设置 production 模式**：Bun 打包器根据 `process.env.NODE_ENV` 选择 React 的 production/development 分支。未设置时打包了 development 版本，即使运行时设置 `NODE_ENV=production` 也无效（因为代码已经打包进去了）。

**修复**：
1. 升级 `react-reconciler` 到 `0.33.0`（支持 React 19.1+ 的 useEffectEvent）
2. 在 `scripts/build.ts` 的 `define` 中添加 `'process.env.NODE_ENV': '"production"'`

### 问题 7：SandboxManager.isSupportedPlatform 不存在

**现象**：运行时报错 `BaseSandboxManager.isSupportedPlatform is not a function`

**原因**：`@anthropic-ai/sandbox-runtime` 的 stub 中 `SandboxManager` 类最初只是空 class，没有 `isSupportedPlatform` 静态方法。源码在运行时（非 feature-gated）调用了这个方法。

**修复**：
1. 在 stub 的 `SandboxManager` 类中添加 `static isSupportedPlatform(): boolean { return false }` 等静态方法
2. **关键**：修改 stub 后必须重新运行 `bun install`，否则 `node_modules/` 中的缓存副本不会更新

### 问题 8：@opentelemetry/resources 缺少 resourceFromAttributes

**现象**：构建报错 `No matching export in "@opentelemetry/resources" for import "resourceFromAttributes"`

**原因**：`resourceFromAttributes` 是 `@opentelemetry/resources` v2.x 新增的 API，初始安装的 v1.30 没有。

**修复**：升级 OpenTelemetry 相关包到最新版：
```bash
bun add @opentelemetry/resources@latest @opentelemetry/core@latest \
  @opentelemetry/sdk-logs@latest @opentelemetry/sdk-metrics@latest \
  @opentelemetry/sdk-trace-base@latest @opentelemetry/api-logs@latest
```

### 问题 9：版本检查拦截启动

**现象**：运行时输出 `It looks like your version of Claude Code (1.0.0-dev) needs an update.`

**原因**：`src/utils/autoUpdater.ts` 中的 `assertMinVersion()` 从远程获取最低版本号并与 `MACRO.VERSION` 比较，`1.0.0-dev` 低于要求。

**修复**：将 `scripts/build.ts` 中的默认版本号从 `1.0.0-dev` 改为 `1.0.80`：
```typescript
const VERSION = process.env.CLAUDE_CODE_VERSION || '1.0.80'
```

---

## 附录：完整目录结构（新增文件）

```
claude-code/
├── package.json                          # [新建] 项目配置和依赖
├── tsconfig.json                         # [新建] TypeScript 配置
├── claude.sh                             # [新建] 启动脚本
├── scripts/
│   └── build.ts                          # [新建] Bun 构建脚本
├── stubs/                                # [新建] 内部包占位实现
│   ├── @ant/
│   │   ├── claude-for-chrome-mcp/        (2 files)
│   │   ├── computer-use-input/           (2 files)
│   │   ├── computer-use-mcp/             (4 files)
│   │   └── computer-use-swift/           (2 files)
│   ├── @anthropic-ai/
│   │   ├── mcpb/                         (2 files)
│   │   └── sandbox-runtime/              (2 files)
│   └── color-diff-napi/                  (2 files)
├── src/                                  # 源码目录
│   ├── assistant/
│   │   └── AssistantSessionChooser.tsx    # [新建] stub
│   ├── commands/
│   │   ├── agents-platform/
│   │   │   └── index.ts                  # [新建] stub
│   │   └── assistant/
│   │       └── assistant.ts              # [新建] stub
│   ├── components/agents/
│   │   └── SnapshotUpdateDialog.tsx       # [新建] stub
│   ├── entrypoints/sdk/
│   │   ├── coreTypes.generated.ts         # [新建] stub
│   │   ├── runtimeTypes.ts                # [新建] stub
│   │   └── toolTypes.ts                   # [新建] stub
│   ├── ink/
│   │   ├── devtools.ts                    # [新建] stub
│   │   └── global.d.ts                    # [新建] stub
│   ├── services/
│   │   ├── compact/
│   │   │   ├── cachedMicrocompact.ts      # [新建] stub
│   │   │   └── snipCompact.ts             # [新建] stub
│   │   └── contextCollapse/
│   │       ├── index.ts                   # [新建] stub
│   │       └── operations.ts              # [新建] stub
│   ├── skills/bundled/verify/
│   │   ├── SKILL.md                       # [新建] stub
│   │   └── examples/
│   │       ├── cli.md                     # [新建] stub
│   │       └── server.md                  # [新建] stub
│   ├── tools/
│   │   ├── REPLTool/
│   │   │   └── REPLTool.ts               # [新建] stub
│   │   ├── SuggestBackgroundPRTool/
│   │   │   └── SuggestBackgroundPRTool.ts # [新建] stub
│   │   ├── TungstenTool/
│   │   │   ├── TungstenTool.ts            # [新建] stub
│   │   │   └── TungstenLiveMonitor.ts     # [新建] stub
│   │   ├── VerifyPlanExecutionTool/
│   │   │   └── VerifyPlanExecutionTool.ts # [新建] stub
│   │   └── WorkflowTool/
│   │       └── constants.ts               # [新建] stub
│   ├── types/
│   │   └── connectorText.ts               # [新建] stub
│   └── utils/
│       ├── filePersistence/
│       │   └── types.ts                   # [新建] stub
│       ├── protectedNamespace.ts          # [新建] stub
│       └── ultraplan/
│           └── prompt.txt                 # [新建] stub
└── dist/                                 # [构建产物]
    ├── cli.js                            (~17MB)
    ├── cli.js.map                        (~47MB)
    └── vendor/ripgrep/arm64-darwin/
        └── rg                            # [符号链接] -> 系统 rg
```

---

## 10. 运行脚本 claude.sh

编译完成后，创建启动脚本 `claude.sh`，配置好 API Key、Base URL 和默认模型：

```bash
#!/bin/bash
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
export PATH="$HOME/.bun/bin:$PATH"
export ANTHROPIC_API_KEY="xxx"          # 替换为你的 API Key
export ANTHROPIC_BASE_URL=""            # 替换为你的 API 代理地址（不要带 /v1 后缀）
exec bun "$SCRIPT_DIR/dist/cli.js" --model claude-sonnet-4-5-20250929 "$@"
```

```bash
chmod +x claude.sh
```

使用方式：

```bash
# 交互模式
./claude.sh

# 非交互模式
./claude.sh -p "hello"

# 传任意参数
./claude.sh -p "explain this code" --max-turns 3
```

---

## 11. 补充问题和修复（运行阶段发现）

### 问题 10：MACRO.BUILD_TIME 等未定义

**现象**：运行时报错 `MACRO is not defined`，堆栈指向 `src/services/analytics/metadata.ts:622`。

**原因**：构建脚本最初只 define 了 `MACRO.VERSION`，但源码还引用了 `MACRO.BUILD_TIME`、`MACRO.PACKAGE_URL`、`MACRO.NATIVE_PACKAGE_URL`、`MACRO.FEEDBACK_CHANNEL`、`MACRO.ISSUES_EXPLAINER`。

**修复**：在 `scripts/build.ts` 的 `define` 中补全所有 MACRO 属性：

```typescript
define: {
  'MACRO.VERSION': JSON.stringify(VERSION),
  'MACRO.BUILD_TIME': JSON.stringify(new Date().toISOString()),
  'MACRO.PACKAGE_URL': JSON.stringify('@anthropic-ai/claude-code'),
  'MACRO.NATIVE_PACKAGE_URL': JSON.stringify('@anthropic-ai/claude-code'),
  'MACRO.FEEDBACK_CHANNEL': JSON.stringify('https://github.com/anthropics/claude-code/issues'),
  'MACRO.ISSUES_EXPLAINER': JSON.stringify(''),
  'process.env.NODE_ENV': '"production"',
},
```

### 问题 11：缺少 ripgrep 二进制文件

**现象**：运行时报错 `ENOENT: no such file or directory, posix_spawn '.../dist/vendor/ripgrep/arm64-darwin/rg'`

**原因**：Claude Code 内置了 ripgrep 用于文件搜索（GrepTool），编译后的 bundle 期望在 `dist/vendor/ripgrep/<arch>/rg` 路径下找到二进制文件。

**修复**：创建符号链接指向系统安装的 ripgrep：

```bash
# macOS ARM (Apple Silicon)
mkdir -p dist/vendor/ripgrep/arm64-darwin
ln -sf $(which rg) dist/vendor/ripgrep/arm64-darwin/rg

# macOS Intel
mkdir -p dist/vendor/ripgrep/x64-darwin
ln -sf $(which rg) dist/vendor/ripgrep/x64-darwin/rg

# Linux x86_64
mkdir -p dist/vendor/ripgrep/x64-linux
ln -sf $(which rg) dist/vendor/ripgrep/x64-linux/rg
```

如果系统没有 ripgrep，先安装：

```bash
# macOS
brew install ripgrep

# Ubuntu/Debian
sudo apt install ripgrep
```

### 问题 12：ANTHROPIC_BASE_URL 路径重复

**现象**：使用第三方 API 代理时，请求路径变成 `/v1/v1/messages`，返回 404。

**原因**：Anthropic SDK 会自动在 base URL 后拼接 `/v1/messages`。如果 `ANTHROPIC_BASE_URL` 已经包含 `/v1`，就会导致路径重复。

**修复**：`ANTHROPIC_BASE_URL` 不要带 `/v1` 后缀：

```bash
# 正确 ✅
export ANTHROPIC_BASE_URL="https://api.modelverse.cn"

# 错误 ❌（会变成 /v1/v1/messages）
export ANTHROPIC_BASE_URL="https://api.modelverse.cn/v1"
```
```
