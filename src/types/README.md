# Switch Types System

This types system follows a three-tier architecture that provides clear separation between internal business logic, external API contracts, and shared utilities.

## Architecture Overview

```
types/
├── domains/     # Internal business logic types (prefixed with 'I')
├── public/      # External API consumer contracts (no prefix)
├── shared/      # Common utilities and base types
└── index.ts     # Main exports with proper namespacing
```

## Type Naming Conventions

- **Internal types**: Prefixed with `I` (e.g., `IModelDefinition`, `IProviderConfig`)
- **Public types**: No prefix (e.g., `ChatCompletionRequest`, `ModelsResponse`)
- **Shared types**: Descriptive names (e.g., `Config`, `BaseError`, `Provider`)

## Domain Types (`domains/`)

Internal business logic types used within the service implementation:

### Models Domain

- `IModelDefinition` - Internal model configuration with runtime state
- `IProviderConfig` - Provider-specific configuration and capabilities
- `IModelHealth` - Health monitoring and status tracking

### Routing Domain

- `IFallbackStrategy` - Fallback and load balancing configuration
- `IRoutingConfig` - Advanced routing options

## Public Types (`public/`)

External API contracts for consumers:

### Requests

- `ChatCompletionRequest` - VLLM-compatible chat completion API
- `CompletionRequest` - Text completion API
- `Message` - Chat message structure

### Responses

- `ModelsResponse` - Available models listing
- `HealthResponse` - Service health status
- `ErrorResponse` - Standardized error format

## Shared Types (`shared/`)

Common utilities available to both internal and external consumers:

### Enums

- `Provider` - Supported model providers
- `MessageRole` - Chat message roles
- `ResponseFormat` - Output format options
- `LogLevel` - Logging levels

### Configuration

- `Config` - Main service configuration
- `ServerConfig`, `LogConfig`, `ModelsConfig` - Component configurations

### Errors

- `BaseError` - Base error class with standardized properties
- `ValidationError`, `ModelNotFoundError` - Specific error types

## Usage Examples

### Internal Service Development

```typescript
import { Domains } from '../types/index.js';

class ModelRouter {
  private models: Map<string, Domains.IModelDefinition> = new Map();

  public getModel(name: string): Domains.IModelDefinition | null {
    return this.models.get(name) || null;
  }
}
```

### External API Consumers

```typescript
import { ChatCompletionRequest, ModelsResponse } from 'switch/types';

const request: ChatCompletionRequest = {
  model: 'qwen3',
  messages: [{ role: 'user', content: 'Hello' }],
  maxTokens: 100,
};
```

### Configuration and Validation

```typescript
import { configSchema, Provider } from '../types/shared/index.js';

const config = configSchema.parse(rawConfig);
const isOpenAI = provider === Provider.OPENAI;
```

## Benefits

- **Type Safety**: Comprehensive validation across the entire API surface
- **Clear Boundaries**: Separation between internal and external concerns
- **Documentation**: Types serve as living API documentation
- **Maintainability**: Organized by domain and usage patterns
- **Scalability**: Easy to extend with new domains and capabilities

## Publishing Strategy

The types can be published as a separate npm package for external consumers:

```bash
# Build types package
bun run build:types

# Publish to npm (internal/external separation maintained)
cd dist-types && npm publish
```

External consumers will only have access to public and shared types, while internal types remain encapsulated within the service implementation.
