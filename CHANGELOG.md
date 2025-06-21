# Changelog

All notable changes to this project will be documented in this file. See [Conventional Commits](https://conventionalcommits.org) for commit guidelines.

## [2.3.0](https://github.com/Vepler/switch/compare/v2.2.0...v2.3.0) (2025-06-18)

### 🚀 New Features

* advanced health checks ([0c28d2d](https://github.com/Vepler/switch/commit/0c28d2d3f4e84f6c0ce5c006d08a83640e5da05a))
* implement comprehensive request timeout management (TICKET-008) ([61b40d6](https://github.com/Vepler/switch/commit/61b40d6ca19fabac4c70387073c8241576a7120d))

### 🐛 Bug Fixes

* logger ([a440211](https://github.com/Vepler/switch/commit/a440211826ddb0aed1345c1532114be63044dbb6))

## [2.2.0](https://github.com/Vepler/switch/compare/v2.1.1...v2.2.0) (2025-06-18)

### 🚀 New Features

* implement enterprise readiness fixes for production deployment ([c4b2544](https://github.com/Vepler/switch/commit/c4b25442e51b599d1ac37e896d334b390cb1f951))

### 📚 Documentation

* enhance enterprise documentation with 1000+ TPS capability ([635435e](https://github.com/Vepler/switch/commit/635435e476f61201e06a72a04ef760d78cdeae5e))

## [2.1.1](https://github.com/Vepler/switch/compare/v2.1.0...v2.1.1) (2025-06-18)

### 🐛 Bug Fixes

* resolve critical memory leaks causing 10GB usage at 100 TPS ([df712b6](https://github.com/Vepler/switch/commit/df712b6b5ec9e7f7dc6a600a4dee1b3c225853d4))

### 📚 Documentation

* clean up documentation to remove unimplemented features ([9ea1a04](https://github.com/Vepler/switch/commit/9ea1a042e3daa0c290ff7426de62e4b40d41780d))
* move beta notice and feature highlights to top of README ([7b94ebe](https://github.com/Vepler/switch/commit/7b94ebeb0c7f01fe4721fa1e2c1bf1f0929a5c07))
* remove all legacy content and migration references ([a478d9c](https://github.com/Vepler/switch/commit/a478d9c95db11506e5973e715ce2e702fc3b53d3))

## [2.1.0](https://github.com/Vepler/switch/compare/v2.0.0...v2.1.0) (2025-06-17)

### 🚀 New Features

* latest ([278c19d](https://github.com/Vepler/switch/commit/278c19d6e03eda6d9d6d623892e05c12ec4c0238))

### 📚 Documentation

* add "Why You Need Switch" section explaining infrastructure benefits ([73552a1](https://github.com/Vepler/switch/commit/73552a1ff7ab9f2c80efa12d9c94d2342ddf4c1b))
* convert roadmap to simple checkboxes with [wip] tags ([e2f1f06](https://github.com/Vepler/switch/commit/e2f1f06ef1620bb69ee0d67071aa9fb647a0d47c))
* refactor roadmap for open source project vision ([5a8d289](https://github.com/Vepler/switch/commit/5a8d2894454b7ca4fbb9c3b54946a5db7b7778c4))
* remove legacy configuration section from README ([2b215fc](https://github.com/Vepler/switch/commit/2b215fc898cd0e819ebee936b81320e6e08acaf8))
* simplify roadmap to sound more human ([7dcedb1](https://github.com/Vepler/switch/commit/7dcedb159d6d50403bb803e2167f712c9aadee54))

## [2.0.0](https://github.com/Vepler/switch/compare/v1.6.2...v2.0.0) (2025-06-16)

### ⚠ BREAKING CHANGES

- API now uses snake_case parameters instead of camelCase

* enableThinking → enable_thinking
* maxTokens → max_tokens
* topP → top_p
* frequencyPenalty → frequency_penalty
* etc.

This aligns with LLM ecosystem standards where most providers (OpenAI, vLLM, etc.) use snake_case.

🤖 Generated with [Claude Code](https://claude.ai/code)

Co-Authored-By: Claude <noreply@anthropic.com>

### 🚀 New Features

- standardize API on snake_case parameters ([5c64210](https://github.com/Vepler/switch/commit/5c64210f3acbe72dcb211dc3ee3b99d8cc53319f))

## [1.6.2](https://github.com/Vepler/switch/compare/v1.6.1...v1.6.2) (2025-06-16)

### 🐛 Bug Fixes

- enable user parameters to override model defaults ([20fdd3d](https://github.com/Vepler/switch/commit/20fdd3d8f9b71cfa1348175f9ec26d4b4f12ccd2))

## [1.6.1](https://github.com/Vepler/switch/compare/v1.6.0...v1.6.1) (2025-06-16)

### 🐛 Bug Fixes

- respect circuit breaker disabled state in provider filtering ([9404c12](https://github.com/Vepler/switch/commit/9404c1266008a2f511d68946406afaf89be82f27))

## [1.6.0](https://github.com/Vepler/switch/compare/v1.5.1...v1.6.0) (2025-06-16)

### 🚀 New Features

- latest ([322d689](https://github.com/Vepler/switch/commit/322d689c4aab6179476eea7e6d9f1c52704af255))

### 🐛 Bug Fixes

- lint ([62f700d](https://github.com/Vepler/switch/commit/62f700d150668404e68065030e048cf64e065253))

## [1.5.1](https://github.com/Vepler/switch/compare/v1.5.0...v1.5.1) (2025-06-15)

### 🐛 Bug Fixes

- allow 403 errors to trigger provider failover instead of immediate circuit breaker trip ([446d657](https://github.com/Vepler/switch/commit/446d657483662b68786f891c563f642bf1c638d7))

## [1.5.0](https://github.com/Vepler/switch/compare/v1.4.0...v1.5.0) (2025-06-15)

### 🚀 New Features

- add CI/CD environment variable debugging for credential detection ([82fffdd](https://github.com/Vepler/switch/commit/82fffddfd7c83b618e91cad4a36b3d496205139c))
- latest ([15a0b6a](https://github.com/Vepler/switch/commit/15a0b6ac5f597743768d6a743b5114d2e505ac70))

### 🐛 Bug Fixes

- add async/await to framework validation test function ([f458d74](https://github.com/Vepler/switch/commit/f458d74556ce2dd445311a7eba0227fe391cb11e))
- ci/cd test failures in build workflow ([105a339](https://github.com/Vepler/switch/commit/105a339bea2e5ecc4ec1dab3e7a79f2969b83dcf))
- configure CI workflow to use environment variables for integration tests ([44141fd](https://github.com/Vepler/switch/commit/44141fd9f587e45390bc3e6262d4f0e8a2aa87a2))
- correct import paths in bedrock integration tests ([388b2c0](https://github.com/Vepler/switch/commit/388b2c000048f0b19780a88ca260aa91410dfb68))
- issues ([bb2c934](https://github.com/Vepler/switch/commit/bb2c9345dcc4f343850b3fca99210771a8a72547))
- only add AWS credential stores when TEST_AWS_REGION is actually set ([946fb4c](https://github.com/Vepler/switch/commit/946fb4cc919a716059716b9d4c3fc5b0de409361))
- resolve CI/CD credential initialization failures ([314308a](https://github.com/Vepler/switch/commit/314308ae2a9402e0569fa38eec1652191b01066a))
- resolve linting errors preventing push ([8dbdc5d](https://github.com/Vepler/switch/commit/8dbdc5dc9283dd02f777b1bdb700a1ee1b72da6f))
- resolve TypeScript errors in credential manager ([767dffb](https://github.com/Vepler/switch/commit/767dffbc37894adb2b738047c9c795203fb98d53))
- tests ([8896869](https://github.com/Vepler/switch/commit/88968698936616fcb1955aa462728c68c659fd90))
- tests ([3724cf4](https://github.com/Vepler/switch/commit/3724cf42d86b8ec390937ff9b0e0ff7afdd169cc))
- update pre-push hook to run only unit tests ([b575ac3](https://github.com/Vepler/switch/commit/b575ac3fd9dc0b51a2a0ce21352cc0c6c1cced18))

### ♻️ Code Refactoring

- comprehensive codebase cleanup and standardisation ([1432466](https://github.com/Vepler/switch/commit/1432466dc148e7e392f77cea9fd2724bde7cb88f))

## [1.4.0](https://github.com/Vepler/switch/compare/v1.3.5...v1.4.0) (2025-06-14)

### 🚀 New Features

- latest ([378db64](https://github.com/Vepler/switch/commit/378db64dbe8a2a9dfdc21306b86ac9886caefc68))

## [1.3.5](https://github.com/Vepler/switch/compare/v1.3.4...v1.3.5) (2025-06-14)

### 🐛 Bug Fixes

- connections ([890a714](https://github.com/Vepler/switch/commit/890a714b111015ccdb1fa973b8c83c17ac111248))

## [1.3.4](https://github.com/Vepler/switch/compare/v1.3.3...v1.3.4) (2025-06-14)

### 🐛 Bug Fixes

- refactors configuration loading and validation ([298f983](https://github.com/Vepler/switch/commit/298f983994624db8f7eb1d0b1a7343ddb353c450))

## [1.3.3](https://github.com/Vepler/switch/compare/v1.3.2...v1.3.3) (2025-06-14)

### 🐛 Bug Fixes

- properly handle optional fields in config validator ([be716c6](https://github.com/Vepler/switch/commit/be716c68ca28b953be705b171436238a3b7165ff))
- update configuration schemas to support new credential store system ([9d7d80c](https://github.com/Vepler/switch/commit/9d7d80cce15780c4d503828c4195462de21231ce))
- update configuration schemas to support new credential store system ([0344ade](https://github.com/Vepler/switch/commit/0344ade346bf2eea8bdb49fa6618f00524727fc0))

## [1.3.2](https://github.com/Vepler/switch/compare/v1.3.1...v1.3.2) (2025-06-14)

### 🐛 Bug Fixes

- make husky prepare script conditional for production builds ([368a716](https://github.com/Vepler/switch/commit/368a7164481e9546b92277f4bdb59ffcdb0582e4))

## [1.3.1](https://github.com/Vepler/switch/compare/v1.3.0...v1.3.1) (2025-06-14)

### 🐛 Bug Fixes

- exclude dist-types from TypeScript compilation ([b228b25](https://github.com/Vepler/switch/commit/b228b254ab48262a8b0c31e7f6c13b112961ea25))
- resolve Docker production build issue with husky ([e0f31ef](https://github.com/Vepler/switch/commit/e0f31ef55934467e74ec405b2873b8c3de51d497))
- resolve types package build and add to pre-push quality gate ([e672439](https://github.com/Vepler/switch/commit/e67243904c9e2a8cf6e7daf25d41acd781ffe648))

### 📚 Documentation

- streamline credential system overview for open source ([ec317ef](https://github.com/Vepler/switch/commit/ec317ef96c34a7a16071cd990abcc620073346e2))

## [1.3.1](https://github.com/Vepler/switch/compare/v1.3.0...v1.3.1) (2025-06-14)

### 🐛 Bug Fixes

- resolve Docker production build issue with husky ([e0f31ef](https://github.com/Vepler/switch/commit/e0f31ef55934467e74ec405b2873b8c3de51d497))
- resolve types package build and add to pre-push quality gate ([e672439](https://github.com/Vepler/switch/commit/e67243904c9e2a8cf6e7daf25d41acd781ffe648))

### 📚 Documentation

- streamline credential system overview for open source ([ec317ef](https://github.com/Vepler/switch/commit/ec317ef96c34a7a16071cd990abcc620073346e2))

## [1.3.0](https://github.com/Vepler/switch/compare/v1.2.0...v1.3.0) (2025-06-14)

### 🚀 New Features

- add provider-specific parameter system ([cbe0746](https://github.com/Vepler/switch/commit/cbe074698dd7dc18b7236ce276e29e42a7378448))

### 🐛 Bug Fixes

- renames project to Switch and updates description ([bc8371a](https://github.com/Vepler/switch/commit/bc8371a85ae24093f7f1b3ccf5222291067b0cc2))
- resolve TypeScript errors in credential system ([996ffe1](https://github.com/Vepler/switch/commit/996ffe1a1eb1fdf3afbbe043e80a6a0ca44f8db9))
- update husky hooks and commitlint config ([d05dc99](https://github.com/Vepler/switch/commit/d05dc99a514b0d960d97de4e6bf2d3b1df8349d2))

## [1.2.0](https://github.com/Vepler/switch/compare/v1.1.4...v1.2.0) (2025-06-13)

### 🚀 New Features

- optimize CI/CD pipeline with fast test suite ([744e05f](https://github.com/Vepler/switch/commit/744e05ffb458a0c5eb19d51ff1247f9f69cb2557))

### 🐛 Bug Fixes

- add .dockerignore to prevent definitions.json from being copied ([08c2f25](https://github.com/Vepler/switch/commit/08c2f25b3b47c2991a92d0c51e8f28ab7858d3b5))
- Improves tests ([1ba43f6](https://github.com/Vepler/switch/commit/1ba43f60f9db79d0b3d250c3954c687e5b08053b))
- prevent startup with placeholder configuration values ([e372e26](https://github.com/Vepler/switch/commit/e372e260dc3b7a86e3eb768429b880fc0e66a148))

## [1.1.4](https://github.com/Vepler/switch/compare/v1.1.3...v1.1.4) (2025-06-13)

### 🐛 Bug Fixes

- update markdownlint action to v3 ([aa97bfd](https://github.com/Vepler/switch/commit/aa97bfd40a2105cf744bdbba3ae9c618be1f98b1))

## [1.1.3](https://github.com/Vepler/switch/compare/v1.1.2...v1.1.3) (2025-06-13)

### 🐛 Bug Fixes

- support trailing slashes in all API endpoints ([917e1c4](https://github.com/Vepler/switch/commit/917e1c4cdd782036db35238a40a8765d217fc0f4))

## [1.1.2](https://github.com/Vepler/switch/compare/v1.1.1...v1.1.2) (2025-06-13)

### 🐛 Bug Fixes

- Adds trailing slash trimming middleware ([dbc6549](https://github.com/Vepler/switch/commit/dbc6549782445fe7083d1a8c7f4a38f11b53c03a))

## [1.1.1](https://github.com/Vepler/switch/compare/v1.1.0...v1.1.1) (2025-06-13)

### 🐛 Bug Fixes

- configures and improves Docker setup ([f528160](https://github.com/Vepler/switch/commit/f52816057f92f40781f83ab3ee1ced2e50fb204a))

## [1.1.0](https://github.com/Vepler/switch/compare/v1.0.5...v1.1.0) (2025-06-13)

### 🚀 New Features

- restructure ([9667fbe](https://github.com/Vepler/switch/commit/9667fbe958e9fcfb26698406e532041387e5872e))

### 🐛 Bug Fixes

- eslint ([72c4c5b](https://github.com/Vepler/switch/commit/72c4c5b68a53f6c0c50d7d7f14883b117f1bf65b))
- tsc ([d26b7c1](https://github.com/Vepler/switch/commit/d26b7c1c4a8d257b0b0da467e82584ff8e0c28d4))

### 📚 Documentation

- readme ([ead662e](https://github.com/Vepler/switch/commit/ead662ee1103dc10832adcea1353614ef9374d88))
- readme ([dc55532](https://github.com/Vepler/switch/commit/dc555320b9f3b52ee265a4ce8434c888813d6b81))

## [1.0.5](https://github.com/Vepler/switch/compare/v1.0.4...v1.0.5) (2025-06-13)

### 🐛 Bug Fixes

- ci/cd ([8da4cbe](https://github.com/Vepler/switch/commit/8da4cbef45017532cf83d7ee9eb93f9da1f79fdc))
- ci/cd ([36c0380](https://github.com/Vepler/switch/commit/36c03801d13572d81f32fdeca7ee13a6d61dfa7c))

## [1.0.4](https://github.com/Vepler/switch/compare/v1.0.3...v1.0.4) (2025-06-13)

### 🐛 Bug Fixes

- build types ([7f14ca9](https://github.com/Vepler/switch/commit/7f14ca963b995cde9cdf58b9a2ea8d4073d5fa3a))

## [1.0.3](https://github.com/Vepler/switch/compare/v1.0.2...v1.0.3) (2025-06-13)

### 🐛 Bug Fixes

- ci/cd ([a2d243f](https://github.com/Vepler/switch/commit/a2d243f7215c12f2b9cfd13a40ed15e522743505))

## [1.0.2](https://github.com/Vepler/switch/compare/v1.0.1...v1.0.2) (2025-06-13)

### 🐛 Bug Fixes

- convert build-types script to ES modules ([89aebf8](https://github.com/Vepler/switch/commit/89aebf804fd67a247be6a8e0cd0bcf2647093eb4))

## [1.0.1](https://github.com/Vepler/switch/compare/v1.0.0...v1.0.1) (2025-06-13)

### 🐛 Bug Fixes

- ci/cd ([3cb1c1b](https://github.com/Vepler/switch/commit/3cb1c1b8aa2a931ccb96bc078a68e89fe6870fb3))

## 1.0.0 (2025-06-13)

### 🐛 Bug Fixes

- latest ([1e72924](https://github.com/Vepler/switch/commit/1e7292447077dbe2dd96127cac5a95281bc86ef7))
- refactors and removes unused security workflows ([04986c4](https://github.com/Vepler/switch/commit/04986c42fcc90e2bbb66c90333e2a6e5f12ce0f7))

## [Unreleased]

### 🚀 New Features

- Initial public release of Model Router
- VLLM-compatible API endpoints
- Multi-provider support (RunPod, Together, OpenAI, Anthropic)
- Advanced circuit breaker pattern for failover
- Real-time streaming support
- Comprehensive TypeScript type system
- API key-based authentication
- Health monitoring and status endpoints
- Docker containerisation support

### 🛡️ Security

- API key authentication with multi-key support
- Input validation with Zod schemas
- Secure error handling without information disclosure
- Comprehensive security policies and procedures

### 📚 Documentation

- Complete README with quick start guide
- API documentation with examples
- Contributing guidelines
- Security policy
- Code of conduct
- Issue and PR templates

### 🏗️ Infrastructure

- GitHub Actions CI/CD pipeline
- Semantic release automation
- Security scanning and vulnerability detection
- Code quality checks and linting
- Automated testing and type checking

---

**Note**: This changelog follows the [Keep a Changelog](https://keepachangelog.com/en/1.0.0/) format and is automatically updated by semantic-release based on conventional commits.
