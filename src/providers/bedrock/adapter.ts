// AWS Bedrock provider adapter

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
import type { Credential, IAWSCredential } from '../../credentials/types/credential-types.js';
import { AWSEndpoint, AWSAuthMethod, AWSRequestSigner } from './auth/aws-auth.js';
import { BedrockError } from './errors/bedrock-errors.js';
import {
  bedrockModels,
  getModelByBedrockId,
  validateModelParameters,
} from '../model-registry/bedrock-models.js';
import {
  AWSBedrockSDKClient,
  createBedrockSDKClient,
  checkAWSSDKAvailability,
} from './client/aws-sdk-client.js';

/**
 * AWS Bedrock adapter for Claude, Llama, and other models
 */
export class BedrockAdapter extends AdapterBase {
  private awsCredential?: IAWSCredential;
  private sdkClient?: AWSBedrockSDKClient;
  private sdkAvailable: boolean;

  constructor(config: ProviderConfig, credential?: Credential) {
    super(config, credential);

    // Validate that we have AWS credentials
    if (credential && credential.type !== 'aws') {
      throw new Error(`Bedrock provider requires AWS credentials, got: ${credential.type}`);
    }

    this.awsCredential = credential as IAWSCredential;

    // Check AWS SDK availability
    const sdkCheck = checkAWSSDKAvailability();
    this.sdkAvailable = sdkCheck.available;

    if (!this.sdkAvailable) {
      log.warn('AWS SDK packages not available, using fallback implementation', {
        missing: sdkCheck.missing,
        instruction: 'Install missing packages: npm install ' + sdkCheck.missing.join(' '),
      });
    }

    // Validate AWS credential compatibility with Bedrock
    if (this.awsCredential) {
      const validation = AWSAuthMethod.validateForBedrock(this.awsCredential);
      if (!validation.valid) {
        throw new Error(`Invalid AWS credential for Bedrock: ${validation.error}`);
      }
    }

    // Set capabilities based on actual model registry
    const modelInfo = bedrockModels[config.modelName] || getModelByBedrockId(config.modelName);
    if (modelInfo) {
      this.capabilities = {
        chat: modelInfo.capabilities.chat,
        completion: modelInfo.capabilities.completion,
        streaming: modelInfo.capabilities.streaming,
        jsonMode: false, // TODO: Add JSON mode support based on model
        functionCalling: modelInfo.capabilities.functionCalling,
        vision: modelInfo.capabilities.vision,
        embeddings: modelInfo.capabilities.embeddings,
      };
    } else {
      // Fallback capabilities for unknown models
      this.capabilities = {
        chat: true,
        completion: false,
        streaming: true,
        jsonMode: false,
        functionCalling: true,
        vision: config.modelName.includes('vision') || config.modelName.includes('claude-3'),
        embeddings: false,
      };
      log.warn(`Model ${config.modelName} not found in registry, using fallback capabilities`);
    }
  }

  /**
   * Get provider capabilities
   */
  public get providerCapabilities() {
    return this.capabilities;
  }

  /**
   * Initialize the AWS SDK client if available
   */
  public async initialize(): Promise<void> {
    if (this.sdkAvailable && this.awsCredential) {
      try {
        this.sdkClient = await createBedrockSDKClient(this.awsCredential);
        log.info('AWS Bedrock SDK client initialized successfully', {
          region: this.awsCredential.region,
          modelName: this.config.modelName,
        });
      } catch (error) {
        log.warn(
          'Failed to initialize AWS Bedrock SDK client, falling back to manual implementation',
          {
            error: error instanceof Error ? error.message : String(error),
          }
        );
        // Continue with fallback implementation
      }
    }
  }

  protected buildAuthHeaders(): Record<string, string> {
    // Return common headers - AWS signing will be handled separately
    return AWSRequestSigner.getCommonHeaders();
  }

