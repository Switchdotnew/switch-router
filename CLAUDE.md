# CLAUDE.md - Switch Service Guidelines

## Build & Development Commands

- Build: `bun run build` - Compiles TypeScript for production
- Dev: `bun run dev` - Run with hot reload using Doppler
- Start: `bun run start` - Run production build
- Lint: `bun run lint` - Run ESLint with auto-fix
- Test: `bun test` - Run Bun's built-in test runner
- Type Check: `bun run typecheck` - Check TypeScript types without emitting

## Code Style Guidelines

- **TypeScript**: Strict typing required, use explicit type definitions
- **Naming**: lowerCamelCase for variables/functions, PascalCase for classes/interfaces
- **Imports**: Use ES modules with .js extensions for local imports
- **Error Handling**: Use try/catch with proper logging (via pino)
- **Performance**: Production-grade high-throughput routing with atomic operations for 1000+ TPS stability
- **Validation**: Use Zod schemas for request/response validation

## Types System Architecture

- **Three-tier structure**: `domains/`, `public/`, `shared/`
- **Internal types**: Prefixed with `I` (e.g., `IModelDefinition`)
- **Public types**: No prefix (e.g., `ChatCompletionRequest`)
- **Import patterns**: Use `Domains` namespace for internal types
- **Clear separation**: Internal business logic vs external API contracts

## Architecture Overview

- **Framework**: Hono.js for ultra-fast HTTP handling
- **Runtime**: Bun for maximum performance
- **Purpose**: VLLM-compatible reverse proxy for model routing
- **Features**: Load balancing, health checks, production-grade streaming with client disconnect detection

## Configuration

- Uses Doppler for environment management (no .env files)
- **Pool-based architecture**: Models map to pools containing providers for sophisticated routing
- Configuration via MODEL_DEFINITIONS environment variable or definitions.json file
- **Fallback chains**: Pools can reference other pools for automatic failover
- **Circuit breakers**: Intelligent failure detection with permanent failure handling
- **Health monitoring**: Continuous provider health checks with adaptive intervals
- Run with: `doppler run -- bun run dev`

### Permanent Failure Configuration

New intelligent handling for permanent failures (404, 401, 403 errors):

**Environment Variables:**

- `PERMANENT_FAILURE_ENABLED` - Enable/disable permanent failure detection (default: true)
- `PERMANENT_FAILURE_TIMEOUT_MULTIPLIER` - Timeout multiplier for permanent failures (default: 5)
- `PERMANENT_FAILURE_BASE_TIMEOUT_MS` - Base timeout in milliseconds (default: 300000 = 5min)
- `PERMANENT_FAILURE_MAX_BACKOFF_MULTIPLIER` - Maximum exponential backoff (default: 4)
- `PERMANENT_FAILURE_ERROR_PATTERNS` - Comma-separated regex patterns for permanent failures

**Pool-based Configuration Example:**

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
      "resetTimeout": 60000,
      "permanentFailureHandling": {
        "enabled": true,
        "timeoutMultiplier": 5,
        "baseTimeoutMs": 300000,
        "maxBackoffMultiplier": 4,
        "errorPatterns": ["404.*not found", "401.*unauthorized", "403.*forbidden"]
      }
    },
    "healthThresholds": {
      "errorRate": 20,
      "responseTime": 30000,
      "consecutiveFailures": 3,
      "minHealthyProviders": 1
    }
  }],
  "models": {
    "fast-model": {
      "primaryPoolId": "fast-pool"
    }
  }
}
```

## Authentication

- **API Key Protection**: All model endpoints protected by API key authentication
- **Environment Variable**: `ADMIN_API_KEY` - comma-separated list of valid API keys
- **Header Required**: `x-api-key` header must match one of the configured keys
- **Public Endpoints**: `/health` endpoint remains public for monitoring
- **Example**: `ADMIN_API_KEY="key1,key2,key3"` allows any of these three keys

## Performance Optimization

### High-Throughput Mode

For maximum performance at 100+ TPS, enable high-throughput mode:

**Environment Variables:**

```bash
NODE_ENV=production
DISABLE_PRETTY_LOGGING=true
LOG_LEVEL=warn
```

**Configuration:**

```json
{
  "performance": {
    "mode": "high_throughput",
    "disable_debug_logging": true,
    "disable_metrics": true,
    "cache_duration_ms": 30000,
    "lightweight_validation": true,
    "disable_pretty_logging": true,
    "max_concurrent_requests": 100
  }
}
```

### Performance Features

- **Lightweight Validation**: Optimised validation for snake_case parameters
- **Provider Caching**: Cached sorted provider lists (10s TTL)
- **Fast Parameter Processing**: Optimised parameter merging and translation
- **Conditional Debug Logging**: Disabled in high-throughput mode
- **Production Logging**: JSON logging without pretty-printing overhead

### Performance Requirements

- Production-grade routing decisions with atomic operations
- Production streaming with client disconnect detection and memory leak prevention
- Optimised for high throughput in high-throughput mode (1000+ TPS stable)
- Memory usage optimised for high concurrency with proper resource cleanup

## Testing with Postman

- **Collection**: `switch.postman_collection.json` - Complete API test suite
- **Environment**: `switch.postman_environment.json` - Development environment variables
- **Setup**: Import both files into Postman and set your `API_KEY` environment variable
- **Endpoints**: Health check, models list, chat completions, text completions, streaming
- **Authentication**: Collection pre-configured with API key authentication
