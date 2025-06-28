import { configSchema, type Config } from './types/shared/config.js';
import type { Domains } from './types/index.js';
import type { ICredentialStoreConfig } from './types/domains/credential.js';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import log from './utils/logging.js';

function validateNoPlaceholders(pools: any[]): void {
  for (const pool of pools) {
    if (pool.providers) {
      for (const provider of pool.providers) {
        // Check for placeholder patterns in critical fields
        const criticalFields = [
          { name: 'apiKey', value: provider.apiKey },
          { name: 'apiBase', value: provider.apiBase },
          { name: 'modelName', value: provider.modelName },
        ];

        for (const field of criticalFields) {
          if (field.value && typeof field.value === 'string' && field.value.includes('${')) {
            log.error(
              `Pool "${pool.id}" provider "${provider.name}" contains placeholder in ${field.name}: ${field.value}`
            );
            log.error('Please provide actual configuration values instead of placeholders.');
            log.error('Refusing to start with placeholder configuration.');
            process.exit(1);
          }
        }
      }
    }
  }
}

/**
 * Detect if credential stores configuration is in array format
 */
function isArrayBasedCredentialStores(credentialStores: unknown): credentialStores is ICredentialStoreConfig[] {
  return Array.isArray(credentialStores);
}

/**
 * Convert array-based credential stores to object-based format for internal use
 */
function normalizeCredentialStores(credentialStores: Record<string, unknown> | ICredentialStoreConfig[]): Record<string, unknown> {
  if (isArrayBasedCredentialStores(credentialStores)) {
    log.info('Converting array-based credential stores to object format for internal processing');
    
    const objectFormat: Record<string, unknown> = {};
    
    for (const store of credentialStores) {
      // Use name as the key, or fall back to ID if name is not available
      const storeKey = store.name || (store.id ? `store-${store.id}` : `store-${Date.now()}`);
      objectFormat[storeKey] = store;
      
      log.debug(`Converted credential store: ${store.name || store.id} -> ${storeKey}`, {
        originalId: store.id,
        originalName: store.name,
        storeKey,
        type: store.type,
      });
    }
    
    return objectFormat;
  }
  
  // Already in object format
  return credentialStores as Record<string, unknown>;
}

/**
 * Auto-detect test environment credentials and generate credential store configurations
 */
function generateTestCredentialStores(): Record<string, unknown> {
  const credentialStores: Record<string, unknown> = {};
  let foundTestCredentials = false;

  // Test environment variables mapping
  const testEnvMappings = [
    {
      storeId: 'test-openai',
      envVar: 'TEST_OPENAI_API_KEY',
      type: 'simple',
      config: { apiKeyVar: 'TEST_OPENAI_API_KEY' },
    },
    {
      storeId: 'test-anthropic',
      envVar: 'TEST_ANTHROPIC_API_KEY',
      type: 'simple',
      config: { apiKeyVar: 'TEST_ANTHROPIC_API_KEY' },
    },
    {
      storeId: 'test-together',
      envVar: 'TEST_TOGETHER_API_KEY',
      type: 'simple',
      config: { apiKeyVar: 'TEST_TOGETHER_API_KEY' },
    },
    {
      storeId: 'test-runpod',
      envVar: 'TEST_RUNPOD_API_KEY',
      type: 'simple',
      config: { apiKeyVar: 'TEST_RUNPOD_API_KEY' },
    },
  ];

  // AWS credentials (multiple auth methods)
  const awsRegion = process.env.TEST_AWS_REGION;
  const awsAccessKeyId = process.env.TEST_AWS_ACCESS_KEY_ID;
  const awsSecretAccessKey = process.env.TEST_AWS_SECRET_ACCESS_KEY;

  // Check for simple API key credentials
  for (const mapping of testEnvMappings) {
    if (process.env[mapping.envVar]) {
      credentialStores[mapping.storeId] = {
        type: mapping.type,
        source: 'env',
        config: mapping.config,
        cacheTtl: 3600,
      };
      foundTestCredentials = true;
      log.debug(`Auto-detected test credential store: ${mapping.storeId} (${mapping.envVar})`);
    }
  }

  // AWS credentials with access keys
  if (awsRegion && awsAccessKeyId && awsSecretAccessKey) {
    credentialStores['test-aws-keys'] = {
      type: 'aws',
      source: 'env',
      config: {
        regionVar: 'TEST_AWS_REGION',
        accessKeyIdVar: 'TEST_AWS_ACCESS_KEY_ID',
        secretAccessKeyVar: 'TEST_AWS_SECRET_ACCESS_KEY',
        ...(process.env.TEST_AWS_SESSION_TOKEN && { sessionTokenVar: 'TEST_AWS_SESSION_TOKEN' }),
      },
      cacheTtl: 1800,
    };
    foundTestCredentials = true;
    log.debug('Auto-detected AWS access key credentials for test-aws-keys');
  }

  // AWS instance profile (if region is set but no explicit keys)
  if (awsRegion && !awsAccessKeyId) {
    credentialStores['test-aws-instance'] = {
      type: 'aws',
      source: 'env',
      config: {
        regionVar: 'TEST_AWS_REGION',
        useInstanceProfile: true,
      },
    };
    foundTestCredentials = true;
    log.debug('Auto-detected AWS instance profile for test-aws-instance');
  }

  // AWS web identity (if region is set)
  if (awsRegion) {
    credentialStores['test-aws-web-identity'] = {
      type: 'aws',
      source: 'env',
      config: {
        regionVar: 'TEST_AWS_REGION',
        useWebIdentity: true,
      },
    };
    foundTestCredentials = true;
    log.debug('Auto-detected AWS web identity for test-aws-web-identity');
  }

  if (foundTestCredentials) {
    log.info(
      `Auto-generated ${Object.keys(credentialStores).length} test credential stores from environment variables`
    );
  }

  return credentialStores;
}

