import log from '../../utils/logging.js';
import { logDebug } from '../../utils/logging.js';
import { BaseProvider, type ProviderConfig, type ProviderError } from './provider-interface.js';
import type { Credential } from '../../credentials/types/credential-types.js';
import { ProviderError as StandardProviderError } from '../../types/shared/errors.js';
export interface HttpClientConfig {
  timeout: number;
  maxRetries: number;
  retryDelay: number;
  userAgent: string;
  headers: Record<string, string>;
}

export interface RetryConfig {
  maxAttempts: number;
  baseDelay: number;
  maxDelay: number;
  backoffFactor: number;
  retryableStatusCodes: number[];
  retryableErrorCodes: string[];
}

export abstract class AdapterBase extends BaseProvider {
  protected httpConfig: HttpClientConfig;
  protected retryConfig: RetryConfig;
  protected credential?: Credential;

  constructor(config: ProviderConfig, credential?: Credential) {
    super(config, {
      chat: true,
      completion: true,
      streaming: false,
      jsonMode: false,
      functionCalling: false,
      vision: false,
      embeddings: false,
    });

    this.credential = credential;
    this.httpConfig = this.buildHttpConfig();
    this.retryConfig = this.buildRetryConfig();
  }

  private buildHttpConfig(): HttpClientConfig {
    return {
      timeout: this.config.timeout || 30000,
      maxRetries: this.config.maxRetries || 3,
      retryDelay: this.config.retryDelay || 1000,
      userAgent: 'Switch/1.0',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        ...this.config.headers,
      },
    };
  }

  private buildRetryConfig(): RetryConfig {
    return {
      maxAttempts: this.config.maxRetries || 3,
      baseDelay: this.config.retryDelay || 1000,
      maxDelay: 30000,
      backoffFactor: 2,
      retryableStatusCodes: [408, 429, 500, 502, 503, 504],
      retryableErrorCodes: ['TIMEOUT', 'NETWORK_ERROR', 'RATE_LIMITED'],
    };
  }

  protected async makeHttpRequest<T>(
    url: string,
    options: {
      method: 'GET' | 'POST' | 'PUT' | 'DELETE';
      headers?: Record<string, string>;
      body?: unknown;
      stream?: boolean;
    }
  ): Promise<T> {
    return this.withRetry(async () => {
      const headers = {
        ...this.httpConfig.headers,
        ...options.headers,
      };

      const requestOptions: any = {
        method: options.method,
        headers,
        signal: AbortSignal.timeout(this.httpConfig.timeout),
      };

      if (options.body) {
        requestOptions.body = JSON.stringify(options.body);
      }

      log.debug(`Making ${options.method} request to ${url}`);

      const response = await fetch(url, requestOptions);

      if (!response.ok) {
        await this.handleHttpError(response);
      }

      if (options.stream) {
        return response as unknown as T;
      }

      const result = await response.json();
      return result as T;
    });
  }

  protected async makeStreamingRequest(
    url: string,
    options: {
      method: 'POST';
      headers?: Record<string, string>;
      body: unknown;
    }
  ): Promise<Response> {
    const headers = {
      ...this.httpConfig.headers,
      ...options.headers,
      Accept: 'text/event-stream',
    };

    const requestOptions: any = {
      method: options.method,
      headers,
      body: JSON.stringify(options.body),
      signal: AbortSignal.timeout(this.httpConfig.timeout),
    };

    log.debug(`Making streaming ${options.method} request to ${url}`);

    const response = await fetch(url, requestOptions);

    if (!response.ok) {
      await this.handleHttpError(response);
    }

    return response;
  }

  private async handleHttpError(response: Response): Promise<never> {
    let errorBody: unknown;

    try {
      errorBody = await response.json();
    } catch {
      errorBody = await response.text();
    }

    const isRateLimited = response.status === 429;
    const isRetryable = this.retryConfig.retryableStatusCodes.includes(response.status);

    log.warn(`HTTP error ${response.status} from ${response.url}`, { errorBody });

    throw this.createProviderError(
      `HTTP ${response.status}: ${response.statusText}`,
      this.mapStatusToErrorCode(response.status),
      response.status,
      isRetryable,
      isRateLimited,
      { responseBody: errorBody }
    );
  }

  private mapStatusToErrorCode(status: number): string {
    switch (status) {
      case 400:
        return 'BAD_REQUEST';
      case 401:
        return 'UNAUTHORIZED';
      case 403:
        return 'FORBIDDEN';
      case 404:
        return 'NOT_FOUND';
      case 408:
        return 'TIMEOUT';
      case 429:
        return 'RATE_LIMITED';
      case 500:
        return 'INTERNAL_SERVER_ERROR';
      case 502:
        return 'BAD_GATEWAY';
      case 503:
        return 'SERVICE_UNAVAILABLE';
      case 504:
        return 'GATEWAY_TIMEOUT';
      default:
        return 'HTTP_ERROR';
    }
  }

  protected async withRetry<T>(operation: () => Promise<T>): Promise<T> {
    let lastError: ProviderError | null = null;

    for (let attempt = 1; attempt <= this.retryConfig.maxAttempts; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error as ProviderError;

        if (attempt === this.retryConfig.maxAttempts || !this.shouldRetry(lastError)) {
          break;
        }

        const delay = this.calculateRetryDelay(attempt);
        logDebug(
          `Retry attempt ${attempt} failed, waiting ${delay}ms before retry: ${error instanceof Error ? error.message : String(error)}`
        );

        await this.sleep(delay);
      }
    }

    throw lastError;
  }

  private shouldRetry(error: ProviderError): boolean {
    if (!error.retryable) {
      return false;
    }

    if (error.statusCode && this.retryConfig.retryableStatusCodes.includes(error.statusCode)) {
      return true;
    }

    if (this.retryConfig.retryableErrorCodes.includes(error.code)) {
      return true;
    }

    return false;
  }

  private calculateRetryDelay(attempt: number): number {
    const baseDelay = this.retryConfig.baseDelay;
    const backoffDelay = baseDelay * Math.pow(this.retryConfig.backoffFactor, attempt - 1);
    const jitteredDelay = backoffDelay * (0.5 + Math.random() * 0.5); // Add jitter

    return Math.min(jitteredDelay, this.retryConfig.maxDelay);
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  protected buildAuthHeaders(): Record<string, string> {
    if (this.credential) {
      return this.credential.getAuthHeaders();
    }

    // Fallback to legacy API key if no credential provided
    if (this.config.apiKey) {
      return this.buildLegacyAuthHeaders(this.config.apiKey);
    }

    throw new Error(`No credentials available for provider: ${this.config.name}`);
  }

  /**
   * Build legacy authentication headers for backward compatibility
   */
  protected buildLegacyAuthHeaders(apiKey: string): Record<string, string> {
    // Default implementation - can be overridden by specific providers
    if (apiKey.startsWith('sk-')) {
      // OpenAI-style key
      return {
        Authorization: `Bearer ${apiKey}`,
      };
    } else {
      // Generic API key header
      return {
        'x-api-key': apiKey,
      };
    }
  }

  /**
   * Get provider-specific configuration from credential
   */
  protected getProviderConfig(): Record<string, unknown> {
    if (this.credential && 'getProviderConfig' in this.credential) {
      return (this.credential as any).getProviderConfig();
    }
    return {};
  }

  /**
   * Check if credentials are available and valid
   */
  protected async validateCredentials(): Promise<boolean> {
    if (this.credential) {
      return await this.credential.validate();
    }

    // For legacy API key, do basic validation
    if (this.config.apiKey) {
      return (
        this.config.apiKey.length > 0 &&
        !this.config.apiKey.startsWith('${') &&
        !this.config.apiKey.endsWith('}')
      );
    }

    return false;
  }

  protected buildRequestUrl(endpoint: string): string {
    const baseUrl = this.config.apiBase.replace(/\/$/, '');
    const cleanEndpoint = endpoint.replace(/^\//, '');
    return `${baseUrl}/${cleanEndpoint}`;
  }

  protected generateRequestId(): string {
    return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  protected sanitizeForLogging(data: unknown): unknown {
    if (typeof data === 'object' && data !== null) {
      const sanitized = { ...data } as Record<string, unknown>;

      // Remove sensitive fields
      const sensitiveFields = ['apiKey', 'authorization', 'token', 'password', 'key'];
      for (const field of sensitiveFields) {
        if (field in sanitized) {
          sanitized[field] = '[REDACTED]';
        }
      }

      return sanitized;
    }

    return data;
  }

  /**
   * Apply provider-specific parameters to request body
   */
  protected applyProviderParams(
    requestBody: Record<string, unknown>,
    isStreaming = false
  ): Record<string, unknown> {
    const result = { ...requestBody };

    // Apply base provider params
    if (this.config.providerParams) {
      Object.assign(result, this.config.providerParams);
    }

    // Apply streaming-specific overrides if this is a streaming request
    if (isStreaming && this.config.streamingParams) {
      Object.assign(result, this.config.streamingParams);
    }

    return result;
  }

  /**
   * Build health check request body with provider-specific parameters
   */
  protected buildHealthCheckRequest(): Record<string, unknown> {
    const baseRequest = {
      model: this.config.modelName,
      messages: [{ role: 'user' as const, content: 'ping' }],
      max_tokens: 1,
      temperature: 0.7,
    };

    // Apply health check specific parameters
    if (this.config.healthCheckParams) {
      Object.assign(baseRequest, this.config.healthCheckParams);
    }

    // Apply base provider params (health check is never streaming)
    if (this.config.providerParams) {
      Object.assign(baseRequest, this.config.providerParams);
    }

    return baseRequest;
  }

  public async healthCheck(): Promise<boolean> {
    try {
      // Check if we have health check specific parameters, use chat completion instead of /models
      if (this.config.healthCheckParams || this.config.providerParams) {
        // Use chat completion with provider-specific parameters
        const url = this.buildRequestUrl('/chat/completions');
        const body = this.buildHealthCheckRequest();

        await this.makeHttpRequest(url, {
          method: 'POST',
          headers: this.buildAuthHeaders(),
          body,
        });
      } else {
        // Default health check - try to make a simple request to /models
        const url = this.buildRequestUrl('/models');

        await this.makeHttpRequest(url, {
          method: 'GET',
          headers: this.buildAuthHeaders(),
        });
      }

      return true;
    } catch (error) {
      log.warn(`Health check failed for provider ${this.config.name}`, {
        error: error instanceof Error ? error.message : String(error),
      });
      return false;
    }
  }

  protected transformError(error: Error, operationName: string): ProviderError {
    if (error.name === 'TimeoutError' || error.message.includes('timeout')) {
      return this.createProviderError(
        `${operationName} timed out after ${this.httpConfig.timeout}ms`,
        'TIMEOUT',
        408,
        true
      );
    }

    if (error.name === 'AbortError') {
      return this.createProviderError(`${operationName} was aborted`, 'ABORTED', undefined, false);
    }

    if (error.message.includes('network') || error.message.includes('fetch')) {
      return this.createProviderError(
        `Network error during ${operationName}: ${error.message}`,
        'NETWORK_ERROR',
        undefined,
        true
      );
    }

    // If it's already a ProviderError, return as-is
    if (error instanceof StandardProviderError) {
      return error;
    }

    // Default transformation
    return this.createProviderError(
      `${operationName} failed: ${error.message}`,
      'PROVIDER_ERROR',
      undefined,
      true
    );
  }
}
