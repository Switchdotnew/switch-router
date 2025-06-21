import log from './logging.js';
import type { ChatCompletionRequest } from '../types/index.js';
import { getProviderConfig } from './providers.js';
import { fastProcessParams, ultraFastProcessParams, canUseUltraFast } from './fast-params.js';
import { config } from '../config.js';
import {
  ProviderError,
  ProviderNotFoundError,
  ProviderAuthenticationError,
  ProviderTimeoutError,
  classifyHttpError,
  shouldTripImmediately,
} from '../types/shared/errors.js';
import type { IRequestContext } from './request-context.js';
import { TimeoutUtils } from './request-context.js';

// Legacy client model interface for backward compatibility
interface IClientModel {
  name: string;
  apiKey: string;
  apiBase: string;
  modelName: string;
  provider: string;
  temperature: number;
  maxTokens: number;
  isHealthy?: boolean;
  lastHealthCheck?: Date;
  responseTime?: number;
  // New provider-specific parameters
  providerParams?: Record<string, unknown>;
  healthCheckParams?: Record<string, unknown>;
  streamingParams?: Record<string, unknown>;
}

export class OpenAICompatibleClient {
  constructor(private model: IClientModel) {}

  /**
   * Get provider parameters with streaming/health-check context
   */
  private getProviderParams(
    isStreaming: boolean,
    requestType: 'chat' | 'completion' | 'health-check' = 'chat'
  ): Record<string, unknown> {
    let params = { ...(this.model.providerParams || {}) };

    // Apply streaming-specific overrides if streaming
    if (isStreaming && this.model.streamingParams) {
      params = { ...params, ...this.model.streamingParams };
    }

    // Apply health-check specific overrides for health checks
    if (requestType === 'health-check' && this.model.healthCheckParams) {
      params = { ...params, ...this.model.healthCheckParams };
    }

    return params;
  }

  /**
   * Calculate effective timeout for client request considering request context
   */
  private calculateRequestTimeout(defaultTimeoutMs: number, requestContext?: IRequestContext): number {
    if (!requestContext) {
      return defaultTimeoutMs;
    }

    // Use the configured provider timeout multiplier
    const timeoutConfig = config.timeout;
    const multiplier = timeoutConfig?.providerTimeoutMultiplier || 0.8;
    
    // Calculate timeout as percentage of remaining request time
    const remainingTime = requestContext.remainingTime;
    const targetTimeout = Math.floor(remainingTime * multiplier);
    
    // Ensure we have a reasonable timeout (min 1s, max of default or calculated)
    const minTimeout = Math.min(1000, remainingTime);
    return Math.max(minTimeout, Math.min(targetTimeout, defaultTimeoutMs));
  }

  async chatCompletion(request: ChatCompletionRequest, requestContext?: IRequestContext): Promise<Response> {
    const providerConfig = getProviderConfig(this.model.provider);
    if (!providerConfig) {
      throw new Error(`Unsupported provider: ${this.model.provider}`);
    }

    // Validate JSON mode support
    if (request.response_format?.type === 'json_object' && !providerConfig.supportsJsonMode) {
      throw new Error(`Provider ${this.model.provider} does not support JSON mode`);
    }

    // Validate streaming support
    if (request.stream && !providerConfig.supportsStreaming) {
      throw new Error(`Provider ${this.model.provider} does not support streaming`);
    }

    const headers: HeadersInit = {
      'Content-Type': 'application/json',
      [providerConfig.authHeader]: `${providerConfig.authPrefix}${this.model.apiKey}`,
    };

    // Performance-optimised parameter processing
    let cleanedBody: Record<string, unknown>;

    if (canUseUltraFast(config.performance)) {
      // Ultra-fast path for high-throughput mode
      cleanedBody = ultraFastProcessParams(request, this.model);
    } else {
      // Standard fast path with provider translation
      const modelParams = this.getProviderParams(request.stream || false, 'chat');
      cleanedBody = fastProcessParams(request, this.model, modelParams);
    }

    const startTime = Date.now();

    // Calculate timeout considering request context
    const timeoutMs = this.calculateRequestTimeout(providerConfig.timeout, requestContext);
    
    // Create timeout signal considering request deadline
    const { signal } = requestContext 
      ? TimeoutUtils.createDeadlineSignal(timeoutMs, requestContext)
      : { signal: AbortSignal.timeout(timeoutMs) };

    try {
      const response = await fetch(`${this.model.apiBase}/v1/chat/completions`, {
        method: 'POST',
        headers,
        body: JSON.stringify(cleanedBody),
        signal,
      });

      // Update health metrics
      this.model.responseTime = Date.now() - startTime;
      this.model.isHealthy = response.ok;
      this.model.lastHealthCheck = new Date();

      if (!response.ok) {
        const errorText = await response.text();
        const classification = classifyHttpError(response.status);

        log.error(
          new Error(`${response.status}: ${errorText}`),
          `Chat completion failed for model ${this.model.name}: status=${response.status}, provider=${this.model.provider}, classification=${classification}, error=${errorText}`
        );

        // Throw specific error types based on status code
        if (response.status === 404) {
          throw new ProviderNotFoundError(this.model.name, this.model.apiBase);
        } else if (response.status === 401 || response.status === 403) {
          throw new ProviderAuthenticationError(this.model.name);
        } else {
          throw new ProviderError(
            `API request failed: ${response.status} - ${errorText}`,
            'api_request_failed',
            response.status,
            classification !== 'not_found' && classification !== 'authentication'
          );
        }
      }

      return response;
    } catch (error) {
      this.model.responseTime = Date.now() - startTime;
      this.model.isHealthy = false;
      this.model.lastHealthCheck = new Date();

      // Handle timeout errors with context information
      if (error instanceof Error && (error.message.includes('timeout') || error.message.includes('aborted'))) {
        const timeoutError = requestContext 
          ? TimeoutUtils.createTimeoutError(requestContext, `Chat completion for model ${this.model.name}`)
          : new ProviderTimeoutError(this.model.name, timeoutMs);
        
        log.error(timeoutError, `Request timeout for model ${this.model.name}`);
        throw timeoutError;
      }

      log.error(
        error instanceof Error ? error : new Error(String(error)),
        `Request error for model ${this.model.name}`
      );
      throw error;
    }
  }

