# Troubleshooting

Common issues and how to fix them.

## Server Won't Start

### "Cannot find module" Errors

Make sure you've installed dependencies:

```bash
bun install
```

### "Port already in use"

Change the port or kill the existing process:

```bash
# Change port
SERVER_PORT=3001 bun run dev

# Or kill existing process
lsof -ti:3000 | xargs kill -9
```

### Invalid JSON in MODEL_DEFINITIONS or definitions.json

Check your JSON syntax:

```bash
# Test MODEL_DEFINITIONS environment variable
echo '$MODEL_DEFINITIONS' | jq .

# Test definitions.json file
jq . definitions.json
```

Common JSON errors:
- Missing commas between objects
- Trailing commas (not allowed in JSON)
- Unmatched quotes or brackets
- Missing required fields in pool configuration

## API Errors

### 401 Unauthorized

**Check your admin API key**:
```bash
curl -H "x-api-key: wrong-key" http://localhost:3000/v1/models
# Returns 401

curl -H "x-api-key: correct-key" http://localhost:3000/v1/models  
# Returns models list
```

**Missing API key header**:
```bash
# Wrong - no header
curl http://localhost:3000/v1/models

# Right - with header  
curl -H "x-api-key: your-key" http://localhost:3000/v1/models
```

### 404 Model Not Found

**Check your model name**:
```bash
# List available models
curl -H "x-api-key: your-key" http://localhost:3000/v1/models

# Use exact model name from the list
curl -X POST http://localhost:3000/v1/chat/completions \
  -H "x-api-key: your-key" \
  -H "Content-Type: application/json" \
  -d '{"model": "exact-model-name", "messages": [{"role": "user", "content": "test"}]}'
```

### 500 Internal Server Error

**Check server logs** for detailed error messages:
```bash
bun run dev
# Look for error details in console output
```

**Common causes**:
- Invalid provider credentials
- Network issues reaching provider APIs
- Malformed configuration

## Provider Issues

### OpenAI API Errors

**Invalid API key**:
```bash
# Test your key directly
curl https://api.openai.com/v1/models \
  -H "Authorization: Bearer $OPENAI_API_KEY"
```

**Rate limiting**:
- OpenAI returns 429 status codes
- Switch will automatically retry
- Consider adding fallback providers

### Anthropic API Errors

**Invalid API key format**:
- Anthropic keys start with `sk-ant-`
- Check you're using the correct key format

**Model name errors**:
- Use exact model names: `claude-3-5-sonnet-20241022`
- Don't use simplified names like `claude-3.5-sonnet`

### AWS Bedrock Issues

**Credential errors**:
```bash
# Test AWS credentials
aws bedrock list-foundation-models --region us-east-1
```

**Region availability**:
- Not all models are available in all regions
- Check AWS documentation for model availability
- Common regions: `us-east-1`, `us-west-2`

**Permission errors**:
- Ensure your AWS credentials have `bedrock:InvokeModel` permissions
- Check IAM policies

### Provider 404 Errors

**Wrong API base URL**:
```json
{
  "pools": [{
    "providers": [{
      "name": "provider",
      "provider": "openai",
      "credentialsRef": "openai",
      "apiBase": "https://wrong-url.com/v1",  // Wrong!
      "modelName": "model",
      "priority": 1
    }]
  }]
}
```

**Missing /compatible-mode for Alibaba**:
```json
{
  "pools": [{
    "providers": [{
      "name": "alibaba-provider",
      "provider": "alibaba",
      "credentialsRef": "alibaba",
      "apiBase": "https://dashscope.aliyuncs.com/compatible-mode",  // Required!
      "modelName": "qwen-turbo",
      "priority": 1
    }]
  }]
}
```

## Circuit Breaker Issues

### Circuit Breaker Stuck Open

**Check provider status**:
```bash
curl -H "x-api-key: your-key" \
     http://localhost:3000/admin/providers/status
```

**Reset circuit breaker**:
```bash
curl -X POST -H "x-api-key: your-key" \
     http://localhost:3000/admin/providers/model-name/provider-name/reset
```

**Disable for testing**:
```json
{
  "pools": [{
    "id": "test-pool",
    "name": "Test Pool",
    "providers": [{
      "name": "test-provider",
      "provider": "openai",
      "credentialsRef": "openai",
      "apiBase": "https://api.openai.com/v1",
      "modelName": "gpt-4o-mini",
      "priority": 1
    }],
    "circuitBreaker": {"enabled": false},
    "healthThresholds": {"errorRate": 100, "responseTime": 300000, "consecutiveFailures": 100, "minHealthyProviders": 1}
  }]
}
```

### Permanent Failure Handling

When you get 404/401/403 errors, Switch uses longer timeouts by default.

