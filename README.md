![Switch Logo](images/logo.png)

# Switch

**Lightweight LLM routing that keeps your stack sane.**

> **⚠️ Beta Software Notice**
> Switch is currently in beta. Despite handling over 100 million requests per month in production, we're still refining features and may introduce breaking changes. Use in production at your own discretion.

## ✨ Switch is the lightweight, open-source LLM routing platform

- 🚀 **OpenAI-compatible API** - Drop-in replacement for `/v1/chat/completions`
- 📛 **Named routes** - Use `smart-model` instead of `gpt-4o-really-long-model-name-v3`
- 🔄 **Automatic fallbacks** - When OpenAI is down, Switch tries Anthropic, then AWS Bedrock
- ⚡ **Circuit breakers** - Stop hitting broken providers automatically
- 🏊 **Pool-based routing** - Group providers for sophisticated load balancing
- 🌐 **Multi-provider support** - OpenAI, Anthropic, AWS Bedrock, Together AI, RunPod, custom APIs
- 📊 **Health monitoring** - Real-time provider health checks and metrics
- 🔒 **Enterprise security** - API key authentication, rate limiting, CORS protection

[![TypeScript](https://img.shields.io/badge/TypeScript-5.8.3-blue.svg)](https://www.typescriptlang.org/)
[![Bun](https://img.shields.io/badge/Bun-1.0+-black.svg)](https://bun.sh/)
[![License](https://img.shields.io/badge/License-Sustainable%20Use-green.svg)](LICENSE)

## The Problem

When working with multiple LLM providers (OpenAI, Anthropic, Together, local GPUs) it quickly becomes a mess:

- Every service hardcodes model names and provider logic
- When a provider goes down, half your stack breaks
- Switching providers means code changes and redeployments
- No unified interface across different APIs

## The Solution

Switch sits in front of your LLMs and provides clean, named routes like `fast-model` or `smart-model`. Behind those routes, you define where requests actually go (OpenAI, fallback to Anthropic, whatever). All in a config file.

**No app code changes. No redeploys. Just update the route and carry on.**

```bash
# Your app calls this
curl -X POST http://localhost:3000/v1/chat/completions \
  -d '{"model": "smart-model", "messages": [...]}'

# Switch routes it to the right provider based on your config
# OpenAI > Anthropic > AWS Bedrock (automatic fallbacks)
```

## Key Features

- **OpenAI-compatible API** - Drop-in replacement for `/v1/chat/completions`
- **Named routes** - Use `smart-model` instead of `gpt-4o-really-long-model-name-v3`
- **Automatic fallbacks** - When OpenAI is down, Switch tries Anthropic, then AWS Bedrock
- **Circuit breakers** - Stop hitting broken providers
- **Pool-based routing** - Group providers for sophisticated load balancing
- **Multi-provider support** - OpenAI, Anthropic, AWS Bedrock, Together AI, RunPod, custom APIs

## Quick Start

### Option 1: Docker (Recommended)

```bash
# 1. Clone and configure
git clone https://github.com/Switchdotnew/switch-router.git
cd switch
cp .env.example .env
# Edit .env with your API keys

# 2. Run with Docker
docker-compose up -d

# 3. Test it works
curl -H "x-api-key: your-api-key" http://localhost:3000/health
```

### Option 2: Local Development

```bash
# 1. Install dependencies
bun install

# 2. Configure environment
cp .env.example .env
# Edit .env with your API keys and model configuration

# 3. Start development server
bun run dev
```

### Basic Configuration Example

Create a `.env` file:

```bash
# Authentication
ADMIN_API_KEY=your-secret-key

# Provider credentials
OPENAI_API_KEY=sk-your-openai-key
ANTHROPIC_API_KEY=sk-ant-your-anthropic-key

# Basic model configuration
MODEL_DEFINITIONS='{
  "credentialStores": {
    "openai": {"type": "simple", "source": "env", "config": {"apiKeyVar": "OPENAI_API_KEY"}},
    "anthropic": {"type": "simple", "source": "env", "config": {"apiKeyVar": "ANTHROPIC_API_KEY"}}
  },
  "pools": [{
    "id": "smart-pool",
    "name": "Smart Models",
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
    "smart-model": {"primaryPoolId": "smart-pool"}
  }
}'
```

### Test Your Setup

```bash
# Check health
curl http://localhost:3000/health

# List available models
curl -H "x-api-key: your-secret-key" http://localhost:3000/v1/models

# Send a chat request
curl -X POST http://localhost:3000/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "x-api-key: your-secret-key" \
  -d '{"model": "smart-model", "messages": [{"role": "user", "content": "Hello!"}]}'
```

## Deployment Options

### Docker Compose (Production)

```bash
# Production-ready setup with monitoring
docker-compose -f docker-compose.yml up -d
```

### Kubernetes

```bash
# Minimal K8s deployment
kubectl apply -f k8s/
```

### Cloud Platforms

- AWS ECS/Fargate
- Google Cloud Run
- Azure Container Instances
- Any Docker-compatible platform

## Supported Providers

| Provider          | Status            | Models                           | Features                           |
| ----------------- | ----------------- | -------------------------------- | ---------------------------------- |
| **VLLM**          | ✅ Full           | Any model                        | Chat, Streaming, Functions, Vision |
| **OpenAI**        | ✅ Full           | GPT-4o, GPT-4, GPT-3.5           | Chat, Streaming, Functions, Vision |
| **Anthropic**     | ✅ Full           | Claude 3.5 Sonnet/Haiku          | Chat, Streaming, Functions, Vision |
| **AWS Bedrock**   | ✅ Full           | 50+ Models (Claude, Llama, Nova) | Chat, Streaming, Functions         |
| **Together AI**   | ✅ Via OpenAI API | Llama, Mixtral, Code Llama       | Chat, Streaming                    |
| **RunPod**        | ✅ Via OpenAI API | Custom Models                    | Chat, Streaming                    |
| **Google Vertex** | 🚧 Coming Soon    | Gemini, PaLM                     | -                                  |
| **Azure OpenAI**  | 🚧 Coming Soon    | GPT Models                       | -                                  |

## What's Next?

- **[Getting Started Guide](docs/getting-started.md)** - Detailed setup instructions
- **[Configuration Guide](docs/configuration.md)** - Complete configuration reference
- **[Provider Setup](docs/providers.md)** - Provider-specific setup instructions
- **[Troubleshooting](docs/troubleshooting.md)** - Common issues and solutions

## License

This project is licensed under the Sustainable Use License - see the [LICENSE](LICENSE) file for details.

## Contributing

Switch thrives on community contributions! Whether you're fixing bugs, adding providers, or improving docs - we'd love your help.

- **Found a bug or have an idea?** Open a [GitHub issue](https://github.com/Switchdotnew/switch-router/issues)
- **Want to add a new provider?** Check out our [provider guide](docs/providers.md)
- **Improving documentation?** All docs live in the `/docs` folder
- **Need help getting started?** Reach out at [support@switch.new](mailto:support@switch.new)

## Contributors

<a href="https://github.com/Switchdotnew/switch-router/graphs/contributors">
  <img src="https://contrib.rocks/image?repo=Switchdotnew/switch-router" />
</a>

## Support

- **Documentation**: [docs/](docs/)
- **Issues**: [GitHub Issues](https://github.com/Switchdotnew/switch-router/issues)
- **Email**: [support@switch.new](mailto:support@switch.new)
