# Provider Setup

Switch supports multiple LLM providers through its pool-based architecture. Here's how to configure each provider within pools.

## OpenAI

### Basic Setup

```bash
# Environment
OPENAI_API_KEY=sk-your-openai-key
```

```json
{
  "credentialStores": {
    "openai": {
      "type": "simple",
      "source": "env",
      "config": {"apiKeyVar": "OPENAI_API_KEY"}
    }
  },
  "pools": [{
    "id": "openai-pool",
    "name": "OpenAI Models",
    "providers": [{
      "name": "openai-gpt4o",
      "provider": "openai",
      "credentialsRef": "openai",
      "apiBase": "https://api.openai.com/v1",
      "modelName": "gpt-4o",
      "priority": 1
    }],
    "fallbackPoolIds": [],
    "routingStrategy": "fastest_response",
    "circuitBreaker": {
      "enabled": true,
      "failureThreshold": 3,
      "resetTimeout": 60000
    },
    "healthThresholds": {
      "errorRate": 20,
      "responseTime": 30000,
      "consecutiveFailures": 3,
      "minHealthyProviders": 1
    }
  }],
  "models": {
    "gpt-4o": {
      "primaryPoolId": "openai-pool"
    }
  }
}
```

### Available Models

- `gpt-4o` - Latest GPT-4 Omni
- `gpt-4o-mini` - Faster, cheaper version  
- `gpt-4-turbo` - Previous generation
- `gpt-3.5-turbo` - Fast and cheap

### Multiple OpenAI Models in One Pool

```json
{
  "pools": [{
    "id": "openai-multi-pool",
    "name": "OpenAI Multi-Model Pool",
    "providers": [
      {
        "name": "gpt4o-primary",
        "provider": "openai",
        "credentialsRef": "openai",
        "apiBase": "https://api.openai.com/v1",
        "modelName": "gpt-4o",
        "priority": 1,
        "weight": 60
      },
      {
        "name": "gpt4o-mini-secondary",
        "provider": "openai",
        "credentialsRef": "openai",
        "apiBase": "https://api.openai.com/v1",
        "modelName": "gpt-4o-mini",
        "priority": 1,
        "weight": 40
      }
    ],
    "routingStrategy": "weighted",
    "circuitBreaker": {"enabled": true, "failureThreshold": 3, "resetTimeout": 60000},
    "healthThresholds": {"errorRate": 20, "responseTime": 30000, "consecutiveFailures": 3, "minHealthyProviders": 1}
  }]
}
```

## Anthropic

### Basic Setup

```bash
# Environment  
ANTHROPIC_API_KEY=sk-ant-your-anthropic-key
```

```json
{
  "credentialStores": {
    "anthropic": {
      "type": "simple", 
      "source": "env",
      "config": {"apiKeyVar": "ANTHROPIC_API_KEY"}
    }
  },
  "pools": [{
    "id": "anthropic-pool",
    "name": "Anthropic Models",
    "providers": [{
      "name": "claude-sonnet",
      "provider": "anthropic", 
      "credentialsRef": "anthropic",
      "apiBase": "https://api.anthropic.com",
      "modelName": "claude-3-5-sonnet-20241022",
      "priority": 1
    }],
    "fallbackPoolIds": [],
    "routingStrategy": "fastest_response",
    "circuitBreaker": {
      "enabled": true,
      "failureThreshold": 3,
      "resetTimeout": 60000
    },
    "healthThresholds": {
      "errorRate": 20,
      "responseTime": 30000,
      "consecutiveFailures": 3,
      "minHealthyProviders": 1
    }
  }],
  "models": {
    "claude-3-5-sonnet": {
      "primaryPoolId": "anthropic-pool"
    }
  }
}
```

### Available Models

- `claude-3-5-sonnet-20241022` - Latest Sonnet
- `claude-3-5-haiku-20241022` - Fast and cheap
- `claude-3-opus-20240229` - Most capable (expensive)

## AWS Bedrock

### Setup with Access Keys

```bash
# Environment
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=AKIA...
AWS_SECRET_ACCESS_KEY=your-secret-key
```

