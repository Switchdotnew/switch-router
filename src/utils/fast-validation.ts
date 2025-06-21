/**
 * High-performance validation for chat completion requests
 * Optimised for snake_case parameters and minimal overhead
 */

export interface FastValidationResult {
  valid: boolean;
  error?: string;
}

export interface ValidatedChatRequest {
  model: string;
  messages: Array<{ role: string; content: string }>;
  max_tokens?: number;
  temperature?: number;
  top_p?: number;
  top_k?: number;
  frequency_penalty?: number;
  presence_penalty?: number;
  stop?: string | string[];
  stream?: boolean;
  logprobs?: number;
  echo?: boolean;
  best_of?: number;
  logit_bias?: Record<string, number>;
  user?: string;
  n?: number;
  seed?: number;
  use_beam_search?: boolean;
  early_stopping?: boolean;
  ignore_eos?: boolean;
  min_p?: number;
  repetition_penalty?: number;
  length_penalty?: number;
  include_stop_str_in_output?: boolean;
  enable_thinking?: boolean;
  fallback_model?: string;
  response_format?: { type: string };
  provider_params?: Record<string, unknown>;
}

/**
 * Fast validation for chat completion requests
 * Uses manual validation instead of Zod for 5-10x performance improvement
 */
export function fastValidateChatRequest(
  body: unknown
): FastValidationResult & { data?: ValidatedChatRequest } {
  // Basic type check
  if (!body || typeof body !== 'object') {
    return { valid: false, error: 'Request body must be an object' };
  }

  const req = body as Record<string, unknown>;

  // Required fields
  if (!req.model || typeof req.model !== 'string') {
    return { valid: false, error: 'model is required and must be a string' };
  }

  if (!Array.isArray(req.messages)) {
    return { valid: false, error: 'messages is required and must be an array' };
  }

  // Validate messages array
  for (let i = 0; i < req.messages.length; i++) {
    const msg = req.messages[i];
    if (!msg || typeof msg !== 'object') {
      return { valid: false, error: `messages[${i}] must be an object` };
    }
    const msgObj = msg as Record<string, unknown>;
    if (!msgObj.role || typeof msgObj.role !== 'string') {
      return { valid: false, error: `messages[${i}].role is required and must be a string` };
    }
    if (!msgObj.content || typeof msgObj.content !== 'string') {
      return { valid: false, error: `messages[${i}].content is required and must be a string` };
    }
    // Validate role values
    if (!['system', 'user', 'assistant', 'tool'].includes(msgObj.role)) {
      return {
        valid: false,
        error: `messages[${i}].role must be one of: system, user, assistant, tool`,
      };
    }
  }

  // Optional numeric parameters with bounds (matching Zod schema exactly)
  const numericChecks = [
    { field: 'temperature', min: 0, max: 2 },
    { field: 'top_p', min: 0, max: 1 },
    { field: 'frequency_penalty', min: -2, max: 2 },
    { field: 'presence_penalty', min: -2, max: 2 },
  ];

  // Numeric fields without bounds in Zod schema
  const unboundedNumericFields = [
    'max_tokens',
    'top_k',
    'logprobs',
    'best_of',
    'n',
    'seed',
    'min_p',
    'repetition_penalty',
    'length_penalty',
  ];

  // Check bounded numeric fields
  for (const check of numericChecks) {
    const value = req[check.field];
    if (value !== undefined) {
      if (typeof value !== 'number' || isNaN(value)) {
        return { valid: false, error: `${check.field} must be a number` };
      }
      if (value < check.min || value > check.max) {
        return {
          valid: false,
          error: `${check.field} must be between ${check.min} and ${check.max}`,
        };
      }
    }
  }

  // Check unbounded numeric fields (just type validation)
  for (const field of unboundedNumericFields) {
    const value = req[field];
    if (value !== undefined) {
      if (typeof value !== 'number' || isNaN(value)) {
        return { valid: false, error: `${field} must be a number` };
      }
    }
  }

  // Boolean parameters
  const booleanFields = [
    'stream',
    'echo',
    'use_beam_search',
    'early_stopping',
    'ignore_eos',
    'include_stop_str_in_output',
    'enable_thinking',
  ];

  for (const field of booleanFields) {
    const value = req[field];
    if (value !== undefined && typeof value !== 'boolean') {
      return { valid: false, error: `${field} must be a boolean` };
    }
  }

  // String parameters
  const stringFields = ['user', 'fallback_model'];
  for (const field of stringFields) {
    const value = req[field];
    if (value !== undefined && typeof value !== 'string') {
      return { valid: false, error: `${field} must be a string` };
    }
  }

  // Stop parameter validation
  if (req.stop !== undefined) {
    if (typeof req.stop !== 'string' && !Array.isArray(req.stop)) {
      return { valid: false, error: 'stop must be a string or array of strings' };
    }
    if (Array.isArray(req.stop)) {
      for (let i = 0; i < req.stop.length; i++) {
        if (typeof req.stop[i] !== 'string') {
          return { valid: false, error: `stop[${i}] must be a string` };
        }
      }
    }
  }

  // logit_bias validation
  if (req.logit_bias !== undefined) {
    if (!req.logit_bias || typeof req.logit_bias !== 'object') {
      return { valid: false, error: 'logit_bias must be an object' };
    }
    const logitBias = req.logit_bias as Record<string, unknown>;
    for (const [key, value] of Object.entries(logitBias)) {
      if (typeof value !== 'number') {
        return { valid: false, error: `logit_bias.${key} must be a number` };
      }
    }
  }

  // response_format validation
  if (req.response_format !== undefined) {
    if (!req.response_format || typeof req.response_format !== 'object') {
      return { valid: false, error: 'response_format must be an object' };
    }
    const responseFormat = req.response_format as Record<string, unknown>;
    if (!responseFormat.type || typeof responseFormat.type !== 'string') {
      return { valid: false, error: 'response_format.type is required and must be a string' };
    }
    if (!['text', 'json_object'].includes(responseFormat.type)) {
      return { valid: false, error: 'response_format.type must be either "text" or "json_object"' };
    }
  }

  // provider_params validation (basic object check)
  if (req.provider_params !== undefined) {
    if (!req.provider_params || typeof req.provider_params !== 'object') {
      return { valid: false, error: 'provider_params must be an object' };
    }
  }

  return {
    valid: true,
    data: req as unknown as ValidatedChatRequest,
  };
}

/**
 * Check if fast validation should be used based on performance configuration
 */
export function shouldUseFastValidation(performanceConfig?: {
  lightweight_validation?: boolean;
}): boolean {
  return performanceConfig?.lightweight_validation === true;
}
