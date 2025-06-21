/**
 * Optimised script to build and package the public types for publishing as an NPM package
 *
 * This script creates a standalone types package from our public API types,
 * ensuring compatibility with CI/CD pipeline requirements.
 */
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configuration constants
const PACKAGE_NAME = '@vepler/switch-types';
const SOURCE_DIR = path.resolve(__dirname, '../src/types');
const OUTPUT_DIR = path.resolve(__dirname, '../dist-types');
const PACKAGE_JSON_PATH = path.resolve(__dirname, '../package.json');

/**
 * Utility class for file operations and content cleaning
 */
class FileProcessor {
  /**
   * Clean TypeScript file content by removing internal dependencies
   */
  static cleanFileContent(content) {
    // Remove Hapi imports and internal dependencies
    content = content.replace(
      /import\s+.*from\s+['"]@hapi\/.*['"];?\n?/g,
      '// Removed Hapi import\n'
    );
    content = content.replace(
      /import\s+.*from\s+['"]\.\.\/\.\.\/api\/.*['"];?\n?/g,
      '// Removed internal import\n'
    );
    content = content.replace(
      /import\s+.*from\s+['"].*@types\/hapi.*['"];?\n?/g,
      '// Removed Hapi import\n'
    );

    // Remove external package imports that won't be available in standalone package
    content = content.replace(
      /import\s+.*from\s+['"]@vepler\/.*['"];?\n?/g,
      '// Removed external dependency\n'
    );
    content = content.replace(
      /import\s+.*from\s+['"]\.\.\/\.\.\/\.\.\/helpers\/.*['"];?\n?/g,
      '// Removed internal helper import\n'
    );
    content = content.replace(
      /import\s+.*from\s+['"]\.\.\/\.\.\/helpers\/.*['"];?\n?/g,
      '// Removed internal helper import\n'
    );
    content = content.replace(
      /import\s+.*from\s+['"]\.\.\/\.\.\/\.\.\/operations\/.*['"];?\n?/g,
      '// Removed operations import\n'
    );
    content = content.replace(
      /import\s+.*from\s+['"]\.\.\/\.\.\/operations\/.*['"];?\n?/g,
      '// Removed operations import\n'
    );
    content = content.replace(
      /import\s+.*from\s+['"]\.\.\/operations\/.*['"];?\n?/g,
      '// Removed operations import\n'
    );

    // Remove specific problematic types that reference external dependencies
    content = content.replace(/PropertyTypes\.[A-Za-z.'\[\]]+/g, 'any');
    content = content.replace(/BreadcrumbItem/g, 'any');
    content = content.replace(/: PropertyTypes\s*$/gm, ': any');

    // Fix re-exports for isolatedModules compatibility
    content = content.replace(/export \* from/g, 'export type * from');
    content = content.replace(/export\s+{([^}]+)}\s+from/g, 'export type {$1} from');

    // Clean up multiple consecutive newlines
    content = content.replace(/\n\n\n+/g, '\n\n');

    return content;
  }

  /**
   * Ensure directory exists, creating it if necessary
   */
  static ensureDirectoryExists(dir) {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  /**
   * Recursively copy TypeScript files with content cleaning
   */
  static copyAndCleanTypeScriptFiles(sourceDir, outputDir) {
    this.ensureDirectoryExists(outputDir);

    const files = fs.readdirSync(sourceDir, { withFileTypes: true });

    for (const file of files) {
      const sourcePath = path.join(sourceDir, file.name);
      const outputPath = path.join(outputDir, file.name);

      if (file.isDirectory()) {
        // Recursively process subdirectories
        this.copyAndCleanTypeScriptFiles(sourcePath, outputPath);
      } else if (
        (file.name.endsWith('.ts') || file.name.endsWith('.d.ts') || file.name.endsWith('.md')) &&
        !file.name.includes('.test.') &&
        !file.name.includes('.spec.')
      ) {
        this.ensureDirectoryExists(path.dirname(outputPath));

        if (file.name.endsWith('.ts')) {
          // Clean TypeScript files
          const content = fs.readFileSync(sourcePath, 'utf8');
          const cleanedContent = this.cleanFileContent(content);
          fs.writeFileSync(outputPath, cleanedContent);
        } else {
          // Copy other files as-is
          fs.copyFileSync(sourcePath, outputPath);
        }
      }
    }
  }
}

/**
 * Configuration generator for the types package
 */
class ConfigGenerator {
  /**
   * Get version from main package.json
   */
  static getPackageVersion() {
    const packageJson = JSON.parse(fs.readFileSync(PACKAGE_JSON_PATH, 'utf8'));
    return packageJson.version;
  }

  /**
   * Create package.json for the types package
   */
  static createPackageJson(version) {
    const packageJson = {
      name: PACKAGE_NAME,
      version,
      description: 'TypeScript type definitions for Switch (Internal)',
      types: 'index.d.ts',
      main: 'index.js',
      files: ['**/*.d.ts', '**/*.js', 'README.md'],
      keywords: [
        'typescript',
        'types',
        'switch',
        'ai',
        'api',
        'proxy',
        'vllm',
        'llm',
        'openai',
        'vepler',
      ],
      author: 'Vepler',
      license: 'ISC',
      publishConfig: {
        access: 'restricted',
      },
      // Add required dependencies for types package
      dependencies: {
        zod: '^3.25.64',
      },
      peerDependencies: {},
      devDependencies: {
        typescript: '^5.8.3',
      },
    };

    fs.writeFileSync(path.join(OUTPUT_DIR, 'package.json'), JSON.stringify(packageJson, null, 2));
  }

  /**
   * Create optimised tsconfig.json for declaration generation
   */
  static createTsConfig() {
    const tsConfig = {
      compilerOptions: {
        target: 'es2018',
        module: 'commonjs',
        declaration: true,
        emitDeclarationOnly: true,
        outDir: './',
        baseUrl: './',
        strict: true,
        esModuleInterop: true,
        skipLibCheck: true,
        forceConsistentCasingInFileNames: true,
        isolatedModules: true,
        moduleResolution: 'node',
      },
      include: ['**/*.ts'],
      exclude: ['node_modules', '**/*.d.ts', '**/__tests__/**', '**/*.test.ts', '**/*.spec.ts'],
    };

    fs.writeFileSync(path.join(OUTPUT_DIR, 'tsconfig.json'), JSON.stringify(tsConfig, null, 2));
  }

  /**
   * Copy README.md from source directory and update package references
   */
  static copyReadme() {
    const readmePath = path.join(SOURCE_DIR, 'README.md');
    const outputReadmePath = path.join(OUTPUT_DIR, 'README.md');

    if (fs.existsSync(readmePath)) {
      let readmeContent = fs.readFileSync(readmePath, 'utf8');

      // Update package name references to ensure consistency
      readmeContent = readmeContent.replace(/@vepler\/pb-api-types-internal/g, PACKAGE_NAME);

      fs.writeFileSync(outputReadmePath, readmeContent);
      console.log('✓ README.md copied from source types directory');
    } else {
      console.warn('⚠ README.md not found in source directory, skipping...');
    }
  }

  /**
   * Create root index.d.ts file for package exports
   */
  static createIndexDeclaration() {
    const indexContent = `// Generated by the Switch types build

// Public API types for external consumption
export type * from './public';

// Domain types for comprehensive type coverage
export type * from './domains';

// Shared utility types
export type * from './shared';
`;
    fs.writeFileSync(path.join(OUTPUT_DIR, 'index.d.ts'), indexContent);
  }

  /**
   * Create minimal index.js stub file
   */
  static createIndexStub() {
    const indexJs = `// TypeScript type definitions only
// No runtime exports
module.exports = {};
`;
    fs.writeFileSync(path.join(OUTPUT_DIR, 'index.js'), indexJs);
  }
}

/**
 * TypeScript compiler wrapper
 */
class TypeScriptCompiler {
  /**
   * Compile TypeScript files to declaration files
   */
  static compileDeclarations() {
    const originalCwd = process.cwd();

    try {
      process.chdir(OUTPUT_DIR);

      console.log('🔨 Compiling TypeScript declarations...');
      execSync('./node_modules/.bin/tsc', { stdio: 'inherit' });
      console.log('✓ TypeScript compilation successful');
    } catch (error) {
      console.error('❌ TypeScript compilation failed:');
      console.error('Error details:', error.message);
      throw new Error('TypeScript compilation failed');
    } finally {
      process.chdir(originalCwd);
    }
  }
}

/**
 * Validation utilities
 */
class Validator {
  /**
   * Validate source directory structure
   */
  static validateSourceDirectory() {
    if (!fs.existsSync(SOURCE_DIR)) {
      throw new Error(`Source directory not found: ${SOURCE_DIR}`);
    }

    // Check for expected structure
    const publicDir = path.join(SOURCE_DIR, 'public');
    const domainsDir = path.join(SOURCE_DIR, 'domains');
    const sharedDir = path.join(SOURCE_DIR, 'shared');

    if (!fs.existsSync(publicDir)) {
      throw new Error(`Public directory not found: ${publicDir}`);
    }
    if (!fs.existsSync(domainsDir)) {
      throw new Error(`Domains directory not found: ${domainsDir}`);
    }
    if (!fs.existsSync(sharedDir)) {
      throw new Error(`Shared directory not found: ${sharedDir}`);
    }

    console.log('✓ Source directory validation passed');
  }

  /**
   * Validate generated package structure
   */
  static validateOutput() {
    const requiredFiles = ['package.json', 'index.d.ts', 'index.js'];

    for (const file of requiredFiles) {
      const filePath = path.join(OUTPUT_DIR, file);
      if (!fs.existsSync(filePath)) {
        throw new Error(`Required output file missing: ${file}`);
      }
    }

    // Check that all main directories were copied
    const publicDir = path.join(OUTPUT_DIR, 'public');
    const domainsDir = path.join(OUTPUT_DIR, 'domains');
    const sharedDir = path.join(OUTPUT_DIR, 'shared');

    if (!fs.existsSync(publicDir)) {
      throw new Error('Public directory was not copied to output');
    }
    if (!fs.existsSync(domainsDir)) {
      throw new Error('Domains directory was not copied to output');
    }
    if (!fs.existsSync(sharedDir)) {
      throw new Error('Shared directory was not copied to output');
    }

    console.log('✓ Output validation passed');
  }
}

/**
 * Main build orchestrator
 */
class TypesPackageBuilder {
  /**
   * Execute the complete build process
   */
  static build() {
    try {
      console.log('🚀 Building types package...');

      // Validate inputs
      Validator.validateSourceDirectory();

      // Get version
      const version = ConfigGenerator.getPackageVersion();
      console.log(`📦 Using version: ${version}`);

      // Clean output directory
      if (fs.existsSync(OUTPUT_DIR)) {
        console.log('🧹 Cleaning output directory...');
        execSync(`rm -rf ${OUTPUT_DIR}`);
      }

      FileProcessor.ensureDirectoryExists(OUTPUT_DIR);

      // Copy and clean TypeScript files
      console.log('📋 Copying and cleaning TypeScript files...');
      FileProcessor.copyAndCleanTypeScriptFiles(SOURCE_DIR, OUTPUT_DIR);

      // Generate configuration files
      console.log('⚙️ Generating configuration files...');
      ConfigGenerator.createPackageJson(version);
      ConfigGenerator.createTsConfig();
      ConfigGenerator.copyReadme();

      // Install dependencies for TypeScript compilation
      console.log('📦 Installing dependencies for compilation...');
      const originalCwd = process.cwd();
      process.chdir(OUTPUT_DIR);
      execSync('npm install', { stdio: 'inherit' });
      process.chdir(originalCwd);

      // Compile TypeScript
      TypeScriptCompiler.compileDeclarations();

      // Create index.js stub
      ConfigGenerator.createIndexStub();

      // Validate output
      Validator.validateOutput();

      console.log(`✅ Types package built successfully at: ${OUTPUT_DIR}`);

      // CI-friendly output using environment files
      if (process.env.CI === 'true' && process.env.GITHUB_OUTPUT) {
        fs.appendFileSync(process.env.GITHUB_OUTPUT, `package-path=${OUTPUT_DIR}\n`);
        fs.appendFileSync(process.env.GITHUB_OUTPUT, `package-name=${PACKAGE_NAME}\n`);
        fs.appendFileSync(process.env.GITHUB_OUTPUT, `package-version=${version}\n`);
      }
    } catch (error) {
      console.error('❌ Error building types package:', error.message);
      process.exit(1);
    }
  }
}

// Execute the build
TypesPackageBuilder.build();
