// AWS Bedrock model registry with comprehensive model definitions
// Based on LiteLLM's extensive Bedrock model support

/**
 * Bedrock model capabilities
 */
interface IBedrockModelCapabilities {
  chat: boolean;
  completion: boolean;
  streaming: boolean;
  functionCalling: boolean;
  vision: boolean;
  embeddings: boolean;
  imageGeneration: boolean;
  reasoning?: boolean;
  toolUse?: boolean;
}

/**
 * Bedrock model pricing information
 */
interface IBedrockModelPricing {
  inputTokens: number; // Cost per 1000 input tokens
  outputTokens: number; // Cost per 1000 output tokens
  currency: 'USD';
  region?: string; // Region-specific pricing
}

/**
 * Bedrock model configuration
 */
interface IBedrockModelConfig {
  name: string;
  displayName?: string;
  description?: string;
  provider?: string;
  modelFamily: 'anthropic' | 'amazon' | 'ai21' | 'cohere' | 'meta' | 'mistral' | 'stability';
  bedrockModelId: string;
  apiVersion?: string;
  capabilities: IBedrockModelCapabilities;
  pricing: IBedrockModelPricing;
  maxTokens: number;
  contextWindow: number;
  supportedRegions: string[];
  parameters?: {
    temperature?: { min: number; max: number; default: number };
    topP?: { min: number; max: number; default: number };
    topK?: { min: number; max: number; default: number };
    maxTokens?: { min: number; max: number; default: number };
  };
}

/**
 * Anthropic Claude models via Bedrock
 */
