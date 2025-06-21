![Switch Logo](images/logo.png)

# Switch

**Lightweight LLM routing that keeps your stack sane.**

> **⚠️ Beta Software Notice**
> Switch is currently in beta whilst being actively developed. Despite currently handling over 100 million requests per month in production environments, we're still refining features and may introduce breaking changes. Use in production at your own discretion and ensure proper testing.

[![TypeScript](https://img.shields.io/badge/TypeScript-5.8.3-blue.svg)](https://www.typescriptlang.org/)
[![Bun](https://img.shields.io/badge/Bun-1.0+-black.svg)](https://bun.sh/)
[![Hono](https://img.shields.io/badge/Hono-4.7.11-orange.svg)](https://hono.dev/)
[![License](https://img.shields.io/badge/License-Sustainable%20Use-green.svg)](LICENSE)

When working with multiple models or providers — across OpenAI, Anthropic, Together, local GPUs, whatever — it quickly becomes a mess. Every service ends up hardcoding model names, auth, provider logic, fallbacks... and when something changes? Half the infrastructure needs redeploying.

Switch solves this.

It sits in front of LLMs and provides clean, named routes like `internal-lite` or `internal-fallback`. Behind those routes, you define where requests actually go — Qwen on Provider A, fallback to Mistral on Provider B, etc. All handled in a config file. Services don't need to know or care about the underlying complexity.

No app code changes. No redeploys. Just update the route and carry on.

If you're building anything serious with LLMs — agents, RAG stacks, LLM APIs, multi-model systems — this starts to matter fast.

## Core Value

**Unified LLM Interface**

- One API for all your models and providers
- Clean, named routes instead of hardcoded provider logic
- Configuration-driven routing that lives outside your application code

**Smart Fallbacks**

- Automatic failover when providers go down
- Cost-optimised routing: cheap providers first, expensive as backup
- Circuit breakers that prevent cascading failures

**Zero Vendor Lock-in**

- Self-hosted on your infrastructure
- No commission fees or markup costs
- Switch providers without changing application code

## Features

**Core Routing**

- OpenAI-compatible API (`/v1/chat/completions`, `/v1/completions`)
- Named route abstraction (e.g., `internal-lite`, `prod-fallback`)
- Multi-provider support: OpenAI, Anthropic, AWS Bedrock, Together AI, RunPod, custom endpoints
- Request/response streaming with proper cleanup

**Reliability**

- Circuit breakers with intelligent failure detection
- Automatic fallbacks when providers fail
- Health monitoring and real-time status
- Load balancing across multiple endpoints

**Operations**

- Configuration-driven setup (no code changes for routing updates)
- Centralized credential management
- Admin API for monitoring and manual overrides
- Built on Bun + Hono for performance

## Supported Providers

| Provider             | Type        | Credential Type   | Models                                                  | Capabilities                                          |
| -------------------- | ----------- | ----------------- | ------------------------------------------------------- | ----------------------------------------------------- |
| **AWS Bedrock**      | `bedrock`   | AWS IAM           | 50+ Models (Claude, Llama, Nova, Mistral, Cohere, AI21) | Chat, Streaming, Function Calling, Vision, RAG        |
| **OpenAI**           | `openai`    | API Key           | GPT-4o, GPT-4, GPT-3.5                                  | Chat, Completion, Streaming, Function Calling, Vision |
| **Anthropic**        | `anthropic` | API Key           | Claude 3.5 Sonnet/Haiku                                 | Chat, Streaming, Function Calling, Vision             |
| **Together AI**      | `together`  | API Key           | Llama, Mixtral, Code Llama [WIP]                        | Chat, Completion, Streaming [via OpenAI adapter]      |
| **RunPod**           | `runpod`    | API Key           | Custom Models [WIP]                                     | Chat, Completion, Streaming [via OpenAI adapter]      |
| **Google Vertex AI** | `vertex`    | Service Account   | Coming Soon                                             | Not yet implemented                                   |
| **Azure OpenAI**     | `azure`     | Azure Credentials | Coming Soon                                             | Not yet implemented                                   |

## Quick Start

### Prerequisites

- [Bun](https://bun.sh/) 1.0+
- Node.js-compatible environment

### Installation

```bash
# Clone the repository
git clone https://github.com/Vepler/switch.git
cd switch

# Install dependencies
bun install

# Configure environment
# Create .env file with your configuration
# See environment configuration section below for required variables

# Start development server
bun run dev
```

### Environment Configuration

Create a `.env` file with your configuration (see also doppler-env-example.md for Doppler setup):

```bash
# Server Configuration
SERVER_HOST=localhost
SERVER_PORT=3000
LOG_LEVEL=info

# Authentication (comma-separated keys)
ADMIN_API_KEY=your-api-key-1,your-api-key-2

# Provider Credentials
OPENAI_API_KEY=sk-your-openai-api-key
ANTHROPIC_API_KEY=sk-ant-your-anthropic-api-key
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=AKIA1234567890ABCDEF
AWS_SECRET_ACCESS_KEY=your-aws-secret-access-key
GOOGLE_PROJECT_ID=your-google-project-id
GOOGLE_SERVICE_ACCOUNT_KEY='{"type":"service_account",...}'

# Model Configuration with Credential Stores (NEW)
MODEL_DEFINITIONS='{
  "credentialStores": {
    "openai-api": {
      "type": "simple",
      "source": "env",
      "config": {
        "apiKeyVar": "OPENAI_API_KEY"
      }
    },
    "aws-bedrock": {
      "type": "aws",
      "source": "env",
      "config": {
        "regionVar": "AWS_REGION",
        "accessKeyIdVar": "AWS_ACCESS_KEY_ID",
        "secretAccessKeyVar": "AWS_SECRET_ACCESS_KEY"
      }
    }
  },
  "models": {
    "claude-3-5-sonnet": {
      "name": "claude-3-5-sonnet",
      "providers": [
        {
          "name": "anthropic-primary",
          "provider": "anthropic",
          "credentialsRef": "anthropic-api",
          "modelName": "claude-3-5-sonnet-20241022",
          "priority": 1
        },
        {
          "name": "bedrock-fallback",
          "provider": "bedrock",
          "credentialsRef": "aws-bedrock",
          "modelName": "anthropic.claude-3-5-sonnet-20241022-v2:0",
          "priority": 2
        }
      ],
      "circuitBreaker": {
        "enabled": true,
        "failureThreshold": 3,
        "resetTimeout": 60000,
        "permanentFailureHandling": {
          "enabled": true,
          "timeoutMultiplier": 5,
          "baseTimeoutMs": 300000,
          "maxBackoffMultiplier": 4,
          "errorPatterns": [
            "404.*not found",
            "401.*unauthorized",
            "403.*forbidden"
          ]
        }
      }
    }
  }
}'
```

**Alternative: Doppler Support**
If you prefer using Doppler for environment management:

```bash
bun run dev:doppler
```

## API Documentation

### Authentication

All endpoints (except `/health`) require authentication via the `x-api-key` header:

```bash
curl -H "x-api-key: your-api-key" http://localhost:3000/v1/models
```

### Core Endpoints

#### Health Check

```http
GET /health
```

Returns service status (no authentication required).

#### List Models

```http
GET /v1/models
```

Returns available models and their configurations.

#### Chat Completions

```http
POST /v1/chat/completions
Content-Type: application/json

{
  "model": "qwen3-0.6b",
  "messages": [
    {"role": "user", "content": "Hello, world!"}
  ],
  "maxTokens": 100,
  "temperature": 0.7,
  "stream": false
}
```

#### Text Completions

```http
POST /v1/completions
Content-Type: application/json

{
  "model": "qwen3-0.6b",
  "prompt": "The future of AI is",
  "maxTokens": 50,
  "temperature": 0.7
}
```

### Admin Endpoints

#### Provider Status

```http
GET /admin/providers/status
```

Returns comprehensive provider health and circuit breaker status:

```json
{
  "qwen3-0.6b-runpod-primary": {
    "state": "closed",
    "metrics": {
      "totalRequests": 1247,
      "successfulRequests": 1198,
      "failedRequests": 49,
      "averageResponseTime": 850,
      "errorRate": 3.93
    }
  }
}
```

#### Reset Provider Circuit Breaker

```http
POST /admin/providers/{modelName}/{providerName}/reset
```

#### Credential Management [WIP]

Credential management admin endpoints are currently under development. Current credential management is handled via configuration files and environment variables.

### Response Headers

Responses include metadata headers:

- `X-Used-Provider`: Which provider handled the request
- `X-Used-Fallback`: Set to "true" if fallback was used
- `X-Circuit-Breaker-State`: Current circuit breaker state
- `X-Provider-Response-Time`: Response time from provider (ms)

## Configuration

### Credential Store Configuration

The new credential store system provides centralized, secure credential management:

```json
{
  "credentialStores": {
    "store-id": {
      "type": "simple|aws|google|azure|oauth",
      "source": "env|file|vault|aws-secrets",
      "config": {
        // Type-specific configuration
      },
      "cacheTtl": 3600,
      "rotation": {
        "enabled": false,
        "intervalHours": 24
      }
    }
  }
}
```

### Model Configuration

Models reference credential stores for clean separation of concerns:

```json
{
  "models": {
    "model-name": {
      "name": "model-name",
      "providers": [
        {
          "name": "primary-provider",
          "provider": "openai|anthropic|bedrock|vertex|azure|together|runpod|custom",
          "credentialsRef": "credential-store-id",
          "apiBase": "https://api.provider.com",
          "modelName": "actual-model-name",
          "priority": 1,
          "weight": 100
        }
      ],
      "circuitBreaker": {
        "enabled": true,
        "failureThreshold": 5,
        "resetTimeout": 60000
      }
    }
  }
}
```

### AWS Bedrock Example

Switch provides **comprehensive AWS Bedrock integration** with support for 50+ models across 6 major families:

```json
{
  "credentialStores": {
    "aws-bedrock-prod": {
      "type": "aws",
      "source": "env",
      "config": {
        "regionVar": "AWS_REGION",
        "accessKeyIdVar": "AWS_ACCESS_KEY_ID",
        "secretAccessKeyVar": "AWS_SECRET_ACCESS_KEY"
      },
      "cacheTtl": 1800
    },
    "aws-bedrock-instance": {
      "type": "aws",
      "source": "env",
      "config": {
        "regionVar": "AWS_REGION",
        "useInstanceProfile": true
      }
    }
  },
  "models": {
    "claude-3-5-sonnet": {
      "name": "claude-3-5-sonnet",
      "providers": [
        {
          "name": "bedrock-primary",
          "provider": "bedrock",
          "credentialsRef": "aws-bedrock-prod",
          "apiBase": "https://bedrock-runtime.${AWS_REGION}.amazonaws.com",
          "modelName": "claude-3-5-sonnet-20241022",
          "priority": 1,
          "weight": 100,
          "timeout": 30000,
          "maxRetries": 3,
          "circuitBreaker": {
            "enabled": true,
            "failureThreshold": 3,
            "resetTimeout": 60000
          }
        },
        {
          "name": "bedrock-fallback",
          "provider": "bedrock",
          "credentialsRef": "aws-bedrock-instance",
          "apiBase": "https://bedrock-runtime.${AWS_REGION}.amazonaws.com",
          "modelName": "claude-3-haiku-20240307",
          "priority": 2
        }
      ],
      "defaultParameters": {
        "temperature": 0.3,
        "maxTokens": 8192
      },
      "loadBalancing": {
        "strategy": "priority-based",
        "stickySessions": false
      },
      "fallback": {
        "enabled": true,
        "maxAttempts": 2,
        "enableModelDegradation": true
      }
    }
  }
}
```

**Supported Bedrock Model Families:**

- **Anthropic**: Claude 3.5 Sonnet, Claude 3 Opus/Sonnet/Haiku (Chat, Streaming, Function Calling, Vision)
- **Amazon**: Nova Pro/Lite/Micro, Titan Text (Chat, Vision, Multimodal)
- **Meta**: Llama 3.1/3.2 (8B to 405B), Llama Vision (Chat, Function Calling, Long Context)
- **Mistral**: Mistral Large, Mixtral 8x7B (Chat, Function Calling)
- **Cohere**: Command R/R+, Command Light (Chat, RAG, Function Calling)
- **AI21**: Jamba 1.5 Large/Mini, Jurassic-2 (Chat, Long Context up to 256K tokens)

**Advanced Bedrock Features:**

- **Multi-Authentication**: Access keys, instance profiles, web identity (EKS/OIDC)
- **Intelligent Fallback**: Automatic model degradation (e.g., Sonnet → Haiku)
- **Cost Optimization**: Automatic cost calculation and provider selection
- **Region Failover**: Cross-region fallback for high availability
- **Parameter Validation**: Model-specific parameter validation and optimization

### Circuit Breaker Configuration

- `failureThreshold`: Number of failures before opening circuit
- `resetTimeout`: Time before attempting recovery (ms)
- `monitoringWindow`: Window for tracking failures (ms)
- `minRequestsThreshold`: Minimum requests before evaluation
- `errorThresholdPercentage`: Error rate percentage threshold

#### Permanent Failure Handling (New)

Intelligent handling for permanent failures like 404, 401, 403 errors:

- `permanentFailureHandling.enabled`: Enable permanent failure detection (default: true)
- `permanentFailureHandling.timeoutMultiplier`: Multiplier for permanent failure timeouts (default: 5)
- `permanentFailureHandling.baseTimeoutMs`: Base timeout for permanent failures (default: 300000ms = 5min)
- `permanentFailureHandling.maxBackoffMultiplier`: Maximum exponential backoff (default: 4 = 16x max)
- `permanentFailureHandling.errorPatterns`: Custom regex patterns for permanent failures

**Environment Variables:**

```bash
PERMANENT_FAILURE_ENABLED=true
PERMANENT_FAILURE_TIMEOUT_MULTIPLIER=5
PERMANENT_FAILURE_BASE_TIMEOUT_MS=300000
PERMANENT_FAILURE_MAX_BACKOFF_MULTIPLIER=4
PERMANENT_FAILURE_ERROR_PATTERNS="404.*not found,401.*unauthorized,custom.*pattern"
```

**Behaviour:**

- **404/401/403 errors**: Trigger immediate circuit breaker trip with extended timeout
- **Exponential backoff**: 5min → 10min → 20min → 40min → 80min for repeated failures
- **Automatic fallback**: Routes to backup providers during extended timeouts
- **Configurable patterns**: Customise which errors are considered permanent

> **See Also**: [Permanent Failure Configuration Examples docs/permanent-failure-examples.md](docs/permanent-failure-examples.md) for detailed configuration scenarios.

### Load Balancing Strategies

- **round-robin**: Distribute requests evenly
- **weighted**: Route based on provider weights
- **least-connections**: Route to provider with fewest active connections
- **fastest-response**: Route to provider with lowest response time
- **priority-based**: Route based on provider priorities

## Credential Management Features

### Centralized Credential Stores

- **Single Definition**: Define credentials once, reference everywhere
- **Type Safety**: Proper validation for AWS IAM, API keys, OAuth tokens
- **Secure Storage**: Support for external secret stores (Vault, AWS Secrets Manager)
- **Caching**: Intelligent credential caching with configurable TTL

### Supported Credential Types

- **Simple API Keys**: OpenAI, Anthropic, Together AI (`simple`)
- **AWS IAM**: Bedrock, SageMaker with proper IAM roles (`aws`)
- **Google Service Accounts**: Vertex AI with service account keys (`google`)
- **Azure Credentials**: Azure OpenAI with managed identities (`azure`)
- **OAuth**: OAuth-based providers with token refresh (`oauth`)

### Security Features

- **No Hardcoded Credentials**: All credentials resolved from environment/vault
- **Credential Rotation**: Automatic credential lifecycle management
- **Audit Logging**: Track credential access and usage
- **Validation**: Comprehensive validation before use

## Development

### Project Structure

```
switch/
├── src/
│   ├── api/                # Route handlers and middleware
│   ├── core/               # Core business logic (circuit breaker, load balancer)
│   ├── providers/          # Provider adapters (OpenAI, Anthropic, Bedrock, etc.)
│   ├── credentials/        # Credential management system
│   │   ├── stores/         # Credential store implementations
│   │   ├── resolvers/      # Credential resolution and caching
│   │   └── managers/       # Central credential management
│   ├── types/              # TypeScript type definitions
│   ├── utils/              # Utilities and helpers
│   ├── config/             # Configuration management
│   └── metrics/            # Metrics collection and monitoring
```

### Available Scripts

```bash
bun run dev        # Start development server (.env)
bun run dev:doppler # Start development server (Doppler)
bun run build      # Build for production
bun run start      # Start production server
bun run test       # Run test suite
bun run typecheck  # TypeScript type checking
bun run lint       # Lint and fix code style
```

### Testing

```bash
# Run all tests
bun test

# Run specific test
bun test src/types/__tests__/types.test.ts

# Using Postman
# Import switch.postman_collection.json
# Import switch.postman_environment.json
# Set API_KEY environment variable
```

## Deployment

### Quick Start with Docker

```bash
# Build image
docker build -t switch .

# Run container
docker run -p 3000:3000 \
  -e ADMIN_API_KEY="your-keys" \
  -e MODEL_DEFINITIONS="your-config" \
  switch
```

### Production Deployment

For production environments, see the **[Production Deployment Guide](docs/production-deployment.md)** which covers:

- **Docker Compose** with monitoring stack
- **Kubernetes** minimal deployment with autoscaling
- **Security** configuration and best practices
- **Performance** optimization for high throughput
- **Monitoring** and observability setup

**Quick Production Setup:**

```bash
# Docker Compose
# Create .env.production with your configuration
# See environment configuration section for required variables
docker-compose up -d

# Kubernetes
kubectl apply -f k8s/namespace.yaml -f k8s/configmap.yaml
# Create secrets with your credentials
kubectl apply -f k8s/deployment.yaml -f k8s/service.yaml
```

### Development

1. **Build the application**

   ```bash
   bun run build
   ```

2. **Set environment variables**

   ```bash
   export ADMIN_API_KEY="development-keys"
   export MODEL_DEFINITIONS="development-config"
   ```

3. **Start the server**
   ```bash
   bun run start
   ```

## Troubleshooting

### Common Issues

#### Provider 404 Errors

- **Alibaba/Dashscope**: Ensure API base includes `/compatible-mode`
- **RunPod**: Verify endpoint ID in API base URL
- **Model Names**: Ensure model names match provider's expected format

**With Permanent Failure Handling (New):**

- 404 errors now trigger extended timeouts (5+ minutes instead of 60 seconds)
- System automatically falls back to working providers
- Check `/admin/providers/status` to see extended timeout status
- Adjust `PERMANENT_FAILURE_BASE_TIMEOUT_MS` if needed

#### Circuit Breaker Stuck Open

- Check `minRequestsThreshold` - may be too high for testing
- Verify `errorThresholdPercentage` is appropriate
- Use admin endpoint to manually reset
- **For permanent failures**: Extended timeouts are intentional - check provider configuration
- **Disable permanent failure handling**: Set `PERMANENT_FAILURE_ENABLED=false` for testing

#### Load Balancing Not Working

- Ensure multiple providers have different `priority` values
- Check provider health status via `/admin/providers/status`
- Verify `stickySessions` setting

## Contributing

We welcome contributions! Please see our [Contributing Guide](CONTRIBUTING.md) for details.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

This project is licensed under the Sustainable Use License - see the [LICENSE](LICENSE) file for details.

## Support

- **Issues**: [GitHub Issues](https://github.com/Vepler/switch/issues)
- **Documentation**: Check this README and [configuration examples](docs/examples/)
- **Email**: [support@switch.new](mailto:support@switch.new)

---

Built with Bun, Hono, and TypeScript for maximum performance and developer experience.
