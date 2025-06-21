// Internal provider interface types for domain logic

import { ProviderError } from '../../shared/errors.js';
export interface IChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
  name?: string;
}

export interface IChatCompletionRequest {
  model: string;
  messages: IChatMessage[];
  maxTokens?: number;
  temperature?: number;
  topP?: number;
  stream?: boolean;
  stop?: string | string[];
  presencePenalty?: number;
  frequencyPenalty?: number;
  user?: string;
  logitBias?: Record<string, number>;
  seed?: number;
  tools?: unknown[];
  toolChoice?: unknown;
  responseFormat?: {
    type: 'text' | 'json_object';
  };
}

export interface IChatCompletionResponse {
  id: string;
  object: 'chat.completion' | 'chat.completion.chunk';
  created: number;
  model: string;
  choices: Array<{
    index: number;
    message?: IChatMessage;
    delta?: Partial<IChatMessage>;
    finishReason: string | null;
  }>;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

export interface ICompletionRequest {
  model: string;
  prompt: string | string[];
  maxTokens?: number;
  temperature?: number;
  topP?: number;
  stream?: boolean;
  stop?: string | string[];
  presencePenalty?: number;
  frequencyPenalty?: number;
  user?: string;
  logitBias?: Record<string, number>;
}

export interface ICompletionResponse {
  id: string;
  object: 'text_completion';
  created: number;
  model: string;
  choices: Array<{
    text: string;
    index: number;
    finishReason: string | null;
  }>;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

export interface IProviderConfig {
  name: string;

  // Credential configuration - new approach (preferred)
  credentialsRef?: string;

  // Legacy credential configuration (deprecated but supported)
  apiKey?: string;

  apiBase: string;
  modelName: string;
  timeout: number;
  maxRetries: number;
  retryDelay: number;
  headers?: Record<string, string>;

  // Provider-specific parameters
  providerParams?: Record<string, unknown>;

  // Health check specific parameters
  healthCheckParams?: Record<string, unknown>;

  // Streaming-specific parameter overrides
  streamingParams?: Record<string, unknown>;

  rateLimits?: {
    requestsPerMinute?: number;
    tokensPerMinute?: number;
  };
}

export interface IProviderCapabilities {
  chat: boolean;
  completion: boolean;
  streaming: boolean;
  jsonMode: boolean;
  functionCalling: boolean;
  vision: boolean;
  embeddings: boolean;
}

export interface IProviderMetrics {
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  averageLatency: number;
  lastRequestTime?: Date;
  lastErrorTime?: Date;
  consecutiveErrors: number;
  rateLimitHits: number;
}

export interface IProviderHealthStatus {
  isHealthy: boolean;
  lastHealthCheck: Date;
  responseTime?: number;
  errorMessage?: string;
  consecutiveFailures: number;
}

// Re-export standardized error types for provider use
export type {
  ProviderError,
  ProviderTimeoutError,
  ProviderRateLimitError,
  ProviderAuthenticationError,
  ProviderConnectionError,
} from '../../shared/errors.js';

export abstract class IBaseProvider {
  protected config: IProviderConfig;
  protected capabilities: IProviderCapabilities;
  protected metrics: IProviderMetrics;
  protected healthStatus: IProviderHealthStatus;

  constructor(config: IProviderConfig, capabilities: IProviderCapabilities) {
    this.config = config;
    this.capabilities = capabilities;
    this.metrics = this.initializeMetrics();
    this.healthStatus = this.initializeHealthStatus();
  }

  private initializeMetrics(): IProviderMetrics {
    return {
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      averageLatency: 0,
      consecutiveErrors: 0,
      rateLimitHits: 0,
    };
  }

  private initializeHealthStatus(): IProviderHealthStatus {
    return {
      isHealthy: true,
      lastHealthCheck: new Date(),
      consecutiveFailures: 0,
    };
  }

