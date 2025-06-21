# Configuration Guide

Switch uses a pool-based architecture for routing requests. Configuration can be provided via the `MODEL_DEFINITIONS` environment variable or a `definitions.json` file.

## Architecture Overview

Switch organises providers into **pools**. Each pool contains one or more providers, and models map to their primary pool. This enables sophisticated routing, fallbacks, and load balancing.

```
Credential Stores → Pools (with Providers) → Models → Your App
```

## Basic Structure

```json
{
  "credentialStores": {
    "store-name": {
      "type": "simple|aws|google|azure|oauth",
      "source": "env|file|vault|aws-secrets|inline",
      "config": {}
    }
  },
  "pools": [{
    "id": "pool-id",
    "name": "Pool Name",
    "providers": [{
      "name": "provider-name",
      "provider": "openai|anthropic|bedrock|together|custom",
      "credentialsRef": "store-name",
      "apiBase": "https://api.provider.com/v1",
      "modelName": "actual-model-name",
      "priority": 1
    }],
    "fallbackPoolIds": ["backup-pool-id"],
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
    "your-model-name": {
      "primaryPoolId": "pool-id"
    }
  }
}
```

## Credential Stores

Define how Switch authenticates with providers.

### Simple API Key Stores

For OpenAI, Anthropic, Together AI, and other API key-based providers:

```json
{
  "credentialStores": {
    "openai": {
      "type": "simple",
      "source": "env",
      "config": {
        "apiKeyVar": "OPENAI_API_KEY"
      },
      "cacheTtl": 3600
    },
    "anthropic": {
      "type": "simple", 
      "source": "env",
      "config": {
        "apiKeyVar": "ANTHROPIC_API_KEY"
      }
    }
  }
}
```

### AWS Credential Stores

For AWS Bedrock access:

```json
{
  "credentialStores": {
    "aws-keys": {
      "type": "aws",
      "source": "env",
      "config": {
        "regionVar": "AWS_REGION",
        "accessKeyIdVar": "AWS_ACCESS_KEY_ID",
        "secretAccessKeyVar": "AWS_SECRET_ACCESS_KEY"
      }
    },
    "aws-instance": {
      "type": "aws",
      "source": "env",
      "config": {
        "regionVar": "AWS_REGION",
        "useInstanceProfile": true
      }
    }
  }
}
```

### Google Cloud Stores

For Google Vertex AI:

```json
{
  "credentialStores": {
    "google": {
      "type": "google",
      "source": "env",
      "config": {
        "projectIdVar": "GOOGLE_PROJECT_ID",
        "serviceAccountKeyVar": "GOOGLE_SERVICE_ACCOUNT_KEY"
      }
    }
  }
}
```

## Pool Configuration

Pools group providers and define routing behaviour.

### Single Provider Pool

```json
{
  "pools": [{
    "id": "fast-pool",
    "name": "Fast Models",
    "providers": [{
      "name": "openai-gpt4o-mini",
      "provider": "openai",
      "credentialsRef": "openai",
      "apiBase": "https://api.openai.com/v1",
      "modelName": "gpt-4o-mini",
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
  }]
}
```

### Multi-Provider Pool with Load Balancing

```json
{
  "pools": [{
    "id": "balanced-pool",
    "name": "Load Balanced Pool",
    "providers": [
      {
        "name": "openai-primary",
        "provider": "openai",
        "credentialsRef": "openai",
        "apiBase": "https://api.openai.com/v1",
        "modelName": "gpt-4o",
        "priority": 1,
        "weight": 70
      },
      {
        "name": "claude-secondary",
        "provider": "anthropic",
        "credentialsRef": "anthropic",
        "apiBase": "https://api.anthropic.com",
        "modelName": "claude-3-5-sonnet-20241022",
        "priority": 1,
        "weight": 30
      }
    ],
    "fallbackPoolIds": [],
    "routingStrategy": "weighted",
    "circuitBreaker": {
      "enabled": true,
      "failureThreshold": 5,
      "resetTimeout": 120000
    },
    "healthThresholds": {
      "errorRate": 15,
      "responseTime": 35000,
      "consecutiveFailures": 2,
      "minHealthyProviders": 1
    }
  }]
}
```

