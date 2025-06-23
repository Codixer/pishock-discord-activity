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
  const [hasOwnDevice, setHasOwnDevice] = useState(true); // Always true now since everyone needs a device
  const [userMaxIntensity, setUserMaxIntensity] = useState(100);
  const [userMaxDuration, setUserMaxDuration] = useState(15.0);
  const [intensity, setIntensity] = useState(1);
  const [duration, setDuration] = useState(0.1);
  const [isShocking, setIsShocking] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [settingsLoading, setSettingsLoading] = useState(false);
  const [settingsSaving, setSettingsSaving] = useState(false);
  const [settingsLoadingData, setSettingsLoadingData] = useState(false);
  const [hasStoredCredentials, setHasStoredCredentials] = useState(false);
  const [currentUserPiShockConnected, setCurrentUserPiShockConnected] = useState(false);
  const [currentUserPiShockUserId, setCurrentUserPiShockUserId] = useState<string>('');
  const [selectedUserLimits, setSelectedUserLimits] = useState<{ maxIntensity: number; maxDuration: number }>({ maxIntensity: 100, maxDuration: 15 });

  // Get the effective limits based on selected user
  const getEffectiveLimits = () => {
    if (!selectedUser) return { maxIntensity: 100, maxDuration: 15.0 };
    
    // Get the user's PiShock status which includes their sharecode limits
    const userStatus = (window as any).userPiShockStatus?.[selectedUser.id];
    if (userStatus && userStatus.maxIntensity && userStatus.maxDuration) {
      return {
        maxIntensity: userStatus.maxIntensity,
        maxDuration: userStatus.maxDuration
      };
    }
    
    return { maxIntensity: 100, maxDuration: 15.0 };
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
    }
  }, [currentUser, auth]);

  // Load settings data when settings panel is opened
  useEffect(() => {
    if (showSettings && currentUser && auth) {
      loadExistingSettings();
    }
  }, [showSettings, currentUser, auth]);

  const checkCurrentUserCredentials = async () => {
    console.log('STATUS: Checking current user credentials for:', currentUser?.id);
    
    setSettingsLoading(true);
    try {
      const response = await fetch(`${getApiBaseUrl()}/users/${currentUser.id}/pishock-status`, {
        headers: {
          'Authorization': `Bearer ${auth.access_token}`,
        },
      });

      console.log('STATUS: Response status:', response.status);
      
      if (response.ok) {
        const status = await response.json();
        console.log('STATUS: Response data:', {
          hasCredentials: status.hasCredentials,
          isConnected: status.isConnected,
          maxIntensity: status.maxIntensity,
          maxDuration: status.maxDuration
        });
        
        setHasStoredCredentials(status.hasCredentials);
        setCurrentUserPiShockConnected(status.isConnected);
        onConnectionChange(status.isConnected);
        
        // Store user's PiShock ID for display
        if (status.piShockUserId) {
          setCurrentUserPiShockUserId(status.piShockUserId);
        }
        
        // Load user's max limits
        if (status.maxIntensity !== undefined && status.maxDuration !== undefined) {
          setUserMaxIntensity(status.maxIntensity);
          setUserMaxDuration(parseFloat(status.maxDuration.toString()));
        }
        
        console.log('STATUS: ✓ Status check completed - hasCredentials:', status.hasCredentials);
        
        if (status.hasCredentials && !status.isConnected) {
          addNotification('warning', 'Connection Issue', 'Your PiShock credentials found but connection failed. Please check your settings.');
        } else if (status.isConnected) {
          addNotification('success', 'Connected', 'Your PiShock account is connected and ready');
        }
      } else {
        const errorText = await response.text();
        console.error('STATUS: Failed to check credentials:', response.status, errorText);
      }
    } catch (error) {
      console.error('Failed to check stored credentials:', error);
    } finally {
      setSettingsLoading(false);
    }
  };

  const loadExistingSettings = async () => {
    if (!currentUser || !auth) return;

    setSettingsLoadingData(true);
    console.log('SETTINGS: Loading existing settings for user:', currentUser.id);
    
    try {
      const response = await fetch(`${getApiBaseUrl()}/users/${currentUser.id}/pishock-settings`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${auth.access_token}`,
        },
      });

      console.log('SETTINGS: Response status:', response.status);
      
      if (response.ok) {
        const result = await response.json();
        console.log('SETTINGS: Response data:', { hasSettings: result.hasSettings, settingsKeys: result.settings ? Object.keys(result.settings) : [] });
        
        if (result.hasSettings && result.settings) {
          const settings = result.settings;
          
          // Populate form fields with existing data
          setUsername(settings.username || '');
          setSharecode(settings.sharecode || '');
          setHasOwnDevice(true); // Always true now
          setUserMaxIntensity(settings.maxIntensity || 100);
          setUserMaxDuration(parseFloat((settings.maxDuration || 15).toString()));
          
          console.log('SETTINGS: ✓ Successfully loaded existing settings:', {
            username: settings.username,
            sharecode: settings.sharecode ? 'Present' : 'Not set',
            hasOwnDevice: true,
            maxIntensity: settings.maxIntensity,
            maxDuration: settings.maxDuration,
            lastUpdated: settings.lastUpdated
          });
        } else {
          console.log('SETTINGS: No settings in response, but user was detected as having credentials. This might be a cache inconsistency.');
          console.log('SETTINGS: hasStoredCredentials from status check:', hasStoredCredentials);
          console.log('SETTINGS: Response hasSettings:', result.hasSettings);
          
          // Clear form fields if no settings exist
          console.log('SETTINGS: No settings found, but this may be normal for new users');
          
          // Reset form to defaults
          if (!settingsLoadingData) {
            setUsername('');
            setSharecode('');
            setUserMaxIntensity(100);
            setUserMaxDuration(15);
          }
        }
      } else {
        const errorText = await response.text();
        console.error('SETTINGS: Failed to load settings:', response.status, errorText);
      }
    } catch (error) {
      console.error('Failed to load existing settings:', error);
      console.log('SETTINGS: Will proceed with empty form fields due to error');
    } finally {
      setSettingsLoadingData(false);
    }
  };
  const savePiShockSettings = async () => {
    if (!currentUser || !auth) return;
    
    // For new users, all fields are required
    // For existing users, API key is optional (will preserve existing if blank)
    const isNewUser = !hasStoredCredentials;
    
    if (isNewUser && (!apiKey || !username || !sharecode)) {
      addNotification('warning', 'Missing Information', 'Please fill in all required fields: API Key, Username, and Share Code');
      return;
    }
    
    if (!username || !sharecode) {
      addNotification('warning', 'Missing Information', 'Please fill in Username and Share Code');
      return;
    }

    const finalSharecode = sharecode.trim();
    if (!finalSharecode) {
      addNotification('warning', 'Missing Share Code', 'Share code is required to control your PiShock device');
      return;
    }

    setSettingsSaving(true);
    try {
      const response = await fetch(`${getApiBaseUrl()}/users/${currentUser.id}/pishock-settings`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${auth.access_token}`,
        },
        body: JSON.stringify({
          apiKey: apiKey || undefined, // undefined will preserve existing API key
          username,
          sharecode: finalSharecode,
          hasOwnDevice: true, // Always true now
          maxIntensity: userMaxIntensity,
          maxDuration: userMaxDuration,
        }),
      });

      const result = await response.json();
      
      if (response.ok && result.success) {
        setHasStoredCredentials(true);
        setCurrentUserPiShockConnected(true);
        onConnectionChange(true);
        
        addNotification('success', 'Settings Saved', 'Your PiShock device settings saved and connection verified');
        
        // Clear the form fields for security
        setApiKey(''); // Always clear API key field for security
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

    // Check if selected user has PiShock configured
    const userStatus = (window as any).userPiShockStatus?.[selectedUser.id];
    if (!userStatus?.isConnected) {
      const displayName = getDisplayName(selectedUser);
      addNotification(
        'error', 
        'PiShock Setup Required', 
        `${displayName} needs to configure their PiShock device first.\n\nThey should:\n1. Open app settings (gear icon)\n2. Add their PiShock credentials\n3. Test the connection\n\nOnly users with configured devices can receive commands.`
      );
      return;
    }

    setIsShocking(true);

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
          addNotification('success', 'Command Sent', `${actionName} sent to ${selectedUser.displayName || selectedUser.username} - Intensity: ${intensity}%, Duration: ${duration.toFixed(1)}s`);
        } else {
          throw new Error(result.error || 'Command failed');
        }
      } else {
        throw new Error('Shock command failed');
      }
    } catch (error) {
      console.error('Shock error:', error);
      
      // Enhanced error reporting
      let errorMessage = 'Failed to send shock command. Please try again.';
      
      if (error instanceof Error) {
        if (error.message.includes('Invalid parameters')) {
          errorMessage = 'Invalid shock parameters. Please check intensity and duration settings.';
        } else if (error.message.includes('exceeds target user\'s maximum')) {
          errorMessage = error.message; // Show the specific limit error
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

  return (
    <div className="h-full flex flex-col space-y-4 overflow-y-auto">
      {/* Settings Panel */}
      <div className="bg-black/20 backdrop-blur-sm rounded-xl border border-white/10 p-4 flex-shrink-0">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center space-x-3">
            <Settings className="h-5 w-5 text-purple-400" />
            <h3 className="text-base sm:text-lg font-semibold">Your PiShock Settings</h3>
            {(settingsLoading || settingsLoadingData) && <Loader className="h-4 w-4 animate-spin text-gray-400" />}
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
                {/* Show user ID for personal accounts */}
                {currentUserPiShockConnected && (
                  <div className="text-xs opacity-75">
                    Your PiShock ID: {currentUserPiShockUserId || 'Loading...'}
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
            {settingsLoadingData && (
              <div className="p-3 bg-blue-900/20 border border-blue-500/30 rounded-lg text-sm text-blue-200">
                <div className="flex items-center space-x-2">
                  <Loader className="h-4 w-4 animate-spin" />
                  <span>Loading your saved settings...</span>
                </div>
                <div className="text-xs text-blue-300 mt-1">
                  Status check: {hasStoredCredentials ? 'Found credentials' : 'No credentials'} • Loading form data...
                </div>
              </div>
            )}
            
            <div className="p-3 bg-blue-900/20 border border-blue-500/30 rounded-lg text-sm text-blue-200">
              <p className="font-semibold mb-1">
                {hasStoredCredentials ? 'Update Settings:' : 'Account Setup:'}
              </p>
              <p>
                {hasStoredCredentials 
                  ? "Configure your PiShock device settings. Fields will auto-populate if you have saved settings."
                  : "Configure your PiShock device to participate. You'll need your API key, username, and device share code."
                }
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">
                API Key {!hasStoredCredentials && <span className="text-red-400">*</span>}
              </label>
              <input
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                disabled={settingsLoadingData}
                className="w-full px-3 py-2 bg-gray-800 border border-gray-600 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all text-sm"
                placeholder={hasStoredCredentials ? "Leave blank to keep your current API key" : "Enter your PiShock API key"}
              />
              {hasStoredCredentials && (
                <p className="text-xs text-gray-400 mt-1">
                  {settingsLoadingData ? 'Loading...' : '✓ Your current API key is saved. Leave blank to keep it unchanged.'}
                </p>
              )}
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">
                Username <span className="text-red-400">*</span>
              </label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                disabled={settingsLoadingData}
                className="w-full px-3 py-2 bg-gray-800 border border-gray-600 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all text-sm"
                placeholder="Your PiShock username"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">
                Share Code <span className="text-red-400">*</span>
              </label>
              <input
                type="text"
                value={sharecode}
                onChange={(e) => setSharecode(e.target.value)}
                disabled={settingsLoadingData}
                className="w-full px-3 py-2 bg-gray-800 border border-gray-600 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all text-sm"
                placeholder="Device share code (required to receive commands)"
              />
              <p className="text-xs text-gray-400 mt-1">
                Your PiShock device share code is required to receive commands from other users
              </p>
            </div>
            
            {/* Max Limits Settings */}
            <div className="space-y-3 p-3 bg-yellow-900/20 border border-yellow-500/30 rounded-lg">
              <h4 className="text-sm font-medium text-yellow-300">Safety Limits</h4>
              <p className="text-xs text-yellow-200">Set your maximum limits for receiving commands</p>
              
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">
                  Maximum Intensity: {userMaxIntensity}%
                </label>
                <input
                  type="range"
                  min="1"
                  max="100"
                  value={userMaxIntensity}
                  onChange={(e) => setUserMaxIntensity(parseInt(e.target.value))}
                  disabled={settingsLoadingData}
                  className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer slider"
                />
                <div className="flex justify-between text-xs text-gray-400 mt-1">
                  <span>1%</span>
                  <span>50%</span>
                  <span>100%</span>
                </div>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">
                  Maximum Duration: {userMaxDuration.toFixed(1)}s
                </label>
                <input
                  type="range"
                  min="0.1"
                  max="15.0"
                  step="0.1"
                  value={userMaxDuration}
                  onChange={(e) => setUserMaxDuration(parseFloat(e.target.value))}
                  disabled={settingsLoadingData}
                  className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer slider"
                />
                <div className="flex justify-between text-xs text-gray-400 mt-1">
                  <span>0.1s</span>
                  <span>7.5s</span>
                  <span>15.0s</span>
                </div>
              </div>
            </div>
            
            <button
              onClick={savePiShockSettings}
              disabled={settingsSaving || settingsLoadingData}
              className="w-full py-2 px-4 bg-gradient-to-r from-green-600 to-green-700 hover:from-green-700 hover:to-green-800 disabled:from-gray-600 disabled:to-gray-700 disabled:cursor-not-allowed rounded-lg font-semibold flex items-center justify-center space-x-2 transition-all text-sm"
            >
              {(settingsSaving || settingsLoadingData) ? (
                <Loader className="h-4 w-4 animate-spin" />
              ) : (
                <Save className="h-4 w-4" />
              )}
              <span>
                {settingsLoadingData ? 'Loading...' : 'Save & Test Connection'}
              </span>
            </button>
            
            {settingsLoadingData && (
              <div className="text-xs text-gray-400 text-center">
                Loading your saved settings...
              </div>
            )}
            
            {hasStoredCredentials && !settingsLoadingData && !username && !sharecode && (
              <div className="text-xs text-yellow-400 text-center">
                <p>Settings status shows you have credentials, but form fields are empty.</p>
                <p>This may be due to a cache inconsistency. Try closing and reopening settings, or just enter your credentials again.</p>
              </div>
            )}
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
                    {(window as any).userPiShockStatus?.[selectedUser.id]?.isConnected 
                      ? 'Commands will be sent through their PiShock account'
                      : 'User needs to configure PiShock first'
                    }
                  </p>
                </div>
                {/* Status indicator */}
                <div className="flex-shrink-0">
                  {(window as any).userPiShockStatus?.[selectedUser.id]?.isConnected ? (
                    <div className="w-2 h-2 bg-green-400 rounded-full"></div>
                  ) : (
                    <div className="w-2 h-2 bg-red-400 rounded-full"></div>
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
                    <span>Duration: {duration.toFixed(1)}s</span>
                    {effectiveLimits.maxDuration < 15 && (
                      <div className="flex items-center space-x-1 text-xs text-yellow-400">
                        <Lock className="h-3 w-3" />
                        <span>Max: {effectiveLimits.maxDuration.toFixed(1)}s</span>
                      </div>
                    )}
                  </div>
                </label>
                <input
                  type="range"
                  min="0.1"
                  step="0.1"
                  max={effectiveLimits.maxDuration}
                  value={duration}
                  onChange={(e) => setDuration(parseFloat(e.target.value))}
                  className={`w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer slider ${
                    effectiveLimits.maxDuration < 15 ? 'limited-slider' : ''
                  }`}
                />
                <div className="flex justify-between text-xs text-gray-400 mt-1">
                  <span>0.1s</span>
                  <span>{(effectiveLimits.maxDuration / 2).toFixed(1)}s</span>
                  <span className={effectiveLimits.maxDuration < 15 ? 'text-yellow-400' : ''}>
                    {effectiveLimits.maxDuration.toFixed(1)}s{effectiveLimits.maxDuration < 15 ? ' (Max)' : ''}
                  </span>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 sm:gap-3 flex-shrink-0">
                <button
                  onClick={() => handleShock(0)}
                  disabled={isShocking}
                  className="py-2 sm:py-3 px-3 sm:px-4 bg-gradient-to-r from-red-600 to-red-700 hover:from-red-700 hover:to-red-800 disabled:from-gray-600 disabled:to-gray-700 disabled:cursor-not-allowed rounded-lg font-semibold flex flex-row sm:flex-col items-center justify-center space-x-2 sm:space-x-0 sm:space-y-1 transition-all text-xs sm:text-sm"
                >
                  <Zap className="h-4 w-4 sm:h-5 sm:w-5" />
                  <span>Shock</span>
                </button>

                <button
                  onClick={() => handleShock(1)}
                  disabled={isShocking}
                  className="py-2 sm:py-3 px-3 sm:px-4 bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 disabled:from-gray-600 disabled:to-gray-700 disabled:cursor-not-allowed rounded-lg font-semibold flex flex-row sm:flex-col items-center justify-center space-x-2 sm:space-x-0 sm:space-y-1 transition-all text-xs sm:text-sm"
                >
                  <Play className="h-4 w-4 sm:h-5 sm:w-5" />
                  <span>Vibrate</span>
                </button>

                <button
                  onClick={() => handleShock(2)}
                  disabled={isShocking}
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