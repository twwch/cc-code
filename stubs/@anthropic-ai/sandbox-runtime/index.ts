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