### Pool with Fallback Chain

```json
{
  "pools": [
    {
      "id": "primary-pool",
      "name": "Primary Models",
      "providers": [{
        "name": "openai-gpt4o",
        "provider": "openai",
        "credentialsRef": "openai",
        "apiBase": "https://api.openai.com/v1",
        "modelName": "gpt-4o",
        "priority": 1
      }],
      "fallbackPoolIds": ["backup-pool"],
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
    },
    {
      "id": "backup-pool",
      "name": "Backup Models",
      "providers": [{
        "name": "claude-backup",
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
        "errorRate": 25,
        "responseTime": 45000,
        "consecutiveFailures": 3,
        "minHealthyProviders": 1
      }
    }
  ]
}
```

## Model Configuration

Models map to their primary pool and can specify default parameters.

### Basic Model Mapping

```json
{
  "models": {
    "fast-model": {
      "primaryPoolId": "fast-pool"
    },
    "smart-model": {
      "primaryPoolId": "balanced-pool",
      "defaultParameters": {
        "temperature": 0.7,
        "maxTokens": 4096
      }
    }
  }
}
```

## Routing Strategies

Configure how requests are distributed within a pool:

- **`fastest_response`** (default): Route to fastest responding provider
- **`weighted`**: Distribute based on provider weights  
- **`cost_optimized`**: Route to lowest cost provider
- **`round_robin`**: Distribute requests evenly
- **`least_connections`**: Route to least busy provider

### Weighted Routing Example

```json
{
  "pools": [{
    "id": "weighted-pool",
    "name": "Weighted Distribution",
    "providers": [
      {"name": "fast", "provider": "openai", "credentialsRef": "openai", "apiBase": "https://api.openai.com/v1", "modelName": "gpt-4o-mini", "priority": 1, "weight": 80},
      {"name": "smart", "provider": "openai", "credentialsRef": "openai", "apiBase": "https://api.openai.com/v1", "modelName": "gpt-4o", "priority": 1, "weight": 20}
    ],
    "routingStrategy": "weighted",
    "weightedRouting": {
      "autoAdjust": false,
      "minWeight": 1,
      "maxWeight": 100
    }
  }]
}
```

## Circuit Breakers

Prevent requests to failing providers.

### Basic Circuit Breaker

```json
{
  "circuitBreaker": {
    "enabled": true,
    "failureThreshold": 3,
    "resetTimeout": 60000
  }
}
```

### Advanced Circuit Breaker with Permanent Failure Handling

```json
{
  "circuitBreaker": {
    "enabled": true,
    "failureThreshold": 5,
    "resetTimeout": 120000,
    "monitoringWindow": 300000,
    "minRequestsThreshold": 10,
    "errorThresholdPercentage": 50,
    "permanentFailureHandling": {
      "enabled": true,
      "timeoutMultiplier": 5,
      "baseTimeoutMs": 300000,
      "maxBackoffMultiplier": 4,
      "errorPatterns": [
        "404.*not found",
        "401.*unauthorized", 
        "403.*forbidden",
        "authentication.*failed",
        "invalid.*credentials"
      ]
    }
  }
}
```

## Health Thresholds

Define when pools/providers are considered unhealthy:

```json
{
  "healthThresholds": {
    "errorRate": 20,
    "responseTime": 30000,
    "consecutiveFailures": 3,
    "minHealthyProviders": 1
  }
}
```

## Provider-Specific Configuration

### Custom Headers

```json
{
  "providers": [{
    "name": "custom-provider",
    "provider": "openai",
    "credentialsRef": "custom",
    "apiBase": "https://custom-api.com/v1",
    "modelName": "custom-model",
    "priority": 1,
    "headers": {
      "Custom-Header": "value",
      "Another-Header": "another-value"
    }
  }]
}
```

