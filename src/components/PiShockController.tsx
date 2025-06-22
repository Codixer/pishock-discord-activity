import React, { useState, useEffect } from 'react';
import { Zap, Settings, Play, Square, AlertTriangle, Wifi, Save, Loader, User, Shield, Lock } from 'lucide-react';

interface PiShockControllerProps {
  selectedUser: any;
  onConnectionChange: (connected: boolean) => void;
  isConnected: boolean;
  addNotification: (type: 'success' | 'error' | 'warning' | 'info', title: string, message: string) => void;
  instanceId: string;
  auth: any;
  currentUser: any;
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
  currentUser
}: PiShockControllerProps) {
  const [apiKey, setApiKey] = useState('');
  const [username, setUsername] = useState('');
  const [sharecode, setSharecode] = useState('');
  const [hasOwnDevice, setHasOwnDevice] = useState(false);
  const [useRelayAccount, setUseRelayAccount] = useState(false);
  const [intensity, setIntensity] = useState(1);
  const [duration, setDuration] = useState(1);
  const [isShocking, setIsShocking] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [settingsLoading, setSettingsLoading] = useState(false);
  const [settingsSaving, setSettingsSaving] = useState(false);
  const [hasStoredCredentials, setHasStoredCredentials] = useState(false);
  const [currentUserPiShockConnected, setCurrentUserPiShockConnected] = useState(false);
  const [relayAccountAvailable, setRelayAccountAvailable] = useState(false);
  const [currentUserPiShockUserId, setCurrentUserPiShockUserId] = useState<string>('');
  const [selectedUserLimits, setSelectedUserLimits] = useState<{ maxIntensity: number; maxDuration: number }>({ maxIntensity: 100, maxDuration: 15 });

  // Get the effective limits based on selected user
  const getEffectiveLimits = () => {
    if (!selectedUser) return { maxIntensity: 100, maxDuration: 15 };
    
    // Get the user's PiShock status which includes their sharecode limits
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

  // 🔒 Security Check: Ensure no sensitive data is exposed in frontend
  useEffect(() => {
    const envKeys = Object.keys(import.meta.env);
    const sensitiveKeys = envKeys.filter(key => 
      key.includes('PISHOCK') && key.includes('API_KEY') ||
      key.includes('PISHOCK') && key.includes('USERNAME') ||
      key.includes('SECRET')
    );
    
    if (sensitiveKeys.length > 0) {
      console.error('🚨 SECURITY ALERT: Sensitive data detected in frontend environment!');
      console.error('Exposed keys:', sensitiveKeys);
      console.error('These should NOT have VITE_ prefix!');
    }
  }, []);

  // Load current user's PiShock connection status when component mounts
  useEffect(() => {
    if (currentUser && auth) {
      checkCurrentUserCredentials();
      checkRelayAccountAvailability();
    }
  }, [currentUser, auth]);

  const checkCurrentUserCredentials = async () => {
    setSettingsLoading(true);
    try {
      const response = await fetch(`${getApiBaseUrl()}/users/${currentUser.id}/pishock-status`, {
        headers: {
          'Authorization': `Bearer ${auth.access_token}`,
        },
      });

      if (response.ok) {
        const status = await response.json();
        setHasStoredCredentials(status.hasCredentials);
        setCurrentUserPiShockConnected(status.isConnected);
        onConnectionChange(status.isConnected || useRelayAccount);
        
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

  const checkRelayAccountAvailability = async () => {
    try {
      const response = await fetch(`${getApiBaseUrl()}/relay-account/status`, {
        headers: {
          'Authorization': `Bearer ${auth.access_token}`,
        },
      });

      if (response.ok) {
        const status = await response.json();
        setRelayAccountAvailable(status.available);
      }
    } catch (error) {
      console.error('Failed to check relay account availability:', error);
      setRelayAccountAvailable(false);
    }
  };

  const savePiShockSettings = async () => {
    if (!currentUser || !auth) return;
    
    if (useRelayAccount) {
      // Using relay account - no credentials needed
      setHasStoredCredentials(true);
      setCurrentUserPiShockConnected(true);
      onConnectionChange(true);
      addNotification('success', 'Relay Account Enabled', 'You can now send commands using the relay account (Not Recommended)');
      setShowSettings(false);
      
      // Trigger a status refresh for all participants
      if (window.refreshAllUserStatuses) {
        window.refreshAllUserStatuses();
      }
      return;
    }

    if (!apiKey || !username) {
      addNotification('warning', 'Missing Information', 'Please fill in API Key and Username at minimum');
      return;
    }

    // If no sharecode provided, use a placeholder for account-only access
    const finalSharecode = sharecode.trim() || 'account_access';

    setSettingsSaving(true);
    try {
      const response = await fetch(`${getApiBaseUrl()}/users/${currentUser.id}/pishock-settings`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${auth.access_token}`,
        },
        body: JSON.stringify({
          apiKey,
          username,
          sharecode: finalSharecode,
          hasOwnDevice,
        }),
      });

      const result = await response.json();
      
      if (response.ok && result.success) {
        setHasStoredCredentials(true);
        setCurrentUserPiShockConnected(true);
        onConnectionChange(true);
        
        const deviceType = hasOwnDevice ? 'device' : 'account';
        addNotification('success', 'Settings Saved', `Your PiShock ${deviceType} settings saved and connection verified`);
        
        // Clear the form fields for security
        setApiKey('');
        setUsername('');
        setSharecode('');
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
        // Show detailed error information if available
        const errorMessage = result.error || `HTTP ${response.status}: Failed to save settings`;
        const debugInfo = result.debug ? `\n\nDebug info: ${JSON.stringify(result.debug, null, 2)}` : '';
        console.error('PiShock settings save error:', result);
        throw new Error(errorMessage + debugInfo);
      }
    } catch (error) {
      console.error('Failed to save PiShock settings:', error);
      addNotification('error', 'Save Failed', error instanceof Error ? error.message : 'Failed to save PiShock settings');
    } finally {
      setSettingsSaving(false);
    }
  };

  const testConnection = async () => {
    if (!currentUser || !auth) return;

    if (useRelayAccount) {
      try {
        const response = await fetch(`${getApiBaseUrl()}/relay-account/test`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${auth.access_token}`,
          },
        });

        if (response.ok) {
          const result = await response.json();
          if (result.success) {
            addNotification('success', 'Relay Account Test', 'Relay account is working correctly');
          } else {
            throw new Error(result.error || 'Relay account test failed');
          }
        } else {
          throw new Error('Relay account test failed');
        }
      } catch (error) {
        console.error('Relay account test error:', error);
        addNotification('error', 'Relay Test Failed', error instanceof Error ? error.message : 'Failed to test relay account');
      }
      return;
    }

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
          onConnectionChange(true);
          addNotification('success', 'Connection Test', 'Your PiShock account is responding correctly');
          
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
          throw new Error(result.error || 'Connection test failed');
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

    if (!currentUserPiShockConnected && !useRelayAccount) {
      addNotification('warning', 'Not Connected', 'Please connect your PiShock account first');
      return;
    }

    setIsShocking(true);

    try {
      const endpoint = useRelayAccount 
        ? `${getApiBaseUrl()}/relay-account/execute`
        : `${getApiBaseUrl()}/users/${selectedUser.id}/pishock-execute`;

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
          useRelay: useRelayAccount,
        }),
      });

      if (response.ok) {
        const result = await response.json();
        if (result.success) {
          const actionName = operation === 0 ? 'Shock' : operation === 1 ? 'Vibration' : 'Beep';
          const method = useRelayAccount ? 'via relay account' : 'to their device';
          addNotification('success', 'Command Sent', `${actionName} sent to ${selectedUser.displayName || selectedUser.username} ${method} - Intensity: ${intensity}%, Duration: ${duration}s`);
        } else {
          throw new Error(result.error || 'Command failed');
        }
      } else {
        throw new Error('Shock command failed');
      }
    } catch (error) {
      console.error('Shock error:', error);
      addNotification('error', 'Command Failed', 'Failed to send shock command. Please try again.');
    } finally {
      setIsShocking(false);
    }
  };

  const removeStoredCredentials = async () => {
    if (!currentUser || !auth) return;

    if (useRelayAccount) {
      setUseRelayAccount(false);
      setHasStoredCredentials(false);
      setCurrentUserPiShockConnected(false);
      onConnectionChange(false);
      addNotification('info', 'Relay Account Disabled', 'Relay account access has been disabled');
      return;
    }

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
        onConnectionChange(false);
        addNotification('info', 'Credentials Removed', 'Your PiShock credentials have been removed');
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
    if (useRelayAccount) {
      return {
        connected: true,
        message: 'Using Relay Account (Not Recommended)',
        color: 'yellow'
      };
    } else if (currentUserPiShockConnected) {
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

  return (
    <div className="h-full flex flex-col space-y-4 overflow-y-auto">
      {/* Settings Panel */}
      <div className="bg-black/20 backdrop-blur-sm rounded-xl border border-white/10 p-4 flex-shrink-0">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center space-x-3">
            <Settings className="h-5 w-5 text-purple-400" />
            <h3 className="text-base sm:text-lg font-semibold">Your PiShock Settings</h3>
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
        {(hasStoredCredentials || useRelayAccount) ? (
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
                  {useRelayAccount ? (
                    <>
                      <span>🔗</span>
                      <Shield className="h-4 w-4" />
                    </>
                  ) : (
                    <Wifi className="h-4 w-4" />
                  )}
                  <span>{status.message}</span>
                </div>
                {/* Show user ID for personal accounts */}
                {!useRelayAccount && currentUserPiShockConnected && (
                  <div className="text-xs opacity-75">
                    Your PiShock ID: {currentUserPiShockUserId || 'Loading...'}
                  </div>
                )}
                {useRelayAccount && (
                  <div className="text-xs opacity-75">
                    🤖 Using relay account - can target any user's device
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
              <p>Configure your PiShock account to participate. You can use account access even without owning a device.</p>
            </div>

            {/* Account Type Selection */}
            <div className="space-y-3">
              <label className="block text-sm font-medium text-gray-300">
                Account Type
              </label>
              
              {/* Personal Account Option */}
              <label className="flex items-start space-x-3 cursor-pointer p-3 rounded-lg border border-gray-600 hover:border-gray-500 transition-colors">
                <input
                  type="radio"
                  name="accountType"
                  checked={!useRelayAccount}
                  onChange={() => setUseRelayAccount(false)}
                  className="w-4 h-4 text-purple-600 bg-gray-800 border-gray-600 focus:ring-purple-500 mt-0.5"
                />
                <div className="flex-1">
                  <div className="flex items-center space-x-2">
                    <User className="h-4 w-4 text-green-400" />
                    <span className="text-sm font-medium text-gray-300">Personal PiShock Account</span>
                    <span className="text-xs bg-green-600 text-white px-2 py-0.5 rounded">Recommended</span>
                  </div>
                  <p className="text-xs text-gray-400 mt-1">
                    Use your own PiShock credentials for secure, personalized access
                  </p>
                </div>
              </label>

              {/* Relay Account Option */}
              {relayAccountAvailable && (
                <label className="flex items-start space-x-3 cursor-pointer p-3 rounded-lg border border-blue-600 hover:border-blue-500 transition-colors">
                  <input
                    type="radio"
                    name="accountType"
                    checked={useRelayAccount}
                    onChange={() => setUseRelayAccount(true)}
                    className="w-4 h-4 text-blue-600 bg-gray-800 border-gray-600 focus:ring-blue-500 mt-0.5"
                  />
                  <div className="flex-1">
                    <div className="flex items-center space-x-2">
                      <span>🔗</span>
                      <Shield className="h-4 w-4 text-blue-400" />
                      <span className="text-sm font-medium text-gray-300">Relay Account</span>
                      <span className="text-xs bg-blue-600 text-white px-2 py-0.5 rounded">Shared Access</span>
                    </div>
                    <p className="text-xs text-gray-400 mt-1">
                      Use shared relay account to send commands to any user's device
                    </p>
                  </div>
                </label>
              )}
            </div>

            {!useRelayAccount && (
              <>
                {/* Device Type Selection */}
                <div className="space-y-2">
                  <label className="block text-sm font-medium text-gray-300">
                    Participation Type
                  </label>
                  <div className="flex space-x-4">
                    <label className="flex items-center space-x-2 cursor-pointer">
                      <input
                        type="radio"
                        name="deviceType"
                        checked={!hasOwnDevice}
                        onChange={() => setHasOwnDevice(false)}
                        className="w-4 h-4 text-purple-600 bg-gray-800 border-gray-600 focus:ring-purple-500"
                      />
                      <span className="text-sm text-gray-300">Account Only (No Device)</span>
                    </label>
                    <label className="flex items-center space-x-2 cursor-pointer">
                      <input
                        type="radio"
                        name="deviceType"
                        checked={hasOwnDevice}
                        onChange={() => setHasOwnDevice(true)}
                        className="w-4 h-4 text-purple-600 bg-gray-800 border-gray-600 focus:ring-purple-500"
                      />
                      <span className="text-sm text-gray-300">Own Device</span>
                    </label>
                  </div>
                  <p className="text-xs text-gray-400">
                    {hasOwnDevice 
                      ? "You own a PiShock device and want to receive commands on it"
                      : "You have a PiShock account but don't own a device (can still participate)"
                    }
                  </p>
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1">
                    API Key <span className="text-red-400">*</span>
                  </label>
                  <input
                    type="password"
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    className="w-full px-3 py-2 bg-gray-800 border border-gray-600 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all text-sm"
                    placeholder="Enter your PiShock API key"
                  />
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
                {hasOwnDevice && (
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-1">
                      Share Code <span className="text-red-400">*</span>
                    </label>
                    <input
                      type="text"
                      value={sharecode}
                      onChange={(e) => setSharecode(e.target.value)}
                      className="w-full px-3 py-2 bg-gray-800 border border-gray-600 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all text-sm"
                      placeholder="Device share code"
                    />
                    <p className="text-xs text-gray-400 mt-1">
                      Required only if you own a device and want to receive commands
                    </p>
                  </div>
                )}
              </>
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
              <span>
                {useRelayAccount ? 'Enable Relay Account' : 'Save & Test Connection'}
              </span>
            </button>
          </div>
        )}
      </div>

      {/* Control Panel */}
      <div className="bg-black/20 backdrop-blur-sm rounded-xl border border-white/10 p-4 flex-1 flex flex-col min-h-0">
        <h3 className="text-base sm:text-lg font-semibold mb-4 flex-shrink-0">Control Panel</h3>

        {!selectedUser ? (
          <div className="text-center py-8 text-gray-400 flex-1 flex flex-col justify-center">
            <AlertTriangle className="h-12 w-12 mx-auto mb-3 opacity-50" />
            <p>Please select a participant to continue</p>
            <p className="text-sm mt-1">Only users with PiShock accounts can be targeted</p>
          </div>
        ) : (
          <div className="flex-1 flex flex-col space-y-4 min-h-0">
            {/* Target User */}
            <div className="p-3 bg-blue-900/20 border border-blue-500/30 rounded-lg flex-shrink-0">
              <div className="flex items-center space-x-3">
                <img
                  src={selectedUser.guildAvatarUrl || selectedUser.avatarUrl || `https://cdn.discordapp.com/embed/avatars/0.png`}
                  alt={`${getDisplayName(selectedUser)}'s avatar`}
                  className="w-8 h-8 rounded-full flex-shrink-0"
                  onError={(e) => {
                    const target = e.target as HTMLImageElement;
                    target.src = `https://cdn.discordapp.com/embed/avatars/0.png`;
                  }}
                />
                <div className="min-w-0 flex-1">
                  <p className="text-blue-300 text-sm">
                    <span className="font-semibold">Target:</span> {getDisplayName(selectedUser)}
                  </p>
                  <p className="text-xs text-blue-400">
                    Commands will be sent {useRelayAccount ? 'via relay account' : 'through their PiShock account'}
                  </p>
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
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 sm:gap-3 flex-shrink-0">
                <button
                  onClick={() => handleShock(0)}
                  disabled={isShocking || (!currentUserPiShockConnected && !useRelayAccount)}
                  className="py-2 sm:py-3 px-3 sm:px-4 bg-gradient-to-r from-red-600 to-red-700 hover:from-red-700 hover:to-red-800 disabled:from-gray-600 disabled:to-gray-700 disabled:cursor-not-allowed rounded-lg font-semibold flex flex-row sm:flex-col items-center justify-center space-x-2 sm:space-x-0 sm:space-y-1 transition-all text-xs sm:text-sm"
                >
                  <Zap className="h-4 w-4 sm:h-5 sm:w-5" />
                  <span>Shock</span>
                </button>

                <button
                  onClick={() => handleShock(1)}
                  disabled={isShocking || (!currentUserPiShockConnected && !useRelayAccount)}
                  className="py-2 sm:py-3 px-3 sm:px-4 bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 disabled:from-gray-600 disabled:to-gray-700 disabled:cursor-not-allowed rounded-lg font-semibold flex flex-row sm:flex-col items-center justify-center space-x-2 sm:space-x-0 sm:space-y-1 transition-all text-xs sm:text-sm"
                >
                  <Play className="h-4 w-4 sm:h-5 sm:w-5" />
                  <span>Vibrate</span>
                </button>

                <button
                  onClick={() => handleShock(2)}
                  disabled={isShocking || (!currentUserPiShockConnected && !useRelayAccount)}
                  className="py-2 sm:py-3 px-3 sm:px-4 bg-gradient-to-r from-green-600 to-green-700 hover:from-green-700 hover:to-green-800 disabled:from-gray-600 disabled:to-gray-700 disabled:cursor-not-allowed rounded-lg font-semibold flex flex-row sm:flex-col items-center justify-center space-x-2 sm:space-x-0 sm:space-y-1 transition-all text-xs sm:text-sm"
                >
                  <Square className="h-4 w-4 sm:h-5 sm:w-5" />
                  <span>Beep</span>
                </button>
              </div>

              {isShocking && (
                <div className="text-center flex-shrink-0">
                  <div className="inline-flex items-center space-x-2 text-yellow-400 text-sm">
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-yellow-400"></div>
                    <span>Executing command...</span>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}