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
