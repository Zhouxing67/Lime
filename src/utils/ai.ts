import { sendMessage } from "../types/messages"

export interface AiInterpretResult {
  ok: boolean
  text?: string
  error?: string
  cancelled?: boolean
}

export function requestAiInterpretation(
  requestId: string,
  text: string,
  aiContext?: string
): Promise<AiInterpretResult> {
  return sendMessage<AiInterpretResult>(
    {
      kind: "ai-interpret",
      payload: { requestId, text, aiContext }
    },
    120000
  )
}

export function requestAiTranslation(
  requestId: string,
  text: string,
  aiContext?: string
): Promise<AiInterpretResult> {
  return sendMessage<AiInterpretResult>(
    {
      kind: "ai-translate",
      payload: { requestId, text, aiContext }
    },
    120000
  )
}

export function cancelAiInterpretation(requestId: string): Promise<void> {
  return sendMessage({ kind: "ai-cancel", requestId }).then(() => undefined)
}

export function testAiConnection(settings: {
  endpoint: string
  model: string
  apiKey: string
}): Promise<AiInterpretResult> {
  return sendMessage<AiInterpretResult>(
    { kind: "ai-test", payload: settings },
    30000
  )
}
