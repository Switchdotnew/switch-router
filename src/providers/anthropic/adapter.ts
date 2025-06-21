import log from '../../utils/logging.js';
import { logDebug, toLogContext } from '../../utils/logging.js';
import { AdapterBase } from '../base/adapter-base.js';
import type {
  ChatCompletionRequest,
  ChatCompletionResponse,
  CompletionRequest,
  CompletionResponse,
  ProviderConfig,
} from '../base/provider-interface.js';
import type { Credential } from '../../credentials/types/credential-types.js';

export class AnthropicAdapter extends AdapterBase {
  constructor(config: ProviderConfig, credential?: Credential) {
    super(config, credential);

    this.capabilities = {
      chat: true,
      completion: false, // Anthropic doesn't support legacy completion API
      streaming: true,
      jsonMode: false,
      functionCalling: true,
      vision: config.modelName.includes('vision'),
      embeddings: false,
    };
  }

  protected buildAuthHeaders(): Record<string, string> {
    const baseHeaders = super.buildAuthHeaders();

    return {
      ...baseHeaders,
      'anthropic-version': '2023-06-01',
      'Content-Type': 'application/json',
    };
  }

  protected buildLegacyAuthHeaders(apiKey: string): Record<string, string> {
    // Anthropic uses x-api-key header
    return {
      'x-api-key': apiKey,
    };
  }

  public async chatCompletion(request: ChatCompletionRequest): Promise<ChatCompletionResponse> {
    const url = this.buildRequestUrl('/v1/messages');

    // Transform to Anthropic format
    const anthropicRequest = {
      model: this.config.modelName,
      max_tokens: request.maxTokens || 1000,
      messages: this.transformMessages(request.messages),
      temperature: request.temperature,
      top_p: request.topP,
      stop_sequences: Array.isArray(request.stop)
        ? request.stop
        : request.stop
          ? [request.stop]
          : undefined,
      stream: false,
    };

    const cleanRequest = this.removeUndefinedValues(anthropicRequest);

    logDebug(
      `Anthropic chat completion request`,
      toLogContext(this.sanitizeForLogging(cleanRequest))
    );

    const anthropicResponse = await this.makeRequest(async () => {
      return this.makeHttpRequest<any>(url, {
        method: 'POST',
        headers: this.buildAuthHeaders(),
        body: cleanRequest,
      });
    }, 'chatCompletion');

    // Transform response to OpenAI format
    const response = this.transformResponse(anthropicResponse);

    logDebug(`Anthropic chat completion response`, toLogContext(this.sanitizeForLogging(response)));

    return response;
  }

  public async *streamChatCompletion(
    request: ChatCompletionRequest
  ): AsyncGenerator<ChatCompletionResponse> {
    const url = this.buildRequestUrl('/v1/messages');

    const anthropicRequest = {
      model: this.config.modelName,
      max_tokens: request.maxTokens || 1000,
      messages: this.transformMessages(request.messages),
      temperature: request.temperature,
      top_p: request.topP,
      stop_sequences: Array.isArray(request.stop)
        ? request.stop
        : request.stop
          ? [request.stop]
          : undefined,
      stream: true,
    };

    const cleanRequest = this.removeUndefinedValues(anthropicRequest);

    const response = await this.makeStreamingRequest(url, {
      method: 'POST',
      headers: this.buildAuthHeaders(),
      body: cleanRequest,
    });

    const reader = response.body?.getReader();
    if (!reader) {
      throw this.createProviderError('Failed to get response stream reader', 'STREAM_ERROR');
    }

    const decoder = new globalThis.TextDecoder();
    let buffer = '';

    try {
      while (true) {
        const { done, value } = await reader.read();

        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmedLine = line.trim();

          if (trimmedLine === '' || !trimmedLine.startsWith('data: ')) continue;
          if (trimmedLine === 'data: [DONE]') return;

          try {
            const data = trimmedLine.slice(6);
            const parsed = JSON.parse(data);

            if (parsed.type === 'content_block_delta' && parsed.delta?.text) {
              yield this.transformStreamingResponse(parsed);
            }
          } catch (error) {
            log.warn('Failed to parse Anthropic streaming response', {
              line: trimmedLine,
              error: error instanceof Error ? error.message : String(error),
            });
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
  }

  public async completion(_request: CompletionRequest): Promise<CompletionResponse> {
    throw this.createProviderError(
      'Anthropic does not support legacy completion API',
      'UNSUPPORTED_OPERATION',
      400,
      false
    );
  }

  private transformMessages(messages: any[]): any[] {
    return messages
      .filter((msg) => msg.role !== 'system') // Anthropic handles system messages differently
      .map((msg) => ({
        role: msg.role === 'assistant' ? 'assistant' : 'user',
        content: msg.content,
      }));
  }

  private transformResponse(anthropicResponse: any): ChatCompletionResponse {
    return {
      id: anthropicResponse.id || this.generateRequestId(),
      object: 'chat.completion',
      created: Math.floor(Date.now() / 1000),
      model: this.config.modelName,
      choices: [
        {
          index: 0,
          message: {
            role: 'assistant',
            content: anthropicResponse.content?.[0]?.text || '',
          },
          finishReason: this.mapFinishReason(anthropicResponse.stop_reason),
        },
      ],
      usage: anthropicResponse.usage
        ? {
            promptTokens: anthropicResponse.usage.input_tokens || 0,
            completionTokens: anthropicResponse.usage.output_tokens || 0,
            totalTokens:
              (anthropicResponse.usage.input_tokens || 0) +
              (anthropicResponse.usage.output_tokens || 0),
          }
        : undefined,
    };
  }

  private transformStreamingResponse(anthropicChunk: any): ChatCompletionResponse {
    return {
      id: anthropicChunk.message?.id || this.generateRequestId(),
      object: 'chat.completion.chunk',
      created: Math.floor(Date.now() / 1000),
      model: this.config.modelName,
      choices: [
        {
          index: 0,
          delta: {
            content: anthropicChunk.delta?.text || '',
          },
          finishReason: null,
        },
      ],
    };
  }

  private mapFinishReason(anthropicReason: string): string {
    switch (anthropicReason) {
      case 'end_turn':
        return 'stop';
      case 'max_tokens':
        return 'length';
      case 'stop_sequence':
        return 'stop';
      default:
        return 'stop';
    }
  }

  private removeUndefinedValues(obj: Record<string, unknown>): Record<string, unknown> {
    const result: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(obj)) {
      if (value !== undefined) {
        result[key] = value;
      }
    }

    return result;
  }

  protected transformError(error: Error, operationName: string) {
    if (error.message.includes('credit_balance_too_low')) {
      return this.createProviderError(
        'Anthropic credit balance too low',
        'INSUFFICIENT_CREDITS',
        402,
        false,
        false,
        { provider: 'anthropic' }
      );
    }

    if (error.message.includes('invalid_request_error')) {
      return this.createProviderError(
        'Anthropic invalid request',
        'INVALID_REQUEST',
        400,
        false,
        false,
        { provider: 'anthropic' }
      );
    }

    return super.transformError(error, operationName);
  }
}
