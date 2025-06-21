#!/usr/bin/env bun

/**
 * Test Smart Defaults System
 * Run with: doppler run -- bun test-smart-defaults.ts
 */

import log from '../src/utils/logging.js';
import {
  mergeModelDefaults,
  getSupportedProviders,
  getProviderInfo,
} from '../src/providers/model-registry/index.js';

async function testSmartDefaults() {
  log.info('🧠 Smart Defaults System Test');
  log.info('==============================\n');

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

  // Test 1: Registry System
  log.info('📋 Testing Registry System...');
  const providers = getSupportedProviders();
  test('Registry has providers', providers.length > 0, `Found: ${providers.join(', ')}`);

  const alibabaInfo = getProviderInfo('alibaba');
  test(
    'Alibaba provider registered',
    alibabaInfo.hasDefaults,
    `Patterns: ${alibabaInfo.patternCount}, Exact: ${alibabaInfo.exactMatchCount}`
  );

  // Test 2: Alibaba Qwen Model Defaults
  log.info('\n🎯 Testing Alibaba Qwen Defaults...');
  const qwenDefaults = mergeModelDefaults('alibaba', 'qwen3-0.6b', {});

  test(
    'Qwen defaults applied',
    qwenDefaults.appliedDefaults.length > 0,
    qwenDefaults.appliedDefaults.join('; ')
  );

  test(
    'enable_thinking=false for non-streaming',
    qwenDefaults.providerParams.enable_thinking === false,
    `providerParams.enable_thinking = ${qwenDefaults.providerParams.enable_thinking}`
  );

  test(
    'enable_thinking=true for streaming',
    qwenDefaults.streamingParams.enable_thinking === true,
    `streamingParams.enable_thinking = ${qwenDefaults.streamingParams.enable_thinking}`
  );

  test(
    'Health check has enable_thinking=false',
    qwenDefaults.healthCheckParams.enable_thinking === false,
    `healthCheckParams.enable_thinking = ${qwenDefaults.healthCheckParams.enable_thinking}`
  );

  // Test 3: User Override Priority
  log.info('\n👤 Testing User Override Priority...');
  const userOverride = mergeModelDefaults('alibaba', 'qwen3-0.6b', {
    providerParams: {
      enable_thinking: true, // User wants this different
      custom_field: 'user_value',
    },
  });

  test(
    'User override takes priority',
    userOverride.providerParams.enable_thinking === true,
    `User set enable_thinking=true, final value: ${userOverride.providerParams.enable_thinking}`
  );

  test(
    'User custom fields preserved',
    userOverride.providerParams.custom_field === 'user_value',
    `custom_field = ${userOverride.providerParams.custom_field}`
  );

  // Test 4: Pattern Matching
  console.log('\n🔄 Testing Pattern Matching...');
  const qwen25Defaults = mergeModelDefaults('alibaba', 'qwen2.5-72b-instruct', {});
  test(
    'Pattern matching works for qwen2.5',
    qwen25Defaults.appliedDefaults.some((d) => d.includes('qwen')),
    'Should match qwen* pattern'
  );

  const qwenTurboDefaults = mergeModelDefaults('alibaba', 'qwen-turbo', {});
  test(
    'Exact match priority over pattern',
    qwenTurboDefaults.appliedDefaults.some((d) => d.includes('qwen-turbo')),
    'Should use exact match for qwen-turbo'
  );

  // Test 5: Provider with No Defaults
  console.log('\n🚫 Testing Unknown Provider...');
  const unknownDefaults = mergeModelDefaults('unknown-provider', 'some-model', {
    providerParams: { user_param: 'value' },
  });

  test(
    'Unknown provider returns user config',
    unknownDefaults.providerParams.user_param === 'value',
    'Should preserve user config when no defaults found'
  );

  // Test 6: Disabled Defaults
  console.log('\n⏹️ Testing Disabled Defaults...');
  const disabledDefaults = mergeModelDefaults('alibaba', 'qwen3-0.6b', {
    useModelDefaults: false,
    providerParams: { user_only: true },
  });

  test(
    'Defaults disabled by user',
    disabledDefaults.appliedDefaults.some((d) => d.includes('disabled')),
    'Should indicate defaults were disabled'
  );

  test(
    'User config preserved when disabled',
    disabledDefaults.providerParams.user_only === true,
    'Should only have user parameters'
  );

  // Test 7: OpenAI Model Defaults
  console.log('\n🤖 Testing OpenAI Defaults...');
  const gpt4Defaults = mergeModelDefaults('openai', 'gpt-4o', {});

  test(
    'OpenAI defaults applied',
    gpt4Defaults.appliedDefaults.length > 0,
    gpt4Defaults.appliedDefaults.join('; ')
  );

  // Test 8: Anthropic Model Defaults
  console.log('\n🎭 Testing Anthropic Defaults...');
  const claudeDefaults = mergeModelDefaults('anthropic', 'claude-3-5-sonnet', {});

  test(
    'Anthropic defaults applied',
    claudeDefaults.appliedDefaults.length > 0,
    claudeDefaults.appliedDefaults.join('; ')
  );

  // Test 9: Parameter Validation
  console.log('\n🔧 Testing Parameter Validation...');
  const validationTest = mergeModelDefaults('alibaba', 'qwen3-0.6b', {
    providerParams: {
      temperature: 5.0, // Should be clamped to 2.0
      top_p: 1.5, // Should be clamped to 0.99
    },
  });

  test(
    'Parameter clamping works',
    validationTest.warnings.some((w) => w.includes('Clamped')),
    `Warnings: ${validationTest.warnings.join('; ')}`
  );

  // Summary
  console.log('\n📊 Test Summary');
  console.log('================');
  console.log(`Passed: ${testsPassed}/${testsTotal}`);

  if (testsPassed === testsTotal) {
    console.log('🎉 All smart defaults tests passed!');

    console.log('\n🎯 Smart Defaults Status:');
    console.log('✅ Registry system working');
    console.log('✅ Alibaba Qwen defaults working');
    console.log('✅ User override priority working');
    console.log('✅ Pattern matching working');
    console.log('✅ Parameter validation working');
    console.log('✅ Ready to solve Alibaba enable_thinking issue!');
  } else {
    console.log('❌ Some tests failed - check smart defaults system');
    process.exit(1);
  }
}

// Run the test
testSmartDefaults().catch((error) => {
  console.error('Test run failed:', error);
  process.exit(1);
});
