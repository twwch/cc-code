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
    'MACRO.BUILD_TIME': JSON.stringify(new Date().toISOString()),
    'MACRO.PACKAGE_URL': JSON.stringify('@anthropic-ai/claude-code'),
    'MACRO.NATIVE_PACKAGE_URL': JSON.stringify('@anthropic-ai/claude-code'),
    'MACRO.FEEDBACK_CHANNEL': JSON.stringify('https://github.com/anthropics/claude-code/issues'),
    'MACRO.ISSUES_EXPLAINER': JSON.stringify(''),
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
