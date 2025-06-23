import { useState, useEffect, useCallback } from 'react';

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
  return import.meta.env.DEV || window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
}

export function useVersionCheck({ 
  currentVersion, 
  onOutdated, 
  onShutdown, 
  addNotification 
}: UseVersionCheckProps) {
  const [isOutdated, setIsOutdated] = useState(false);
  const [shutdownTimer, setShutdownTimer] = useState<NodeJS.Timeout | null>(null);
  const [timeRemaining, setTimeRemaining] = useState(300); // 5 minutes warning (300 seconds)
  const [isShuttingDown, setIsShuttingDown] = useState(false);
  const [lastCheckedVersion, setLastCheckedVersion] = useState<string>('');
  const [hasInitialized, setHasInitialized] = useState(false);
  const [isChecking, setIsChecking] = useState(false);

  const checkVersion = useCallback(async (isManualCheck = false) => {
    // Skip version checking in development mode
    if (isDevelopmentMode()) {
      if (isManualCheck) {
        addNotification('info', 'Development Mode', 'Version checking is disabled in development mode');
      }
      return;
    }

    // Skip if already shutting down
    if (isShuttingDown) {
      if (isManualCheck) {
        addNotification('warning', 'Update Required', 'Application update is already in progress');
      }
      return;
    }

    setIsChecking(true);

    try {
      console.log('Checking version...', { current: currentVersion, manual: isManualCheck });
      
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
          if (isManualCheck) {
            addNotification('warning', 'Version Check Failed', 'Unable to retrieve version information');
          }
          return;
        }
        
        console.log('Version check result:', {
          current: currentVersion,
          latest: versionInfo.latestVersion,
          lastChecked: lastCheckedVersion,
          deployedAt: versionInfo.deployedAt,
          manual: isManualCheck
        });

        // On first check, just store the latest version without triggering shutdown
        if (!hasInitialized) {
          setLastCheckedVersion(versionInfo.latestVersion);
          setHasInitialized(true);
          console.log('VERSION_CHECK: Initialized with version:', versionInfo.latestVersion);
          if (isManualCheck) {
            if (versionInfo.latestVersion === currentVersion) {
              addNotification('success', 'Up to Date', 'You are running the latest version');
            } else {
              addNotification('info', 'Version Check Complete', 'Version information updated');
            }
          }
          return;
        }

        // For manual checks, always provide feedback
        if (isManualCheck) {
          if (versionInfo.latestVersion === currentVersion) {
            addNotification('success', 'Up to Date', 'You are running the latest version');
            setLastCheckedVersion(versionInfo.latestVersion);
            return;
          } else if (!isOutdated) {
            // Manual check discovered new version
            addNotification('warning', 'Update Available', 'A new version is available. Update will begin automatically.');
          }
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
            'A new version has been deployed. This session will close in 5 minutes to ensure compatibility.'
          );

          // Start countdown timer - 5 minutes (300 seconds)
          let remaining = 300;
          setTimeRemaining(remaining);
          onOutdated(remaining);

          const countdownInterval = setInterval(() => {
            remaining -= 1;
            setTimeRemaining(remaining);
            onOutdated(remaining);

            // Additional warnings at key intervals
            if (remaining === 240) { // 4 minutes remaining
              addNotification(
                'warning', 
                'Session Closing Soon', 
                'This session will close in 4 minutes due to an application update.'
              );
            } else if (remaining === 120) { // 2 minutes remaining
              addNotification(
                'warning', 
                'Session Closing Soon', 
                'This session will close in 2 minutes due to an application update.'
              );
            } else if (remaining === 60) { // 1 minute remaining
              addNotification(
                'error', 
                'Session Closing Soon', 
                'This session will close in 1 minute. Please refresh to use the new version.'
              );
            } else if (remaining === 30) { // 30 seconds remaining
              addNotification(
                'error', 
                'Session Closing', 
                'This session will close in 30 seconds. Please refresh to use the new version.'
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
      } else {
        if (isManualCheck) {
          addNotification('error', 'Version Check Failed', 'Unable to check for updates');
        }
      }
    } catch (error) {
      console.warn('VERSION_CHECK: Version check failed:', error);
      if (isManualCheck) {
        addNotification('error', 'Version Check Failed', 'Network error while checking for updates');
      }
      // Silently fail automatic version checks to avoid disrupting the user experience
    } finally {
      setIsChecking(false);
    }
  }, [currentVersion, isOutdated, isShuttingDown, lastCheckedVersion, hasInitialized, onOutdated, onShutdown, addNotification]);

  // Check version periodically, but not in development mode
  useEffect(() => {
    if (isDevelopmentMode()) {
      console.log('Skipping version checks in development mode');
      return;
    }

    if (isShuttingDown) return;

    // Initial check after a longer delay to allow app to fully load
    const initialTimer = setTimeout(() => {
      checkVersion(false);
    }, 10000); // 10 seconds delay for initial check

    // Set up periodic checks every 15 minutes (900000 ms)
    const interval = setInterval(() => checkVersion(false), 900000);

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

  // Manual check function for clicking
  const manualCheckVersion = useCallback(() => {
    checkVersion(true);
  }, [checkVersion]);

  return {
    isOutdated,
    isShuttingDown,
    isChecking,
    timeRemaining,
    forceShutdown,
    checkVersion: manualCheckVersion
  };
}