function loadConfigurationData(): {
  pools: any[];
  models: Record<string, any>;
  credentialStores?: Record<string, unknown>;
} {
  log.info('🏠 Local mode enabled - Standalone operation');
  return loadLocalConfigurationData();
}

function loadLocalConfigurationData(): {
  pools: any[];
  models: Record<string, any>;
  credentialStores?: Record<string, unknown>;
} {
  // Check for local definitions.json file first
  const localDefinitionsPath = join(process.cwd(), 'definitions.json');

  if (existsSync(localDefinitionsPath)) {
    try {
      const fileContent = readFileSync(localDefinitionsPath, 'utf-8');
      const configData = JSON.parse(fileContent);
      log.info(`Loaded configuration from local file: ${localDefinitionsPath}`);

      // Extract pools and models from new configuration format
      const pools = configData.pools || [];
      const models = configData.models || {};

      // Validate that we have actual configuration and not just placeholders
      if (pools.length > 0) {
        validateNoPlaceholders(pools);
      }

      // Normalize credential stores to support both object and array formats
      let normalizedCredentialStores = configData.credentialStores;
      if (normalizedCredentialStores) {
        normalizedCredentialStores = normalizeCredentialStores(normalizedCredentialStores);
      }

      return {
        pools,
        models,
        credentialStores: normalizedCredentialStores,
      };
    } catch (error) {
      log.warn(`Failed to parse local definitions.json file: ${error}`);
      log.info('Falling back to environment variable...');
    }
  } else {
    log.info('No local definitions.json found, checking environment variable...');
  }

  // Fallback to environment variable
  const modelDefinitionsRaw = process.env.MODEL_DEFINITIONS || '{}';
  try {
    const configData = JSON.parse(modelDefinitionsRaw);

    // Extract pools and models from new configuration format
    const pools = configData.pools || [];
    const models = configData.models || {};

    if (pools.length > 0) {
      log.info('Loaded pool configuration from MODEL_DEFINITIONS environment variable');

      // Validate that we have actual configuration and not just placeholders
      validateNoPlaceholders(pools);
    } else {
      log.debug('No pool configuration found in environment variable');
    }

    // If no credential stores are configured but we have test environment variables,
    // auto-generate credential store configurations
    let credentialStores = configData.credentialStores;
    
    // Normalize credential stores to support both object and array formats
    if (credentialStores) {
      credentialStores = normalizeCredentialStores(credentialStores);
    }
    
    if (!credentialStores || Object.keys(credentialStores).length === 0) {
      const testCredentialStores = generateTestCredentialStores();
      if (Object.keys(testCredentialStores).length > 0) {
        credentialStores = testCredentialStores;
        log.info('Using auto-generated test credential stores');
      }
    }

    return {
      pools,
      models,
      credentialStores,
    };
  } catch (error) {
    log.warn('Failed to parse MODEL_DEFINITIONS environment variable:', error);

    // Even if pool configuration parsing fails, try to generate test credential stores
    const testCredentialStores = generateTestCredentialStores();
    if (Object.keys(testCredentialStores).length > 0) {
      log.info('Auto-generated test credential stores despite configuration error');
      return {
        pools: [],
        models: {},
        credentialStores: testCredentialStores,
      };
    }

    return { pools: [], models: {} };
  }
}

