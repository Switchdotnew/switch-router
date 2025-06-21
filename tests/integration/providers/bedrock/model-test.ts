#!/usr/bin/env bun

/**
 * End-to-end test for model configuration and API requests
 * Tests the complete flow: config loading -> credential resolution -> API calls
 */

import { describe, test, expect, beforeAll, afterAll } from 'bun:test';
import log from '../../../../src/utils/logging.js';
import { config } from '../../../../src/config.js';
import { CredentialManager } from '../../../../src/credentials/managers/credential-manager.js';
import { initializeRouter, getRouter } from '../../../../src/utils/enhanced-router.js';

describe('E2E Model Tests', () => {
  let credentialManager: CredentialManager | undefined;

  beforeAll(async () => {
    log.info('🧪 Setting up E2E test environment...');

    // Initialize credential manager if configured
    if (config.credentialStores && Object.keys(config.credentialStores).length > 0) {
      log.info(
        `🔑 Initializing credential manager with ${Object.keys(config.credentialStores).length} stores...`
      );
      credentialManager = new CredentialManager();
      await credentialManager.initialize(config.credentialStores);
      log.info('✅ Credential manager initialized');

      // Log credential store status
      for (const [storeName, storeConfig] of Object.entries(config.credentialStores)) {
        log.info(`   - ${storeName}: ${storeConfig.type} (${storeConfig.source})`);
      }
    } else {
      console.log('⚠️  No credential stores configured - using legacy mode');
    }

    // Initialize the enhanced model router
    console.log('🔧 Initializing enhanced model router...');
    await initializeRouter(credentialManager);
    console.log('✅ Enhanced model router initialized');
  });

  test('Configuration Loading', () => {
    console.log('\n📋 Testing configuration loading...');

    // Test that config is loaded correctly
    expect(config).toBeDefined();
    expect(config.models).toBeDefined();
    expect(config.models.definitions).toBeDefined();

    // Test that models are configured
    const modelNames = Object.keys(config.models.definitions);
    console.log(`   Found ${modelNames.length} models: ${modelNames.join(', ')}`);
    expect(modelNames.length).toBeGreaterThan(0);

    // Test credential stores if present
    if (config.credentialStores) {
      const storeNames = Object.keys(config.credentialStores);
      console.log(`   Found ${storeNames.length} credential stores: ${storeNames.join(', ')}`);
      expect(storeNames.length).toBeGreaterThan(0);
    }
  });

  test('Credential Resolution', async () => {
    if (!credentialManager || !config.credentialStores) {
      console.log('⏭️  Skipping credential resolution test - no credential manager');
      return;
    }

    console.log('\n🔑 Testing credential resolution...');

    // Test each credential store
    for (const [storeName, storeConfig] of Object.entries(config.credentialStores)) {
      console.log(`   Testing credential store: ${storeName}`);

      try {
        const credentials = await credentialManager.resolveCredentials(storeName);
        expect(credentials).toBeDefined();
        expect(credentials.type).toBe(storeConfig.type);
        console.log(`   ✅ ${storeName} resolved successfully (type: ${credentials.type})`);

        // Test that we can get auth headers
        const authHeaders = credentials.getAuthHeaders();
        expect(authHeaders).toBeDefined();
        expect(typeof authHeaders).toBe('object');
        console.log(`   ✅ ${storeName} auth headers generated`);
      } catch (error) {
        console.error(`   ❌ ${storeName} failed: ${error}`);
        throw error;
      }
    }
  });

  test('Router Model Access', () => {
    console.log('\n🔧 Testing router model access...');

    const router = getRouter();
    expect(router).toBeDefined();

    // Test each configured model
    for (const modelName of Object.keys(config.models.definitions)) {
      console.log(`   Testing model: ${modelName}`);

      const model = router.getModel(modelName);
      expect(model).toBeDefined();
      expect(model!.name).toBe(modelName);
      expect(model!.providers).toBeDefined();
      expect(model!.providers.length).toBeGreaterThan(0);

      console.log(`   ✅ ${modelName} found with ${model!.providers.length} providers`);

      // Test each provider
      for (const provider of model!.providers) {
        console.log(
          `      - ${provider.name} (${provider.provider}) priority=${provider.priority}`
        );

        // Verify provider has either apiKey or credentialsRef
        if (
          !('apiKey' in provider && provider.apiKey) &&
          !('credentialsRef' in provider && provider.credentialsRef)
        ) {
          throw new Error(`Provider ${provider.name} has no apiKey or credentialsRef`);
        }

        if ('credentialsRef' in provider && provider.credentialsRef) {
          console.log(`        credentialsRef: ${provider.credentialsRef}`);

          // Verify the credential store exists
          if (config.credentialStores && !config.credentialStores[provider.credentialsRef]) {
            throw new Error(`Credential store '${provider.credentialsRef}' not found`);
          }
        }

        // Check for provider parameters
        if (provider.providerParams) {
          console.log(`        providerParams: ${JSON.stringify(provider.providerParams)}`);
        }

        if (provider.healthCheckParams) {
          console.log(`        healthCheckParams: ${JSON.stringify(provider.healthCheckParams)}`);
        }
      }
    }
  });

  test('Health Checks', async () => {
    console.log('\n🏥 Testing provider health checks...');

    const router = getRouter();

    // Test health checks for each model
    for (const modelName of Object.keys(config.models.definitions)) {
      const model = router.getModel(modelName);
      if (!model) continue;

      console.log(`   Testing health checks for model: ${modelName}`);

      for (const provider of model.providers) {
        const _providerId = `${modelName}-${provider.name}`;
        console.log(`      Testing provider: ${provider.name}`);

        try {
          // Get the client for this provider
          const client = router.getClient(modelName, provider.name);
          expect(client).toBeDefined();

          // Test health check
          const isHealthy = await client!.healthCheck();
          console.log(`      ${provider.name}: ${isHealthy ? '✅ healthy' : '❌ unhealthy'}`);

          // Don't fail the test if health check fails - external APIs might be down
          // Just log the result
        } catch (error) {
          console.log(`      ${provider.name}: ❌ health check failed - ${error}`);
          // Continue with other providers
        }
      }
    }
  });

  test('Mock API Request', async () => {
    console.log('\n🚀 Testing mock API request flow...');

    const router = getRouter();

    // Test with the first available model
    const modelName = Object.keys(config.models.definitions)[0];
    if (!modelName) {
      throw new Error('No models configured for testing');
    }

    console.log(`   Testing API request flow with model: ${modelName}`);

    try {
      // Create a mock operation that doesn't actually call the API
      const mockOperation = async (client: any, providerId: string) => {
        console.log(`      Mock operation called with provider: ${providerId}`);

        // Verify the client has the necessary properties
        expect(client).toBeDefined();
        expect(client.model).toBeDefined();
        expect(client.model.apiKey).toBeDefined(); // Should be resolved from credentials
        expect(client.model.apiBase).toBeDefined();
        expect(client.model.modelName).toBeDefined();

        console.log(`      ✅ Client validated for ${providerId}`);
        console.log(`         API Base: ${client.model.apiBase}`);
        console.log(`         Model Name: ${client.model.modelName}`);
        console.log(`         Provider: ${client.model.provider}`);

        // Check if provider params are properly filtered
        if (client.model.providerParams) {
          console.log(`         Provider Params: ${JSON.stringify(client.model.providerParams)}`);
        }

        return { success: true, provider: providerId };
      };

      // Execute the mock operation using the router's provider selection
      const result = await router.executeWithBestProvider(modelName, mockOperation);

      expect(result).toBeDefined();
      expect(result.result).toBeDefined();
      expect(result.result.success).toBe(true);
      expect(result.usedProvider).toBeDefined();

      console.log(`   ✅ Mock API request completed successfully`);
      console.log(`      Used provider: ${result.usedProvider}`);
      console.log(`      Used fallback: ${result.usedFallback}`);
    } catch (error) {
      console.error(`   ❌ Mock API request failed: ${error}`);
      throw error;
    }
  });

  afterAll(() => {
    console.log('\n🧹 Cleaning up E2E test environment...');

    // Stop the router
    try {
      const router = getRouter();
      router.stop();
      console.log('✅ Router stopped');
    } catch (_error) {
      console.log('⚠️  Router cleanup skipped');
    }
  });
});

// Manual test runner if executed directly
if (import.meta.main) {
  console.log('🏃 Running E2E tests manually...');

  // Simple manual test runner
  async function runTests() {
    try {
      console.log('Starting manual E2E test run...');

      // You can add manual test execution here if needed
      // For now, just recommend using bun test
      console.log('Please run: bun test src/__tests__/e2e/model-test.ts');
    } catch (error) {
      console.error('Manual test run failed:', error);
      process.exit(1);
    }
  }

  runTests();
}
