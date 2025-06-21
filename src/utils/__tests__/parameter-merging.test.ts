import { describe, test, expect } from 'bun:test';

// Test the deep merge functionality used in openai-client.ts
function deepMergeParams(
  base: Record<string, unknown>,
  override: Record<string, unknown>
): Record<string, unknown> {
  const result = { ...base };

  for (const [key, value] of Object.entries(override)) {
    if (value !== undefined) {
      if (
        typeof value === 'object' &&
        value !== null &&
        !Array.isArray(value) &&
        typeof result[key] === 'object' &&
        result[key] !== null &&
        !Array.isArray(result[key])
      ) {
        // Recursively merge nested objects
        result[key] = deepMergeParams(
          result[key] as Record<string, unknown>,
          value as Record<string, unknown>
        );
      } else {
        // Override primitive values and arrays
        result[key] = value;
      }
    }
  }

  return result;
}

describe('Parameter Merging for LLM Requests', () => {
  test('should prioritise user enable_thinking over model defaults', () => {
    const modelParams = {
      enable_thinking: false, // Model default that should be overridden
      temperature: 0.7,
    };

    const userParams = {
      temperature: 0.5, // User override
      chat_template_kwargs: {
        enable_thinking: true, // User's enable_thinking: true
      },
    };

    const result = deepMergeParams(modelParams, userParams);

    expect(result.temperature).toBe(0.5); // User temperature wins
    expect(result.enable_thinking).toBe(false); // Model default remains
    expect((result.chat_template_kwargs as any).enable_thinking).toBe(true); // User enable_thinking wins
  });

  test('should handle enable_thinking: false correctly', () => {
    const modelParams = {
      enable_thinking: true, // Model default
      some_other_param: 'model_value',
      chat_template_kwargs: {
        some_model_setting: true,
      },
    };

    const userParams = {
      chat_template_kwargs: {
        enable_thinking: false, // User explicitly wants thinking disabled
      },
    };

    const result = deepMergeParams(modelParams, userParams);

    expect(result.enable_thinking).toBe(true); // Model default remains
    expect((result.chat_template_kwargs as any).enable_thinking).toBe(false); // User choice respected
    expect((result.chat_template_kwargs as any).some_model_setting).toBe(true); // Model settings preserved
  });

  test('should handle nested parameter merging correctly', () => {
    const modelParams = {
      param1: 'model_default',
      nested: {
        a: 'model_a',
        b: 'model_b',
        deep: {
          x: 'model_x',
          y: 'model_y',
        },
      },
    };

    const userParams = {
      param1: 'user_override',
      nested: {
        b: 'user_b', // Override model_b
        c: 'user_c', // New parameter
        deep: {
          y: 'user_y', // Override model_y
          // x should remain model_x
        },
      },
    };

    const result = deepMergeParams(modelParams, userParams);

    expect(result.param1).toBe('user_override');
    expect((result.nested as any).a).toBe('model_a'); // Preserved
    expect((result.nested as any).b).toBe('user_b'); // Overridden
    expect((result.nested as any).c).toBe('user_c'); // Added
    expect((result.nested as any).deep.x).toBe('model_x'); // Preserved
    expect((result.nested as any).deep.y).toBe('user_y'); // Overridden
  });

  test('should handle undefined values correctly', () => {
    const modelParams = {
      param1: 'model_value',
      param2: 'another_value',
    };

    const userParams = {
      param1: 'user_value',
      param2: undefined, // Should not override
      param3: undefined, // Should not be added
    };

    const result = deepMergeParams(modelParams, userParams);

    expect(result.param1).toBe('user_value');
    expect(result.param2).toBe('another_value'); // Not overridden by undefined
    expect(result.param3).toBeUndefined(); // Not added
  });

  test('should handle arrays correctly (no deep merge for arrays)', () => {
    const modelParams = {
      array_param: ['model1', 'model2'],
    };

    const userParams = {
      array_param: ['user1'], // Should completely replace model array
    };

    const result = deepMergeParams(modelParams, userParams);

    expect(result.array_param).toEqual(['user1']); // Completely replaced
  });

  test('should handle complex provider params scenarios', () => {
    const modelParams = {
      temperature: 0.7,
      max_tokens: 1000,
      chat_template_kwargs: {
        enable_thinking: false,
        incremental_output: true,
        model_specific_setting: 'model_value',
      },
      provider_specific: {
        timeout: 30000,
        retries: 3,
      },
    };

    const userParams = {
      temperature: 0.9, // User override
      chat_template_kwargs: {
        enable_thinking: true, // User wants thinking enabled
        user_specific_setting: 'user_value',
      },
      provider_specific: {
        timeout: 60000, // User wants longer timeout
        // retries should remain 3
      },
      user_only_param: 'user_value',
    };

    const result = deepMergeParams(modelParams, userParams);

    expect(result.temperature).toBe(0.9);
    expect(result.max_tokens).toBe(1000);
    expect((result.chat_template_kwargs as any).enable_thinking).toBe(true); // User wins
    expect((result.chat_template_kwargs as any).incremental_output).toBe(true); // Preserved
    expect((result.chat_template_kwargs as any).model_specific_setting).toBe('model_value'); // Preserved
    expect((result.chat_template_kwargs as any).user_specific_setting).toBe('user_value'); // Added
    expect((result.provider_specific as any).timeout).toBe(60000); // User override
    expect((result.provider_specific as any).retries).toBe(3); // Preserved
    expect(result.user_only_param).toBe('user_value'); // Added
  });
});