  async healthCheck(): Promise<boolean> {
    const providerConfig = getProviderConfig(this.model.provider);
    if (!providerConfig) {
      return false;
    }

    const startTime = Date.now();

    try {
      let endpoint: string;
      let method: string;
      let body: string | undefined;

      // Use different health check methods for different providers
      if (this.model.healthCheckParams || this.model.providerParams) {
        // Use chat completion with provider-specific parameters
        endpoint = `${this.model.apiBase}/v1/chat/completions`;
        method = 'POST';

        const healthCheckRequest = {
          model: this.model.modelName,
          messages: [{ role: 'user', content: 'ping' }],
          max_tokens: 1,
          temperature: 0.7,
          // Apply provider-specific params (health checks are non-streaming)
          ...this.getProviderParams(false, 'health-check'),
        };

        body = JSON.stringify(healthCheckRequest);
      } else {
        // Other providers use /v1/models endpoint
        endpoint = `${this.model.apiBase}/v1/models`;
        method = 'GET';
      }

      const response = await fetch(endpoint, {
        method,
        headers: {
          'Content-Type': 'application/json',
          [providerConfig.authHeader]: `${providerConfig.authPrefix}${this.model.apiKey}`,
        },
        body,
        signal: AbortSignal.timeout(5000),
      });

      this.model.isHealthy = response.ok;
      this.model.responseTime = Date.now() - startTime;
      this.model.lastHealthCheck = new Date();

      if (!response.ok) {
        const errorText = await response.text();
        const classification = classifyHttpError(response.status);

        log.warn(
          `Health check failed for model ${this.model.name}: ${response.status} - ${errorText} (${classification})`
        );

        // For immediate failure conditions (404, 401, 403), throw an error
        // to ensure the circuit breaker is triggered immediately
        if (shouldTripImmediately(classification)) {
          if (response.status === 404) {
            throw new ProviderNotFoundError(this.model.name, endpoint);
          } else if (response.status === 401 || response.status === 403) {
            throw new ProviderAuthenticationError(this.model.name);
          }
        }
      }

      return response.ok;
    } catch (error) {
      this.model.responseTime = Date.now() - startTime;
      this.model.isHealthy = false;
      this.model.lastHealthCheck = new Date();

      // Re-throw specific error types to ensure proper circuit breaker handling
      if (error instanceof ProviderNotFoundError || error instanceof ProviderAuthenticationError) {
        throw error;
      }

      // Handle timeout errors
      if (
        error instanceof Error &&
        (error.message.includes('timeout') || error.message.includes('aborted'))
      ) {
        throw new ProviderTimeoutError(this.model.name, 5000);
      }

      log.error(
        error instanceof Error ? error : new Error(String(error)),
        `Health check error for model ${this.model.name}`
      );
      return false;
    }
  }
}
