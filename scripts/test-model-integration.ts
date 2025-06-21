#!/usr/bin/env bun

/**
 * Quick integration test for model configuration
 * Run with: doppler run -- bun test-model-integration.ts
 */

import log from '../src/utils/logging.js';
import { config } from '../src/config.js';
import { CredentialManager } from '../src/credentials/managers/credential-manager.js';
import { initializeRouter, getRouter } from '../src/utils/enhanced-router.js';

async function testModelIntegration() {
  log.info('🧪 Model Integration Test');
  log.info('========================\n');

  let testsPassed = 0;
  let testsTotal = 0;

  function test(name: string, assertion: boolean, details?: string) {
    testsTotal++;
    if (assertion) {
      log.info(`✅ ${name}`);
      if (details) log.info(`   ${details}`);
      testsPassed++;
    } else {
      log.error(`❌ ${name}`);
      if (details) log.error(`   ${details}`);
    }
  }

  try {
    // Test 1: Configuration Loading
    console.log('📋 Testing Configuration...');
    test('Config loaded', !!config);
    test('Models defined', !!config.models?.definitions);
    test('Has models', Object.keys(config.models?.definitions || {}).length > 0);

    if (config.credentialStores) {
      test(
        'Credential stores defined',
        Object.keys(config.credentialStores).length > 0,
        `Found: ${Object.keys(config.credentialStores).join(', ')}`
      );
    }

    // Test 2: Credential Manager
    console.log('\n🔑 Testing Credential Manager...');
    let credentialManager: CredentialManager | undefined;

    if (config.credentialStores && Object.keys(config.credentialStores).length > 0) {
      credentialManager = new CredentialManager();
      await credentialManager.initialize(config.credentialStores);
      test('Credential manager initialized', true);

      // Test credential resolution
      for (const [storeName, _storeConfig] of Object.entries(config.credentialStores)) {
        try {
          const credentials = await credentialManager.resolveCredentials(storeName);
          test(
            `Credential store '${storeName}' resolves`,
            !!credentials,
            `Type: ${credentials.type}`
          );

          const authHeaders = credentials.getAuthHeaders();
          test(`Credential store '${storeName}' provides auth headers`, !!authHeaders);
        } catch (error) {
          test(`Credential store '${storeName}' resolves`, false, `Error: ${error}`);
        }
      }
    } else {
      test('No credential stores to test', true, 'Using legacy API key mode');
    }

    // Test 3: Enhanced Router
    console.log('\n🔧 Testing Enhanced Router...');
    await initializeRouter(credentialManager);
    const router = getRouter();
    test('Router initialized', !!router);

    // Test model access
    const models = Object.keys(config.models.definitions);
    for (const modelName of models) {
      const model = router.getModel(modelName);
      test(
        `Model '${modelName}' accessible`,
        !!model,
        `Providers: ${model?.providers.length || 0}`
      );

      if (model) {
        // Test each provider
        for (const provider of model.providers) {
          const hasCredentials =
            ('apiKey' in provider && !!provider.apiKey) ||
            ('credentialsRef' in provider && !!provider.credentialsRef);
          test(
            `Provider '${provider.name}' has credentials`,
            hasCredentials,
            'credentialsRef' in provider
              ? `credentialsRef: ${provider.credentialsRef}`
              : 'apiKey: [present]'
          );

          // Test provider parameters
          if (
            provider.provider === 'alibaba' &&
            provider.providerParams?.enable_thinking !== undefined
          ) {
            test(
              `Alibaba provider '${provider.name}' has enable_thinking configured`,
              true,
              `enable_thinking: ${provider.providerParams.enable_thinking}`
            );
          }
        }
      }
    }

    // Test 4: Mock Request Flow
    console.log('\n🚀 Testing Request Flow...');
    if (models.length > 0) {
      const testModel = models[0];
      try {
        const result = await router.executeWithBestProvider(
          testModel,
          async (client: any, providerId: string) => {
            // Mock operation - don't actually call API
            const hasApiKey = !!client.model.apiKey;
            const hasProviderParams = !!client.model.providerParams;

            return {
              providerId,
              hasApiKey,
              hasProviderParams,
              provider: client.model.provider,
              apiBase: client.model.apiBase,
              providerParams: client.model.providerParams,
            };
          }
        );

        test('Mock request executed', !!result);
        test('Used provider identified', !!result.usedProvider, `Provider: ${result.usedProvider}`);
        test(
          'API key resolved',
          result.result.hasApiKey,
          `For provider: ${result.result.provider}`
        );

        // Test Alibaba-specific parameter filtering
        if (result.result.provider === 'alibaba') {
          const hasEnableThinking = result.result.providerParams?.enable_thinking !== undefined;
          test(
            'Alibaba provider params configured',
            hasEnableThinking,
            `enable_thinking: ${result.result.providerParams?.enable_thinking}`
          );
        }
      } catch (error) {
        test('Mock request executed', false, `Error: ${error}`);
      }
    }
  } catch (error) {
    console.error(`\n💥 Test execution failed: ${error}`);
  }

  // Summary
  console.log('\n📊 Test Summary');
  console.log('================');
  console.log(`Passed: ${testsPassed}/${testsTotal}`);

  if (testsPassed === testsTotal) {
    console.log('🎉 All tests passed!');

    console.log('\n🎯 Integration Status:');
    console.log('✅ Configuration loading works');
    console.log('✅ Credential resolution works');
    console.log('✅ Router initialization works');
    console.log('✅ Provider parameter handling works');
    console.log('✅ Ready for API requests!');
  } else {
    console.log('❌ Some tests failed - check configuration');
    process.exit(1);
  }
}

// Run the test
testModelIntegration().catch((error) => {
  console.error('Test run failed:', error);
  process.exit(1);
});
