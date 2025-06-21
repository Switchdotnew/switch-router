import { z } from 'zod';

export const modelInfoSchema = z.object({
  id: z.string(),
  object: z.literal('model'),
  created: z.number().optional(),
  owned_by: z.string().optional(),
  permission: z.array(z.any()).optional(),
  root: z.string().optional(),
  parent: z.string().optional(),
});

export const modelsResponseSchema = z.object({
  object: z.literal('list'),
  data: z.array(modelInfoSchema),
});

export type ModelInfo = z.infer<typeof modelInfoSchema>;
export type ModelsResponse = z.infer<typeof modelsResponseSchema>;