```json
{
  "credentialStores": {
    "bedrock": {
      "type": "aws",
      "source": "env",
      "config": {
        "regionVar": "AWS_REGION",
        "accessKeyIdVar": "AWS_ACCESS_KEY_ID", 
        "secretAccessKeyVar": "AWS_SECRET_ACCESS_KEY"
      }
    }
  },
  "pools": [{
    "id": "bedrock-pool",
    "name": "AWS Bedrock Models",
    "providers": [{
      "name": "bedrock-claude",
      "provider": "bedrock",
      "credentialsRef": "bedrock",
      "apiBase": "https://bedrock-runtime.us-east-1.amazonaws.com",
      "modelName": "anthropic.claude-3-5-sonnet-20241022-v2:0",
      "priority": 1
    }],
    "fallbackPoolIds": [],
    "routingStrategy": "fastest_response",
    "circuitBreaker": {
      "enabled": true,
      "failureThreshold": 3,
      "resetTimeout": 60000
    },
    "healthThresholds": {
      "errorRate": 20,
      "responseTime": 30000,
      "consecutiveFailures": 3,
      "minHealthyProviders": 1
    }
  }],
  "models": {
    "claude-bedrock": {
      "primaryPoolId": "bedrock-pool"
    }
  }
}
```

### Setup with Instance Profile

```bash
# Environment
AWS_REGION=us-east-1
```

```json
{
  "credentialStores": {
    "bedrock-instance": {
      "type": "aws",
      "source": "env", 
      "config": {
        "regionVar": "AWS_REGION",
        "useInstanceProfile": true
      }
    }
  },
  "pools": [{
    "id": "bedrock-instance-pool",
    "name": "Bedrock Instance Profile Pool",
    "providers": [{
      "name": "bedrock-instance-claude",
      "provider": "bedrock",
      "credentialsRef": "bedrock-instance",
      "apiBase": "https://bedrock-runtime.us-east-1.amazonaws.com",
      "modelName": "anthropic.claude-3-5-sonnet-20241022-v2:0",
      "priority": 1
    }],
    "fallbackPoolIds": [],
    "routingStrategy": "fastest_response",
    "circuitBreaker": {"enabled": true, "failureThreshold": 3, "resetTimeout": 60000},
    "healthThresholds": {"errorRate": 20, "responseTime": 30000, "consecutiveFailures": 3, "minHealthyProviders": 1}
  }]
}
```

### Popular Bedrock Models

**Anthropic Claude**:
- `anthropic.claude-3-5-sonnet-20241022-v2:0`
- `anthropic.claude-3-haiku-20240307-v1:0`  
- `anthropic.claude-3-opus-20240229-v1:0`

**Meta Llama**:
- `meta.llama3-1-405b-instruct-v1:0`
- `meta.llama3-1-70b-instruct-v1:0`
- `meta.llama3-1-8b-instruct-v1:0`

**Amazon Nova**:
- `amazon.nova-pro-v1:0`
- `amazon.nova-lite-v1:0` 
- `amazon.nova-micro-v1:0`

**Mistral**:
- `mistral.mistral-large-2407-v1:0`
- `mistral.mixtral-8x7b-instruct-v0:1`

### Multi-Model Bedrock Pool

```json
{
  "pools": [{
    "id": "bedrock-multi-pool",
    "name": "Bedrock Multi-Model Pool",
    "providers": [
      {
        "name": "claude-sonnet",
        "provider": "bedrock",
        "credentialsRef": "bedrock",
        "apiBase": "https://bedrock-runtime.us-east-1.amazonaws.com",
        "modelName": "anthropic.claude-3-5-sonnet-20241022-v2:0",
        "priority": 1,
        "costPerToken": 0.000003
      },
      {
        "name": "llama-405b",
        "provider": "bedrock", 
        "credentialsRef": "bedrock",
        "apiBase": "https://bedrock-runtime.us-east-1.amazonaws.com",
        "modelName": "meta.llama3-1-405b-instruct-v1:0",
        "priority": 2,
        "costPerToken": 0.000001
      }
    ],
    "routingStrategy": "cost_optimized",
    "costOptimization": {
      "maxCostPerToken": 0.000005,
      "prioritizeCost": true
    },
    "circuitBreaker": {"enabled": true, "failureThreshold": 3, "resetTimeout": 60000},
    "healthThresholds": {"errorRate": 20, "responseTime": 30000, "consecutiveFailures": 3, "minHealthyProviders": 1}
  }]
}
```

## Together AI

Uses OpenAI-compatible API format.

### Setup

```bash
# Environment
TOGETHER_API_KEY=your-together-key
```

