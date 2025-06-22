import { writeFileSync } from 'fs';
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
    
    // If we're in a Cloudflare Pages environment, trigger the deployment hook
    if (process.env.CF_PAGES === '1' || process.env.CF_PAGES_URL) {
      console.log('POST-BUILD: Detected Cloudflare Pages environment');
      
      // In Cloudflare Pages, we can use the deployment hook to update the version
      const deploymentUrl = process.env.CF_PAGES_URL || process.env.VITE_DEPLOYMENT_URL;
      
      if (deploymentUrl) {
        try {
          const hookUrl = `${deploymentUrl}/api/deployment-hook`;
          console.log('POST-BUILD: Calling deployment hook:', hookUrl);
          
          const hookResponse = await fetch(hookUrl, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              version: deploymentVersion,
              buildTime: versionInfo.buildTime,
              source: 'post_build_script'
            })
          });
          
          if (hookResponse.ok) {
            const result = await hookResponse.json();
            console.log('POST-BUILD: Successfully updated deployment version:', result);
          } else {
            console.warn('POST-BUILD: Deployment hook failed:', hookResponse.status);
          }
        } catch (error) {
          console.warn('POST-BUILD: Failed to call deployment hook:', error.message);
        }
      }
    } else {
      console.log('POST-BUILD: Not in Cloudflare Pages environment, skipping deployment hook');
    }
    
  } catch (error) {
    console.error('POST-BUILD: Error in post-build script:', error);
    // Don't fail the build for version issues
  }
}

postBuild();