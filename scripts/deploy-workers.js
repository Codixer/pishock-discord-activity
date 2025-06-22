#!/usr/bin/env node

/**
 * Cloudflare Workers Deployment Script
 * Handles environment variables correctly for Workers deployment
 */

import { execSync } from 'child_process';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

console.log('🚀 Cloudflare Workers Deployment Script');
console.log('==========================================');

// Check for Discord Client ID from multiple sources
function getDiscordClientId() {
  const sources = [
    { name: 'Environment DISCORD_CLIENT_ID', value: process.env.DISCORD_CLIENT_ID },
    { name: 'Environment VITE_DISCORD_CLIENT_ID', value: process.env.VITE_DISCORD_CLIENT_ID },
  ];
  
  // Check .env file
  const envPath = join(process.cwd(), '.env');
  if (existsSync(envPath)) {
    const envContent = readFileSync(envPath, 'utf8');
    const match = envContent.match(/VITE_DISCORD_CLIENT_ID\s*=\s*(.+)/);
    if (match) {
      sources.push({ name: '.env file', value: match[1].trim().replace(/["']/g, '') });
    }
  }
  
  console.log('\n🔍 Discord Client ID Sources:');
  sources.forEach(source => {
    console.log(`  ${source.name}: ${source.value ? '✅ Found' : '❌ Not found'}`);
  });
  
  const clientId = sources.find(s => s.value)?.value;
  console.log(`\n📋 Final Client ID: ${clientId ? '✅ Ready' : '❌ MISSING'}`);
  
  return clientId;
}

// Main deployment function
function deploy() {
  const clientId = getDiscordClientId();
  
  if (!clientId) {
    console.error('\n❌ DEPLOYMENT FAILED: No Discord Client ID found!');
    console.error('\n💡 Solutions:');
    console.error('   1. Set environment variable:');
    console.error('      export DISCORD_CLIENT_ID="your_actual_client_id"');
    console.error('      npm run deploy:with-env');
    console.error('');
    console.error('   2. Create .env file:');
    console.error('      echo "VITE_DISCORD_CLIENT_ID=your_actual_client_id" > .env');
    console.error('      npm run deploy');
    console.error('');
    console.error('   3. Use this script with environment variable:');
    console.error('      DISCORD_CLIENT_ID="your_id" node scripts/deploy-workers.js');
    process.exit(1);
  }
  
  try {
    console.log('\n🏗️  Building with Discord Client ID...');
    
    // Set the environment variable for the build
    process.env.DISCORD_CLIENT_ID = clientId;
    process.env.VITE_DISCORD_CLIENT_ID = clientId;
    
    // Build the project
    execSync('npm run build', { stdio: 'inherit', env: process.env });
    
    console.log('\n🚀 Deploying to Cloudflare Workers...');
    
    // Deploy to Workers
    execSync('npx wrangler deploy', { stdio: 'inherit' });
    
    console.log('\n✅ Deployment Complete!');
    console.log('🌐 Your Discord Activity should now be available');
    console.log(`📱 Discord Client ID: ${clientId.slice(0, 8)}...`);
    
  } catch (error) {
    console.error('\n❌ Deployment failed:', error.message);
    process.exit(1);
  }
}

// Run deployment
deploy();