const anthropicModels: Record<string, IBedrockModelConfig> = {
  'claude-3-5-sonnet-20241022': {
    name: 'claude-3-5-sonnet-20241022',
    displayName: 'Claude 3.5 Sonnet (Latest)',
    description: 'Most capable Claude model for complex reasoning and coding',
    provider: 'bedrock',
    modelFamily: 'anthropic',
    bedrockModelId: 'anthropic.claude-3-5-sonnet-20241022-v2:0',
    apiVersion: 'bedrock-2023-05-31',
    capabilities: {
      chat: true,
      completion: false,
      streaming: true,
      functionCalling: true,
      vision: true,
      embeddings: false,
      imageGeneration: false,
      reasoning: true,
      toolUse: true,
    },
    pricing: {
      inputTokens: 3.0, // $3 per 1M input tokens
      outputTokens: 15.0, // $15 per 1M output tokens
      currency: 'USD',
    },
    maxTokens: 8192,
    contextWindow: 200000,
    supportedRegions: [
      'us-east-1',
      'us-west-2',
      'eu-west-1',
      'eu-central-1',
      'ap-southeast-1',
      'ap-northeast-1',
    ],
    parameters: {
      temperature: { min: 0, max: 1, default: 0.7 },
      topP: { min: 0, max: 1, default: 1 },
      maxTokens: { min: 1, max: 8192, default: 1000 },
    },
  },

  'claude-3-5-haiku-20241022': {
    name: 'claude-3-5-haiku-20241022',
    displayName: 'Claude 3.5 Haiku',
    description: 'Fast and cost-effective Claude model',
    provider: 'bedrock',
    modelFamily: 'anthropic',
    bedrockModelId: 'anthropic.claude-3-5-haiku-20241022-v1:0',
    apiVersion: 'bedrock-2023-05-31',
    capabilities: {
      chat: true,
      completion: false,
      streaming: true,
      functionCalling: true,
      vision: true,
      embeddings: false,
      imageGeneration: false,
      toolUse: true,
    },
    pricing: {
      inputTokens: 0.25, // $0.25 per 1M input tokens
      outputTokens: 1.25, // $1.25 per 1M output tokens
      currency: 'USD',
    },
    maxTokens: 8192,
    contextWindow: 200000,
    supportedRegions: [
      'us-east-1',
      'us-west-2',
      'eu-west-1',
      'eu-central-1',
      'ap-southeast-1',
      'ap-northeast-1',
    ],
    parameters: {
      temperature: { min: 0, max: 1, default: 0.7 },
      topP: { min: 0, max: 1, default: 1 },
      maxTokens: { min: 1, max: 8192, default: 1000 },
    },
  },

  'claude-3-sonnet': {
    name: 'claude-3-sonnet',
    displayName: 'Claude 3 Sonnet',
    description: 'Balanced performance and cost Claude model',
    provider: 'bedrock',
    modelFamily: 'anthropic',
    bedrockModelId: 'anthropic.claude-3-sonnet-20240229-v1:0',
    apiVersion: 'bedrock-2023-05-31',
    capabilities: {
      chat: true,
      completion: false,
      streaming: true,
      functionCalling: true,
      vision: true,
      embeddings: false,
      imageGeneration: false,
      toolUse: true,
    },
    pricing: {
      inputTokens: 3.0,
      outputTokens: 15.0,
      currency: 'USD',
    },
    maxTokens: 4096,
    contextWindow: 200000,
    supportedRegions: [
      'us-east-1',
      'us-west-2',
      'eu-west-1',
      'eu-central-1',
      'ap-southeast-1',
      'ap-northeast-1',
    ],
    parameters: {
      temperature: { min: 0, max: 1, default: 0.7 },
      topP: { min: 0, max: 1, default: 1 },
      maxTokens: { min: 1, max: 4096, default: 1000 },
    },
  },

  'claude-3-haiku': {
    name: 'claude-3-haiku',
    displayName: 'Claude 3 Haiku',
    description: 'Fast and cost-effective Claude model',
    provider: 'bedrock',
    modelFamily: 'anthropic',
    bedrockModelId: 'anthropic.claude-3-haiku-20240307-v1:0',
    apiVersion: 'bedrock-2023-05-31',
    capabilities: {
      chat: true,
      completion: false,
      streaming: true,
      functionCalling: true,
      vision: true,
      embeddings: false,
      imageGeneration: false,
      toolUse: true,
    },
    pricing: {
      inputTokens: 0.25,
      outputTokens: 1.25,
      currency: 'USD',
    },
    maxTokens: 4096,
    contextWindow: 200000,
    supportedRegions: [
      'us-east-1',
      'us-west-2',
      'eu-west-1',
      'eu-central-1',
      'ap-southeast-1',
      'ap-northeast-1',
    ],
    parameters: {
      temperature: { min: 0, max: 1, default: 0.7 },
      topP: { min: 0, max: 1, default: 1 },
      maxTokens: { min: 1, max: 4096, default: 1000 },
    },
  },

  'claude-2.1': {
    name: 'claude-2.1',
    displayName: 'Claude 2.1',
    description: 'Previous generation Claude model',
    provider: 'bedrock',
    modelFamily: 'anthropic',
    bedrockModelId: 'anthropic.claude-v2:1',
    apiVersion: 'bedrock-2023-05-31',
    capabilities: {
      chat: true,
      completion: false,
      streaming: true,
      functionCalling: false,
      vision: false,
      embeddings: false,
      imageGeneration: false,
    },
    pricing: {
      inputTokens: 8.0,
      outputTokens: 24.0,
      currency: 'USD',
    },
    maxTokens: 4096,
    contextWindow: 200000,
    supportedRegions: ['us-east-1', 'us-west-2', 'eu-west-1'],
    parameters: {
      temperature: { min: 0, max: 1, default: 0.7 },
      topP: { min: 0, max: 1, default: 1 },
      maxTokens: { min: 1, max: 4096, default: 1000 },
    },
  },
};

/**
 * Amazon models via Bedrock
 */
