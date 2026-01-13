/**
 * =============================================================================
 * STRATEGY BUILD SCRIPT
 * =============================================================================
 * Bundles modular strategies into single files for compilation
 * 
 * Usage: node build.js
 * Output: dist/ultra-scalping.bundle.js, dist/hqx-2b.bundle.js
 */

const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const STRATEGIES_DIR = __dirname;
const DIST_DIR = path.join(STRATEGIES_DIR, 'dist');

// Ensure dist directory exists
if (!fs.existsSync(DIST_DIR)) {
  fs.mkdirSync(DIST_DIR, { recursive: true });
}

const strategies = [
  {
    name: 'ultra-scalping',
    entry: path.join(STRATEGIES_DIR, 'ultra-scalping/index.js'),
    output: path.join(DIST_DIR, 'ultra-scalping.bundle.js')
  },
  {
    name: 'hqx-2b',
    entry: path.join(STRATEGIES_DIR, 'hqx-2b/index.js'),
    output: path.join(DIST_DIR, 'hqx-2b.bundle.js')
  }
];

console.log('Building strategies...\n');

for (const strategy of strategies) {
  console.log(`Building ${strategy.name}...`);
  
  try {
    // Use esbuild to bundle
    execSync(`npx esbuild ${strategy.entry} --bundle --platform=node --outfile=${strategy.output} --external:uuid`, {
      cwd: STRATEGIES_DIR,
      stdio: 'inherit'
    });
    
    const stats = fs.statSync(strategy.output);
    console.log(`  -> ${strategy.output} (${(stats.size / 1024).toFixed(1)} KB)\n`);
  } catch (error) {
    console.error(`  ERROR building ${strategy.name}:`, error.message);
    process.exit(1);
  }
}

console.log('All strategies built successfully!');