  // Abstract methods that must be implemented by provider adapters
  abstract chatCompletion(request: IChatCompletionRequest): Promise<IChatCompletionResponse>;
  abstract streamChatCompletion(
    request: IChatCompletionRequest
  ): AsyncGenerator<IChatCompletionResponse>;
  abstract completion(request: ICompletionRequest): Promise<ICompletionResponse>;
  abstract healthCheck(): Promise<boolean>;

  // Common functionality
  public getCapabilities(): IProviderCapabilities {
    return { ...this.capabilities };
  }

  public getMetrics(): IProviderMetrics {
    return { ...this.metrics };
  }

  public getHealthStatus(): IProviderHealthStatus {
    return { ...this.healthStatus };
  }

  public getName(): string {
    return this.config.name;
  }

  public getModelName(): string {
    return this.config.modelName;
  }

  protected updateMetrics(success: boolean, latency: number, rateLimited = false): void {
    this.metrics.totalRequests++;
    this.metrics.lastRequestTime = new Date();

    if (success) {
      this.metrics.successfulRequests++;
      this.metrics.consecutiveErrors = 0;
      this.updateAverageLatency(latency);
    } else {
      this.metrics.failedRequests++;
      this.metrics.consecutiveErrors++;
      this.metrics.lastErrorTime = new Date();
    }

    if (rateLimited) {
      this.metrics.rateLimitHits++;
    }
  }

  private updateAverageLatency(newLatency: number): void {
    if (this.metrics.averageLatency === 0) {
      this.metrics.averageLatency = newLatency;
    } else {
      // Exponential moving average
      this.metrics.averageLatency = this.metrics.averageLatency * 0.9 + newLatency * 0.1;
    }
  }

  protected updateHealthStatus(isHealthy: boolean, responseTime?: number, error?: string): void {
    this.healthStatus.lastHealthCheck = new Date();
    this.healthStatus.responseTime = responseTime;

    if (isHealthy) {
      this.healthStatus.isHealthy = true;
      this.healthStatus.consecutiveFailures = 0;
      this.healthStatus.errorMessage = undefined;
    } else {
      this.healthStatus.isHealthy = false;
      this.healthStatus.consecutiveFailures++;
      this.healthStatus.errorMessage = error;
    }
  }

  protected createProviderError(
    message: string,
    code: string,
    statusCode?: number,
    retryable = false,
    rateLimited = false,
    providerSpecific?: Record<string, unknown>
  ): ProviderError {
    return new ProviderError(
      message,
      code,
      statusCode || 500,
      retryable,
      providerSpecific,
      rateLimited
    );
  }

  protected async makeRequest<T>(operation: () => Promise<T>, operationName: string): Promise<T> {
    const startTime = Date.now();

    try {
      const result = await operation();
      const latency = Date.now() - startTime;
      this.updateMetrics(true, latency);
      return result;
    } catch (error) {
      const latency = Date.now() - startTime;
      const isRateLimited = this.isRateLimitError(error);
      this.updateMetrics(false, latency, isRateLimited);

      if (error instanceof Error) {
        throw this.transformError(error, operationName);
      }
      throw error;
    }
  }

  protected isRateLimitError(error: unknown): boolean {
    if (error && typeof error === 'object' && 'statusCode' in error) {
      return (error as { statusCode: number }).statusCode === 429;
    }
    return false;
  }

  protected transformError(error: Error, operationName: string): ProviderError {
    // Default transformation - providers can override this
    return this.createProviderError(
      `${operationName} failed: ${error.message}`,
      'PROVIDER_ERROR',
      undefined,
      true
    );
  }

  public async performHealthCheck(): Promise<void> {
    const startTime = Date.now();

    try {
      const isHealthy = await this.healthCheck();
      const responseTime = Date.now() - startTime;
      this.updateHealthStatus(isHealthy, responseTime);
    } catch (error) {
      const responseTime = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.updateHealthStatus(false, responseTime, errorMessage);
    }
  }

  public resetMetrics(): void {
    this.metrics = this.initializeMetrics();
  }
}