const amazonModels: Record<string, IBedrockModelConfig> = {
  'titan-text-premier': {
    name: 'titan-text-premier',
    displayName: 'Amazon Titan Text Premier',
    description: 'Amazon Titan Text Premier model for high-quality text generation',
    provider: 'bedrock',
    modelFamily: 'amazon',
    bedrockModelId: 'amazon.titan-text-premier-v1:0',
    capabilities: {
      chat: true,
      completion: false,
      streaming: true,
      functionCalling: false,
      vision: false,
      embeddings: false,
      imageGeneration: false,
    },
    pricing: {
      inputTokens: 0.5,
      outputTokens: 1.5,
      currency: 'USD',
    },
    maxTokens: 3000,
    contextWindow: 32000,
    supportedRegions: ['us-east-1', 'us-west-2'],
    parameters: {
      temperature: { min: 0, max: 1, default: 0.7 },
      topP: { min: 0, max: 1, default: 1 },
      maxTokens: { min: 1, max: 3000, default: 1000 },
    },
  },

  'nova-pro': {
    name: 'nova-pro',
    displayName: 'Amazon Nova Pro',
    description: 'Amazon Nova Pro multimodal model',
    provider: 'bedrock',
    modelFamily: 'amazon',
    bedrockModelId: 'amazon.nova-pro-v1:0',
    capabilities: {
      chat: true,
      completion: false,
      streaming: true,
      functionCalling: true,
      vision: true,
      embeddings: false,
      imageGeneration: false,
      toolUse: true,
    },
    pricing: {
      inputTokens: 0.8,
      outputTokens: 3.2,
      currency: 'USD',
    },
    maxTokens: 5000,
    contextWindow: 300000,
    supportedRegions: ['us-east-1', 'us-west-2'],
    parameters: {
      temperature: { min: 0, max: 1, default: 0.7 },
      topP: { min: 0, max: 1, default: 1 },
      maxTokens: { min: 1, max: 5000, default: 1000 },
    },
  },

  'nova-lite': {
    name: 'nova-lite',
    displayName: 'Amazon Nova Lite',
    description: 'Amazon Nova Lite multimodal model',
    provider: 'bedrock',
    modelFamily: 'amazon',
    bedrockModelId: 'amazon.nova-lite-v1:0',
    capabilities: {
      chat: true,
      completion: false,
      streaming: true,
      functionCalling: true,
      vision: true,
      embeddings: false,
      imageGeneration: false,
      toolUse: true,
    },
    pricing: {
      inputTokens: 0.06,
      outputTokens: 0.24,
      currency: 'USD',
    },
    maxTokens: 5000,
    contextWindow: 300000,
    supportedRegions: ['us-east-1', 'us-west-2'],
    parameters: {
      temperature: { min: 0, max: 1, default: 0.7 },
      topP: { min: 0, max: 1, default: 1 },
      maxTokens: { min: 1, max: 5000, default: 1000 },
    },
  },

  'nova-micro': {
    name: 'nova-micro',
    displayName: 'Amazon Nova Micro',
    description: 'Amazon Nova Micro text-only model',
    provider: 'bedrock',
    modelFamily: 'amazon',
    bedrockModelId: 'amazon.nova-micro-v1:0',
    capabilities: {
      chat: true,
      completion: false,
      streaming: true,
      functionCalling: false,
      vision: false,
      embeddings: false,
      imageGeneration: false,
    },
    pricing: {
      inputTokens: 0.035,
      outputTokens: 0.14,
      currency: 'USD',
    },
    maxTokens: 5000,
    contextWindow: 128000,
    supportedRegions: ['us-east-1', 'us-west-2'],
    parameters: {
      temperature: { min: 0, max: 1, default: 0.7 },
      topP: { min: 0, max: 1, default: 1 },
      maxTokens: { min: 1, max: 5000, default: 1000 },
    },
  },
};

/**
 * Meta Llama models via Bedrock
 */
