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

export class OpenAIAdapter extends AdapterBase {
  constructor(config: ProviderConfig, credential?: Credential) {
    super(config, credential);

    // Override capabilities for OpenAI
    this.capabilities = {
      chat: true,
      completion: true,
      streaming: true,
      jsonMode: true,
      functionCalling: true,
      vision: config.modelName.includes('vision') || config.modelName.includes('gpt-4'),
      embeddings: false,
    };
  }

  protected buildAuthHeaders(): Record<string, string> {
    const baseHeaders = super.buildAuthHeaders();

    return {
      ...baseHeaders,
      'OpenAI-Organization': this.config.headers?.['OpenAI-Organization'] || '',
    };
  }

  protected buildLegacyAuthHeaders(apiKey: string): Record<string, string> {
    // OpenAI uses Bearer token authorization
    return {
      Authorization: `Bearer ${apiKey}`,
    };
  }

  public async chatCompletion(request: ChatCompletionRequest): Promise<ChatCompletionResponse> {
    const url = this.buildRequestUrl('/v1/chat/completions');

    const openaiRequest = {
      model: this.config.modelName,
      messages: request.messages,
      max_tokens: request.maxTokens,
      temperature: request.temperature,
      top_p: request.topP,
      stream: false,
      stop: request.stop,
      presence_penalty: request.presencePenalty,
      frequency_penalty: request.frequencyPenalty,
      user: request.user,
      logit_bias: request.logitBias,
      seed: request.seed,
      tools: request.tools,
      tool_choice: request.toolChoice,
      response_format: request.responseFormat,
    };

    // Remove undefined values
    const cleanRequest = this.removeUndefinedValues(openaiRequest);

    logDebug(`OpenAI chat completion request`, toLogContext(this.sanitizeForLogging(cleanRequest)));

    const response = await this.makeRequest(async () => {
      return this.makeHttpRequest<ChatCompletionResponse>(url, {
        method: 'POST',
        headers: this.buildAuthHeaders(),
        body: cleanRequest,
      });
    }, 'chatCompletion');

    logDebug(`OpenAI chat completion response`, toLogContext(this.sanitizeForLogging(response)));

    return response;
  }

  public async *streamChatCompletion(
    request: ChatCompletionRequest
  ): AsyncGenerator<ChatCompletionResponse> {
    const url = this.buildRequestUrl('/v1/chat/completions');

    const openaiRequest = {
      model: this.config.modelName,
      messages: request.messages,
      max_tokens: request.maxTokens,
      temperature: request.temperature,
      top_p: request.topP,
      stream: true,
      stop: request.stop,
      presence_penalty: request.presencePenalty,
      frequency_penalty: request.frequencyPenalty,
      user: request.user,
      logit_bias: request.logitBias,
      seed: request.seed,
      tools: request.tools,
      tool_choice: request.toolChoice,
      response_format: request.responseFormat,
    };

    const cleanRequest = this.removeUndefinedValues(openaiRequest);

    logDebug(
      `OpenAI streaming chat completion request`,
      toLogContext(this.sanitizeForLogging(cleanRequest))
    );

    const response = await this.makeStreamingRequest(url, {
      method: 'POST',
      headers: this.buildAuthHeaders(),
      body: cleanRequest,
    });

    const reader = response.body?.getReader();
    if (!reader) {
      throw this.createProviderError(
        'Failed to get response stream reader',
        'STREAM_ERROR',
        undefined,
        false
      );
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

          if (trimmedLine === '') continue;
          if (trimmedLine === 'data: [DONE]') return;
          if (!trimmedLine.startsWith('data: ')) continue;

          try {
            const data = trimmedLine.slice(6);
            const parsed = JSON.parse(data) as ChatCompletionResponse;
            yield parsed;
          } catch (error) {
            log.warn('Failed to parse streaming response line', {
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

  public async completion(request: CompletionRequest): Promise<CompletionResponse> {
    const url = this.buildRequestUrl('/v1/completions');

    const openaiRequest = {
      model: this.config.modelName,
      prompt: request.prompt,
      max_tokens: request.maxTokens,
      temperature: request.temperature,
      top_p: request.topP,
      stream: false,
      stop: request.stop,
      presence_penalty: request.presencePenalty,
      frequency_penalty: request.frequencyPenalty,
      user: request.user,
      logit_bias: request.logitBias,
    };

    const cleanRequest = this.removeUndefinedValues(openaiRequest);

    logDebug(`OpenAI completion request`, toLogContext(this.sanitizeForLogging(cleanRequest)));

    const response = await this.makeRequest(async () => {
      return this.makeHttpRequest<CompletionResponse>(url, {
        method: 'POST',
        headers: this.buildAuthHeaders(),
        body: cleanRequest,
      });
    }, 'completion');

    logDebug(`OpenAI completion response`, toLogContext(this.sanitizeForLogging(response)));

    return response;
  }

  public async healthCheck(): Promise<boolean> {
    try {
      const url = this.buildRequestUrl('/v1/models');

      const response = await this.makeHttpRequest<{ data: Array<{ id: string }> }>(url, {
        method: 'GET',
        headers: this.buildAuthHeaders(),
      });

      // Check if our model is available
      const modelExists = response.data.some((model) => model.id === this.config.modelName);

      if (!modelExists) {
        log.warn(`Model ${this.config.modelName} not found in OpenAI models list`);
        return false;
      }

      return true;
    } catch (error) {
      log.warn(`OpenAI health check failed`, {
        error: error instanceof Error ? error.message : String(error),
      });
      return false;
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
    // Handle OpenAI-specific errors
    if (error.message.includes('insufficient_quota')) {
      return this.createProviderError(
        'OpenAI API quota exceeded',
        'QUOTA_EXCEEDED',
        402,
        false,
        false,
        { provider: 'openai' }
      );
    }

    if (error.message.includes('model_not_found')) {
      return this.createProviderError(
        `OpenAI model ${this.config.modelName} not found`,
        'MODEL_NOT_FOUND',
        404,
        false,
        false,
        { provider: 'openai', model: this.config.modelName }
      );
    }

    if (error.message.includes('context_length_exceeded')) {
      return this.createProviderError(
        'OpenAI context length exceeded',
        'CONTEXT_LENGTH_EXCEEDED',
        400,
        false,
        false,
        { provider: 'openai' }
      );
    }

    if (error.message.includes('content_filter')) {
      return this.createProviderError(
        'OpenAI content filter triggered',
        'CONTENT_FILTERED',
        400,
        false,
        false,
        { provider: 'openai' }
      );
    }

    // Call parent transformation for common errors
    return super.transformError(error, operationName);
  }
}
