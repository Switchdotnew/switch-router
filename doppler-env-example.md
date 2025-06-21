# Doppler Environment Variables

Configure these variables in your Doppler project:

## Server Configuration

```
PORT=3000
HOSTNAME=localhost
LOG_LEVEL=info
```

## Model Configuration

```
DEFAULT_MODEL=qwen3
```

## Model Definitions (JSON Object format)

```json
MODEL_DEFINITIONS={
  "qwen3": {
    "name": "qwen3",
    "apiKey": "your-runpod-api-key",
    "apiBase": "https://api.runpod.ai/v2/your-endpoint-id",
    "modelName": "Qwen/Qwen2.5-VL-7B-Instruct",
    "temperature": 0.1,
    "maxTokens": 4000,
    "provider": "runpod"
  },
  "together-llama": {
    "name": "together-llama",
    "apiKey": "your-together-api-key",
    "apiBase": "https://api.together.xyz",
    "modelName": "meta-llama/Llama-3.2-11B-Vision-Instruct-Turbo",
    "temperature": 0.7,
    "maxTokens": 4096,
    "provider": "together"
  },
  "openai-gpt4": {
    "name": "openai-gpt4",
    "apiKey": "your-openai-api-key",
    "apiBase": "https://api.openai.com",
    "modelName": "gpt-4-turbo-preview",
    "temperature": 0.3,
    "maxTokens": 4096,
    "provider": "openai"
  }
}
```

## Routing Configuration

```
ENABLE_FALLBACK=true
HEALTH_CHECK_INTERVAL=30000
```
