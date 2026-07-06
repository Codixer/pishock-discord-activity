import { writeFileSync } from 'fs';
import { copyFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Post-build script to trigger version update
async function postBuild() {
  try {
    console.log('POST-BUILD: Starting post-build version update...');
    
    // Generate a deployment version
    const deploymentVersion = `build-${Date.now()}`;
    console.log('POST-BUILD: Generated deployment version:', deploymentVersion);
    
    // Copy .assetsignore to dist directory to prevent _worker.js from being served as asset
    try {
      copyFileSync(
        join(__dirname, '../.assetsignore'),
        join(__dirname, '../dist/.assetsignore')
      );
      console.log('POST-BUILD: Copied .assetsignore to dist directory');
    } catch (error) {
      console.warn('POST-BUILD: Failed to copy .assetsignore:', error.message);
    }
    
    // In a real deployment, you would call the deployment hook endpoint
    // For now, we'll just log the version that would be used
    console.log('POST-BUILD: Build completed successfully');
    console.log('POST-BUILD: Deployment version ready:', deploymentVersion);
    
    // Create a version file that could be used by deployment systems
    const versionInfo = {
      version: deploymentVersion,
      buildTime: new Date().toISOString(),
      nodeEnv: process.env.NODE_ENV || 'production'
    };
    
    writeFileSync(
      join(__dirname, '../dist/version.json'), 
      JSON.stringify(versionInfo, null, 2)
    );
    
    console.log('POST-BUILD: Version file created at dist/version.json');
    
  } catch (error) {
    console.error('POST-BUILD: Error in post-build script:', error);
    // Don't fail the build for post-build issues
  }
}

postBuild();