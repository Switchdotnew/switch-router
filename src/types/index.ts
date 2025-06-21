// Public API exports (external consumers)
export * from './public/index.js';

// Shared utilities (available to both internal and external)
export * from './shared/index.js';

// Internal domain types (for service implementation only)
// Note: These are exported for internal use but should not be used by external consumers
export * as Domains from './domains/index.js';
