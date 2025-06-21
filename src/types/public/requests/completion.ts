import { z } from 'zod';

export const completionRequestSchema = z.object({
  model: z.string(),
  prompt: z.union([z.string(), z.array(z.string())]),
  suffix: z.string().optional(),
  max_tokens: z.number().optional(),
  temperature: z.number().min(0).max(2).optional(),
  top_p: z.number().min(0).max(1).optional(),
  top_k: z.number().optional(),
  frequency_penalty: z.number().min(-2).max(2).optional(),
  presence_penalty: z.number().min(-2).max(2).optional(),
  stop: z.union([z.string(), z.array(z.string())]).optional(),
  stream: z.boolean().optional(),
  logprobs: z.number().optional(),
  echo: z.boolean().optional(),
  best_of: z.number().optional(),
  logit_bias: z.record(z.string(), z.number()).optional(),
  user: z.string().optional(),
  n: z.number().optional(),
  seed: z.number().optional(),
  use_beam_search: z.boolean().optional(),
  early_stopping: z.boolean().optional(),
  ignore_eos: z.boolean().optional(),
  min_p: z.number().optional(),
  repetition_penalty: z.number().optional(),
  length_penalty: z.number().optional(),
  include_stop_str_in_output: z.boolean().optional(),

  // LLM-specific parameters (now using snake_case)
  enable_thinking: z.boolean().optional(),
  response_format: z
    .object({
      type: z.enum(['text', 'json_object']),
    })
    .optional(),

  // Flexible provider-specific parameters
  provider_params: z.record(z.unknown()).optional(),
});

export type CompletionRequest = z.infer<typeof completionRequestSchema>;