function loadConfig(): Config {
  const configData = loadConfigurationData();

  // Check if we have any pool configuration
  if (configData.pools.length === 0) {
    const isProduction = process.env.NODE_ENV === 'production';

    if (isProduction) {
      log.error('CONFIGURATION_ERROR: No pool configuration found');
      log.error('Service cannot start without pool configuration');
      process.exit(1);
    } else {
      log.warn('No pool configuration found!');
      log.warn('This may be expected in test environments.');
      log.warn('For development, provide pool configuration via:');
      log.warn('1. Create a definitions.json file with pools array in the project root, OR');
      log.warn('2. Set the MODEL_DEFINITIONS environment variable with pools configuration');
      log.warn('3. Use doppler: doppler run -- bun run dev');
    }
  }

  // Parse permanent failure error patterns from environment
  const permanentFailurePatterns = process.env.PERMANENT_FAILURE_ERROR_PATTERNS
    ? process.env.PERMANENT_FAILURE_ERROR_PATTERNS.split(',').map((pattern) => pattern.trim())
    : undefined;

  const rawConfig = {
    server: {
      port: parseInt(process.env.PORT || '3000'),
      hostname: process.env.HOSTNAME || '0.0.0.0',
    },
    log: {
      level: process.env.LOG_LEVEL || 'info',
    },
    pools: configData.pools,
    models: configData.models,
    routing: {
      enableFallback: process.env.ENABLE_FALLBACK !== 'false',
      healthCheckInterval: parseInt(process.env.HEALTH_CHECK_INTERVAL || '30000'),
      permanentFailureHandling: {
        enabled: process.env.PERMANENT_FAILURE_ENABLED !== 'false',
        timeoutMultiplier: parseInt(process.env.PERMANENT_FAILURE_TIMEOUT_MULTIPLIER || '5'),
        baseTimeoutMs: parseInt(process.env.PERMANENT_FAILURE_BASE_TIMEOUT_MS || '300000'),
        maxBackoffMultiplier: parseInt(process.env.PERMANENT_FAILURE_MAX_BACKOFF_MULTIPLIER || '4'),
        ...(permanentFailurePatterns && { errorPatterns: permanentFailurePatterns }),
      },
    },
    timeout: {
      enabled: process.env.TIMEOUT_ENABLED !== 'false',
      defaultTimeoutMs: parseInt(process.env.DEFAULT_TIMEOUT_MS || '60000'),
      maxTimeoutMs: parseInt(process.env.MAX_TIMEOUT_MS || '300000'),
      minTimeoutMs: parseInt(process.env.MIN_TIMEOUT_MS || '1000'),
      includeTimeoutHeaders: process.env.INCLUDE_TIMEOUT_HEADERS !== 'false',
      credentialResolutionTimeoutMs: parseInt(process.env.CREDENTIAL_RESOLUTION_TIMEOUT_MS || '10000'),
      providerTimeoutMultiplier: parseFloat(process.env.PROVIDER_TIMEOUT_MULTIPLIER || '0.8'),
      streamingTimeoutMs: parseInt(process.env.STREAMING_TIMEOUT_MS || '600000'),
    },
    ...(configData.credentialStores && { credentialStores: configData.credentialStores }),
  };

  return configSchema.parse(rawConfig);
}

// Initialize config synchronously
let configInstance: Config | null = null;

export function getConfig(): Config {
  if (!configInstance) {
    configInstance = loadConfig();
  }
  return configInstance;
}

// Synchronous config access proxy (will throw if config not loaded)
export const config = new Proxy({} as Config, {
  get(target, prop) {
    if (!configInstance) {
      throw new Error('Configuration not loaded yet. Use getConfig() for async loading or ensure config is loaded before use.');
    }
    return configInstance[prop as keyof Config];
  }
});

export type { Config };