  public async chatCompletion(request: ChatCompletionRequest): Promise<ChatCompletionResponse> {
    if (!this.awsCredential) {
      throw this.createProviderError(
        'AWS credentials not available for Bedrock',
        'MISSING_CREDENTIALS',
        401,
        false
      );
    }

    const url = this.buildBedrockUrl(false);

    // Transform to Bedrock format based on model type
    const bedrockRequest = this.transformToBedrock(request);

    logDebug(
      `Bedrock chat completion request`,
      toLogContext(this.sanitizeForLogging(bedrockRequest))
    );

    const bedrockResponse = await this.makeRequest(async () => {
      return this.makeBedrockRequest(url, bedrockRequest);
    }, 'chatCompletion');

    // Transform response from Bedrock format to OpenAI format
    const response = this.transformFromBedrock(bedrockResponse, request);

    logDebug(`Bedrock chat completion response`, toLogContext(this.sanitizeForLogging(response)));

    return response;
  }

  public async *streamChatCompletion(
    request: ChatCompletionRequest
  ): AsyncGenerator<ChatCompletionResponse> {
    if (!this.awsCredential) {
      throw this.createProviderError(
        'AWS credentials not available for Bedrock streaming',
        'MISSING_CREDENTIALS',
        401,
        false
      );
    }

    const url = this.buildBedrockUrl(true);
    const bedrockRequest = this.transformToBedrock(request, true);

    const response = await this.makeBedrockStreamingRequest(url, bedrockRequest);

    // Handle AWS SDK streaming (AsyncGenerator) vs manual streaming (Response)
    if (Symbol.asyncIterator in (response as any)) {
      // AWS SDK streaming
      const sdkStream = response as AsyncGenerator<any, void, unknown>;
      try {
        for await (const chunk of sdkStream) {
          const transformedChunk = this.transformStreamingFromBedrock(chunk, request);
          if (transformedChunk) {
            yield transformedChunk;
          }
        }
      } catch (error) {
        log.warn('Failed to process AWS SDK streaming response', {
          error: error instanceof Error ? error.message : String(error),
        });
        throw error;
      }
      return;
    }

    // Manual streaming implementation (fallback)
    const fetchResponse = response as Response;
    const reader = fetchResponse.body?.getReader();
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

            // Transform Bedrock streaming response to OpenAI format
            const chunk = this.transformStreamingFromBedrock(parsed, request);
            if (chunk) {
              yield chunk;
            }
          } catch (error) {
            log.warn('Failed to parse Bedrock streaming response', {
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
      'Bedrock does not support legacy completion API, use chat completion instead',
      'UNSUPPORTED_OPERATION',
      400,
      false
    );
  }

  /**
   * Build Bedrock API URL
   */
  private buildBedrockUrl(streaming: boolean = false): string {
    if (!this.awsCredential) {
      throw new Error('AWS credentials not available');
    }

    const region = this.awsCredential.region;
    let modelId = this.config.modelName;

    // Check if we need to map model name to Bedrock model ID
    const modelInfo = bedrockModels[modelId];
    if (modelInfo) {
      modelId = modelInfo.bedrockModelId;
    }

    return streaming
      ? AWSEndpoint.buildBedrockStreamingEndpoint(region, modelId)
      : AWSEndpoint.buildBedrockEndpoint(region, modelId);
  }

  /**
   * Transform OpenAI format to Bedrock format
   */
  private transformToBedrock(
    request: ChatCompletionRequest,
    streaming = false
  ): Record<string, unknown> {
    let modelId = this.config.modelName;

    // Get model info from registry
    let modelInfo = bedrockModels[modelId];
    if (!modelInfo) {
      const foundModel = getModelByBedrockId(modelId);
      if (foundModel) {
        modelInfo = foundModel;
      }
    }

    if (modelInfo) {
      modelId = modelInfo.bedrockModelId;

      // Validate parameters against model registry
      const paramValidation = validateModelParameters(modelInfo.name, {
        temperature: request.temperature,
        topP: request.topP,
        maxTokens: request.maxTokens,
      });

      if (!paramValidation.valid) {
        log.warn(
          `Parameter validation failed for model ${modelInfo.name}:`,
          paramValidation.errors
        );
      }
    }

    // Transform based on model family
    if (modelId.startsWith('anthropic.claude')) {
      return this.transformToAnthropicBedrock(request, streaming);
    } else if (modelId.startsWith('meta.llama')) {
      return this.transformToLlamaBedrock(request, streaming);
    } else if (modelId.startsWith('amazon.titan') || modelId.startsWith('amazon.nova')) {
      return this.transformToAmazonBedrock(request, streaming);
    } else if (modelId.startsWith('mistral.')) {
      return this.transformToMistralBedrock(request, streaming);
    } else if (modelId.startsWith('cohere.')) {
      return this.transformToCohereBedrock(request, streaming);
    } else if (modelId.startsWith('ai21.')) {
      return this.transformToAI21Bedrock(request, streaming);
    } else {
      // Generic format fallback
      return {
        inputText: this.messagesToText(request.messages),
        textGenerationConfig: {
          maxTokenCount: request.maxTokens || 1000,
          temperature: request.temperature || 0.7,
          topP: request.topP || 1.0,
          stopSequences: Array.isArray(request.stop)
            ? request.stop
            : request.stop
              ? [request.stop]
              : undefined,
        },
      };
    }
  }

  /**
   * Transform to Anthropic Claude format for Bedrock
   */
  private transformToAnthropicBedrock(
    request: ChatCompletionRequest,
    streaming = false
  ): Record<string, unknown> {
    // Separate system messages from user/assistant messages
    const systemMessage = request.messages.find((msg) => msg.role === 'system');
    const conversationMessages = request.messages.filter((msg) => msg.role !== 'system');

    const bedrockRequest: Record<string, unknown> = {
      max_tokens: request.maxTokens || 1000,
      messages: conversationMessages.map((msg) => ({
        role: msg.role === 'assistant' ? 'assistant' : 'user',
        content: msg.content,
      })),
      temperature: request.temperature,
      top_p: request.topP,
      stop_sequences: Array.isArray(request.stop)
        ? request.stop
        : request.stop
          ? [request.stop]
          : undefined,
      anthropic_version: 'bedrock-2023-05-31',
    };

    if (systemMessage) {
      bedrockRequest.system = systemMessage.content;
    }

    if (streaming) {
      bedrockRequest.stream = true;
    }

    return this.removeUndefinedValues(bedrockRequest);
  }

  /**
   * Transform to Llama format for Bedrock
   */
  private transformToLlamaBedrock(
    request: ChatCompletionRequest,
    streaming = false
  ): Record<string, unknown> {
    return {
      prompt: this.messagesToLlamaPrompt(request.messages),
      max_gen_len: request.maxTokens || 1000,
      temperature: request.temperature || 0.7,
      top_p: request.topP || 1.0,
      stream: streaming,
    };
  }

  /**
   * Transform to Amazon (Titan/Nova) format for Bedrock
   */
  private transformToAmazonBedrock(
    request: ChatCompletionRequest,
    _streaming = false
  ): Record<string, unknown> {
    const modelId = this.config.modelName;

    // Nova models use a different format than Titan
    if (modelId.includes('nova')) {
      return {
        messages: request.messages.map((msg) => ({
          role: msg.role === 'assistant' ? 'assistant' : 'user',
          content: [{ text: msg.content }],
        })),
        inferenceConfig: {
          maxTokens: request.maxTokens || 1000,
          temperature: request.temperature || 0.7,
          topP: request.topP || 1.0,
          stopSequences: Array.isArray(request.stop)
            ? request.stop
            : request.stop
              ? [request.stop]
              : undefined,
        },
      };
    }

    // Titan format
    return {
      inputText: this.messagesToText(request.messages),
      textGenerationConfig: {
        maxTokenCount: request.maxTokens || 1000,
        temperature: request.temperature || 0.7,
        topP: request.topP || 1.0,
        stopSequences: Array.isArray(request.stop)
          ? request.stop
          : request.stop
            ? [request.stop]
            : undefined,
      },
    };
  }

  /**
   * Transform to Mistral format for Bedrock
   */
  private transformToMistralBedrock(
    request: ChatCompletionRequest,
    streaming = false
  ): Record<string, unknown> {
    return {
      prompt: this.messagesToText(request.messages),
      max_tokens: request.maxTokens || 1000,
      temperature: request.temperature || 0.7,
      top_p: request.topP || 1.0,
      stop: Array.isArray(request.stop) ? request.stop : request.stop ? [request.stop] : undefined,
      stream: streaming,
    };
  }

  /**
   * Transform to Cohere format for Bedrock
   */
  private transformToCohereBedrock(
    request: ChatCompletionRequest,
    streaming = false
  ): Record<string, unknown> {
    const messages = request.messages.filter((msg) => msg.role !== 'system');
    const systemMessage = request.messages.find((msg) => msg.role === 'system');

    return {
      message: messages[messages.length - 1]?.content || '',
      chat_history: messages.slice(0, -1).map((msg) => ({
        role: msg.role === 'assistant' ? 'CHATBOT' : 'USER',
        message: msg.content,
      })),
      preamble: systemMessage?.content,
      max_tokens: request.maxTokens || 1000,
      temperature: request.temperature || 0.7,
      p: request.topP || 1.0,
      stop_sequences: Array.isArray(request.stop)
        ? request.stop
        : request.stop
          ? [request.stop]
          : undefined,
      stream: streaming,
    };
  }

  /**
   * Transform to AI21 format for Bedrock
   */
  private transformToAI21Bedrock(
    request: ChatCompletionRequest,
    streaming = false
  ): Record<string, unknown> {
    return {
      messages: request.messages.map((msg) => ({
        role: msg.role,
        content: msg.content,
      })),
      max_tokens: request.maxTokens || 1000,
      temperature: request.temperature || 0.7,
      top_p: request.topP || 1.0,
      stop_sequences: Array.isArray(request.stop)
        ? request.stop
        : request.stop
          ? [request.stop]
          : undefined,
      stream: streaming,
    };
  }

  /**
   * Transform Bedrock response to OpenAI format
   */
  private transformFromBedrock(
    bedrockResponse: any,
    request: ChatCompletionRequest
  ): ChatCompletionResponse {
    const modelId = this.config.modelName;

    if (modelId.startsWith('anthropic.claude')) {
      return this.transformAnthropicBedrockResponse(bedrockResponse, request);
    } else if (modelId.startsWith('meta.llama')) {
      return this.transformLlamaBedrockResponse(bedrockResponse, request);
    } else if (modelId.startsWith('amazon.titan')) {
      return this.transformTitanBedrockResponse(bedrockResponse, request);
    } else {
      // Generic response format
      return {
        id: this.generateRequestId(),
        object: 'chat.completion',
        created: Math.floor(Date.now() / 1000),
        model: this.config.modelName,
        choices: [
          {
            index: 0,
            message: {
              role: 'assistant',
              content: bedrockResponse.results?.[0]?.outputText || bedrockResponse.outputText || '',
            },
            finishReason: 'stop',
          },
        ],
      };
    }
  }

  /**
   * Transform Anthropic Bedrock response
   */
  private transformAnthropicBedrockResponse(
    bedrockResponse: any,
    _request: ChatCompletionRequest
  ): ChatCompletionResponse {
    return {
      id: bedrockResponse.id || this.generateRequestId(),
      object: 'chat.completion',
      created: Math.floor(Date.now() / 1000),
      model: this.config.modelName,
      choices: [
        {
          index: 0,
          message: {
            role: 'assistant',
            content: bedrockResponse.content?.[0]?.text || '',
          },
          finishReason: this.mapAnthropicFinishReason(bedrockResponse.stop_reason),
        },
      ],
      usage: bedrockResponse.usage
        ? {
            promptTokens: bedrockResponse.usage.input_tokens || 0,
            completionTokens: bedrockResponse.usage.output_tokens || 0,
            totalTokens:
              (bedrockResponse.usage.input_tokens || 0) +
              (bedrockResponse.usage.output_tokens || 0),
          }
        : undefined,
    };
  }

  /**
   * Transform Llama Bedrock response
   */
  private transformLlamaBedrockResponse(
    bedrockResponse: any,
    _request: ChatCompletionRequest
  ): ChatCompletionResponse {
    return {
      id: this.generateRequestId(),
      object: 'chat.completion',
      created: Math.floor(Date.now() / 1000),
      model: this.config.modelName,
      choices: [
        {
          index: 0,
          message: {
            role: 'assistant',
            content: bedrockResponse.generation || '',
          },
          finishReason: bedrockResponse.stop_reason === 'stop' ? 'stop' : 'length',
        },
      ],
      usage: {
        promptTokens: bedrockResponse.prompt_token_count || 0,
        completionTokens: bedrockResponse.generation_token_count || 0,
        totalTokens:
          (bedrockResponse.prompt_token_count || 0) + (bedrockResponse.generation_token_count || 0),
      },
    };
  }

  /**
   * Transform Titan Bedrock response
   */
  private transformTitanBedrockResponse(
    bedrockResponse: any,
    _request: ChatCompletionRequest
  ): ChatCompletionResponse {
    const result = bedrockResponse.results?.[0] || {};

    return {
      id: this.generateRequestId(),
      object: 'chat.completion',
      created: Math.floor(Date.now() / 1000),
      model: this.config.modelName,
      choices: [
        {
          index: 0,
          message: {
            role: 'assistant',
            content: result.outputText || '',
          },
          finishReason: result.completionReason === 'FINISH' ? 'stop' : 'length',
        },
      ],
      usage: {
        promptTokens: bedrockResponse.inputTextTokenCount || 0,
        completionTokens: result.tokenCount || 0,
        totalTokens: (bedrockResponse.inputTextTokenCount || 0) + (result.tokenCount || 0),
      },
    };
  }

  /**
   * Transform streaming response from Bedrock
   */
  private transformStreamingFromBedrock(
    chunk: any,
    _request: ChatCompletionRequest
  ): ChatCompletionResponse | null {
    const modelId = this.config.modelName;

    if (modelId.startsWith('anthropic.claude')) {
      if (chunk.type === 'content_block_delta' && chunk.delta?.text) {
        return {
          id: chunk.message?.id || this.generateRequestId(),
          object: 'chat.completion.chunk',
          created: Math.floor(Date.now() / 1000),
          model: this.config.modelName,
          choices: [
            {
              index: 0,
              delta: {
                content: chunk.delta.text,
              },
              finishReason: null,
            },
          ],
        };
      }
    } else if (modelId.startsWith('meta.llama')) {
      if (chunk.generation) {
        return {
          id: this.generateRequestId(),
          object: 'chat.completion.chunk',
          created: Math.floor(Date.now() / 1000),
          model: this.config.modelName,
          choices: [
            {
              index: 0,
              delta: {
                content: chunk.generation,
              },
              finishReason: chunk.stop_reason === 'stop' ? 'stop' : null,
            },
          ],
        };
      }
    }

    return null;
  }

  /**
   * Convert messages to plain text
   */
  private messagesToText(messages: any[]): string {
    return messages.map((msg) => `${msg.role}: ${msg.content}`).join('\n');
  }

  /**
   * Convert messages to Llama prompt format
   */
  private messagesToLlamaPrompt(messages: any[]): string {
    let prompt = '<s>';

    for (const message of messages) {
      if (message.role === 'system') {
        prompt += `[INST] <<SYS>>\n${message.content}\n<</SYS>>\n\n`;
      } else if (message.role === 'user') {
        prompt += `[INST] ${message.content} [/INST]`;
      } else if (message.role === 'assistant') {
        prompt += ` ${message.content}</s><s>`;
      }
    }

    return prompt;
  }

  /**
   * Map Anthropic finish reasons to OpenAI format
   */
  private mapAnthropicFinishReason(reason: string): string {
    switch (reason) {
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

  /**
   * Remove undefined values from object
   */
  private removeUndefinedValues(obj: Record<string, unknown>): Record<string, unknown> {
    const result: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(obj)) {
      if (value !== undefined) {
        result[key] = value;
      }
    }

    return result;
  }

  /**
   * Make authenticated request to Bedrock
   */
  private async makeBedrockRequest(url: string, body: Record<string, unknown>): Promise<any> {
    if (!this.awsCredential) {
      throw new Error('AWS credentials not available');
    }

    // Use AWS SDK client if available
    if (this.sdkClient) {
      try {
        const modelId = this.extractModelIdFromUrl(url);
        const response = await this.sdkClient.invokeModel({
          modelId,
          body: JSON.stringify(body),
          contentType: 'application/json',
          accept: 'application/json',
        });

        // Convert AWS SDK response to JSON
        const responseText = new TextDecoder().decode(response.body);
        return JSON.parse(responseText);
      } catch (error) {
        if (error instanceof BedrockError) {
          throw error;
        }
        throw new BedrockError('SDKError', error instanceof Error ? error.message : String(error));
      }
    }

    // Fallback to manual implementation
    const bodyStr = JSON.stringify(body);
    const headers = AWSRequestSigner.prepareHeaders(this.awsCredential, url, bodyStr, false);

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers,
        body: bodyStr,
      });

      if (!response.ok) {
        // Parse error response
        let errorData: any = null;
        try {
          errorData = await response.json();
        } catch {
          // If JSON parsing fails, use status text
        }

        throw BedrockError.fromAWSResponse(response, errorData);
      }

      return response.json();
    } catch (error) {
      if (error instanceof BedrockError) {
        throw error;
      }

      // Handle network errors
      if (error instanceof TypeError && error.message.includes('fetch')) {
        throw BedrockError.fromNetworkError(error);
      }

      throw new BedrockError(
        'UnknownError',
        error instanceof Error ? error.message : String(error)
      );
    }
  }

  /**
   * Extract model ID from Bedrock URL
   */
  private extractModelIdFromUrl(url: string): string {
    const match = url.match(/\/model\/([^/]+)\/invoke/);
    if (!match) {
      throw new Error(`Cannot extract model ID from URL: ${url}`);
    }
    return decodeURIComponent(match[1]);
  }

  /**
   * Make authenticated streaming request to Bedrock
   */
  private async makeBedrockStreamingRequest(
    url: string,
    body: Record<string, unknown>
  ): Promise<Response | AsyncGenerator<any, void, unknown>> {
    if (!this.awsCredential) {
      throw new Error('AWS credentials not available');
    }

    // Use AWS SDK client if available for streaming
    if (this.sdkClient) {
      try {
        const modelId = this.extractModelIdFromUrl(url);
        return this.sdkClient.invokeModelWithResponseStream({
          modelId,
          body: JSON.stringify(body),
          contentType: 'application/json',
          accept: 'application/json',
        });
      } catch (error) {
        if (error instanceof BedrockError) {
          throw error;
        }
        throw new BedrockError(
          'SDKStreamError',
          error instanceof Error ? error.message : String(error)
        );
      }
    }

    // Fallback to manual implementation
    const bodyStr = JSON.stringify(body);
    const headers = AWSRequestSigner.prepareHeaders(this.awsCredential, url, bodyStr, true);

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers,
        body: bodyStr,
      });

      if (!response.ok) {
        // Parse error response
        let errorData: any = null;
        try {
          errorData = await response.json();
        } catch {
          // If JSON parsing fails, use status text
        }

        throw BedrockError.fromAWSResponse(response, errorData);
      }

      return response;
    } catch (error) {
      if (error instanceof BedrockError) {
        throw error;
      }

      // Handle network errors
      if (error instanceof TypeError && error.message.includes('fetch')) {
        throw BedrockError.fromNetworkError(error);
      }

      throw new BedrockError(
        'UnknownError',
        error instanceof Error ? error.message : String(error)
      );
    }
  }

  protected transformError(error: Error, operationName: string) {
    // Handle BedrockError instances
    if (error instanceof BedrockError) {
      return this.createProviderError(
        error.message,
        error.code,
        error.statusCode,
        error.isRetryable,
        error.isRateLimit,
        {
          provider: 'bedrock',
          operation: operationName,
          ...error.metadata,
        }
      );
    }

    // Handle legacy error patterns for backward compatibility
    const errorMessage = error.message;
    let awsErrorCode = 'UnknownError';

    // Extract AWS error code from message if possible
    if (errorMessage.includes('UnauthorizedOperation')) awsErrorCode = 'UnauthorizedOperation';
    else if (errorMessage.includes('InvalidSignatureException'))
      awsErrorCode = 'InvalidSignatureException';
    else if (errorMessage.includes('ThrottlingException')) awsErrorCode = 'ThrottlingException';
    else if (errorMessage.includes('TooManyRequestsException'))
      awsErrorCode = 'TooManyRequestsException';
    else if (errorMessage.includes('ModelNotReadyException'))
      awsErrorCode = 'ModelNotReadyException';
    else if (errorMessage.includes('ValidationException')) awsErrorCode = 'ValidationException';

    // Create BedrockError and transform it
    const bedrockError = new BedrockError(awsErrorCode, errorMessage, 500, {
      operation: operationName,
      originalError: error,
    });

    return this.createProviderError(
      bedrockError.message,
      bedrockError.code,
      bedrockError.statusCode,
      bedrockError.isRetryable,
      bedrockError.isRateLimit,
      {
        provider: 'bedrock',
        operation: operationName,
        ...bedrockError.metadata,
      }
    );
  }
}
