/**
 * Performance-optimised parameter processing for high-throughput scenarios
 * Minimises object copying and deep merging overhead
 */

import type { ChatCompletionRequest } from '../types/index.js';
import { getParameterTranslator } from './parameter-translator.js';

/**
 * Fast parameter processing that avoids deep merging for simple cases
 */
export function fastProcessParams(
  request: ChatCompletionRequest,
  model: {
    modelName: string;
    provider: string;
    maxTokens: number;
    temperature: number;
  },
  modelParams: Record<string, unknown>
): Record<string, unknown> {
  // Get parameter translator for this provider
  const translateParams = getParameterTranslator(model.provider);

  // Create enhanced request with model defaults (minimal object creation)
  const enhancedRequest: ChatCompletionRequest = {
    model: model.modelName,
    messages: request.messages,
    max_tokens: request.max_tokens || model.maxTokens,
    temperature: request.temperature ?? model.temperature,
    stream: request.stream || false,
  };

  // Only add optional parameters if they exist (avoid undefined pollution)
  if (request.top_p !== undefined) enhancedRequest.top_p = request.top_p;
  if (request.top_k !== undefined) enhancedRequest.top_k = request.top_k;
  if (request.frequency_penalty !== undefined)
    enhancedRequest.frequency_penalty = request.frequency_penalty;
  if (request.presence_penalty !== undefined)
    enhancedRequest.presence_penalty = request.presence_penalty;
  if (request.stop !== undefined) enhancedRequest.stop = request.stop;
  if (request.logprobs !== undefined) enhancedRequest.logprobs = request.logprobs;
  if (request.echo !== undefined) enhancedRequest.echo = request.echo;
  if (request.best_of !== undefined) enhancedRequest.best_of = request.best_of;
  if (request.logit_bias !== undefined) enhancedRequest.logit_bias = request.logit_bias;
  if (request.user !== undefined) enhancedRequest.user = request.user;
  if (request.n !== undefined) enhancedRequest.n = request.n;
  if (request.seed !== undefined) enhancedRequest.seed = request.seed;
  if (request.use_beam_search !== undefined)
    enhancedRequest.use_beam_search = request.use_beam_search;
  if (request.early_stopping !== undefined) enhancedRequest.early_stopping = request.early_stopping;
  if (request.ignore_eos !== undefined) enhancedRequest.ignore_eos = request.ignore_eos;
  if (request.min_p !== undefined) enhancedRequest.min_p = request.min_p;
  if (request.repetition_penalty !== undefined)
    enhancedRequest.repetition_penalty = request.repetition_penalty;
  if (request.length_penalty !== undefined) enhancedRequest.length_penalty = request.length_penalty;
  if (request.include_stop_str_in_output !== undefined)
    enhancedRequest.include_stop_str_in_output = request.include_stop_str_in_output;
  if (request.enable_thinking !== undefined)
    enhancedRequest.enable_thinking = request.enable_thinking;
  if (request.fallback_model !== undefined) enhancedRequest.fallback_model = request.fallback_model;
  if (request.response_format !== undefined)
    enhancedRequest.response_format = request.response_format;
  if (request.provider_params !== undefined)
    enhancedRequest.provider_params = request.provider_params;

  // Translate parameters for the provider
  const translatedParams = translateParams(enhancedRequest);

  // Fast merge: start with model params, override with translated params
  const result: Record<string, unknown> = { ...modelParams };

  // Override with translated parameters (avoiding deep merge for performance)
  for (const [key, value] of Object.entries(translatedParams)) {
    if (value !== undefined) {
      result[key] = value;
    }
  }

  return result;
}

/**
 * Ultra-fast parameter processing for cases where we don't need provider-specific translation
 * Used when circuit breaker is disabled and we want maximum performance
 */
export function ultraFastProcessParams(
  request: ChatCompletionRequest,
  model: {
    modelName: string;
    maxTokens: number;
    temperature: number;
  }
): Record<string, unknown> {
  // Minimal object creation - only essential parameters
  const result: Record<string, unknown> = {
    model: model.modelName,
    messages: request.messages,
    max_tokens: request.max_tokens || model.maxTokens,
    temperature: request.temperature ?? model.temperature,
    stream: request.stream || false,
  };

  // Add only defined optional parameters
  if (request.top_p !== undefined) result.top_p = request.top_p;
  if (request.frequency_penalty !== undefined) result.frequency_penalty = request.frequency_penalty;
  if (request.presence_penalty !== undefined) result.presence_penalty = request.presence_penalty;
  if (request.stop !== undefined) result.stop = request.stop;
  if (request.provider_params !== undefined) {
    // Shallow merge provider params
    Object.assign(result, request.provider_params);
  }

  return result;
}

/**
 * Check if ultra-fast processing can be used
 */
export function canUseUltraFast(performanceConfig?: { mode?: string }): boolean {
  return performanceConfig?.mode === 'high_throughput';
}
