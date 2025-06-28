#!/usr/bin/env node

// Simple test script to verify pool configuration loading
import { existsSync } from 'fs';

console.log('Testing pool-based routing integration...');

// Check if required files exist
const basePath = process.cwd().includes('switch-open-source') ? './' : '../../switch-open-source/';
const requiredFiles = [
  `${basePath}dist/config.js`,
  `${basePath}dist/utils/pool-manager.js`,
  `${basePath}dist/utils/enhanced-router.js`,
  `${basePath}definitions-with-pools.example.json`
];

let allFilesExist = true;
for (const file of requiredFiles) {
  if (!existsSync(file)) {
    console.error(`❌ Missing required file: ${file}`);
    allFilesExist = false;
  } else {
    console.log(`✅ Found: ${file}`);
  }
}

if (!allFilesExist) {
  console.error('❌ Some required files are missing. Please build the project first.');
  process.exit(1);
}

// Test configuration schema
try {
  const { configSchema } = await import(`${basePath}dist/types/shared/config.js`);
  
  // Test with pools example configuration
  const exampleConfig = {
    server: { port: 3000, hostname: 'localhost' },
    log: { level: 'info' },
    models: {
      defaultModel: 'test-model',
      definitions: {
        'test-model': {
          name: 'test-model',
          providers: [{
            name: 'test-provider',
            provider: 'openai',
            credentialsRef: 'test-creds',
            apiBase: 'https://api.openai.com/v1',
            modelName: 'gpt-3.5-turbo',
            priority: 1
          }]
        }
      }
    },
    pools: {
      enabled: true,
      defaultPool: 'test-pool',
      pools: {
        'test-pool': {
          name: 'test-pool',
          description: 'Test pool',
          models: ['test-model'],
          loadBalancing: {
            strategy: 'fastest-response',
            healthCheckWeight: 0.3
          },
          failover: {
            enabled: true,
            strategy: 'priority-based',
            maxAttempts: 3,
            delayMs: 1000,
            backoffMultiplier: 2,
            crossPoolFailover: false
          },
          healthThresholds: {
            errorRate: 20,
            responseTime: 30000,
            consecutiveFailures: 3,
            minHealthyProviders: 1
          },
          priority: 1,
          limits: {
            maxConcurrentRequests: 10
          },
          monitoring: {
            enabled: true,
            metricsRetentionDays: 7,
            alertThresholds: {
              errorRate: 25,
              responseTime: 35000,
              consecutiveFailures: 4,
              minHealthyProviders: 1
            }
          }
        }
      },
      assignments: [{
        model: 'test-model',
        pool: 'test-pool',
        priority: 1
      }],
      crossPoolFailover: {
        enabled: false,
        maxAttempts: 2,
        strategy: 'priority-based'
      },
      monitoring: {
        globalMetricsEnabled: true,
        costTrackingEnabled: false,
        performanceOptimizationEnabled: true
      }
    },
    routing: {
      enableFallback: true,
      healthCheckInterval: 30000
    }
  };

  const result = configSchema.parse(exampleConfig);
  console.log('✅ Pool configuration schema validation passed');
  console.log(`✅ Pools enabled: ${result.pools?.enabled}`);
  console.log(`✅ Number of pools: ${Object.keys(result.pools?.pools || {}).length}`);
  console.log(`✅ Pool assignments: ${result.pools?.assignments?.length || 0}`);
  
} catch (error) {
  console.error('❌ Schema validation failed:', error.message);
  process.exit(1);
}

// Test PoolManager instantiation
try {
  const { PoolManager } = await import(`${basePath}dist/utils/pool-manager.js`);
  const { ProviderHealthManager } = await import(`${basePath}dist/utils/provider-health-manager.js`);
  
  const healthManager = new ProviderHealthManager();
  const poolManager = new PoolManager(healthManager);
  
  console.log('✅ PoolManager instantiation successful');
  console.log(`✅ Pool manager enabled: ${poolManager.isEnabled()}`);
  
} catch (error) {
  console.error('❌ PoolManager instantiation failed:', error.message);
  process.exit(1);
}

// Test EnhancedModelRouter with pools
try {
  const { EnhancedModelRouter } = await import(`${basePath}dist/utils/enhanced-router.js`);
  
  const router = new EnhancedModelRouter();
  console.log('✅ EnhancedModelRouter with pool support instantiation successful');
  console.log(`✅ Router pools enabled: ${router.isPoolsEnabled()}`);
  
} catch (error) {
  console.error('❌ EnhancedModelRouter instantiation failed:', error.message);
  process.exit(1);
}

console.log('\n🎉 All pool integration tests passed!');
console.log('\nNext steps:');
console.log('1. Copy definitions-with-pools.example.json to definitions.json');
console.log('2. Set up your credential environment variables');
console.log('3. Start the server with pool-based routing enabled');
console.log('4. Monitor pools via the /health endpoint');