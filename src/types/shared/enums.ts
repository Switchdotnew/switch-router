export const ProviderValues = {
  RUNPOD: 'runpod',
  TOGETHER: 'together',
  OPENAI: 'openai',
  ANTHROPIC: 'anthropic',
} as const;

export type Provider = (typeof ProviderValues)[keyof typeof ProviderValues];

export const LogLevelValues = {
  DEBUG: 'debug',
  INFO: 'info',
  WARN: 'warn',
  ERROR: 'error',
} as const;

export type LogLevel = (typeof LogLevelValues)[keyof typeof LogLevelValues];

export const ResponseFormatValues = {
  TEXT: 'text',
  JSON_OBJECT: 'json_object',
} as const;

export type ResponseFormat = (typeof ResponseFormatValues)[keyof typeof ResponseFormatValues];

export const MessageRoleValues = {
  SYSTEM: 'system',
  USER: 'user',
  ASSISTANT: 'assistant',
} as const;

export type MessageRole = (typeof MessageRoleValues)[keyof typeof MessageRoleValues];