const metaModels: Record<string, IBedrockModelConfig> = {
  'llama-3.2-90b-instruct': {
    name: 'llama-3.2-90b-instruct',
    displayName: 'Llama 3.2 90B Instruct',
    description: 'Meta Llama 3.2 90B instruction-following model',
    provider: 'bedrock',
    modelFamily: 'meta',
    bedrockModelId: 'meta.llama3-2-90b-instruct-v1:0',
    capabilities: {
      chat: true,
      completion: false,
      streaming: true,
      functionCalling: true,
      vision: true,
      embeddings: false,
      imageGeneration: false,
      toolUse: true,
    },
    pricing: {
      inputTokens: 2.0,
      outputTokens: 6.0,
      currency: 'USD',
    },
    maxTokens: 4096,
    contextWindow: 128000,
    supportedRegions: ['us-east-1', 'us-west-2'],
    parameters: {
      temperature: { min: 0, max: 1, default: 0.6 },
      topP: { min: 0, max: 1, default: 0.9 },
      maxTokens: { min: 1, max: 4096, default: 2048 },
    },
  },

  'llama-3.1-405b-instruct': {
    name: 'llama-3.1-405b-instruct',
    displayName: 'Llama 3.1 405B Instruct',
    description: 'Meta Llama 3.1 405B largest instruction-following model',
    provider: 'bedrock',
    modelFamily: 'meta',
    bedrockModelId: 'meta.llama3-1-405b-instruct-v1:0',
    capabilities: {
      chat: true,
      completion: false,
      streaming: true,
      functionCalling: true,
      vision: false,
      embeddings: false,
      imageGeneration: false,
      toolUse: true,
    },
    pricing: {
      inputTokens: 5.32,
      outputTokens: 16.0,
      currency: 'USD',
    },
    maxTokens: 4096,
    contextWindow: 128000,
    supportedRegions: ['us-east-1', 'us-west-2'],
    parameters: {
      temperature: { min: 0, max: 1, default: 0.6 },
      topP: { min: 0, max: 1, default: 0.9 },
      maxTokens: { min: 1, max: 4096, default: 2048 },
    },
  },

  'llama-3.1-70b-instruct': {
    name: 'llama-3.1-70b-instruct',
    displayName: 'Llama 3.1 70B Instruct',
    description: 'Meta Llama 3.1 70B instruction-following model',
    provider: 'bedrock',
    modelFamily: 'meta',
    bedrockModelId: 'meta.llama3-1-70b-instruct-v1:0',
    capabilities: {
      chat: true,
      completion: false,
      streaming: true,
      functionCalling: true,
      vision: false,
      embeddings: false,
      imageGeneration: false,
      toolUse: true,
    },
    pricing: {
      inputTokens: 0.99,
      outputTokens: 2.99,
      currency: 'USD',
    },
    maxTokens: 4096,
    contextWindow: 128000,
    supportedRegions: ['us-east-1', 'us-west-2', 'eu-west-1'],
    parameters: {
      temperature: { min: 0, max: 1, default: 0.6 },
      topP: { min: 0, max: 1, default: 0.9 },
      maxTokens: { min: 1, max: 4096, default: 2048 },
    },
  },

  'llama-3.1-8b-instruct': {
    name: 'llama-3.1-8b-instruct',
    displayName: 'Llama 3.1 8B Instruct',
    description: 'Meta Llama 3.1 8B instruction-following model',
    provider: 'bedrock',
    modelFamily: 'meta',
    bedrockModelId: 'meta.llama3-1-8b-instruct-v1:0',
    capabilities: {
      chat: true,
      completion: false,
      streaming: true,
      functionCalling: true,
      vision: false,
      embeddings: false,
      imageGeneration: false,
      toolUse: true,
    },
    pricing: {
      inputTokens: 0.22,
      outputTokens: 0.22,
      currency: 'USD',
    },
    maxTokens: 4096,
    contextWindow: 128000,
    supportedRegions: ['us-east-1', 'us-west-2', 'eu-west-1'],
    parameters: {
      temperature: { min: 0, max: 1, default: 0.6 },
      topP: { min: 0, max: 1, default: 0.9 },
      maxTokens: { min: 1, max: 4096, default: 2048 },
    },
  },
};

/**
 * Mistral models via Bedrock
 */
const mistralModels: Record<string, IBedrockModelConfig> = {
  'mistral-large-2407': {
    name: 'mistral-large-2407',
    displayName: 'Mistral Large 2407',
    description: 'Mistral Large model optimised for complex reasoning',
    provider: 'bedrock',
    modelFamily: 'mistral',
    bedrockModelId: 'mistral.mistral-large-2407-v1:0',
    capabilities: {
      chat: true,
      completion: false,
      streaming: true,
      functionCalling: true,
      vision: false,
      embeddings: false,
      imageGeneration: false,
      toolUse: true,
    },
    pricing: {
      inputTokens: 3.0,
      outputTokens: 9.0,
      currency: 'USD',
    },
    maxTokens: 8192,
    contextWindow: 128000,
    supportedRegions: ['us-east-1', 'us-west-2', 'eu-west-1'],
    parameters: {
      temperature: { min: 0, max: 1, default: 0.7 },
      topP: { min: 0, max: 1, default: 1 },
      maxTokens: { min: 1, max: 8192, default: 1000 },
    },
  },

  'mistral-small-2402': {
    name: 'mistral-small-2402',
    displayName: 'Mistral Small 2402',
    description: 'Efficient Mistral model for cost-effective tasks',
    provider: 'bedrock',
    modelFamily: 'mistral',
    bedrockModelId: 'mistral.mistral-small-2402-v1:0',
    capabilities: {
      chat: true,
      completion: false,
      streaming: true,
      functionCalling: true,
      vision: false,
      embeddings: false,
      imageGeneration: false,
      toolUse: true,
    },
    pricing: {
      inputTokens: 1.0,
      outputTokens: 3.0,
      currency: 'USD',
    },
    maxTokens: 8192,
    contextWindow: 32000,
    supportedRegions: ['us-east-1', 'us-west-2', 'eu-west-1'],
    parameters: {
      temperature: { min: 0, max: 1, default: 0.7 },
      topP: { min: 0, max: 1, default: 1 },
      maxTokens: { min: 1, max: 8192, default: 1000 },
    },
  },
};

