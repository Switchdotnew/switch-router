import { describe, test, expect } from 'bun:test';
import {
  chatCompletionRequestSchema,
  MessageRoleValues,
  ProviderValues,
  type ChatCompletionRequest,
  type Domains,
} from '../index.js';

describe('Types System', () => {
  test('should validate chat completion request', () => {
    const validRequest: ChatCompletionRequest = {
      model: 'qwen3',
      messages: [{ role: MessageRoleValues.USER, content: 'Hello, world!' }],
      maxTokens: 100,
      temperature: 0.7,
      stream: false,
    };

    const result = chatCompletionRequestSchema.safeParse(validRequest);
    expect(result.success).toBe(true);
  });

  test('should reject invalid chat completion request', () => {
    const invalidRequest = {
      model: 'qwen3',
      messages: [{ role: 'invalid_role', content: 'Hello, world!' }],
      temperature: 3.0, // Invalid: > 2.0
    };

    const result = chatCompletionRequestSchema.safeParse(invalidRequest);
    expect(result.success).toBe(false);
  });

  test('should provide type-safe enums', () => {
    expect(ProviderValues.RUNPOD).toBe(ProviderValues.RUNPOD);
    expect(ProviderValues.OPENAI).toBe(ProviderValues.OPENAI);
    expect(MessageRoleValues.USER).toBe(MessageRoleValues.USER);
    expect(MessageRoleValues.ASSISTANT).toBe(MessageRoleValues.ASSISTANT);

    // Test enum values
    expect(ProviderValues.RUNPOD).toBe('runpod');
    expect(ProviderValues.OPENAI).toBe('openai');
    expect(MessageRoleValues.USER).toBe('user');
    expect(MessageRoleValues.ASSISTANT).toBe('assistant');
  });

  test('should separate internal and external types', () => {
    // Internal domain type
    const modelDef: Domains.IModelDefinition = {
      name: 'test-model',
      providers: [
        {
          name: 'primary',
          provider: 'runpod',
          apiKey: 'test-key',
          apiBase: 'https://api.test.com',
          modelName: 'test/model',
          priority: 1,
          isHealthy: true,
          lastHealthCheck: new Date(),
          responseTime: 100,
        },
      ],
      temperature: 0.7,
      maxTokens: 4096,
      circuitBreaker: {
        enabled: true,
        failureThreshold: 5,
        resetTimeout: 60000,
        monitoringWindow: 300000,
        minRequestsThreshold: 10,
        errorThresholdPercentage: 50,
      },
    };

    expect(modelDef.name).toBe('test-model');
    expect(modelDef.providers[0].isHealthy).toBe(true);
  });
});