```json
{
  "credentialStores": {
    "together": {
      "type": "simple",
      "source": "env",
      "config": {"apiKeyVar": "TOGETHER_API_KEY"}
    }
  },
  "pools": [{
    "id": "together-pool",
    "name": "Together AI Models",
    "providers": [{
      "name": "together-llama-405b",
      "provider": "openai",
      "credentialsRef": "together",
      "apiBase": "https://api.together.xyz/v1",
      "modelName": "meta-llama/Meta-Llama-3.1-405B-Instruct-Turbo",
      "priority": 1
    }],
    "fallbackPoolIds": [],
    "routingStrategy": "fastest_response",
    "circuitBreaker": {
      "enabled": true,
      "failureThreshold": 3,
      "resetTimeout": 60000
    },
    "healthThresholds": {
      "errorRate": 20,
      "responseTime": 30000,
      "consecutiveFailures": 3,
      "minHealthyProviders": 1
    }
  }],
  "models": {
    "llama-405b": {
      "primaryPoolId": "together-pool"
    }
  }
}
```

### Popular Together Models

- `meta-llama/Meta-Llama-3.1-405B-Instruct-Turbo`
- `meta-llama/Meta-Llama-3.1-70B-Instruct-Turbo`
- `meta-llama/Meta-Llama-3.1-8B-Instruct-Turbo`
- `mistralai/Mixtral-8x7B-Instruct-v0.1`

## Groq

Uses OpenAI-compatible API format.

### Setup

```bash
# Environment  
GROQ_API_KEY=gsk-your-groq-key
```

```json
{
  "credentialStores": {
    "groq": {
      "type": "simple",
      "source": "env",
      "config": {"apiKeyVar": "GROQ_API_KEY"}
    }
  },
  "pools": [{
    "id": "groq-pool",
    "name": "Groq Fast Models",
    "providers": [{
      "name": "groq-llama-70b",
      "provider": "openai", 
      "credentialsRef": "groq",
      "apiBase": "https://api.groq.com/openai/v1",
      "modelName": "llama-3.1-70b-versatile",
      "priority": 1
    }],
    "fallbackPoolIds": [],
    "routingStrategy": "fastest_response",
    "circuitBreaker": {
      "enabled": true,
      "failureThreshold": 3,
      "resetTimeout": 60000
    },
    "healthThresholds": {
      "errorRate": 20,
      "responseTime": 30000,
      "consecutiveFailures": 3,
      "minHealthyProviders": 1
    }
  }],
  "models": {
    "llama-groq": {
      "primaryPoolId": "groq-pool"
    }
  }
}
```

### Available Groq Models

- `llama-3.1-405b-reasoning`
- `llama-3.1-70b-versatile`
- `llama-3.1-8b-instant`
- `mixtral-8x7b-32768`

## Custom OpenAI-Compatible APIs

Many providers offer OpenAI-compatible APIs.

### Setup

```bash
# Environment
CUSTOM_API_KEY=your-custom-key
```

```json
{
  "credentialStores": {
    "custom": {
      "type": "simple",
      "source": "env", 
      "config": {"apiKeyVar": "CUSTOM_API_KEY"}
    }
  },
  "pools": [{
    "id": "custom-pool",
    "name": "Custom Provider Pool",
    "providers": [{
      "name": "custom-model",
      "provider": "openai",
      "credentialsRef": "custom",
      "apiBase": "https://your-api.com/v1",
      "modelName": "your-model-name", 
      "priority": 1,
      "headers": {
        "Custom-Header": "value"
      },
      "timeout": 60000
    }],
    "fallbackPoolIds": [],
    "routingStrategy": "fastest_response",
    "circuitBreaker": {
      "enabled": true,
      "failureThreshold": 3,
      "resetTimeout": 60000
    },
    "healthThresholds": {
      "errorRate": 20,
      "responseTime": 30000,
      "consecutiveFailures": 3,
      "minHealthyProviders": 1
    }
  }],
  "models": {
    "custom-model": {
      "primaryPoolId": "custom-pool"
    }
  }
}
```

## Alibaba/Dashscope

### Setup

```bash
# Environment
ALIBABA_API_KEY=sk-your-alibaba-key
```

```json
{
  "credentialStores": {
    "alibaba": {
      "type": "simple",
      "source": "env",
      "config": {"apiKeyVar": "ALIBABA_API_KEY"}
    }
  },
  "pools": [{
    "id": "alibaba-pool",
    "name": "Alibaba Qwen Models",
    "providers": [{
      "name": "qwen-turbo",
      "provider": "alibaba",
      "credentialsRef": "alibaba",
      "apiBase": "https://dashscope.aliyuncs.com/compatible-mode",
      "modelName": "qwen-turbo",
      "priority": 1,
      "providerParams": {
        "enable_thinking": false,
        "incremental_output": false
      }
    }],
    "fallbackPoolIds": [],
    "routingStrategy": "fastest_response",
    "circuitBreaker": {
      "enabled": true,
      "failureThreshold": 3,
      "resetTimeout": 60000
    },
    "healthThresholds": {
      "errorRate": 20,
      "responseTime": 30000,
      "consecutiveFailures": 3,
      "minHealthyProviders": 1
    }
  }],
  "models": {
    "qwen-turbo": {
      "primaryPoolId": "alibaba-pool"
    }
  }
}
```