**Check extended timeout status**:
```bash
curl -H "x-api-key: your-key" \
     http://localhost:3000/admin/providers/status
```

**Disable permanent failure handling**:
```bash
PERMANENT_FAILURE_ENABLED=false bun run dev
```

**Adjust timeout settings**:
```bash
PERMANENT_FAILURE_BASE_TIMEOUT_MS=60000  # 1 minute instead of 5
```

## Configuration Problems

### Credential Store Not Found

**Error**: `Credential store 'store-name' not found`

**Fix**: Make sure the credential store is defined and referenced correctly:
```json
{
  "credentialStores": {
    "store-name": {
      "type": "simple",
      "source": "env", 
      "config": {"apiKeyVar": "API_KEY"}
    }
  },
  "pools": [{
    "id": "example-pool",
    "name": "Example Pool",
    "providers": [{
      "name": "example-provider",
      "provider": "openai",
      "credentialsRef": "store-name",  // Must match above
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
    "example-model": {
      "primaryPoolId": "example-pool"
    }
  }
}
```

### Environment Variable Not Set

**Error**: `Environment variable 'OPENAI_API_KEY' not found`

**Fix**: Set the environment variable:
```bash
export OPENAI_API_KEY=sk-your-key
# Or add to .env file
echo "OPENAI_API_KEY=sk-your-key" >> .env
```

### Pool Configuration Issues

**Missing required pool fields**:
```json
{
  "pools": [{
    "id": "required-field",
    "name": "required-field", 
    "providers": ["required-array"],
    "circuitBreaker": "required-object",
    "healthThresholds": "required-object"
  }]
}
```

**Provider priority conflicts**:
If multiple providers have the same priority, Switch picks based on routing strategy.

**Fix**: Use different priorities for fallback ordering:
```json
{
  "providers": [
    {"name": "primary", "priority": 1},
    {"name": "secondary", "priority": 2},  
    {"name": "tertiary", "priority": 3}
  ]
}
```

**Model not mapped to pool**:
```json
{
  "models": {
    "my-model": {
      "primaryPoolId": "pool-that-must-exist"
    }
  }
}
```

## Performance Issues

### Slow Response Times

**Check provider latency**:
```bash
curl -H "x-api-key: your-key" \
     http://localhost:3000/admin/providers/status
# Look at averageResponseTime
```

**Enable high-throughput mode**:
```bash
NODE_ENV=production
DISABLE_PRETTY_LOGGING=true
LOG_LEVEL=warn
bun run dev
```

**Use faster providers**:
- Groq for speed
- OpenAI for balance  
- Local providers for lowest latency

### High Memory Usage

**Check for memory leaks**:
```bash
# Monitor memory usage
top -p $(pgrep -f "bun.*switch")
```

**Enable production mode**:
```bash
NODE_ENV=production bun run start
```

## Testing and Debugging

### Test Individual Providers

**Bypass Switch for testing**:
```bash
# Test OpenAI directly
curl https://api.openai.com/v1/chat/completions \
  -H "Authorization: Bearer $OPENAI_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"model": "gpt-4o-mini", "messages": [{"role": "user", "content": "test"}]}'

# Test Anthropic directly  
curl https://api.anthropic.com/v1/messages \
  -H "x-api-key: $ANTHROPIC_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"model": "claude-3-haiku-20240307", "max_tokens": 100, "messages": [{"role": "user", "content": "test"}]}'
```

### Enable Debug Logging

```bash
LOG_LEVEL=debug bun run dev
```

This shows detailed request/response information.

### Check Switch Health

```bash
# Health endpoint (no auth required)
curl http://localhost:3000/health

# Should return: {"status": "ok"}
```

### Validate Configuration

```bash
# Check if models are loaded correctly
curl -H "x-api-key: your-key" \
     http://localhost:3000/v1/models

# Check provider status
curl -H "x-api-key: your-key" \
     http://localhost:3000/admin/providers/status
```

## Getting Help

### Useful Information to Include

When reporting issues, include:

1. **Error message** (exact text)
2. **Switch logs** (with LOG_LEVEL=debug)
3. **Configuration** (sanitised, no API keys)
4. **Environment** (OS, Bun version, Node version)
5. **Request example** that's failing

### Debug Commands

```bash
# Check Bun version
bun --version

# Check Node version (if using Node)
node --version

# Test JSON configuration
echo '$MODEL_DEFINITIONS' | jq .

# Check environment variables
env | grep -E "(API_KEY|AWS_)"

# Test network connectivity
curl -I https://api.openai.com
curl -I https://api.anthropic.com
```

### Common Quick Fixes

1. **Restart the server** - Fixes configuration reload issues
2. **Check API keys** - Most common problem
3. **Verify model names** - Must match provider exactly  
4. **Test providers directly** - Isolate Switch vs provider issues
5. **Check logs** - Error details are usually in the logs