# Getting Started

Switch is a lightweight router that sits between your apps and LLM providers. Instead of hardcoding provider details in your apps, you define named routes like `fast-model` or `cheap-model` and Switch handles the rest.

## Quick Setup

### 1. Install and Run

```bash
git clone https://github.com/Vepler/switch.git
cd switch
bun install
bun run dev
```

### 2. Basic Configuration

Create a `.env` file:

```bash
# Your API keys
OPENAI_API_KEY=sk-your-key-here
ADMIN_API_KEY=your-admin-key

# Basic model config
MODEL_DEFINITIONS='{
  "credentialStores": {
    "openai": {
      "type": "simple",
      "source": "env",
      "config": {"apiKeyVar": "OPENAI_API_KEY"}
    }
  },
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
    "circuitBreaker": {"enabled": true, "failureThreshold": 3, "resetTimeout": 60000},
    "healthThresholds": {"errorRate": 20, "responseTime": 30000, "consecutiveFailures": 3, "minHealthyProviders": 1}
  }],
  "models": {
    "fast-model": {
      "primaryPoolId": "fast-pool"
    }
  }
}'
```

### 3. Test Your Setup

```bash
# Check health
curl http://localhost:3000/health

# List your models
curl -H "x-api-key: your-admin-key" \
     http://localhost:3000/v1/models

# Send a chat request
curl -X POST http://localhost:3000/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "x-api-key: your-admin-key" \
  -d '{
    "model": "fast-model",
    "messages": [{"role": "user", "content": "Hello!"}]
  }'
```

## Key Concepts

**Named Routes**: Instead of `gpt-4o-mini`, you use names like `fast-model`. Your apps never need to know the underlying provider.

**Fallbacks**: Define multiple providers for the same route. If OpenAI is down, Switch automatically tries Anthropic.

**Configuration-Driven**: Change providers by updating config, not code. No redeployments needed.

## What's Next?

- [Configuration Guide](configuration.md) - Learn all config options
- [Provider Setup](providers.md) - Add Anthropic, AWS Bedrock, etc.
- [Troubleshooting](troubleshooting.md) - Fix common issues

## Common First Steps

**Add Anthropic fallback**:
```json
{
  "credentialStores": {
    "openai": {"type": "simple", "source": "env", "config": {"apiKeyVar": "OPENAI_API_KEY"}},
    "anthropic": {"type": "simple", "source": "env", "config": {"apiKeyVar": "ANTHROPIC_API_KEY"}}
  },
  "pools": [{
    "id": "smart-pool",
    "name": "Smart Models with Fallback",
    "providers": [
      {"name": "openai-gpt4o", "provider": "openai", "credentialsRef": "openai", "apiBase": "https://api.openai.com/v1", "modelName": "gpt-4o", "priority": 1},
      {"name": "claude-fallback", "provider": "anthropic", "credentialsRef": "anthropic", "apiBase": "https://api.anthropic.com", "modelName": "claude-3-5-sonnet-20241022", "priority": 2}
    ],
    "fallbackPoolIds": [],
    "routingStrategy": "fastest_response",
    "circuitBreaker": {"enabled": true, "failureThreshold": 3, "resetTimeout": 60000},
    "healthThresholds": {"errorRate": 20, "responseTime": 30000, "consecutiveFailures": 3, "minHealthyProviders": 1}
  }],
  "models": {
    "smart-model": {
      "primaryPoolId": "smart-pool"
    }
  }
}
```

**Advanced circuit breaker configuration**:
```json
{
  "pools": [{
    "id": "reliable-pool",
    "name": "Reliable Models",
    "providers": [{"name": "openai-gpt4o", "provider": "openai", "credentialsRef": "openai", "apiBase": "https://api.openai.com/v1", "modelName": "gpt-4o", "priority": 1}],
    "fallbackPoolIds": [],
    "routingStrategy": "fastest_response",
    "circuitBreaker": {
      "enabled": true,
      "failureThreshold": 5,
      "resetTimeout": 120000,
      "permanentFailureHandling": {
        "enabled": true,
        "timeoutMultiplier": 5,
        "baseTimeoutMs": 300000
      }
    },
    "healthThresholds": {"errorRate": 15, "responseTime": 25000, "consecutiveFailures": 2, "minHealthyProviders": 1}
  }],
  "models": {
    "reliable-model": {
      "primaryPoolId": "reliable-pool"
    }
  }
}
```