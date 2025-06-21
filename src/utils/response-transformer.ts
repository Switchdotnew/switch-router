/**
 * Response transformation utilities for provider compatibility
 */

interface VLLMResponse {
  choices: Array<{
    message?: {
      content: string;
      reasoning_content?: string;
      role: string;
    };
    delta?: {
      content?: string;
      reasoning_content?: string;
      role?: string;
    };
    finish_reason?: string;
    index: number;
  }>;
  model: string;
  object: string;
  usage?: {
    completion_tokens: number;
    prompt_tokens: number;
    total_tokens: number;
  };
}

interface StandardResponse {
  choices: Array<{
    message?: {
      content: string;
      role: string;
      reasoningContent?: string; // Convert to camelCase
    };
    delta?: {
      content?: string;
      role?: string;
      reasoningContent?: string; // Convert to camelCase
    };
    finish_reason?: string;
    index: number;
  }>;
  model: string;
  object: string;
  usage?: {
    completion_tokens: number;
    prompt_tokens: number;
    total_tokens: number;
  };
  _metadata?: {
    originalResponse?: unknown;
    hasReasoningContent?: boolean;
  };
}

/**
 * Transform vLLM response to standard format
 */
export function transformVLLMResponse(response: VLLMResponse): StandardResponse {
  const hasReasoningContent = response.choices.some(
    (choice) => choice.message?.reasoning_content || choice.delta?.reasoning_content
  );

  const transformedChoices = response.choices.map((choice) => {
    const transformedChoice: StandardResponse['choices'][0] = {
      ...choice,
    };

    // Transform message if present
    if (choice.message) {
      transformedChoice.message = {
        content: choice.message.content,
        role: choice.message.role,
      };

      // Add reasoning content in camelCase if present
      if (choice.message.reasoning_content) {
        transformedChoice.message.reasoningContent = choice.message.reasoning_content;
      }
    }

    // Transform delta if present (for streaming)
    if (choice.delta) {
      transformedChoice.delta = {
        content: choice.delta.content,
        role: choice.delta.role,
      };

      // Add reasoning content in camelCase if present
      if (choice.delta.reasoning_content) {
        transformedChoice.delta.reasoningContent = choice.delta.reasoning_content;
      }
    }

    return transformedChoice;
  });

  return {
    ...response,
    choices: transformedChoices,
    _metadata: {
      originalResponse: response,
      hasReasoningContent,
    },
  };
}

/**
 * Check if response appears to be from vLLM (has reasoning_content)
 */
export function isVLLMResponse(response: unknown): response is VLLMResponse {
  if (typeof response !== 'object' || !response || !('choices' in response)) {
    return false;
  }

  const choices = (response as { choices?: unknown }).choices;
  if (!Array.isArray(choices)) {
    return false;
  }

  return choices.some(
    (choice) =>
      choice?.message?.reasoning_content !== undefined ||
      choice?.delta?.reasoning_content !== undefined
  );
}

/**
 * Transform response based on provider type
 */
export function transformProviderResponse(
  response: unknown,
  _provider: string
): StandardResponse | unknown {
  // Check if this looks like a vLLM response
  if (isVLLMResponse(response)) {
    return transformVLLMResponse(response);
  }

  // For other providers, return as-is
  return response;
}
