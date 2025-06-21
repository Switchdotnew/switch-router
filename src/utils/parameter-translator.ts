import type { ChatCompletionRequest } from '../types/index.js';

/**
 * Parameter translation utilities for provider compatibility
 */

/**
 * No parameter conversion needed - all providers use snake_case
 * This module now simply handles provider-specific parameter logic
 */

/**
 * Parameters for vLLM and compatible providers (native snake_case, no translation needed)
 */
export function translateParametersForVLLM(
  request: ChatCompletionRequest
): Record<string, unknown> {
  const { provider_params, enable_thinking, ...standardParams } = request;

  // vLLM uses snake_case natively, so no translation needed for standard params
  const translatedParams: Record<string, unknown> = { ...standardParams };

  // Handle vLLM-specific thinking mode via chat_template_kwargs
  const providerParamsTyped = provider_params as Record<string, unknown> | undefined;
  if (enable_thinking !== undefined || providerParamsTyped?.chat_template_kwargs) {
    const chatTemplateKwargs: Record<string, unknown> = {
      ...((providerParamsTyped?.chat_template_kwargs as Record<string, unknown>) || {}),
    };

    // Add thinking mode if specified
    if (enable_thinking !== undefined) {
      chatTemplateKwargs.enable_thinking = enable_thinking;
    }

    translatedParams.chat_template_kwargs = chatTemplateKwargs;
  }

  // Add any additional provider-specific parameters
  if (providerParamsTyped) {
    // Exclude chat_template_kwargs since we handle it separately
    const otherProviderParams = { ...providerParamsTyped };
    delete otherProviderParams.chat_template_kwargs;

    // Provider params are already in snake_case, merge directly
    Object.assign(translatedParams, otherProviderParams);
  }

  return translatedParams;
}

/**
 * Parameters for OpenAI and compatible providers (native snake_case, no conversion needed)
 */
export function translateParametersForOpenAI(
  request: ChatCompletionRequest
): Record<string, unknown> {
  const { provider_params, ...standardParams } = request;

  // OpenAI uses snake_case natively, so no translation needed
  const translatedParams: Record<string, unknown> = { ...standardParams };

  if (provider_params) {
    // Provider params are already in snake_case, merge directly
    const providerParamsTyped = provider_params as Record<string, unknown>;
    Object.assign(translatedParams, providerParamsTyped);
  }

  return translatedParams;
}

/**
 * Get the appropriate parameter translator based on provider type
 */
export function getParameterTranslator(
  provider: string
): (request: ChatCompletionRequest) => Record<string, unknown> {
  switch (provider.toLowerCase()) {
    case 'runpod':
    case 'together':
    case 'alibaba':
    case 'custom':
      // These providers use vLLM or similar engines (native snake_case)
      return translateParametersForVLLM;

    case 'openai':
    case 'anthropic':
    case 'bedrock':
      // These providers need camelCase parameters
      return translateParametersForOpenAI;

    default:
      // Default to vLLM-style (most common in ecosystem)
      return translateParametersForVLLM;
  }
}

/**
 * Check if a provider likely uses vLLM-style parameters
 */
export function isVLLMCompatibleProvider(provider: string): boolean {
  const vllmProviders = ['runpod', 'together'];
  return vllmProviders.includes(provider.toLowerCase());
}
