import { describe, test, expect } from 'bun:test';
import { fastProcessParams, ultraFastProcessParams, canUseUltraFast } from '../fast-params.js';

describe('Fast Parameter Processing', () => {
  const mockModel = {
    modelName: 'test-model',
    provider: 'runpod',
    maxTokens: 1000,
    temperature: 0.7,
  };

  const mockModelParams = {
    model: 'base-model',
    some_provider_param: 'base_value',
  };

  describe('Fast Parameter Processing', () => {
    test('should process basic chat request with snake_case parameters', () => {
      const request = {
        model: 'user-model',
        messages: [{ role: 'user', content: 'Hello' }],
        max_tokens: 500,
        temperature: 0.8,
        top_p: 0.9,
        stream: true,
      };

      const result = fastProcessParams(request, mockModel, mockModelParams);

      expect(result.model).toBe('test-model'); // Should use model.modelName
      expect(result.max_tokens).toBe(500); // Should use request value
      expect(result.temperature).toBe(0.8); // Should use request value
      expect(result.top_p).toBe(0.9);
      expect(result.stream).toBe(true);
      expect(result.messages).toEqual(request.messages);
    });

    test('should apply model defaults when request values missing', () => {
      const request = {
        model: 'user-model',
        messages: [{ role: 'user', content: 'Hello' }],
      };

      const result = fastProcessParams(request, mockModel, mockModelParams);

      expect(result.max_tokens).toBe(1000); // Should use model default
      expect(result.temperature).toBe(0.7); // Should use model default
      expect(result.stream).toBe(false); // Should default to false
    });

    test('should handle provider_params correctly', () => {
      const request = {
        model: 'user-model',
        messages: [{ role: 'user', content: 'Hello' }],
        provider_params: {
          custom_param: 'custom_value',
          enable_thinking: true,
        },
      };

      const result = fastProcessParams(request, mockModel, mockModelParams);

      // Should include translated provider params
      expect(result).toHaveProperty('custom_param');
      expect(result).toHaveProperty('enable_thinking');
    });

    test('should not include undefined parameters', () => {
      const request = {
        model: 'user-model',
        messages: [{ role: 'user', content: 'Hello' }],
        max_tokens: undefined,
        temperature: undefined,
      };

      const result = fastProcessParams(request, mockModel, mockModelParams);

      // Should use model defaults, not undefined
      expect(result.max_tokens).toBe(1000);
      expect(result.temperature).toBe(0.7);
    });
  });

  describe('Ultra-Fast Parameter Processing', () => {
    test('should process request with minimal overhead', () => {
      const request = {
        model: 'user-model',
        messages: [{ role: 'user', content: 'Hello' }],
        max_tokens: 500,
        temperature: 0.8,
        provider_params: { custom: 'value' },
      };

      const result = ultraFastProcessParams(request, mockModel);

      expect(result.model).toBe('test-model');
      expect(result.max_tokens).toBe(500);
      expect(result.temperature).toBe(0.8);
      expect(result.custom).toBe('value'); // Should merge provider_params
      expect(result.messages).toEqual(request.messages);
    });

    test('should handle missing optional parameters', () => {
      const request = {
        model: 'user-model',
        messages: [{ role: 'user', content: 'Hello' }],
      };

      const result = ultraFastProcessParams(request, mockModel);

      expect(result.max_tokens).toBe(1000);
      expect(result.temperature).toBe(0.7);
      expect(result.stream).toBe(false);
    });

    test('should only include defined parameters', () => {
      const request = {
        model: 'user-model',
        messages: [{ role: 'user', content: 'Hello' }],
        top_p: 0.9,
        frequency_penalty: undefined,
      };

      const result = ultraFastProcessParams(request, mockModel);

      expect(result).toHaveProperty('top_p');
      expect(result).not.toHaveProperty('frequency_penalty');
    });
  });

  describe('Performance Mode Detection', () => {
    test('should enable ultra-fast mode for high_throughput', () => {
      const config = { mode: 'high_throughput' };
      expect(canUseUltraFast(config)).toBe(true);
    });

    test('should disable ultra-fast mode for standard', () => {
      const config = { mode: 'standard' };
      expect(canUseUltraFast(config)).toBe(false);
    });

    test('should handle undefined config', () => {
      expect(canUseUltraFast(undefined)).toBe(false);
    });
  });
});
