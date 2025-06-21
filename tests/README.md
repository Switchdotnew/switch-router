# Switch Testing Framework

Comprehensive testing framework for validating Switch's multi-provider LLM routing capabilities.

## 🧪 Test Structure

```
tests/
├── integration/               # Real API integration tests
│   ├── providers/
│   │   ├── bedrock/          # AWS Bedrock models (50+ models)
│   │   ├── openai/           # OpenAI models
│   │   ├── anthropic/        # Claude models
│   │   ├── together/         # Together AI models
│   │   └── runpod/           # RunPod models
│   ├── scenarios/            # End-to-end scenarios
│   │   ├── failover/         # Provider failover testing
│   │   ├── load-balancing/   # Load balancing strategies
│   │   └── streaming/        # Streaming across providers
│   ├── config/               # Test configurations
│   │   ├── credentials/      # Test credential configurations
│   │   └── models/           # Test model definitions
│   └── utils/                # Integration test utilities
├── e2e/                      # Full end-to-end scenarios
├── performance/              # Performance/load testing
└── smoke/                    # Quick smoke tests for CI
```

## 🚀 Test Categories

### 1. **Smoke Tests** (Fast - CI on every PR)

```bash
bun run test:smoke
```

- **Purpose**: Quick validation without external API calls
- **Duration**: < 10 seconds
- **Scope**: Configuration, setup, model registry, error handling
- **When**: Every PR, every commit
- **Credentials**: None required

### 2. **Unit Tests** (Fast - CI on every PR)

```bash
bun run test:unit
```

- **Purpose**: Test individual components and functions
- **Duration**: < 30 seconds
- **Scope**: Internal business logic, transformations, utilities
- **When**: Every PR, every commit
- **Credentials**: None required

### 3. **Integration Tests** (Real APIs - Manual/Scheduled)

```bash
bun run test:integration
```

- **Purpose**: Test real API endpoints with actual credentials
- **Duration**: 1-5 minutes per provider
- **Scope**: Provider API calls, response validation, error handling
- **When**: Manual testing, scheduled CI, release validation
- **Credentials**: Required for each provider

### 4. **E2E Tests** (Complete flows - Pre-release)

```bash
bun run test:e2e
```

- **Purpose**: Complete user scenarios from request to response
- **Duration**: 5-15 minutes
- **Scope**: Full request lifecycle, multi-provider scenarios
- **When**: Pre-release validation, major feature testing
- **Credentials**: Multiple providers required

### 5. **Performance Tests** (Load testing - As needed)

```bash
# Coming soon
bun run test:performance
```

- **Purpose**: Load testing, latency benchmarks, concurrent requests
- **Duration**: 10-60 minutes
- **Scope**: High-throughput scenarios, provider performance comparison
- **When**: Performance validation, capacity planning
- **Credentials**: Production-like credentials

## 🔐 Credential Configuration

### Environment Variables

Set these environment variables to run integration tests with real API calls:

```bash
# OpenAI
TEST_OPENAI_API_KEY=sk-your-openai-api-key

# Anthropic
TEST_ANTHROPIC_API_KEY=sk-ant-your-anthropic-api-key

# AWS Bedrock (Access Keys)
TEST_AWS_REGION=us-east-1
TEST_AWS_ACCESS_KEY_ID=AKIA1234567890ABCDEF
TEST_AWS_SECRET_ACCESS_KEY=your-aws-secret-access-key
TEST_AWS_SESSION_TOKEN=optional-session-token

# Together AI
TEST_TOGETHER_API_KEY=your-together-api-key

# RunPod
TEST_RUNPOD_API_KEY=your-runpod-api-key
```

### AWS Authentication Methods

The integration tests support all AWS authentication methods:

1. **Access Keys** (above)
2. **Instance Profile** (automatic in EC2)
3. **Web Identity** (automatic in EKS/Fargate)

## 📊 Test Commands

### Quick Testing

```bash
# Run all fast tests (unit + smoke)
bun run test:all

# Run only smoke tests (fastest)
bun run test:smoke

# Run only unit tests
bun run test:unit
```

### Integration Testing

```bash
# Run all integration tests
bun run test:integration

# Run specific provider tests
bun test tests/integration/providers/bedrock/
bun test tests/integration/providers/openai/
bun test tests/integration/providers/anthropic/

# Run scenario tests
bun test tests/integration/scenarios/failover/
```

### CI/Development

```bash
# Quality gates (what CI runs)
bun run quality:check

# Fix quality issues
bun run quality:fix

# Run TypeScript checking
bun run typecheck
```

## 🎯 Test Coverage

### Bedrock Integration (50+ models)

- **Anthropic**: Claude 3.5 Sonnet, Claude 3 Opus/Sonnet/Haiku
- **Amazon**: Nova Pro/Lite/Micro, Titan Text
- **Meta**: Llama 3.1/3.2 (8B to 405B), Llama Vision
- **Mistral**: Mistral Large, Mixtral 8x7B
- **Cohere**: Command R/R+, Command Light
- **AI21**: Jamba 1.5 Large/Mini, Jurassic-2