/**
 * Cohere models via Bedrock
 */
const cohereModels: Record<string, IBedrockModelConfig> = {
  'command-r-plus': {
    name: 'command-r-plus',
    displayName: 'Cohere Command R+',
    description: 'Cohere Command R+ model optimised for RAG and tool use',
    provider: 'bedrock',
    modelFamily: 'cohere',
    bedrockModelId: 'cohere.command-r-plus-v1:0',
    capabilities: {
      chat: true,
      completion: false,
      streaming: true,
      functionCalling: true,
      vision: false,
      embeddings: false,
      imageGeneration: false,
      toolUse: true,
    },
    pricing: {
      inputTokens: 3.0,
      outputTokens: 15.0,
      currency: 'USD',
    },
    maxTokens: 4096,
    contextWindow: 128000,
    supportedRegions: ['us-east-1', 'us-west-2'],
    parameters: {
      temperature: { min: 0, max: 1, default: 0.7 },
      topP: { min: 0, max: 1, default: 1 },
      maxTokens: { min: 1, max: 4096, default: 1000 },
    },
  },

  'command-r': {
    name: 'command-r',
    displayName: 'Cohere Command R',
    description: 'Cohere Command R model for retrieval-augmented generation',
    provider: 'bedrock',
    modelFamily: 'cohere',
    bedrockModelId: 'cohere.command-r-v1:0',
    capabilities: {
      chat: true,
      completion: false,
      streaming: true,
      functionCalling: true,
      vision: false,
      embeddings: false,
      imageGeneration: false,
      toolUse: true,
    },
    pricing: {
      inputTokens: 0.5,
      outputTokens: 1.5,
      currency: 'USD',
    },
    maxTokens: 4096,
    contextWindow: 128000,
    supportedRegions: ['us-east-1', 'us-west-2'],
    parameters: {
      temperature: { min: 0, max: 1, default: 0.7 },
      topP: { min: 0, max: 1, default: 1 },
      maxTokens: { min: 1, max: 4096, default: 1000 },
    },
  },
};

/**
 * AI21 models via Bedrock
 */
const ai21Models: Record<string, IBedrockModelConfig> = {
  'jamba-1.5-large': {
    name: 'jamba-1.5-large',
    displayName: 'AI21 Jamba 1.5 Large',
    description: 'AI21 Jamba 1.5 Large hybrid architecture model',
    provider: 'bedrock',
    modelFamily: 'ai21',
    bedrockModelId: 'ai21.jamba-1-5-large-v1:0',
    capabilities: {
      chat: true,
      completion: false,
      streaming: true,
      functionCalling: true,
      vision: false,
      embeddings: false,
      imageGeneration: false,
      toolUse: true,
    },
    pricing: {
      inputTokens: 2.0,
      outputTokens: 8.0,
      currency: 'USD',
    },
    maxTokens: 4096,
    contextWindow: 256000,
    supportedRegions: ['us-east-1', 'us-west-2'],
    parameters: {
      temperature: { min: 0, max: 2, default: 0.7 },
      topP: { min: 0, max: 1, default: 1 },
      maxTokens: { min: 1, max: 4096, default: 1000 },
    },
  },

  'jamba-1.5-mini': {
    name: 'jamba-1.5-mini',
    displayName: 'AI21 Jamba 1.5 Mini',
    description: 'AI21 Jamba 1.5 Mini efficient model',
    provider: 'bedrock',
    modelFamily: 'ai21',
    bedrockModelId: 'ai21.jamba-1-5-mini-v1:0',
    capabilities: {
      chat: true,
      completion: false,
      streaming: true,
      functionCalling: true,
      vision: false,
      embeddings: false,
      imageGeneration: false,
      toolUse: true,
    },
    pricing: {
      inputTokens: 0.2,
      outputTokens: 0.4,
      currency: 'USD',
    },
    maxTokens: 4096,
    contextWindow: 256000,
    supportedRegions: ['us-east-1', 'us-west-2'],
    parameters: {
      temperature: { min: 0, max: 2, default: 0.7 },
      topP: { min: 0, max: 1, default: 1 },
      maxTokens: { min: 1, max: 4096, default: 1000 },
    },
  },
};