### Custom Timeouts and Retries

```json
{
  "providers": [{
    "name": "slow-provider",
    "provider": "openai",
    "credentialsRef": "creds",
    "apiBase": "https://slow-api.com/v1",
    "modelName": "slow-model",
    "priority": 1,
    "timeout": 120000,
    "maxRetries": 5,
    "retryDelay": 2000
  }]
}
```

### Rate Limiting

```json
{
  "providers": [{
    "name": "rate-limited",
    "provider": "openai",
    "credentialsRef": "openai",
    "apiBase": "https://api.openai.com/v1",
    "modelName": "gpt-4o",
    "priority": 1,
    "rateLimits": {
      "requestsPerMinute": 100,
      "tokensPerMinute": 50000
    }
  }]
}
```

### Provider-Specific Parameters

```json
{
  "providers": [{
    "name": "alibaba-qwen",
    "provider": "alibaba",
    "credentialsRef": "alibaba",
    "apiBase": "https://dashscope.aliyuncs.com/compatible-mode",
    "modelName": "qwen-turbo",
    "priority": 1,
    "providerParams": {
      "enable_thinking": false,
      "incremental_output": false
    }
  }]
}
```

## Configuration Examples

### Development Setup

Simple, single-provider configuration:

```json
{
  "credentialStores": {
    "openai-dev": {
      "type": "simple",
      "source": "env",
      "config": {"apiKeyVar": "OPENAI_API_KEY"}
    }
  },
  "pools": [{
    "id": "dev-pool",
    "name": "Development Pool",
    "providers": [{
      "name": "openai-dev",
      "provider": "openai",
      "credentialsRef": "openai-dev",
      "apiBase": "https://api.openai.com/v1",
      "modelName": "gpt-4o-mini",
      "priority": 1
    }],
    "fallbackPoolIds": [],
    "routingStrategy": "fastest_response",
    "circuitBreaker": {"enabled": false},
    "healthThresholds": {
      "errorRate": 50,
      "responseTime": 60000,
      "consecutiveFailures": 10,
      "minHealthyProviders": 1
    }
  }],
  "models": {
    "dev-model": {
      "primaryPoolId": "dev-pool"
    }
  }
}
```

### Production Setup with Multiple Fallbacks

Enterprise configuration with fallback chains:

```json
{
  "credentialStores": {
    "openai": {"type": "simple", "source": "env", "config": {"apiKeyVar": "OPENAI_API_KEY"}},
    "anthropic": {"type": "simple", "source": "env", "config": {"apiKeyVar": "ANTHROPIC_API_KEY"}},
    "aws": {
      "type": "aws",
      "source": "env",
      "config": {
        "regionVar": "AWS_REGION",
        "accessKeyIdVar": "AWS_ACCESS_KEY_ID",
        "secretAccessKeyVar": "AWS_SECRET_ACCESS_KEY"
      }
    }
  },
  "pools": [
    {
      "id": "tier1-pool",
      "name": "Tier 1 Models",
      "providers": [
        {"name": "openai-gpt4o", "provider": "openai", "credentialsRef": "openai", "apiBase": "https://api.openai.com/v1", "modelName": "gpt-4o", "priority": 1, "weight": 60},
        {"name": "claude-sonnet", "provider": "anthropic", "credentialsRef": "anthropic", "apiBase": "https://api.anthropic.com", "modelName": "claude-3-5-sonnet-20241022", "priority": 1, "weight": 40}
      ],
      "fallbackPoolIds": ["tier2-pool"],
      "routingStrategy": "weighted",
      "circuitBreaker": {
        "enabled": true,
        "failureThreshold": 3,
        "resetTimeout": 120000,
        "permanentFailureHandling": {
          "enabled": true,
          "timeoutMultiplier": 5,
          "baseTimeoutMs": 300000
        }
      },
      "healthThresholds": {
        "errorRate": 10,
        "responseTime": 30000,
        "consecutiveFailures": 2,
        "minHealthyProviders": 1
      }
    },
    {
      "id": "tier2-pool",
      "name": "Tier 2 Fallback",
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
        "resetTimeout": 180000
      },
      "healthThresholds": {
        "errorRate": 25,
        "responseTime": 45000,
        "consecutiveFailures": 3,
        "minHealthyProviders": 1
      }
    }
  ],
  "models": {
    "production-model": {
      "primaryPoolId": "tier1-pool",
      "defaultParameters": {
        "temperature": 0.3,
        "maxTokens": 8192
      }
    }
  }
}
```

