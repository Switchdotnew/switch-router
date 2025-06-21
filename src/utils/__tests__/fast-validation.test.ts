import { describe, test, expect } from 'bun:test';
import { fastValidateChatRequest, shouldUseFastValidation } from '../fast-validation.js';

describe('Fast Validation', () => {
  describe('Chat Request Validation', () => {
    test('should validate valid chat request with snake_case parameters', () => {
      const validRequest = {
        model: 'qwen3',
        messages: [{ role: 'user', content: 'Hello, world!' }],
        max_tokens: 100,
        temperature: 0.7,
        top_p: 0.9,
        frequency_penalty: 0.1,
        presence_penalty: 0.1,
        stream: false,
        enable_thinking: true,
        provider_params: { custom_param: 'value' },
      };

      const result = fastValidateChatRequest(validRequest);
      expect(result.valid).toBe(true);
      expect(result.data).toBeDefined();
      expect(result.data?.model).toBe('qwen3');
      expect(result.data?.max_tokens).toBe(100);
      expect(result.data?.enable_thinking).toBe(true);
    });

    test('should reject request with missing model', () => {
      const invalidRequest = {
        messages: [{ role: 'user', content: 'Hello, world!' }],
      };

      const result = fastValidateChatRequest(invalidRequest);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('model is required');
    });

    test('should reject request with missing messages', () => {
      const invalidRequest = {
        model: 'qwen3',
      };

      const result = fastValidateChatRequest(invalidRequest);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('messages is required');
    });

    test('should validate temperature bounds', () => {
      const invalidRequest = {
        model: 'qwen3',
        messages: [{ role: 'user', content: 'Hello' }],
        temperature: 3.0,
      };

      const result = fastValidateChatRequest(invalidRequest);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('temperature must be between 0 and 2');
    });

    test('should validate message roles', () => {
      const invalidRequest = {
        model: 'qwen3',
        messages: [{ role: 'invalid_role', content: 'Hello' }],
      };

      const result = fastValidateChatRequest(invalidRequest);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('role must be one of');
    });

    test('should validate response_format', () => {
      const validRequest = {
        model: 'qwen3',
        messages: [{ role: 'user', content: 'Hello' }],
        response_format: { type: 'json_object' },
      };

      const result = fastValidateChatRequest(validRequest);
      expect(result.valid).toBe(true);
    });

    test('should reject invalid response_format type', () => {
      const invalidRequest = {
        model: 'qwen3',
        messages: [{ role: 'user', content: 'Hello' }],
        response_format: { type: 'invalid_format' },
      };

      const result = fastValidateChatRequest(invalidRequest);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('response_format.type must be either');
    });

    test('should validate all numeric parameter bounds', () => {
      const testCases = [
        { field: 'max_tokens', value: -1, shouldFail: false }, // max_tokens has no bounds in Zod schema
        { field: 'max_tokens', value: 1000, shouldFail: false },
        { field: 'top_p', value: 1.5, shouldFail: true },
        { field: 'top_p', value: 0.9, shouldFail: false },
        { field: 'frequency_penalty', value: -3, shouldFail: true },
        { field: 'frequency_penalty', value: 1.5, shouldFail: false },
      ];

      for (const testCase of testCases) {
        const request = {
          model: 'qwen3',
          messages: [{ role: 'user', content: 'Hello' }],
          [testCase.field]: testCase.value,
        };

        const result = fastValidateChatRequest(request);
        if (testCase.shouldFail) {
          expect(result.valid).toBe(false);
          expect(result.error).toContain(testCase.field);
        } else {
          expect(result.valid).toBe(true);
        }
      }
    });
  });

  describe('Performance Config Detection', () => {
    test('should enable fast validation when configured', () => {
      const config = { lightweight_validation: true };
      expect(shouldUseFastValidation(config)).toBe(true);
    });

    test('should disable fast validation by default', () => {
      const config = { lightweight_validation: false };
      expect(shouldUseFastValidation(config)).toBe(false);
    });

    test('should handle undefined config', () => {
      expect(shouldUseFastValidation(undefined)).toBe(false);
    });
  });
});
