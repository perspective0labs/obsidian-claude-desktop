import type { ContentBlock, Tool } from './types';

export interface StreamCallbacks {
  onText: (text: string) => void;
  onToolUse: (id: string, name: string, input: Record<string, unknown>) => void;
  onComplete: (stopReason: string) => void;
  onError: (error: Error) => void;
}

export class AnthropicClient {
  private apiKey: string;
  private baseUrl = 'https://api.anthropic.com/v1';

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  setApiKey(key: string) {
    this.apiKey = key;
  }

  async streamMessage(params: {
    model: string;
    messages: Array<{ role: string; content: string | ContentBlock[] }>;
    system?: string;
    tools?: Tool[];
    maxTokens: number;
    callbacks: StreamCallbacks;
  }): Promise<void> {
    const { model, messages, system, tools, maxTokens, callbacks } = params;

    if (!this.apiKey) {
      callbacks.onError(new Error('No API key set. Add your Anthropic API key in Settings → Claude Desktop Mirror.'));
      return;
    }

    const body: Record<string, unknown> = {
      model,
      messages,
      max_tokens: maxTokens,
      stream: true,
    };
    if (system) body.system = system;
    if (tools && tools.length > 0) body.tools = tools;

    let response: Response;
    try {
      response = await fetch(`${this.baseUrl}/messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': this.apiKey,
          'anthropic-version': '2023-06-01',
          'anthropic-dangerous-direct-browser-access': 'true',
        },
        body: JSON.stringify(body),
      });
    } catch (err) {
      callbacks.onError(new Error(`Network error: ${err}`));
      return;
    }

    if (!response.ok) {
      let msg = `API error ${response.status}`;
      try {
        const errBody = await response.json();
        msg = errBody?.error?.message || msg;
      } catch { /* ignore */ }
      callbacks.onError(new Error(msg));
      return;
    }

    const reader = response.body!.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let currentToolId = '';
    let currentToolName = '';
    let currentToolInputStr = '';

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const data = line.slice(6).trim();
          if (data === '[DONE]' || !data) continue;

          let event: Record<string, unknown>;
          try {
            event = JSON.parse(data);
          } catch {
            continue;
          }

          switch (event.type) {
            case 'content_block_start': {
              const cb = event.content_block as Record<string, unknown>;
              if (cb?.type === 'tool_use') {
                currentToolId = cb.id as string;
                currentToolName = cb.name as string;
                currentToolInputStr = '';
              }
              break;
            }
            case 'content_block_delta': {
              const delta = event.delta as Record<string, unknown>;
              if (delta?.type === 'text_delta') {
                callbacks.onText(delta.text as string);
              } else if (delta?.type === 'input_json_delta') {
                currentToolInputStr += delta.partial_json as string;
              }
              break;
            }
            case 'content_block_stop': {
              if (currentToolName) {
                let input: Record<string, unknown> = {};
                try { input = JSON.parse(currentToolInputStr || '{}'); } catch { /* ignore */ }
                callbacks.onToolUse(currentToolId, currentToolName, input);
                currentToolName = '';
                currentToolId = '';
                currentToolInputStr = '';
              }
              break;
            }
            case 'message_delta': {
              const delta = event.delta as Record<string, unknown>;
              if (delta?.stop_reason) {
                callbacks.onComplete(delta.stop_reason as string);
              }
              break;
            }
          }
        }
      }
    } catch (err) {
      callbacks.onError(err instanceof Error ? err : new Error(String(err)));
    }
  }

  async simpleMessage(params: {
    model: string;
    messages: Array<{ role: string; content: string }>;
    system?: string;
    tools?: Tool[];
    maxTokens: number;
  }): Promise<{ text: string; stopReason: string; toolUses: Array<{ id: string; name: string; input: Record<string, unknown> }> }> {
    const { model, messages, system, tools, maxTokens } = params;

    const body: Record<string, unknown> = { model, messages, max_tokens: maxTokens };
    if (system) body.system = system;
    if (tools && tools.length > 0) body.tools = tools;

    const response = await fetch(`${this.baseUrl}/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errBody = await response.json().catch(() => ({}));
      throw new Error(errBody?.error?.message || `API error ${response.status}`);
    }

    const result = await response.json();
    const text = (result.content as Array<Record<string, unknown>>)
      .filter(b => b.type === 'text')
      .map(b => b.text as string)
      .join('');
    const toolUses = (result.content as Array<Record<string, unknown>>)
      .filter(b => b.type === 'tool_use')
      .map(b => ({ id: b.id as string, name: b.name as string, input: b.input as Record<string, unknown> }));

    return { text, stopReason: result.stop_reason, toolUses };
  }
}
