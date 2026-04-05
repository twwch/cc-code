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