**Note**: Alibaba requires `/compatible-mode` in the API base URL.

## Multi-Provider Pool Examples

### OpenAI → Anthropic → Bedrock Fallback Chain

```json
{
  "credentialStores": {
    "openai": {"type": "simple", "source": "env", "config": {"apiKeyVar": "OPENAI_API_KEY"}},
    "anthropic": {"type": "simple", "source": "env", "config": {"apiKeyVar": "ANTHROPIC_API_KEY"}},
    "aws": {"type": "aws", "source": "env", "config": {"regionVar": "AWS_REGION", "accessKeyIdVar": "AWS_ACCESS_KEY_ID", "secretAccessKeyVar": "AWS_SECRET_ACCESS_KEY"}}
  },
  "pools": [
    {
      "id": "primary-pool",
      "name": "Primary High-Quality Pool",
      "providers": [{
        "name": "openai-gpt4o",
        "provider": "openai", 
        "credentialsRef": "openai",
        "apiBase": "https://api.openai.com/v1",
        "modelName": "gpt-4o",
        "priority": 1
      }],
      "fallbackPoolIds": ["anthropic-pool"],
      "routingStrategy": "fastest_response",
      "circuitBreaker": {
        "enabled": true,
        "failureThreshold": 3,
        "resetTimeout": 60000
      },
      "healthThresholds": {
        "errorRate": 15,
        "responseTime": 30000,
        "consecutiveFailures": 2,
        "minHealthyProviders": 1
      }
    },
    {
      "id": "anthropic-pool",
      "name": "Anthropic Fallback Pool",
      "providers": [{
        "name": "claude-sonnet",
        "provider": "anthropic",
        "credentialsRef": "anthropic", 
        "apiBase": "https://api.anthropic.com",
        "modelName": "claude-3-5-sonnet-20241022",
        "priority": 1
      }],
      "fallbackPoolIds": ["bedrock-pool"],
      "routingStrategy": "fastest_response",
      "circuitBreaker": {
        "enabled": true,
        "failureThreshold": 3,
        "resetTimeout": 60000
      },
      "healthThresholds": {
        "errorRate": 20,
        "responseTime": 35000,
        "consecutiveFailures": 3,
        "minHealthyProviders": 1
      }
    },
    {
      "id": "bedrock-pool",
      "name": "Bedrock Emergency Pool",
      "providers": [{
        "name": "bedrock-claude",
        "provider": "bedrock",
        "credentialsRef": "aws",
        "apiBase": "https://bedrock-runtime.us-east-1.amazonaws.com",
        "modelName": "anthropic.claude-3-5-sonnet-20241022-v2:0",
        "priority": 1
      }],
      "fallbackPoolIds": [],
      "routingStrategy": "fastest_response",
      "circuitBreaker": {
        "enabled": true,
        "failureThreshold": 5,
        "resetTimeout": 120000
      },
      "healthThresholds": {
        "errorRate": 30,
        "responseTime": 45000,
        "consecutiveFailures": 5,
        "minHealthyProviders": 1
      }
    }
  ],
  "models": {
    "reliable-model": {
      "primaryPoolId": "primary-pool",
      "defaultParameters": {
        "temperature": 0.7,
        "maxTokens": 4096
      }
    }
  }
}
```

### Cost-Optimised: Cheap → Expensive