/**
 * Complete Bedrock model registry
 */
export const bedrockModels: Record<string, IBedrockModelConfig> = {
  ...anthropicModels,
  ...amazonModels,
  ...metaModels,
  ...mistralModels,
  ...cohereModels,
  ...ai21Models,
};

/**
 * Get model configuration by Bedrock model ID
 */
export function getModelByBedrockId(bedrockModelId: string): IBedrockModelConfig | undefined {
  return Object.values(bedrockModels).find((model) => model.bedrockModelId === bedrockModelId);
}

/**
 * Get models by family
 */
export function getModelsByFamily(
  family: 'anthropic' | 'amazon' | 'ai21' | 'cohere' | 'meta' | 'mistral' | 'stability'
): Record<string, IBedrockModelConfig> {
  return Object.fromEntries(
    Object.entries(bedrockModels).filter(([, model]) => model.modelFamily === family)
  );
}

/**
 * Get models supported in a specific region
 */
export function getModelsByRegion(region: string): Record<string, IBedrockModelConfig> {
  return Object.fromEntries(
    Object.entries(bedrockModels).filter(([, model]) => model.supportedRegions.includes(region))
  );
}

/**
 * Get models with specific capabilities
 */
export function getModelsByCapability(
  capability: keyof IBedrockModelCapabilities
): Record<string, IBedrockModelConfig> {
  return Object.fromEntries(
    Object.entries(bedrockModels).filter(([, model]) => model.capabilities[capability])
  );
}

/**
 * Calculate cost for a request
 */
export function calculateBedrockCost(
  modelId: string,
  inputTokens: number,
  outputTokens: number
): { cost: number; currency: string } | null {
  const model = bedrockModels[modelId];
  if (!model) return null;

  const cost =
    (inputTokens / 1000) * model.pricing.inputTokens +
    (outputTokens / 1000) * model.pricing.outputTokens;

  return {
    cost: Math.round(cost * 100000) / 100000, // Round to 5 decimal places
    currency: model.pricing.currency,
  };
}

/**
 * Validate model parameters
 */
export function validateModelParameters(
  modelId: string,
  parameters: Record<string, unknown>
): { valid: boolean; errors: string[] } {
  const model = bedrockModels[modelId];
  if (!model) {
    return { valid: false, errors: [`Model ${modelId} not found in registry`] };
  }

  const errors: string[] = [];

  if (model.parameters) {
    // Validate temperature
    if (parameters.temperature !== undefined) {
      const temp = parameters.temperature as number;
      const tempConfig = model.parameters.temperature;
      if (tempConfig && (temp < tempConfig.min || temp > tempConfig.max)) {
        errors.push(
          `Temperature ${temp} is outside valid range [${tempConfig.min}, ${tempConfig.max}]`
        );
      }
    }

    // Validate topP
    if (parameters.topP !== undefined) {
      const topP = parameters.topP as number;
      const topPConfig = model.parameters.topP;
      if (topPConfig && (topP < topPConfig.min || topP > topPConfig.max)) {
        errors.push(`TopP ${topP} is outside valid range [${topPConfig.min}, ${topPConfig.max}]`);
      }
    }

    // Validate maxTokens
    if (parameters.maxTokens !== undefined) {
      const maxTokens = parameters.maxTokens as number;
      const maxTokensConfig = model.parameters.maxTokens;
      if (maxTokensConfig && (maxTokens < maxTokensConfig.min || maxTokens > maxTokensConfig.max)) {
        errors.push(
          `MaxTokens ${maxTokens} is outside valid range [${maxTokensConfig.min}, ${maxTokensConfig.max}]`
        );
      }
    }
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Export all model families for convenience
 */
export { anthropicModels, amazonModels, metaModels, mistralModels, cohereModels, ai21Models };
