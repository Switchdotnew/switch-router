import { Domains } from '../../types/index.js';

// Re-export types for backward compatibility
export type ChatMessage = Domains.IChatMessage;
export type ChatCompletionRequest = Domains.IChatCompletionRequest;
export type ChatCompletionResponse = Domains.IChatCompletionResponse;
export type CompletionRequest = Domains.ICompletionRequest;
export type CompletionResponse = Domains.ICompletionResponse;
export type ProviderConfig = Domains.IProviderConfig;
export type ProviderCapabilities = Domains.IProviderCapabilities;
export type ProviderMetrics = Domains.IProviderMetrics;
export type ProviderHealthStatus = Domains.IProviderHealthStatus;
export type ProviderError = Domains.ProviderError;

// Export the base provider abstract class for use by provider implementations
export const BaseProvider = Domains.IBaseProvider;