```json
{
  "credentialStores": {
    "together": {"type": "simple", "source": "env", "config": {"apiKeyVar": "TOGETHER_API_KEY"}},
    "groq": {"type": "simple", "source": "env", "config": {"apiKeyVar": "GROQ_API_KEY"}},
    "openai": {"type": "simple", "source": "env", "config": {"apiKeyVar": "OPENAI_API_KEY"}}
  },
  "pools": [{
    "id": "cost-optimised-pool",
    "name": "Cost Optimised Pool",
    "providers": [
      {
        "name": "together-cheap",
        "provider": "openai",
        "credentialsRef": "together",
        "apiBase": "https://api.together.xyz/v1",
        "modelName": "meta-llama/Meta-Llama-3.1-8B-Instruct-Turbo",
        "priority": 1,
        "costPerToken": 0.0000001
      },
      {
        "name": "groq-fast",
        "provider": "openai",
        "credentialsRef": "groq", 
        "apiBase": "https://api.groq.com/openai/v1",
        "modelName": "llama-3.1-8b-instant",
        "priority": 2,
        "costPerToken": 0.0000002
      },
      {
        "name": "openai-premium",
        "provider": "openai",
        "credentialsRef": "openai",
        "apiBase": "https://api.openai.com/v1",
        "modelName": "gpt-4o-mini",
        "priority": 3,
        "costPerToken": 0.000001
      }
    ],
    "fallbackPoolIds": [],
    "routingStrategy": "cost_optimized",
    "costOptimization": {
      "maxCostPerToken": 0.000001,
      "prioritizeCost": true
    },
    "circuitBreaker": {
      "enabled": true,
      "failureThreshold": 3,
      "resetTimeout": 60000
    },
    "healthThresholds": {
      "errorRate": 25,
      "responseTime": 45000,
      "consecutiveFailures": 5,
      "minHealthyProviders": 1
    }
  }],
  "models": {
    "cost-optimised": {
      "primaryPoolId": "cost-optimised-pool"
    }
  }
}
```

### Load Balanced Multi-Provider Pool

```json
{
  "pools": [{
    "id": "balanced-pool",
    "name": "Load Balanced Pool",
    "providers": [
      {
        "name": "openai-gpt4o",
        "provider": "openai",
        "credentialsRef": "openai",
        "apiBase": "https://api.openai.com/v1",
        "modelName": "gpt-4o",
        "priority": 1,
        "weight": 50
      },
      {
        "name": "claude-sonnet",
        "provider": "anthropic",
        "credentialsRef": "anthropic",
        "apiBase": "https://api.anthropic.com",
        "modelName": "claude-3-5-sonnet-20241022",
        "priority": 1,
        "weight": 30
      },
      {
        "name": "together-llama",
        "provider": "openai",
        "credentialsRef": "together",
        "apiBase": "https://api.together.xyz/v1",
        "modelName": "meta-llama/Meta-Llama-3.1-70B-Instruct-Turbo",
        "priority": 1,
        "weight": 20
      }
    ],
    "fallbackPoolIds": [],
    "routingStrategy": "weighted",
    "weightedRouting": {
      "autoAdjust": true,
      "minWeight": 5,
      "maxWeight": 95
    },
    "circuitBreaker": {
      "enabled": true,
      "failureThreshold": 5,
      "resetTimeout": 120000
    },
    "healthThresholds": {
      "errorRate": 15,
      "responseTime": 35000,
      "consecutiveFailures": 2,
      "minHealthyProviders": 2
    }
  }]
}
```

## Provider-Specific Notes

### OpenAI
- Supports function calling, vision, and all standard features
- Rate limits vary by tier
- Best model compatibility
- Excellent for production workloads

### Anthropic  
- Excellent for reasoning and analysis
- Supports function calling and vision
- Higher context windows
- Strong safety features

### AWS Bedrock
- 50+ models from multiple providers
- Good for compliance requirements
- Regional availability varies
- Supports multiple authentication methods

### Together AI
- Good selection of open source models
- Competitive pricing for large models
- Fast inference
- OpenAI-compatible API

### Groq
- Extremely fast inference (highest tokens/second)
- Limited model selection
- Good for real-time applications
- OpenAI-compatible API

### Custom Providers
- Use OpenAI-compatible format when possible
- Test thoroughly with your specific provider
- Check for any special requirements or parameters
- Monitor for provider-specific error patterns

## Best Practices

### Pool Design
- **Single Provider Pools**: Use for provider-specific optimisations
- **Multi-Provider Pools**: Use for load balancing similar models
- **Fallback Chains**: Use pools with `fallbackPoolIds` for reliability

### Circuit Breakers
- Enable for production workloads
- Set appropriate failure thresholds based on provider reliability
- Use permanent failure handling for authentication errors

### Health Monitoring
- Set conservative health thresholds for critical workloads
- Monitor error rates and response times
- Ensure `minHealthyProviders` matches your availability requirements

### Cost Optimisation
- Use `cost_optimized` routing strategy for budget-conscious deployments
- Set `costPerToken` values for accurate routing decisions
- Consider fallback chains from cheap to expensive providers