### Provider Features

- ✅ Chat Completions
- ✅ Streaming Responses
- ✅ Function Calling
- ✅ Vision/Multimodal (where supported)
- ✅ Error Handling & Recovery
- ✅ Authentication Methods
- ✅ Rate Limiting Behavior
- ✅ Failover Scenarios

### Scenarios Tested

- ✅ Primary → Fallback Provider Chains
- ✅ Model Degradation (Premium → Fast)
- ✅ Circuit Breaker Integration
- ✅ Load Balancing Strategies
- ✅ Cross-Provider Consistency
- ✅ Response Format Validation

## 🚦 CI Integration

### GitHub Actions Jobs

1. **Test Suite** (Every PR/Push)

   - Unit tests
   - Smoke tests
   - TypeScript checking
   - Linting & formatting

2. **Integration Tests** (PRs only)

   - Provider integration tests (graceful skip without credentials)
   - Scenario tests (configuration validation)
   - Error handling paths

3. **Docker Build** (Every PR/Push)

   - Docker image build
   - Container health check

4. **Performance Tests** (PRs only)
   - Basic performance benchmarks
   - Health endpoint testing

### Test Results

Tests provide detailed results:

- ✅ **Success**: Test passed with performance metrics
- ⏭️ **Skipped**: Missing credentials (expected)
- ❌ **Failed**: Actual failure requiring attention

## 🔧 Development Workflow

### Adding New Provider Tests

1. **Create provider test file**:

   ```bash
   touch tests/integration/providers/newprovider/newprovider-integration.test.ts
   ```

2. **Add model configuration**:

   ```typescript
   // Add to tests/integration/config/test-models.ts
   export const NEWPROVIDER_TEST_MODELS: ITestModelConfig[] = [...]
   ```

3. **Update test helper**:
   ```typescript
   // Add to tests/integration/utils/test-helpers.ts
   case 'newprovider':
     return 'https://api.newprovider.com';
   ```

### Running Tests Locally

```bash
# Development cycle
bun run test:smoke           # Quick validation
bun run test:unit           # Component testing

# With credentials for full testing
export TEST_OPENAI_API_KEY="sk-..."
export TEST_ANTHROPIC_API_KEY="sk-ant-..."
bun run test:integration    # Full integration testing
```

### Debugging Test Failures

1. **Check logs**: Tests provide detailed logging
2. **Verify credentials**: Ensure test credentials are valid
3. **Check network**: Some tests require internet connectivity
4. **Run individually**: Isolate failing tests

```bash
# Run single test file
bun test tests/integration/providers/openai/openai-integration.test.ts

# Run with verbose output
bun test --verbose tests/smoke/
```

## 📈 Performance Expectations

### Latency Targets (95th percentile)

- **Claude Haiku**: < 2 seconds
- **GPT-4o Mini**: < 3 seconds
- **Claude Sonnet**: < 5 seconds
- **GPT-4o**: < 5 seconds
- **Llama 70B**: < 6 seconds
- **Llama 405B**: < 8 seconds

### Test Performance

- **Smoke Tests**: < 10 seconds
- **Unit Tests**: < 30 seconds
- **Integration Tests**: 1-5 minutes per provider
- **E2E Tests**: 5-15 minutes total

## 🛠️ Troubleshooting

### Common Issues

1. **"No credentials" warnings**

   - **Solution**: Set TEST\_\*\_API_KEY environment variables
   - **Note**: Tests will skip gracefully without credentials

2. **AWS SDK not available**

   - **Solution**: Tests use fallback implementation automatically
   - **Note**: This is expected in test environments

3. **Rate limiting errors**

   - **Solution**: Tests include automatic retry logic
   - **Note**: Some providers have strict rate limits

4. **Network timeouts**
   - **Solution**: Check internet connectivity
   - **Note**: Tests have generous timeout settings

### Test Environment Issues

```bash
# Check Bun version
bun --version  # Should be 1.0+

# Check test files exist
ls tests/integration/providers/

# Verify no TypeScript errors
bun run typecheck

# Check dependencies
bun install
```

## 📋 Test Checklist

Before releasing new features:

- [ ] All smoke tests pass
- [ ] All unit tests pass
- [ ] Integration tests pass for affected providers
- [ ] New providers have comprehensive test coverage
- [ ] Performance tests show no regression
- [ ] Error handling scenarios tested
- [ ] Documentation updated

## 🎯 Future Enhancements

- **Visual Test Reports**: HTML test result dashboards
- **Performance Monitoring**: Continuous performance tracking
- **Cost Tracking**: API cost monitoring during tests
- **Parallel Testing**: Concurrent provider testing
- **Advanced Scenarios**: Complex multi-provider workflows

---

This testing framework ensures Switch maintains the highest quality standards across all 50+ supported models and multiple providers, with comprehensive validation for real-world usage scenarios.
