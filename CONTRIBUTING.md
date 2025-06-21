# Contributing to Switch

We love your input! We want to make contributing to Switch as easy and transparent as possible, whether it's:

- Reporting a bug
- Discussing the current state of the code
- Submitting a fix
- Proposing new features
- Becoming a maintainer

## 🚀 Development Process

We use GitHub to host code, to track issues and feature requests, as well as accept pull requests.

### Pull Request Process

1. **Fork the repository** and create your branch from `master`
2. **Install dependencies**: `bun install`
3. **Make your changes** following our coding standards
4. **Add tests** for your changes if applicable
5. **Run the test suite**: `bun test`
6. **Run type checking**: `bun run typecheck`
7. **Run linting**: `bun run lint`
8. **Update documentation** if you've changed APIs
9. **Submit a pull request**

### Branch Naming Convention

- `feature/description` - New features
- `fix/description` - Bug fixes
- `docs/description` - Documentation updates
- `refactor/description` - Code refactoring
- `test/description` - Test improvements

## 🏗️ Development Setup

### Prerequisites

- [Bun](https://bun.sh/) 1.0+
- Node.js-compatible environment

### Local Development

```bash
# Clone your fork
git clone https://github.com/YOUR_USERNAME/switch.git
cd switch

# Install dependencies
bun install

# Set up environment
# Create .env file with your configuration
# See doppler-env-example.md for reference

# Start development server
bun run dev

# Alternative: Use Doppler if preferred
# doppler setup
# bun run dev:doppler
```

### Running Tests

We have a comprehensive testing framework with multiple test categories:

```bash
# Quick validation (no credentials needed)
bun run test:smoke      # < 10 seconds - Core system validation
bun run test:unit       # < 30 seconds - Component testing

# Integration testing (requires credentials)
bun run test:integration # Real API endpoint testing
bun run test:e2e        # Full end-to-end scenarios

# Combined testing
bun run test:all        # Smoke + Unit + Integration
bun test               # Legacy command (unit tests only)

# Specific test files
bun test src/types/__tests__/types.test.ts
bun test tests/integration/providers/bedrock/
```

#### Test Categories

- **Smoke Tests**: Quick validation without external API calls
- **Unit Tests**: Component and function testing
- **Integration Tests**: Real API calls with actual credentials
- **E2E Tests**: Complete user scenarios and workflows

See [tests/README.md](tests/README.md) for comprehensive testing documentation.

### AWS Development Setup

For developing and testing our comprehensive AWS Bedrock integration (50+ models):

#### Setting Up AWS Credentials

1. **Create AWS IAM User** (for development):

   ```bash
   # Required permissions: bedrock:InvokeModel, bedrock:InvokeModelWithResponseStream
   ```

2. **Set Environment Variables**:

   ```bash
   # For integration testing
   export TEST_AWS_REGION=us-east-1
   export TEST_AWS_ACCESS_KEY_ID=AKIA1234567890ABCDEF
   export TEST_AWS_SECRET_ACCESS_KEY=your-secret-key

   # For general development
   export AWS_REGION=us-east-1
   export AWS_ACCESS_KEY_ID=AKIA1234567890ABCDEF
   export AWS_SECRET_ACCESS_KEY=your-secret-key
   ```

3. **Enable Bedrock Models**: In AWS Console → Bedrock → Model Access, enable:
   - Claude 3.5 Sonnet, Claude 3 Haiku (Anthropic)
   - Nova Pro/Lite/Micro (Amazon)
   - Llama 3.1 models (Meta)
   - Mistral Large (Mistral)

#### Cost Management

- **Use us-east-1**: Most models available, often lowest cost
- **Start with Haiku**: Fastest and cheapest for testing
- **Set Billing Alerts**: AWS Console → Billing → Budgets
- **Integration Tests**: Only run when needed (skip gracefully without credentials)

#### Testing AWS Integration

```bash
# Test AWS credential setup
aws bedrock list-foundation-models --region us-east-1

# Run Bedrock integration tests
bun test tests/integration/providers/bedrock/

# Test specific Bedrock scenario
bun test tests/integration/scenarios/failover/
```

See [docs/providers/bedrock.md](docs/providers/bedrock.md) for complete AWS Bedrock setup.

### Code Quality

Our project uses comprehensive quality gates to ensure code quality:

```bash
# Run all quality checks
bun run quality:check

# Run quality checks with auto-fixes
bun run quality:fix

# Individual quality checks
bun run typecheck     # TypeScript compilation
bun run lint:check    # Code linting
bun run format:check  # Code formatting
bun test              # Test suite
bun run build         # Build verification
```

**Quality Gates**: All code goes through automated quality checks via:

- Pre-commit hooks (lint-staged, build verification)
- Pre-push hooks (full quality suite)
- GitHub Actions CI (comprehensive testing)

See [QUALITY_GATES.md](QUALITY_GATES.md) for detailed information.

## 📋 Coding Standards

### TypeScript Guidelines

- **Strict typing required** - Use explicit type definitions
- **Naming conventions**:
  - `lowerCamelCase` for variables and functions
  - `PascalCase` for classes and interfaces
  - `UPPER_SNAKE_CASE` for constants
- **Import patterns**: Use ES modules with `.js` extensions for local imports
- **Error handling**: Use try/catch with proper logging via `@vepler/logger`

### Code Style

- Use the provided ESLint configuration
- Follow existing patterns in the codebase
- Write clear, self-documenting code
- Add comments for complex business logic only

### Type System Architecture

Follow our three-tier type structure:

- **`domains/`** - Internal business logic types (prefixed with `I`)
- **`public/`** - External API contracts (no prefix)
- **`shared/`** - Common utilities and base types

```typescript
// Internal usage
import { Domains } from './types/index.js';
const model: Domains.IModelDefinition = { ... };

// External API
import { ChatCompletionRequest } from './types/public/requests/chat.js';
const request: ChatCompletionRequest = { ... };
```

## 🧪 Testing Guidelines

### General Testing Principles

- Write tests for new features and bug fixes
- Follow existing test patterns
- Use descriptive test names
- Test both happy paths and error cases
- Mock external dependencies appropriately

### Integration Testing with Real APIs

When contributing to provider integrations, you can test with real API endpoints:

```bash
# Set up credentials for the providers you're testing
export TEST_OPENAI_API_KEY="sk-your-openai-key"
export TEST_ANTHROPIC_API_KEY="sk-ant-your-anthropic-key"
export TEST_AWS_REGION="us-east-1"
export TEST_AWS_ACCESS_KEY_ID="your-aws-key"
export TEST_AWS_SECRET_ACCESS_KEY="your-aws-secret"

# Run integration tests
bun run test:integration
```

**Important**: Integration tests gracefully skip when credentials aren't available, so CI won't fail.

### Test Structure

```typescript
import { describe, it, expect } from 'bun:test';

describe('FeatureName', () => {
  it('should handle normal case correctly', () => {
    // Arrange
    const input = 'test input';

    // Act
    const result = functionUnderTest(input);

    // Assert
    expect(result).toBe('expected output');
  });
});
```

### Writing Integration Tests

For new providers, follow the pattern in `tests/integration/providers/`:

```typescript
// Example: tests/integration/providers/newprovider/newprovider-integration.test.ts
import IntegrationTestHelper from '../../utils/test-helpers.js';

describe('NewProvider Integration Tests', () => {
  test('Chat Completion', async () => {
    if (!testHelper.hasCredentialsFor('newprovider')) {
      testHelper.skipTest('NewProvider Chat', 'no credentials');
      return;
    }

    const provider = await testHelper.createTestProvider('newprovider', 'model-name');
    const result = await testHelper.testChatCompletion(provider);

    expectSuccessfulResponse(result);
  });
});
```

## 📝 Commit Message Convention

We use [Conventional Commits](https://www.conventionalcommits.org/) for automatic semantic versioning:

```
type(scope): description

[optional body]

[optional footer]
```

### Types

- `feat` - New features
- `fix` - Bug fixes
- `docs` - Documentation changes
- `style` - Code style changes (formatting, etc.)
- `refactor` - Code refactoring
- `test` - Test additions or modifications
- `chore` - Maintenance tasks

### Examples

```
feat(router): add circuit breaker pattern for provider failover

Implements sophisticated circuit breaker with configurable thresholds
for automatic provider failover and recovery.

Closes #123
```

```
fix(auth): resolve API key validation edge case

Fixes issue where empty API keys were incorrectly accepted
in certain middleware configurations.
```

## 🐛 Bug Reports

Great bug reports include:

1. **Summary** - Quick summary of the issue
2. **Environment** - OS, Bun version, etc.
3. **Steps to reproduce** - Specific steps to trigger the bug
4. **Expected behaviour** - What you expected to happen
5. **Actual behaviour** - What actually happened
6. **Additional context** - Logs, screenshots, etc.

Use our bug report template when creating issues.

## 💡 Feature Requests

Feature requests should include:

1. **Problem description** - What problem does this solve?
2. **Proposed solution** - Your preferred solution
3. **Alternatives considered** - Other approaches you've thought about
4. **Additional context** - Use cases, examples, etc.

## 🔐 Security

If you discover a security vulnerability, please follow our [Security Policy](SECURITY.md) for responsible disclosure.

## 📄 License

By contributing, you agree that your contributions will be licensed under the ISC License.

## 🤝 Code of Conduct

This project adheres to standard open source community guidelines. By participating, you are expected to be respectful and constructive.

## 🆘 Getting Help

- **Documentation**: Check the [README](README.md) first
- **Issues**: Search existing [GitHub Issues](https://github.com/Vepler/switch/issues)
- **Discussions**: Join [GitHub Discussions](https://github.com/Vepler/switch/discussions)
- **Email**: [support@switch.new](mailto:support@switch.new)

## 🎯 What We're Looking For

We particularly welcome contributions in these areas:

- Performance optimisations
- Additional provider integrations
- Enhanced monitoring and observability
- Documentation improvements
- Test coverage improvements
- Security enhancements

---

Thank you for contributing to Switch! 🚀
