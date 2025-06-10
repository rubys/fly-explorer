#!/usr/bin/env node

import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Path to the server entry point
const serverPath = join(__dirname, '..', 'dist', 'server', 'index.js');

// Default port
const port = process.env.PORT || 3001;

console.log('🚀 Starting Fly Explorer...');
console.log(`📍 Server will be available at http://localhost:${port}`);
console.log('💡 Make sure flyctl is installed and available in your PATH');
console.log('📖 Documentation: https://github.com/rubys/fly-explorer#readme');
console.log('');

// Start the server
const server = spawn('node', [serverPath], {
  stdio: 'inherit',
  env: {
    ...process.env,
    PORT: port
  }
});

server.on('error', (err) => {
  console.error('❌ Failed to start server:', err.message);
  process.exit(1);
});

server.on('exit', (code) => {
  if (code !== 0) {
    console.error(`❌ Server exited with code ${code}`);
    process.exit(code);
  }
});

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('\n🛑 Shutting down Fly Explorer...');
  server.kill('SIGINT');
});

process.on('SIGTERM', () => {
  console.log('\n🛑 Shutting down Fly Explorer...');
  server.kill('SIGTERM');
});