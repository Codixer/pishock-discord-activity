import { useState, useEffect, useCallback } from 'react';
import { isDevelopmentMode } from '../utils/mockData';

interface VersionInfo {
  latestVersion: string;
  deployedAt: string;
}

interface UseVersionCheckProps {
  currentVersion: string;
  onOutdated: (timeRemaining: number) => void;
  onShutdown: () => void;
  addNotification: (type: 'success' | 'error' | 'warning' | 'info', title: string, message: string) => void;
}

// Helper function to get the correct API base URL
function getApiBaseUrl(): string {
  const urlParams = new URLSearchParams(window.location.search);
  const isEmbedded = urlParams.has('frame_id');
  
  if (isEmbedded) {
    return '/.proxy/api';
  } else {
    return '/api';
  }
}

// Check if we're in development mode
function isDevelopmentMode(): boolean {
  return import.meta.env.DEV || 
         window.location.hostname === 'localhost' || 
         window.location.hostname === '127.0.0.1' ||
         window.location.port === '3000';
}

export function useVersionCheck({ 
  currentVersion, 
  onOutdated, 
  onShutdown, 
  addNotification 
}: UseVersionCheckProps) {
  const [isOutdated, setIsOutdated] = useState(false);
  const [shutdownTimer, setShutdownTimer] = useState<NodeJS.Timeout | null>(null);
  const [timeRemaining, setTimeRemaining] = useState(60); // 60 seconds warning
  const [isShuttingDown, setIsShuttingDown] = useState(false);
  const [lastCheckedVersion, setLastCheckedVersion] = useState<string>('');
  const [hasInitialized, setHasInitialized] = useState(false);

  const checkVersion = useCallback(async () => {
    // Skip version checking in development mode
    if (isDevelopmentMode()) {
      console.log('🔒 DEV MODE: Version checking disabled');
      return;
    }

    // Skip if already shutting down
    if (isShuttingDown) {
      return;
    }

    try {
      console.log('Checking version...', { current: currentVersion });
      
      const response = await fetch(`${getApiBaseUrl()}/version`, {
        headers: {
          'Cache-Control': 'no-cache',
          'Pragma': 'no-cache'
        }
      });
      
      if (response.ok) {
        const versionInfo: VersionInfo = await response.json();
        
        // Skip processing if version is "unknown" or invalid
        if (!versionInfo.latestVersion || 
            versionInfo.latestVersion === 'unknown' || 
            versionInfo.latestVersion === 'null' || 
            versionInfo.latestVersion === 'undefined') {
          console.log('VERSION_CHECK: Received invalid version, skipping check');
          return;
        }
        
        console.log('Version check result:', {
          current: currentVersion,
          latest: versionInfo.latestVersion,
          lastChecked: lastCheckedVersion,
          deployedAt: versionInfo.deployedAt
        });

        // On first check, just store the latest version without triggering shutdown
        if (!hasInitialized) {
          setLastCheckedVersion(versionInfo.latestVersion);
          setHasInitialized(true);
          console.log('VERSION_CHECK: Initialized with version:', versionInfo.latestVersion);
          return;
        }

        // Only trigger shutdown if:
        // 1. We have a valid latest version
        // 2. It's different from current version  
        // 3. It's different from the last version we checked (to prevent repeated triggers)
        // 4. We're not already outdated/shutting down
        const isNewVersionAvailable = versionInfo.latestVersion && 
                                    versionInfo.latestVersion !== 'unknown' &&
                                    versionInfo.latestVersion !== currentVersion &&
                                    versionInfo.latestVersion !== lastCheckedVersion &&
                                    !isOutdated;

        if (isNewVersionAvailable) {
          console.log('New version detected, starting shutdown sequence');
          setLastCheckedVersion(versionInfo.latestVersion);
          setIsOutdated(true);
          setIsShuttingDown(true);
          
          addNotification(
            'warning', 
            'Application Updated', 
            'A new version has been deployed. This session will close in 60 seconds to ensure compatibility.'
          );

          // Start countdown timer
          let remaining = 60;
          setTimeRemaining(remaining);
          onOutdated(remaining);

          const countdownInterval = setInterval(() => {
            remaining -= 1;
            setTimeRemaining(remaining);
            onOutdated(remaining);

            // Additional warnings at key intervals
            if (remaining === 30) {
              addNotification(
                'warning', 
                'Session Closing Soon', 
                'This session will close in 30 seconds due to an application update.'
              );
            } else if (remaining === 10) {
              addNotification(
                'error', 
                'Session Closing', 
                'This session will close in 10 seconds. Please refresh to use the new version.'
              );
            }

            if (remaining <= 0) {
              clearInterval(countdownInterval);
              console.log('Shutdown timer expired, calling onShutdown');
              onShutdown();
            }
          }, 1000);

          setShutdownTimer(countdownInterval);
        } else if (versionInfo.latestVersion && versionInfo.latestVersion !== lastCheckedVersion) {
          // Update the last checked version even if it matches current (for future comparisons)
          setLastCheckedVersion(versionInfo.latestVersion);
        }
      }
    } catch (error) {
      console.warn('VERSION_CHECK: Version check failed:', error);
      // Silently fail version checks to avoid disrupting the user experience
    }
  }, [currentVersion, isOutdated, isShuttingDown, lastCheckedVersion, hasInitialized, onOutdated, onShutdown, addNotification]);

  // Check version periodically, but not in development mode
  useEffect(() => {
    if (isDevelopmentMode()) {
      console.log('🔒 DEV MODE: Skipping all version checks');
      return;
    }

    if (isShuttingDown) return;

    // Initial check after a longer delay to allow app to fully load
    const initialTimer = setTimeout(() => {
      checkVersion();
    }, 10000); // 10 seconds delay for initial check

    // Set up periodic checks every 60 seconds
    const interval = setInterval(checkVersion, 60000);

    return () => {
      clearTimeout(initialTimer);
      clearInterval(interval);
      if (shutdownTimer) {
        clearInterval(shutdownTimer);
      }
    };
  }, [checkVersion, isShuttingDown, shutdownTimer, hasInitialized]);

  const forceShutdown = useCallback(() => {
    if (shutdownTimer) {
      clearInterval(shutdownTimer);
    }
    setIsShuttingDown(true);
    onShutdown();
  }, [shutdownTimer, onShutdown]);

  return {
    isOutdated,
    isShuttingDown,
    timeRemaining,
    forceShutdown,
    checkVersion
  };
}