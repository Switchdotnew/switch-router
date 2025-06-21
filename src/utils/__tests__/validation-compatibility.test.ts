import { describe, test, expect } from 'bun:test';
import { fastValidateChatRequest } from '../fast-validation.js';
import { chatCompletionRequestSchema } from '../../types/public/requests/chat.js';

describe('Validation Compatibility', () => {
  describe('Fast Validation vs Zod Validation', () => {
    const testCases = [
      // Valid requests
      {
        name: 'basic valid request',
        data: {
          model: 'qwen3',
          messages: [{ role: 'user', content: 'Hello, world!' }],
          max_tokens: 100,
          temperature: 0.7,
          stream: false,
        },
        shouldBeValid: true,
      },
      {
        name: 'request with all snake_case parameters',
        data: {
          model: 'qwen3',
          messages: [{ role: 'user', content: 'Hello' }],
          max_tokens: 100,
          temperature: 0.7,
          top_p: 0.9,
          top_k: 40,
          frequency_penalty: 0.1,
          presence_penalty: 0.1,
          stop: ['\\n', 'END'],
          stream: true,
          logprobs: 5,
          echo: false,
          best_of: 1,
          logit_bias: { '123': 0.5 },
          user: 'test-user',
          n: 1,
          seed: 42,
          use_beam_search: false,
          early_stopping: true,
          ignore_eos: false,
          min_p: 0.1,
          repetition_penalty: 1.1,
          length_penalty: 1.0,
          include_stop_str_in_output: false,
          enable_thinking: true,
          fallback_model: 'backup-model',
          response_format: { type: 'json_object' },
          provider_params: { custom_param: 'value' },
        },
        shouldBeValid: true,
      },
      // Invalid requests
      {
        name: 'missing model',
        data: {
          messages: [{ role: 'user', content: 'Hello' }],
        },
        shouldBeValid: false,
      },
      {
        name: 'missing messages',
        data: {
          model: 'qwen3',
        },
        shouldBeValid: false,
      },
      {
        name: 'invalid temperature',
        data: {
          model: 'qwen3',
          messages: [{ role: 'user', content: 'Hello' }],
          temperature: 3.0,
        },
        shouldBeValid: false,
      },
      {
        name: 'invalid message role',
        data: {
          model: 'qwen3',
          messages: [{ role: 'invalid_role', content: 'Hello' }],
        },
        shouldBeValid: false,
      },
      {
        name: 'invalid response_format type',
        data: {
          model: 'qwen3',
          messages: [{ role: 'user', content: 'Hello' }],
          response_format: { type: 'invalid_format' },
        },
        shouldBeValid: false,
      },
    ];

    for (const testCase of testCases) {
      test(`should handle ${testCase.name} consistently`, () => {
        // Test with fast validation
        const fastResult = fastValidateChatRequest(testCase.data);

        // Test with Zod validation
        const zodResult = chatCompletionRequestSchema.safeParse(testCase.data);

        // Both should agree on validity
        expect(fastResult.valid).toBe(zodResult.success);

        if (testCase.shouldBeValid) {
          expect(fastResult.valid).toBe(true);
          expect(zodResult.success).toBe(true);

          // If valid, both should produce data
          expect(fastResult.data).toBeDefined();
          expect(zodResult.data).toBeDefined();

          // Key fields should match
          if (fastResult.data && zodResult.data) {
            expect(fastResult.data.model).toBe(zodResult.data.model);
            expect(fastResult.data.messages).toEqual(zodResult.data.messages);
          }
        } else {
          expect(fastResult.valid).toBe(false);
          expect(zodResult.success).toBe(false);

          // Both should provide error information
          expect(fastResult.error).toBeDefined();
          expect(zodResult.error).toBeDefined();
        }
      });
    }

    test('should handle edge cases consistently', () => {
      const edgeCases = [
        null,
        undefined,
        {},
        { model: '' },
        { model: 123 },
        { messages: null },
        { messages: [] },
        { messages: 'invalid' },
      ];

      for (const edgeCase of edgeCases) {
        const fastResult = fastValidateChatRequest(edgeCase);
        const zodResult = chatCompletionRequestSchema.safeParse(edgeCase);

        // Both should reject these edge cases
        expect(fastResult.valid).toBe(false);
        expect(zodResult.success).toBe(false);
      }
    });

    test('should validate numeric bounds consistently', () => {
      const numericTests = [
        { field: 'max_tokens', valid: [0, 1, 1000, 50000], invalid: ['not_a_number'] },
        { field: 'temperature', valid: [0, 1, 2], invalid: [-0.1, 2.1, 'not_a_number'] },
        { field: 'top_p', valid: [0, 0.5, 1], invalid: [-0.1, 1.1, 'not_a_number'] },
        { field: 'frequency_penalty', valid: [-2, 0, 2], invalid: [-2.1, 2.1, 'not_a_number'] },
        { field: 'presence_penalty', valid: [-2, 0, 2], invalid: [-2.1, 2.1, 'not_a_number'] },
      ];

      for (const test of numericTests) {
        // Test valid values
        for (const validValue of test.valid) {
          const request = {
            model: 'qwen3',
            messages: [{ role: 'user', content: 'Hello' }],
            [test.field]: validValue,
          };

          const fastResult = fastValidateChatRequest(request);
          const zodResult = chatCompletionRequestSchema.safeParse(request);

          expect(fastResult.valid).toBe(true);
          expect(zodResult.success).toBe(true);
        }

        // Test invalid values
        for (const invalidValue of test.invalid) {
          const request = {
            model: 'qwen3',
            messages: [{ role: 'user', content: 'Hello' }],
            [test.field]: invalidValue,
          };

          const fastResult = fastValidateChatRequest(request);
          const zodResult = chatCompletionRequestSchema.safeParse(request);

          expect(fastResult.valid).toBe(false);
          expect(zodResult.success).toBe(false);
        }
      }
    });
  });
});
