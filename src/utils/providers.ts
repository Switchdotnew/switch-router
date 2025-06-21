import { ProviderValues, type Provider } from '../types/shared/enums.js';
import type { Domains } from '../types/index.js';

export const providerConfigs: Record<string, Domains.IModelProviderTemplate> = {
  runpod: {
    name: ProviderValues.RUNPOD,
    authHeader: 'Authorization',
    authPrefix: 'Bearer ',
    supportsJsonMode: true,
    supportsStreaming: true,
    timeout: 30000,
    maxRetries: 3,
  },
  together: {
    name: ProviderValues.TOGETHER,
    defaultApiBase: 'https://api.together.xyz',
    authHeader: 'Authorization',
    authPrefix: 'Bearer ',
    supportsJsonMode: true,
    supportsStreaming: true,
    timeout: 30000,
    maxRetries: 3,
  },
  openai: {
    name: ProviderValues.OPENAI,
    defaultApiBase: 'https://api.openai.com',
    authHeader: 'Authorization',
    authPrefix: 'Bearer ',
    supportsJsonMode: true,
    supportsStreaming: true,
    timeout: 30000,
    maxRetries: 3,
  },
  anthropic: {
    name: ProviderValues.ANTHROPIC,
    defaultApiBase: 'https://api.anthropic.com',
    authHeader: 'x-api-key',
    authPrefix: '',
    supportsJsonMode: false,
    supportsStreaming: true,
    timeout: 45000,
    maxRetries: 3,
  },
  alibaba: {
    name: 'alibaba' as Provider,
    defaultApiBase: 'https://dashscope.aliyuncs.com',
    authHeader: 'Authorization',
    authPrefix: 'Bearer ',
    supportsJsonMode: true,
    supportsStreaming: true,
    timeout: 30000,
    maxRetries: 3,
  },
};

export function getProviderConfig(providerName: string): Domains.IModelProviderTemplate | null {
  return providerConfigs[providerName] || null;
}
