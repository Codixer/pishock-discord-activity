import React, { useState, useEffect } from 'react';
import { Zap, Settings, Play, Square, AlertTriangle, Wifi, Save, Loader, User, Lock } from 'lucide-react';

interface PiShockControllerProps {
  selectedUser: any;
  onConnectionChange: (connected: boolean) => void;
  isConnected: boolean;
  addNotification: (type: 'success' | 'error' | 'warning' | 'info', title: string, message: string) => void;
  instanceId: string;
  auth: any;
  currentUser: any;
  isCompactMode?: boolean;
  orientation?: string;
}

// Helper function to get the correct API base URL
function getApiBaseUrl(): string {
  const urlParams = new URLSearchParams(window.location.search);
  const isEmbedded = urlParams.has('frame_id');
  
  if (isEmbedded) {
    // Use Discord's proxy for embedded environment
    return '/.proxy/api';
  } else {
    // Use direct API calls for development
    return '/api';
  }
}

export function PiShockController({ 
  selectedUser, 
  onConnectionChange, 
  isConnected, 
  addNotification, 
  instanceId, 
  auth,
  currentUser,
  isCompactMode = false,
  orientation = 'UNKNOWN'
}: PiShockControllerProps) {
  const [apiKey, setApiKey] = useState('');
  const [username, setUsername] = useState('');
  const [maxIntensity, setMaxIntensity] = useState(100);
  const [maxDuration, setMaxDuration] = useState(15);
  const [intensity, setIntensity] = useState(1);
  const [duration, setDuration] = useState(1);
  const [isShocking, setIsShocking] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [settingsLoading, setSettingsLoading] = useState(false);
  const [settingsSaving, setSettingsSaving] = useState(false);
  const [hasStoredCredentials, setHasStoredCredentials] = useState(false);
  const [currentUserPiShockConnected, setCurrentUserPiShockConnected] = useState(false);
  const [currentUserPiShockUserId, setCurrentUserPiShockUserId] = useState<string>('');
  const [selectedUserLimits, setSelectedUserLimits] = useState<{ maxIntensity: number; maxDuration: number }>({ maxIntensity: 100, maxDuration: 15 });
  const [lastShockTime, setLastShockTime] = useState<number>(0);
  const [currentUserMaxIntensity, setCurrentUserMaxIntensity] = useState(100);
  const [currentUserMaxDuration, setCurrentUserMaxDuration] = useState(15);  const [availableShockers, setAvailableShockers] = useState<any[]>([]);
  const [selectedShockerId, setSelectedShockerId] = useState<string>('');
  const [availableSharecodes, setAvailableSharecodes] = useState<any[]>([]);
  const [selectedSharecode, setSelectedSharecode] = useState<string>('');
  const [loadingShockers, setLoadingShockers] = useState(false);

  // Get the effective limits based on selected user
  const getEffectiveLimits = () => {
    if (!selectedUser) return { maxIntensity: 100, maxDuration: 15 };
    
    // Get the user's PiShock status which includes their user-configured limits
    const userStatus = (window as any).userPiShockStatus?.[selectedUser.id];
    if (userStatus && userStatus.maxIntensity && userStatus.maxDuration) {
      return {
        maxIntensity: userStatus.maxIntensity,
        maxDuration: userStatus.maxDuration
      };
    }
    
    return { maxIntensity: 100, maxDuration: 15 };
  };

  const effectiveLimits = getEffectiveLimits();

  // Update intensity and duration when limits change
  useEffect(() => {
    const limits = getEffectiveLimits();
    setSelectedUserLimits(limits);
    
    // Clamp current values to new limits
    if (intensity > limits.maxIntensity) {
      setIntensity(limits.maxIntensity);
    }
    if (duration > limits.maxDuration) {
      setDuration(limits.maxDuration);
    }
  }, [selectedUser, intensity, duration]);

  // Load current user's PiShock connection status when component mounts
  useEffect(() => {
    if (currentUser && auth) {
      checkCurrentUserCredentials();
    }
  }, [currentUser, auth]);

  const checkCurrentUserCredentials = async () => {
    setSettingsLoading(true);
    try {
      const response = await fetch(`${getApiBaseUrl()}/users/${currentUser.id}/pishock-status`, {
        headers: {
          'Authorization': `Bearer ${auth.access_token}`,
          'Cache-Control': 'no-cache', // Force fresh data
        },
      });

      if (response.ok) {
        const status = await response.json();
        setHasStoredCredentials(status.hasCredentials);
        setCurrentUserPiShockConnected(status.isConnected);
        setCurrentUserMaxIntensity(status.maxIntensity || 100);
        setCurrentUserMaxDuration(status.maxDuration || 15);
        onConnectionChange(status.isConnected);
          // Load available shockers and selected shocker from status
        if (status.availableShockers && Array.isArray(status.availableShockers)) {
          setAvailableShockers(status.availableShockers);
        }
        if (status.selectedShockerId) {
          setSelectedShockerId(status.selectedShockerId.toString());
        }
        
        // Load available sharecodes and selected sharecode from status
        if (status.availableSharecodes && Array.isArray(status.availableSharecodes)) {
          setAvailableSharecodes(status.availableSharecodes);
        }
        if (status.selectedSharecode) {
          setSelectedSharecode(status.selectedSharecode);
        }
        
        // Store user's PiShock ID for display
        if (status.piShockUserId) {
          setCurrentUserPiShockUserId(status.piShockUserId);
        }
        
        if (status.hasCredentials && !status.isConnected) {
          addNotification('warning', 'Connection Issue', 'Your PiShock credentials found but connection failed. Please check your settings.');
        } else if (status.isConnected) {
          addNotification('success', 'Connected', 'Your PiShock account is connected and ready');
        }
      }
    } catch (error) {
      console.error('Failed to check stored credentials:', error);
    } finally {
      setSettingsLoading(false);
    }
  };

  const savePiShockSettings = async () => {
    if (!currentUser || !auth) return;
    
    if (!apiKey || !username) {
      addNotification('warning', 'Missing Information', 'Please fill in API Key and Username');
      return;
    }

    // If we have available shockers but no selection, warn the user
    if (availableShockers.length > 0 && !selectedShockerId) {
      addNotification('warning', 'Select Shocker', 'Please select which shocker to use for incoming commands');
      return;
    }

    // Validate user limits
    const finalMaxIntensity = Math.min(Math.max(maxIntensity, 1), 100);
    const finalMaxDuration = Math.min(Math.max(maxDuration, 1), 15);

    setSettingsSaving(true);
    try {
      const response = await fetch(`${getApiBaseUrl()}/users/${currentUser.id}/pishock-settings`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${auth.access_token}`,
        },        body: JSON.stringify({
          apiKey,
          username,
          maxIntensity: finalMaxIntensity,
          maxDuration: finalMaxDuration,
          selectedShockerId: selectedShockerId || null, // Include selected shocker
          selectedSharecode: selectedSharecode || null, // Include selected sharecode
        }),
      });

      const result = await response.json();
      
      if (response.ok && result.success) {
        setHasStoredCredentials(true);
        setCurrentUserPiShockConnected(true);
        setCurrentUserMaxIntensity(finalMaxIntensity);
        setCurrentUserMaxDuration(finalMaxDuration);
        onConnectionChange(true);
          // Update available shockers and selected shocker from response
        if (result.availableShockers) {
          setAvailableShockers(result.availableShockers);
        }
        if (result.selectedShockerId) {
          setSelectedShockerId(result.selectedShockerId);
        }
        
        // Update available sharecodes and selected sharecode from response
        if (result.availableSharecodes) {
          setAvailableSharecodes(result.availableSharecodes);
        }
        if (result.selectedSharecode) {
          setSelectedSharecode(result.selectedSharecode);
        }
        
        const shockerMessage = selectedShockerId ? ` Selected shocker: ${availableShockers.find(s => s.shockerId.toString() === selectedShockerId)?.displayName || selectedShockerId}` : '';
        addNotification('success', 'Settings Saved', `PiShock account connected successfully with limits: ${finalMaxIntensity}%/${finalMaxDuration}s.${shockerMessage}`);
        
        // Clear the form fields for security
        setApiKey('');
        setUsername('');
        setShowSettings(false);
        
        // Update the stored PiShock user ID from save result
        if (result.piShockUserId) {
          setCurrentUserPiShockUserId(result.piShockUserId);
        }
        
        // Trigger a status refresh for all participants
        if (window.refreshAllUserStatuses) {
          window.refreshAllUserStatuses();
        }
      } else {
        // Show user-friendly error message
        let errorMessage = result.error || 'Failed to save PiShock settings';
        
        // Log detailed debug info but show simpler message to user
        console.error('PiShock settings save error:', result);
        
        // Provide specific guidance based on error type
        if (errorMessage.includes('Invalid response format') || errorMessage.includes('empty response')) {
          errorMessage = 'Unable to validate PiShock credentials. Please check:\n\n• Your API key is correct\n• Your username is correct\n• PiShock.com is accessible\n• Try again in a few moments';
        } else if (errorMessage.includes('Network error')) {
          errorMessage = 'Network connection failed. Please check your internet connection and try again.';
        } else if (errorMessage.includes('No UserID found')) {
          errorMessage = 'Invalid PiShock credentials. Please double-check your API key and username.';
        }
        
        throw new Error(errorMessage);
      }
    } catch (error) {
      console.error('Failed to save PiShock settings:', error);
      addNotification('error', 'Save Failed', error instanceof Error ? error.message : 'Failed to save PiShock settings');
    } finally {
      setSettingsSaving(false);
    }
  };  const loadAvailableShockers = async () => {
    if (!currentUser || !auth || !apiKey || !username) {
      addNotification('warning', 'Missing Data', 'Please ensure you have entered your API key and username before loading shockers');
      return;
    }
    
    setLoadingShockers(true);
    try {
      // Use the settings endpoint which now returns both shockers and sharecodes
      const response = await fetch(`${getApiBaseUrl()}/users/${currentUser.id}/pishock-settings`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${auth.access_token}`,
        },
        body: JSON.stringify({
          apiKey,
          username,
          maxIntensity: maxIntensity,
          maxDuration: maxDuration,
          selectedShockerId: selectedShockerId || null,
          selectedSharecode: selectedSharecode || null,
        }),
      });
      
      if (response.ok) {
        const result = await response.json();
        
        if (result.success) {
          // Update shockers
          if (result.availableShockers) {
            setAvailableShockers(result.availableShockers);
            
            // Auto-select first shocker if none selected
            if (!selectedShockerId && result.availableShockers.length > 0) {
              setSelectedShockerId(result.availableShockers[0].shockerId.toString());
            }
          }
          
          // Update sharecodes  
          if (result.availableSharecodes) {
            setAvailableSharecodes(result.availableSharecodes);
          }
          
          const shockerCount = result.availableShockers?.length || 0;
          const sharecodeCount = result.availableSharecodes?.length || 0;
          addNotification('success', 'Data Loaded', `Found ${shockerCount} shockers and ${sharecodeCount} sharecodes`);
        } else {
          addNotification('warning', 'No Data Found', 'No shockers or sharecodes found in your PiShock account');
          setAvailableShockers([]);
          setAvailableSharecodes([]);
        }
      } else {
        let errorMessage = 'Failed to get available data';
        try {
          const result = await response.json();
          errorMessage = result.error || errorMessage;
        } catch (parseError) {
          errorMessage = `HTTP ${response.status}: ${response.statusText}`;
        }
        addNotification('error', 'Failed to Load Data', errorMessage);
      }
    } catch (error) {
      console.error('Failed to load shockers and sharecodes:', error);
      addNotification('error', 'Load Failed', 'Failed to load available data');
    } finally {
      setLoadingShockers(false);
    }
  };

  const testConnection = async () => {
    if (!currentUser || !auth) return;

    setSettingsLoading(true);
    try {
      const response = await fetch(`${getApiBaseUrl()}/users/${currentUser.id}/pishock-test`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${auth.access_token}`,
        },
      });

      if (response.ok) {
        const result = await response.json();
        if (result.success) {
          setCurrentUserPiShockConnected(true);
          setCurrentUserMaxIntensity(result.maxIntensity || 100);
          setCurrentUserMaxDuration(result.maxDuration || 15);
          onConnectionChange(true);
          addNotification('success', 'Connection Test', `Your PiShock account is responding correctly. Limits: ${result.maxIntensity || 100}%/${result.maxDuration || 15}s`);
          
          // Update the stored PiShock user ID from test result
          if (result.piShockUserId) {
            setCurrentUserPiShockUserId(result.piShockUserId);
          }
          
          // Trigger a status refresh for all participants
          if (window.refreshAllUserStatuses) {
            window.refreshAllUserStatuses();
          }
        } else {
          setCurrentUserPiShockConnected(false);
          onConnectionChange(false);
          
          let errorMessage = result.error || 'Connection test failed';
          
          // Provide specific guidance for common issues
          if (errorMessage.includes('Invalid response format') || errorMessage.includes('empty response')) {
            errorMessage = 'Connection test failed. Please verify:\n\n• Your API key is correct\n• Your username is correct\n• PiShock services are online\n• Try again in a moment';
          } else if (errorMessage.includes('Network error')) {
            errorMessage = 'Network connection failed during test. Please check your internet connection.';
          }
          
          throw new Error(errorMessage);
        }
      } else {
        const errorText = await response.text();
        console.error('Test connection HTTP error:', response.status, errorText);
        throw new Error('Connection test failed');
      }
    } catch (error) {
      console.error('Connection test error:', error);
      addNotification('error', 'Connection Failed', error instanceof Error ? error.message : 'Failed to test PiShock connection');
      setCurrentUserPiShockConnected(false);
      onConnectionChange(false);
    } finally {
      setSettingsLoading(false);
    }
  };

  const handleShock = async (operation: number) => {
    if (!selectedUser) {
      addNotification('warning', 'No User Selected', 'Please select a user first');
      return;
    }

    if (!currentUserPiShockConnected) {
      addNotification('warning', 'Not Connected', 'Please connect your PiShock account first');
      return;
    }

    // Prevent rapid-fire commands (minimum 3 second cooldown)
    const now = Date.now();
    if (now - lastShockTime < 3000) {
      addNotification('warning', 'Please Wait', 'Please wait a moment before sending another command');
      return;
    }

    setIsShocking(true);
    setLastShockTime(now);

    try {
      const endpoint = `${getApiBaseUrl()}/users/${selectedUser.id}/pishock-execute`;

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${auth.access_token}`,
        },
        body: JSON.stringify({
          executorUserId: currentUser.id,
          targetUserId: selectedUser.id,
          intensity,
          duration,
          operation, // 0 = shock, 1 = vibrate, 2 = beep
        }),
      });

      if (response.ok) {
        const result = await response.json();
        if (result.success) {
          const actionName = operation === 0 ? 'Shock' : operation === 1 ? 'Vibration' : 'Beep';
          addNotification('success', 'Command Sent', `${actionName} sent to ${selectedUser.displayName || selectedUser.username} - Intensity: ${intensity}%, Duration: ${duration}s`);
          
          // Refresh user statuses after successful command
          if (window.refreshAllUserStatuses) {
            setTimeout(() => {
              window.refreshAllUserStatuses();
            }, 1000);
          }
        } else {
          throw new Error(result.error || 'Command failed');
        }
      } else {
        throw new Error('Shock command failed');
      }
    } catch (error) {
      console.error('Shock error:', error);
      
      // Enhanced error reporting
      let errorMessage = 'Failed to send command. Please try again.';
      
      if (error instanceof Error) {
        if (error.message.includes('no PiShock device configured')) {
          const displayName = selectedUser?.guildDisplayName || selectedUser?.displayName || selectedUser?.global_name || selectedUser?.username || 'Unknown';
          errorMessage = `❌ ${displayName} hasn't set up their PiShock device yet.\n\nThey need to:\n• Click the gear icon (⚙️) to open settings\n• Add their PiShock API key & username\n• Configure their device limits\n• Test the connection\n\nOnly users with configured devices can receive commands.`;
        } else if (error.message.includes('Invalid parameters')) {
          errorMessage = 'Invalid shock parameters. Please check intensity and duration settings.';
        } else if (error.message.includes('Target user') && error.message.includes('no PiShock device configured')) {
          const displayName = selectedUser?.guildDisplayName || selectedUser?.displayName || selectedUser?.global_name || selectedUser?.username || 'Unknown';
          errorMessage = `❌ Cannot send command to ${displayName}.\n\nThey haven't configured their PiShock device in this app yet. Ask them to:\n• Open the app\n• Click the settings gear (⚙️)\n• Enter their PiShock credentials\n• Set their limits\n• Test the connection`;
        } else if (error.message.includes('exceeds') && error.message.includes('limit')) {
          errorMessage = `❌ ${error.message}\n\nThe user has set lower limits for their safety. Please reduce the intensity or duration and try again.`;
        } else {
          errorMessage = `Command failed: ${error.message}`;
        }
      }
      
      addNotification('error', 'Command Failed', errorMessage);
    } finally {
      setIsShocking(false);
    }
  };

  const removeStoredCredentials = async () => {
    if (!currentUser || !auth) return;

    try {
      const response = await fetch(`${getApiBaseUrl()}/users/${currentUser.id}/pishock-settings`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${auth.access_token}`,
        },
      });

      if (response.ok) {
        setHasStoredCredentials(false);
        setCurrentUserPiShockConnected(false);
        setCurrentUserMaxIntensity(100);
        setCurrentUserMaxDuration(15);
        onConnectionChange(false);
        addNotification('info', 'Credentials Removed', 'Your PiShock credentials have been removed');
        
        // Refresh statuses
        if (window.refreshAllUserStatuses) {
          setTimeout(() => {
            window.refreshAllUserStatuses();
          }, 1000);
        }
      }
    } catch (error) {
      console.error('Failed to remove credentials:', error);
      addNotification('error', 'Remove Failed', 'Failed to remove stored credentials');
    }
  };

  const getDisplayName = (user: any) => {
    return user?.guildDisplayName || user?.displayName || user?.global_name || user?.username || 'Unknown User';
  };

  const getConnectionStatus = () => {
    if (currentUserPiShockConnected) {
      return {
        connected: true,
        message: 'Your PiShock Account is Connected',
        color: 'green'
      };
    } else if (hasStoredCredentials) {
      return {
        connected: false,
        message: 'Credentials stored but connection failed',
        color: 'yellow'
      };
    } else {
      return {
        connected: false,
        message: 'No PiShock account configured',
        color: 'gray'
      };
    }
  };

  const status = getConnectionStatus();

  const loadDeviceSharecodes = async (deviceId: string) => {
    if (!currentUser || !auth || !deviceId) {
      return;
    }
    
    try {
      console.log('Loading sharecodes for device:', deviceId);
      const response = await fetch(`${getApiBaseUrl()}/users/${currentUser.id}/device-sharecodes?deviceId=${encodeURIComponent(deviceId)}`, {
        headers: {
          'Authorization': `Bearer ${auth.access_token}`,
        },
      });
      
      if (response.ok) {
        const result = await response.json();
        
        if (result.success) {
          setAvailableSharecodes(result.sharecodes || []);
          console.log(`Loaded ${result.sharecodes?.length || 0} sharecodes for device ${deviceId}`);
            // Clear selected sharecode if it's not in the new list
          if (selectedSharecode && result.sharecodes) {
            const isStillAvailable = result.sharecodes.some((sc: any) => 
              (sc.code || sc.shareCode) === selectedSharecode
            );
            if (!isStillAvailable) {
              setSelectedSharecode('');
            }
          }
        } else {
          console.log('No sharecodes found for device:', deviceId);
          setAvailableSharecodes([]);
          setSelectedSharecode('');
        }
      } else {
        console.error('Failed to load device sharecodes:', response.status);
        // Don't show error notification as this is called automatically
      }
    } catch (error) {
      console.error('Error loading device sharecodes:', error);
      // Don't show error notification as this is called automatically
    }
  };

  // Load device-specific sharecodes when a device is selected
  useEffect(() => {
    if (selectedShockerId && hasStoredCredentials) {
      loadDeviceSharecodes(selectedShockerId);
    } else {
      // Clear sharecodes if no device is selected
      setAvailableSharecodes([]);
      setSelectedSharecode('');
    }
  }, [selectedShockerId, hasStoredCredentials]);

  return (
    <div className="h-full flex flex-col space-y-4 overflow-y-auto">
      {/* Settings Panel */}
      <div className="bg-black/20 backdrop-blur-sm rounded-xl border border-white/10 p-4 flex-shrink-0">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center space-x-3">
            <Settings className="h-5 w-5 text-purple-400" />
            <h3 className={`${
              isCompactMode 
                ? 'text-sm' 
                : 'text-base sm:text-lg'
            } font-semibold`}>
              {isCompactMode ? 'Settings' : 'Your PiShock Settings'}
            </h3>
            {settingsLoading && <Loader className="h-4 w-4 animate-spin text-gray-400" />}
          </div>
          <button
            onClick={() => setShowSettings(!showSettings)}
            className="px-2 sm:px-3 py-1 rounded-md bg-gray-700 hover:bg-gray-600 text-xs sm:text-sm transition-colors"
          >
            {showSettings ? 'Hide' : 'Configure'}
          </button>
        </div>

        {/* Connection Status */}
        {hasStoredCredentials ? (
          <div className="mb-4">
            <div className={`flex items-center justify-between p-3 border rounded-lg ${
              status.color === 'green' ? 'bg-green-900/20 border-green-500/30' :
              status.color === 'yellow' ? 'bg-yellow-900/20 border-yellow-500/30' :
              'bg-gray-900/20 border-gray-500/30'
            }`}>
              <div className={`flex flex-col space-y-1 flex-1 ${
                status.color === 'green' ? 'text-green-400' :
                status.color === 'yellow' ? 'text-yellow-400' :
                'text-gray-400'
              }`}>
                <div className="flex items-center space-x-2 text-sm">
                  <Wifi className="h-4 w-4" />
                  <span>{status.message}</span>
                </div>
                {currentUserPiShockConnected && (
                  <div className="text-xs opacity-75">
                    PiShock ID: {currentUserPiShockUserId || 'Loading...'}
                    <br />
                    Your limits: {currentUserMaxIntensity}%/{currentUserMaxDuration}s
                    {selectedShockerId && availableShockers.length > 0 && (
                      <>
                        <br />
                        Selected shocker: {availableShockers.find(s => s.shockerId.toString() === selectedShockerId)?.displayName || selectedShockerId}
                      </>
                    )}
                  </div>
                )}
              </div>
              <div className="flex space-x-2">
                <button
                  onClick={testConnection}
                  className={`px-3 py-1 rounded text-xs transition-colors ${
                    status.color === 'green' ? 'bg-green-600 hover:bg-green-700' :
                    status.color === 'yellow' ? 'bg-yellow-600 hover:bg-yellow-700' :
                    'bg-gray-600 hover:bg-gray-700'
                  }`}
                >
                  Test
                </button>
                <button
                  onClick={removeStoredCredentials}
                  className="px-3 py-1 bg-red-600 hover:bg-red-700 rounded text-xs transition-colors"
                >
                  Remove
                </button>
              </div>
            </div>
          </div>
        ) : (
          !showSettings && (
            <div className="p-3 bg-gray-900/20 border border-gray-500/30 rounded-lg mb-4">
              <div className="flex items-center space-x-2 text-gray-400 text-sm">
                <AlertTriangle className="h-4 w-4" />
                <span>No PiShock account configured</span>
              </div>
            </div>
          )
        )}

        {showSettings && (
          <div className="space-y-3 mb-4">
            <div className="p-3 bg-blue-900/20 border border-blue-500/30 rounded-lg text-sm text-blue-200">
              <p className="font-semibold mb-1">Account Setup:</p>
              <p>Configure your PiShock account to participate. You'll choose which of your shockers others can control when they target you.</p>
              {isCompactMode && (
                <p className="text-xs mt-2 text-blue-300">
                  💡 Tip: Switch to full view for easier configuration
                </p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">
                API Key <span className="text-red-400">*</span>
              </label>              <input
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                className="w-full px-3 py-2 bg-gray-800 border border-gray-600 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all text-sm"
                placeholder="Enter your PiShock API key"
              />
              <p className="text-xs text-gray-400 mt-1">
                Get your API key from <a href="https://ps.pishock.com/#/account" target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:text-blue-300">your PiShock account page</a>
              </p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">
                Username <span className="text-red-400">*</span>
              </label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full px-3 py-2 bg-gray-800 border border-gray-600 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all text-sm"
                placeholder="Your PiShock username"
              />
            </div>

            {/* Load Shockers Button */}
            {apiKey && username && (
              <div>
                <button
                  onClick={loadAvailableShockers}
                  disabled={loadingShockers}
                  className="w-full py-2 px-4 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 disabled:cursor-not-allowed rounded-lg font-medium flex items-center justify-center space-x-2 transition-all text-sm"
                >
                  {loadingShockers ? (
                    <Loader className="h-4 w-4 animate-spin" />
                  ) : (
                    <Zap className="h-4 w-4" />
                  )}                  <span>{loadingShockers ? 'Loading...' : 'Load My Data'}</span>
                </button>
                <p className="text-xs text-gray-400 mt-1">
                  Click to load available shockers and sharecodes from your PiShock account
                </p>
              </div>
            )}            {/* Shocker Selection */}
            {availableShockers.length > 0 && (
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">
                  Select Your Shocker <span className="text-red-400">*</span>
                </label>
                <select
                  value={selectedShockerId}
                  onChange={(e) => setSelectedShockerId(e.target.value)}
                  className="w-full px-3 py-2 bg-gray-800 border border-gray-600 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all text-sm"
                >
                  <option value="">Choose a shocker...</option>
                  {availableShockers.map((shocker) => (
                    <option key={shocker.shockerId} value={shocker.shockerId}>
                      {shocker.displayName}
                    </option>
                  ))}
                </select>
                <p className="text-xs text-gray-400 mt-1">
                  This shocker will be used when others send commands to you
                </p>
              </div>
            )}            {/* Sharecode Selection */}
            {availableSharecodes.length > 0 && (
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">
                  Select Your Sharecode (Optional)
                  {selectedShockerId && (
                    <span className="text-xs text-blue-400 ml-2">
                      • for selected device
                    </span>
                  )}
                </label>
                <select
                  value={selectedSharecode}
                  onChange={(e) => setSelectedSharecode(e.target.value)}
                  className="w-full px-3 py-2 bg-gray-800 border border-gray-600 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all text-sm"
                >
                  <option value="">No sharecode (use device selection)</option>
                  {availableSharecodes.map((sharecode) => (
                    <option key={sharecode.code || sharecode.shareCode} value={sharecode.code || sharecode.shareCode}>
                      {sharecode.name || sharecode.code || sharecode.shareCode}
                    </option>
                  ))}
                </select>
                <p className="text-xs text-gray-400 mt-1">
                  {selectedShockerId 
                    ? `Showing sharecodes for ${availableShockers.find(s => s.shockerId.toString() === selectedShockerId)?.displayName || 'selected device'}. If selected, sharecode will be used instead of device selection for commands.`
                    : 'If selected, sharecode will be used instead of device selection for commands'
                  }
                </p>
              </div>
            )}{/* Message when data hasn't been loaded */}
            {apiKey && username && availableShockers.length === 0 && !loadingShockers && (
              <div className="p-3 bg-blue-900/20 border border-blue-500/30 rounded-lg">
                <div className="flex items-center space-x-2 text-blue-300 text-sm">
                  <Zap className="h-4 w-4" />
                  <span>Click "Load My Data" to see your available devices and sharecodes</span>
                </div>
              </div>
            )}
            
            {/* User-configurable limits */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">
                  Max Intensity (%)
                </label>
                <input
                  type="number"
                  min="1"
                  max="100"
                  value={maxIntensity}
                  onChange={(e) => setMaxIntensity(Math.min(Math.max(parseInt(e.target.value) || 1, 1), 100))}
                  className="w-full px-3 py-2 bg-gray-800 border border-gray-600 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">
                  Max Duration (s)
                </label>
                <input
                  type="number"
                  min="1"
                  max="15"
                  value={maxDuration}
                  onChange={(e) => setMaxDuration(Math.min(Math.max(parseInt(e.target.value) || 1, 1), 15))}
                  className="w-full px-3 py-2 bg-gray-800 border border-gray-600 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all text-sm"
                />
              </div>
            </div>
            {!isCompactMode && (
              <p className="text-xs text-gray-400">
                Set your own safety limits. Others can only use commands within these limits when targeting you.
              </p>
            )}
            
            <button
              onClick={savePiShockSettings}
              disabled={settingsSaving}
              className="w-full py-2 px-4 bg-gradient-to-r from-green-600 to-green-700 hover:from-green-700 hover:to-green-800 disabled:from-gray-600 disabled:to-gray-700 disabled:cursor-not-allowed rounded-lg font-semibold flex items-center justify-center space-x-2 transition-all text-sm"
            >
              {settingsSaving ? (
                <Loader className="h-4 w-4 animate-spin" />
              ) : (
                <Save className="h-4 w-4" />
              )}
              <span>Save Settings & Connect</span>
            </button>
          </div>
        )}
      </div>

      {/* Control Panel */}
      <div className="bg-black/20 backdrop-blur-sm rounded-xl border border-white/10 p-4 flex-1 flex flex-col min-h-0">
        <h3 className={`${
          isCompactMode 
            ? 'text-sm mb-3' 
            : 'text-base sm:text-lg mb-4'
        } font-semibold flex-shrink-0`}>
          Control Panel
        </h3>

        {!selectedUser ? (
          <div className="text-center py-8 text-gray-400 flex-1 flex flex-col justify-center">
            <AlertTriangle className="h-12 w-12 mx-auto mb-3 opacity-50" />
            <p>Please select a participant to continue</p>
            <p className="text-sm mt-1">Only users with PiShock devices can be targeted</p>
          </div>
        ) : (
          <div className="flex-1 flex flex-col space-y-4 min-h-0">
            {/* Target User */}
            <div className="p-3 bg-blue-900/20 border border-blue-500/30 rounded-lg flex-shrink-0">
              <div className="flex items-center space-x-3">
                <img
                  src={selectedUser.guildAvatarUrl || selectedUser.avatarUrl || `https://cdn.discordapp.com/embed/avatars/0.png`}
                  alt={`${getDisplayName(selectedUser)}'s avatar`}
                  className={`${isCompactMode ? 'w-6 h-6' : 'w-8 h-8'} rounded-full flex-shrink-0`}
                  onError={(e) => {
                    const target = e.target as HTMLImageElement;
                    target.src = `https://cdn.discordapp.com/embed/avatars/0.png`;
                  }}
                />
                <div className="min-w-0 flex-1">
                  <p className="text-blue-300 text-sm">
                    <span className="font-semibold">Target:</span> {getDisplayName(selectedUser)}
                  </p>
                  {!isCompactMode && (
                  <p className="text-xs text-blue-400">
                    Commands will be sent to their PiShock device (max: {effectiveLimits.maxIntensity}%/{effectiveLimits.maxDuration}s)
                  </p>
                  )}
                </div>
              </div>
            </div>

            {/* Controls Container */}
            <div className="flex-1 flex flex-col space-y-4 min-h-0">
              {/* Intensity Control */}
              <div>
                <label className="block text-xs sm:text-sm font-medium text-gray-300 mb-2">
                  <div className="flex items-center justify-between">
                    <span>Intensity: {intensity}%</span>
                    {effectiveLimits.maxIntensity < 100 && (
                      <div className="flex items-center space-x-1 text-xs text-yellow-400">
                        <Lock className="h-3 w-3" />
                        <span>Max: {effectiveLimits.maxIntensity}%</span>
                      </div>
                    )}
                  </div>
                </label>
                <input
                  type="range"
                  min="1"
                  max={effectiveLimits.maxIntensity}
                  value={intensity}
                  onChange={(e) => setIntensity(parseInt(e.target.value))}
                  className={`w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer slider ${
                    effectiveLimits.maxIntensity < 100 ? 'limited-slider' : ''
                  }`}
                />
                <div className="flex justify-between text-xs text-gray-400 mt-1">
                  <span>1%</span>
                  <span>{Math.floor(effectiveLimits.maxIntensity / 2)}%</span>
                  <span className={effectiveLimits.maxIntensity < 100 ? 'text-yellow-400' : ''}>
                    {effectiveLimits.maxIntensity}%{effectiveLimits.maxIntensity < 100 ? ' (Max)' : ''}
                  </span>
                </div>
              </div>

              {/* Duration Control */}
              <div>
                <label className="block text-xs sm:text-sm font-medium text-gray-300 mb-2">
                  <div className="flex items-center justify-between">
                    <span>Duration: {duration}s</span>
                    {effectiveLimits.maxDuration < 15 && (
                      <div className="flex items-center space-x-1 text-xs text-yellow-400">
                        <Lock className="h-3 w-3" />
                        <span>Max: {effectiveLimits.maxDuration}s</span>
                      </div>
                    )}
                  </div>
                </label>
                <input
                  type="range"
                  min="1"
                  max={effectiveLimits.maxDuration}
                  value={duration}
                  onChange={(e) => setDuration(parseInt(e.target.value))}
                  className={`w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer slider ${
                    effectiveLimits.maxDuration < 15 ? 'limited-slider' : ''
                  }`}
                />
                <div className="flex justify-between text-xs text-gray-400 mt-1">
                  <span>1s</span>
                  <span>{Math.floor(effectiveLimits.maxDuration / 2)}s</span>
                  <span className={effectiveLimits.maxDuration < 15 ? 'text-yellow-400' : ''}>
                    {effectiveLimits.maxDuration}s{effectiveLimits.maxDuration < 15 ? ' (Max)' : ''}
                  </span>
                </div>
              </div>

              {/* Action Buttons */}
              <div className={`grid gap-2 sm:gap-3 flex-shrink-0 ${
                isCompactMode 
                  ? 'grid-cols-3' // Always 3 columns in compact mode
                  : orientation === 'PORTRAIT' 
                    ? 'grid-cols-1' // Single column in portrait 
                    : 'grid-cols-1 sm:grid-cols-3' // Responsive for landscape
              }`}>
                <button
                  onClick={() => handleShock(0)}
                  disabled={isShocking || !currentUserPiShockConnected}
                  className={`${
                    isCompactMode 
                      ? 'py-2 px-2 text-xs flex flex-col space-y-1' 
                      : 'py-2 sm:py-3 px-3 sm:px-4 flex flex-row sm:flex-col space-x-2 sm:space-x-0 sm:space-y-1 text-xs sm:text-sm'
                  } bg-gradient-to-r from-red-600 to-red-700 hover:from-red-700 hover:to-red-800 disabled:from-gray-600 disabled:to-gray-700 disabled:cursor-not-allowed rounded-lg font-semibold items-center justify-center transition-all`}
                >
                  <Zap className={`${isCompactMode ? 'h-3 w-3' : 'h-4 w-4 sm:h-5 sm:w-5'}`} />
                  <span>Shock</span>
                </button>

                <button
                  onClick={() => handleShock(1)}
                  disabled={isShocking || !currentUserPiShockConnected}
                  className={`${
                    isCompactMode 
                      ? 'py-2 px-2 text-xs flex flex-col space-y-1' 
                      : 'py-2 sm:py-3 px-3 sm:px-4 flex flex-row sm:flex-col space-x-2 sm:space-x-0 sm:space-y-1 text-xs sm:text-sm'
                  } bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 disabled:from-gray-600 disabled:to-gray-700 disabled:cursor-not-allowed rounded-lg font-semibold items-center justify-center transition-all`}
                >
                  <Play className={`${isCompactMode ? 'h-3 w-3' : 'h-4 w-4 sm:h-5 sm:w-5'}`} />
                  <span>Vibrate</span>
                </button>

                <button
                  onClick={() => handleShock(2)}
                  disabled={isShocking || !currentUserPiShockConnected}
                  className={`${
                    isCompactMode 
                      ? 'py-2 px-2 text-xs flex flex-col space-y-1' 
                      : 'py-2 sm:py-3 px-3 sm:px-4 flex flex-row sm:flex-col space-x-2 sm:space-x-0 sm:space-y-1 text-xs sm:text-sm'
                  } bg-gradient-to-r from-green-600 to-green-700 hover:from-green-700 hover:to-green-800 disabled:from-gray-600 disabled:to-gray-700 disabled:cursor-not-allowed rounded-lg font-semibold items-center justify-center transition-all`}
                >
                  <Square className={`${isCompactMode ? 'h-3 w-3' : 'h-4 w-4 sm:h-5 sm:w-5'}`} />
                  <span>Beep</span>
                </button>
              </div>

              {isShocking && (
                <div className="text-center flex-shrink-0">
                  <div className="inline-flex items-center space-x-2 text-yellow-400 text-sm">
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-yellow-400"></div>
                    <span>Executing command...</span>
                  </div>
                  {!isCompactMode && <p className="text-xs text-gray-400 mt-1">
                    Please wait, sending to {selectedUser?.displayName || selectedUser?.username || 'target'}...
                  </p>}
                </div>
              )}
              
              {/* Cooldown indicator */}
              {(() => {
                const now = Date.now();
                return (now - lastShockTime < 3000) && !isShocking && (
                  <div className="text-center flex-shrink-0">
                    <div className={`${isCompactMode ? 'text-xs' : 'text-xs'} text-gray-400`}>
                      Cooldown: {Math.ceil((3000 - (now - lastShockTime)) / 1000)}s remaining
                    </div>
                  </div>
                );
              })()}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}