### Cost-Optimised Setup

Route to cheapest providers first:

```json
{
  "pools": [{
    "id": "cost-pool",
    "name": "Cost Optimised",
    "providers": [
      {"name": "together-cheap", "provider": "openai", "credentialsRef": "together", "apiBase": "https://api.together.xyz/v1", "modelName": "meta-llama/Meta-Llama-3.1-8B-Instruct-Turbo", "priority": 1, "costPerToken": 0.0000001},
      {"name": "openai-backup", "provider": "openai", "credentialsRef": "openai", "apiBase": "https://api.openai.com/v1", "modelName": "gpt-4o-mini", "priority": 2, "costPerToken": 0.000001}
    ],
    "fallbackPoolIds": [],
    "routingStrategy": "cost_optimized",
    "costOptimization": {
      "maxCostPerToken": 0.000001,
      "prioritizeCost": true
    },
    "circuitBreaker": {"enabled": true, "failureThreshold": 3, "resetTimeout": 60000},
    "healthThresholds": {"errorRate": 30, "responseTime": 45000, "consecutiveFailures": 5, "minHealthyProviders": 1}
  }]
}
```

## Environment Variables

### Required

```bash
ADMIN_API_KEY=your-admin-key-here
MODEL_DEFINITIONS='{"credentialStores":{},"pools":[],"models":{}}'
```

### Optional Server Configuration

```bash
PORT=3000
HOSTNAME=0.0.0.0
LOG_LEVEL=info
```

### Optional Performance Configuration

```bash
# High throughput mode
NODE_ENV=production
DISABLE_PRETTY_LOGGING=true
LOG_LEVEL=warn

# Timeout configuration
DEFAULT_TIMEOUT_MS=60000
MAX_TIMEOUT_MS=300000
STREAMING_TIMEOUT_MS=600000

# Circuit breaker settings
PERMANENT_FAILURE_ENABLED=true
PERMANENT_FAILURE_TIMEOUT_MULTIPLIER=5
PERMANENT_FAILURE_BASE_TIMEOUT_MS=300000
PERMANENT_FAILURE_ERROR_PATTERNS="404.*not found,401.*unauthorized,403.*forbidden"
```

## Configuration Loading

Switch loads configuration in this order:

1. **Local file**: `definitions.json` in project root
2. **Environment variable**: `MODEL_DEFINITIONS` 
3. **Auto-generated**: Test credential stores from environment variables

### Using definitions.json

Create a `definitions.json` file in your project root:

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
    "id": "main-pool",
    "name": "Main Pool",
    "providers": [{
      "name": "openai-main",
      "provider": "openai",
      "credentialsRef": "openai",
      "apiBase": "https://api.openai.com/v1",
      "modelName": "gpt-4o-mini",
      "priority": 1
    }],
    "fallbackPoolIds": [],
    "routingStrategy": "fastest_response",
    "circuitBreaker": {"enabled": true, "failureThreshold": 3, "resetTimeout": 60000},
    "healthThresholds": {"errorRate": 20, "responseTime": 30000, "consecutiveFailures": 3, "minHealthyProviders": 1}
  }],
  "models": {
    "default": {
      "primaryPoolId": "main-pool"
    }
  }
}
```

Then run Switch without setting `MODEL_DEFINITIONS`.