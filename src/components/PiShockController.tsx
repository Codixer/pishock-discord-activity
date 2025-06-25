import React, { useState, useEffect } from 'react';
import { Zap, Settings, Play, Square, AlertTriangle, Wifi, Save, Loader, User, Shield, Lock, ExternalLink } from 'lucide-react';
import { DiscordSDK, Common } from '@discord/embedded-app-sdk';

interface PiShockControllerProps {
  selectedUser: any;
  onConnectionChange: (connected: boolean) => void;
  isConnected: boolean;
  addNotification: (type: 'success' | 'error' | 'warning' | 'info', title: string, message: string) => void;
  instanceId: string;
  auth: any;
  currentUser: any;
  discordSdk: DiscordSDK;
  isEmbedded: boolean;
  layoutMode?: number;
}

// Helper function to get the correct API base URL
function getApiBaseUrl(): string {
  const urlParams = new URLSearchParams(window.location.search);
  const isEmbedded = urlParams.has('frame_id');
  
  if (isEmbedded) {
    // Use Discord's proxy for embedded environment
    return '/.proxy/api';
  } else {
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
  discordSdk,
  isEmbedded,
  layoutMode = Common.LayoutModeTypeObject.FOCUSED,
  participants = []
}: PiShockControllerProps) {
  const [apiKey, setApiKey] = useState('');
  const [username, setUsername] = useState('');
  const [sharecode, setSharecode] = useState('');
  const [hasOwnDevice, setHasOwnDevice] = useState(true); // Always true now since everyone needs a device
  const [userMaxIntensity, setUserMaxIntensity] = useState(100);
  const [userMaxDuration, setUserMaxDuration] = useState(15);
  const [intensity, setIntensity] = useState(1);
  const [duration, setDuration] = useState(1);
  const [isShocking, setIsShocking] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [settingsLoading, setSettingsLoading] = useState(false);
  const [settingsSaving, setSettingsSaving] = useState(false);
  const [settingsLoadingData, setSettingsLoadingData] = useState(false);
  const [hasStoredCredentials, setHasStoredCredentials] = useState(false);
  const [currentUserPiShockConnected, setCurrentUserPiShockConnected] = useState(false);
  const [currentUserPiShockUserId, setCurrentUserPiShockUserId] = useState<string>('');
  const [selectedUserLimits, setSelectedUserLimits] = useState<{ maxIntensity: number; maxDuration: number }>({ maxIntensity: 100, maxDuration: 15 });
  const [bannedExecutors, setBannedExecutors] = useState<string[]>([]);
  const [settingsExpanded, setSettingsExpanded] = useState(false);

  // Check if we're in PIP mode
  const isPipMode = layoutMode === Common.LayoutModeTypeObject.PIP;

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
    }
  }, [currentUser, auth]);

  // Load settings data when settings panel is opened
  useEffect(() => {
    if (showSettings && currentUser && auth) {
      loadExistingSettings();
    }
  }, [showSettings, currentUser, auth]);

  // Auto-save ban list whenever it changes
  useEffect(() => {
    if (currentUser && auth && bannedExecutors.length >= 0) {
      // Debounce the save to avoid excessive API calls
      const saveTimeout = setTimeout(async () => {
        try {
          console.log('BAN_MANAGEMENT: Auto-saving ban list:', bannedExecutors);
          
          await fetch(`${getApiBaseUrl()}/users/${currentUser.id}/pishock-settings`, {
            method: 'PUT',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${auth.access_token}`,
            },
            body: JSON.stringify({
              // Only send the banned executors to update that field
              bannedExecutors,
              // Keep existing other settings by not providing them (backend will preserve)
            }),
          });
          
          console.log('BAN_MANAGEMENT: ✓ Ban list saved successfully');
        } catch (error) {
          console.error('BAN_MANAGEMENT: Failed to save ban list:', error);
          // Silently fail - user will see the change in UI immediately
        }
      }, 1000); // 1 second debounce
      
      return () => clearTimeout(saveTimeout);
    }
  }, [bannedExecutors, currentUser, auth]);

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
          setUserMaxDuration(status.maxDuration);
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
          setUserMaxDuration(settings.maxDuration || 15);
          setBannedExecutors(settings.bannedExecutors || []);
          
          console.log('SETTINGS: ✓ Successfully loaded existing settings:', {
            username: settings.username,
            sharecode: settings.sharecode ? 'Present' : 'Not set',
            hasOwnDevice: true,
            maxIntensity: settings.maxIntensity,
            maxDuration: settings.maxDuration,
            bannedExecutors: settings.bannedExecutors?.length || 0,
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
          bannedExecutors,
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
        if (result.bannedExecutors || result.settings?.bannedExecutors) {
          const bannedList = result.bannedExecutors || result.settings?.bannedExecutors || [];
          setBannedExecutors(bannedList);
          console.log('BAN_MANAGEMENT: Loaded ban list:', bannedList);
          
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
          addNotification('success', 'Command Sent', `${actionName} sent to ${selectedUser.displayName || selectedUser.username} - Intensity: ${intensity}%, Duration: ${duration}s`);
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
          errorMessage = `Command intensity or duration exceeds the target user's maximum limits.`;
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

  const openPiShockAccount = async () => {
    if (isEmbedded && discordSdk) {
      try {
        await discordSdk.commands.openExternalLink({
          url: 'https://pishock.com/#/account',
        });
        addNotification('info', 'Opening PiShock Account', 'Opening your PiShock account page in a new window');
      } catch (error) {
        console.error('Failed to open external link:', error);
        addNotification('error', 'Link Failed', 'Failed to open external link. Please visit pishock.com manually.');
      }
    } else {
      // Development mode fallback
      window.open('https://pishock.com/#/account', '_blank');
      addNotification('info', 'Opening PiShock Account', 'Opening your PiShock account page in a new tab');
    }
  };
  // Get participants excluding current user for ban management
  const getOtherParticipants = () => {
    // Use participants passed as prop, fallback to global reference for compatibility
    const allParticipants = participants.length > 0 ? participants : (window as any).discordParticipants || [];
    return allParticipants.filter((p: any) => p.id !== currentUser?.id);
  };

  const toggleBanUser = (userId: string) => {
    setBannedExecutors(prev => {
      if (prev.includes(userId)) {
        return prev.filter(id => id !== userId);
      } else {
        return [...prev, userId];
      }
    });
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
    <div className="h-full flex flex-col overflow-hidden">
      {/* Settings Panel */}
      {!isPipMode && (
        <div className={`bg-black/20 backdrop-blur-sm rounded-xl border border-white/10 p-4 flex-shrink-0 ${
          showSettings ? 'max-h-96 overflow-y-auto' : ''
        }`}>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center space-x-3">
            <Settings className="h-5 w-5 text-purple-400" />
            <h3 className="text-sm sm:text-base font-semibold">PiShock Settings</h3>
            {(settingsLoading || settingsLoadingData) && <Loader className="h-4 w-4 animate-spin text-gray-400" />}
          </div>
          <div className="flex items-center space-x-2">
            <button
              onClick={() => setSettingsExpanded(!settingsExpanded)}
              className="px-2 py-1 rounded-md bg-gray-600 hover:bg-gray-500 text-xs transition-colors"
            >
              {settingsExpanded ? '−' : '+'}
            </button>
            <button
              onClick={() => setShowSettings(!showSettings)}
              className="px-2 sm:px-3 py-1 rounded-md bg-gray-700 hover:bg-gray-600 text-xs sm:text-sm transition-colors"
            >
              {showSettings ? 'Close' : 'Configure'}
            </button>
          </div>
        </div>

        {/* Compact Connection Status */}
        <div className={`transition-all duration-200 ${settingsExpanded ? 'mb-4' : 'mb-2'}`}>
          {hasStoredCredentials ? (
            <div className={`flex items-center justify-between p-3 border rounded-lg ${
              status.color === 'green' ? 'bg-green-900/20 border-green-500/30' :
              status.color === 'yellow' ? 'bg-yellow-900/20 border-yellow-500/30' :
              'bg-gray-900/20 border-gray-500/30'
            }`}>
              <div className={`flex ${settingsExpanded ? 'flex-col space-y-1' : 'flex-row items-center space-x-2'} flex-1 ${
                status.color === 'green' ? 'text-green-400' :
                status.color === 'yellow' ? 'text-yellow-400' :
                'text-gray-400'
              }`}>
                <div className={`flex items-center space-x-2 ${settingsExpanded ? 'text-sm' : 'text-xs'}`}>
                  <Wifi className="h-4 w-4" />
                  <span>{settingsExpanded ? status.message : (status.connected ? 'Connected' : 'Not Connected')}</span>
                </div>
                {/* Show user ID for personal accounts */}
                {currentUserPiShockConnected && settingsExpanded && (
                  <div className="text-xs opacity-75 mt-1">
                    Your PiShock ID: {currentUserPiShockUserId || 'Loading...'}
                  </div>
                )}
              </div>
              <div className={`flex space-x-2 ${settingsExpanded ? '' : 'ml-auto'}`}>
                <button
                  onClick={testConnection}
                  className={`px-2 py-1 rounded text-xs transition-colors ${
                    status.color === 'green' ? 'bg-green-600 hover:bg-green-700' :
                    status.color === 'yellow' ? 'bg-yellow-600 hover:bg-yellow-700' :
                    'bg-gray-600 hover:bg-gray-700'
                  }`}
                >
                  Test
                </button>
                {settingsExpanded && (
                  <button
                    onClick={removeStoredCredentials}
                    className="px-2 py-1 bg-red-600 hover:bg-red-700 rounded text-xs transition-colors"
                  >
                    Remove
                  </button>
                )}
              </div>
            </div>
          ) : (
            <div className={`p-2 bg-gray-900/20 border border-gray-500/30 rounded-lg ${settingsExpanded ? 'mb-4' : 'mb-2'}`}>
              <div className={`flex items-center space-x-2 text-gray-400 ${settingsExpanded ? 'text-sm' : 'text-xs'}`}>
                <AlertTriangle className="h-4 w-4" />
                <span>{settingsExpanded ? 'No PiShock account configured' : 'Not configured'}</span>
              </div>
            </div>
          )}
        </div>

        {showSettings && (
          <>
            <div className="space-y-3 mb-4 overflow-y-auto flex-1 min-h-0 pr-2">
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
              <div className="flex space-x-2">
              <input
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                disabled={settingsLoadingData}
                className="flex-1 px-3 py-2 bg-gray-800 border border-gray-600 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all text-sm"
                placeholder={hasStoredCredentials ? "Leave blank to keep your current API key" : "Enter your PiShock API key"}
              />
                <button
                  onClick={openPiShockAccount}
                  type="button"
                  disabled={settingsLoadingData}
                  className="px-3 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 rounded-lg transition-colors flex items-center space-x-1 text-sm"
                  title="Open PiShock Account Page"
                >
                  <ExternalLink className="h-4 w-4" />
                  <span className="hidden sm:inline">Get API Key</span>
                </button>
              </div>
              {hasStoredCredentials && (
                <p className="text-xs text-gray-400 mt-1">
                  {settingsLoadingData ? 'Loading...' : '✓ Your current API key is saved. Leave blank to keep it unchanged.'}
                </p>
              )}
              {!hasStoredCredentials && (
                <p className="text-xs text-blue-300 mt-1">
                  <ExternalLink className="h-3 w-3 inline mr-1" />
                  Click "Get API Key" to open your PiShock account page where you can find your API key
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
              <p className="text-xs text-gray-400  mt-1">
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
                  Maximum Duration: {userMaxDuration}s
                </label>
                <input
                  type="range"
                  min="1"
                  max="15"
                  value={userMaxDuration}
                  onChange={(e) => setUserMaxDuration(parseInt(e.target.value))}
                  disabled={settingsLoadingData}
                  className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer slider"
                />
                <div className="flex justify-between text-xs text-gray-400 mt-1">
                  <span>1s</span>
                  <span>8s</span>
                  <span>15s</span>
                </div>
              </div>
            </div>
            
            {/* Ban Management Section */}
            <div className="space-y-3 p-3 bg-red-900/20 border border-red-500/30 rounded-lg">
              <h4 className="text-sm font-medium text-red-300">Manage Who Can Shock You</h4>
              <p className="text-xs text-red-200">Block specific users from sending commands to your device</p>
              
              {getOtherParticipants().length > 0 ? (
                <div className="space-y-2 max-h-32 overflow-y-auto">
                  {getOtherParticipants().map((participant) => {
                    const isBanned = bannedExecutors.includes(participant.id);
                    const displayName = getDisplayName(participant);
                    
                    return (
                      <div key={participant.id} className="flex items-center justify-between p-2 bg-black/20 rounded border border-gray-600">
                        <div className="flex items-center space-x-2 flex-1 min-w-0">
                          <img
                            src={participant.avatarUrl || `https://cdn.discordapp.com/embed/avatars/0.png`}
                            alt={`${displayName}'s avatar`}
                            className="w-6 h-6 rounded-full flex-shrink-0"
                            onError={(e) => {
                              const target = e.target as HTMLImageElement;
                              target.src = `https://cdn.discordapp.com/embed/avatars/0.png`;
                            }}
                          />
                          <span className="text-sm text-gray-300 truncate">{displayName}</span>
                          {isBanned && <span className="text-xs text-red-400">BANNED</span>}
                        </div>
                        <button
                          onClick={() => toggleBanUser(participant.id)}
                          disabled={settingsLoadingData}
                          className={`px-2 py-1 rounded text-xs transition-colors ${
                            isBanned
                              ? 'bg-green-600 hover:bg-green-700 text-white'
                              : 'bg-red-600 hover:bg-red-700 text-white'
                          }`}
                        >
                          {isBanned ? 'Unban' : 'Ban'}
                        </button>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="text-xs text-gray-400">No other participants available to manage</p>
              )}
              
              {bannedExecutors.length > 0 && (
                <div className="text-xs text-red-300">
                  Currently blocking {bannedExecutors.length} user{bannedExecutors.length !== 1 ? 's' : ''}
                </div>
              )}
            </div>
            
          </div>
            
            {/* Fixed Save Button */}
            <div className="flex-shrink-0 pt-3 border-t border-white/10">
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
              <div className="text-xs text-gray-400 text-center mt-2">
                Loading your saved settings...
              </div>
            )}
            
            {hasStoredCredentials && !settingsLoadingData && !username && !sharecode && (
              <div className="text-xs text-yellow-400 text-center mt-2">
                <p>Settings status shows you have credentials, but form fields are empty.</p>
                <p>This may be due to a cache inconsistency. Try closing and reopening settings, or just enter your credentials again.</p>
              </div>
            )}
          </div>
      <div className={`bg-black/20 backdrop-blur-sm rounded-xl border border-white/10 flex-1 flex flex-col min-h-0 overflow-hidden ${isPipMode ? 'p-2' : 'p-6'} ${
        showSettings ? 'mt-4' : ''
      }`}>

        {!isPipMode && <h3 className="text-lg sm:text-xl font-semibold mb-6 flex-shrink-0">Control Panel</h3>}

        {!selectedUser ? (
          <div className="text-center py-12 text-gray-400 flex-1 flex flex-col justify-center">
            <AlertTriangle className="h-16 w-16 mx-auto mb-4 opacity-50" />
            <p className="text-lg mb-2">Please select a participant to continue</p>
            <p className="text-sm opacity-75">Only users with PiShock accounts can be targeted</p>
          </div>
        ) : (
          <div className="flex-1 flex flex-col space-y-6 min-h-0 overflow-y-auto">
            {/* Target User */}
            <div className="flex-shrink-0 space-y-4">
              <div className={`p-4 bg-blue-900/20 border border-blue-500/30 rounded-lg ${isPipMode ? 'p-2' : ''}`}>
                <div className="flex items-center space-x-3">
                  <img
                    src={selectedUser.guildAvatarUrl || selectedUser.avatarUrl || `https://cdn.discordapp.com/embed/avatars/0.png`}
                    alt={`${getDisplayName(selectedUser)}'s avatar`}
                    className={`rounded-full flex-shrink-0 ${isPipMode ? 'w-6 h-6' : 'w-10 h-10'}`}
                    onError={(e) => {
                      const target = e.target as HTMLImageElement;
                      target.src = `https://cdn.discordapp.com/embed/avatars/0.png`;
                    }}
                  />
                  <div className="min-w-0 flex-1">
                    <p className={`text-blue-300 font-medium ${isPipMode ? 'text-xs' : 'text-base'}`}>
                      <span className="font-semibold">Target:</span> {getDisplayName(selectedUser)}
                    </p>
                    {!isPipMode && (
                      <p className="text-sm text-blue-400 mt-1">
                      {(window as any).userPiShockStatus?.[selectedUser.id]?.isConnected 
                        ? 'Commands will be sent through their PiShock account'
                        : 'User needs to configure PiShock first'
                      }
                      </p>
                    )}
                  </div>
                  {/* Status indicator */}
                  <div className="flex-shrink-0">
                    {(window as any).userPiShockStatus?.[selectedUser.id]?.isConnected ? (
                      <div className="w-3 h-3 bg-green-400 rounded-full"></div>
                    ) : (
                      <div className="w-3 h-3 bg-red-400 rounded-full"></div>
                    )}
                  </div>
                </div>
              </div>

              {/* Ban Management for Selected User */}
              {!isPipMode && selectedUser && (
                <div className="p-4 bg-red-900/20 border border-red-500/30 rounded-lg">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-3 flex-1 min-w-0">
                      <div className="flex items-center space-x-2">
                        <Shield className="h-5 w-5 text-red-400" />
                        <span className="text-base font-medium text-red-300">Protection</span>
                      </div>
                      <div className="min-w-0 flex-1">
                        {bannedExecutors.includes(selectedUser.id) ? (
                          <p className="text-sm text-red-200">
                            <span className="font-semibold text-red-300">{getDisplayName(selectedUser)}</span> is blocked from shocking you
                          </p>
                        ) : (
                          <p className="text-sm text-gray-300">
                            <span className="font-semibold text-white">{getDisplayName(selectedUser)}</span> can shock you if you have PiShock configured
                          </p>
                        )}
                      </div>
                    </div>
                    <button
                      onClick={() => toggleBanUser(selectedUser.id)}
                      className={`px-4 py-2 rounded text-sm font-medium transition-colors ${
                        bannedExecutors.includes(selectedUser.id)
                          ? 'bg-green-600 hover:bg-green-700 text-white'
                          : 'bg-red-600 hover:bg-red-700 text-white'
                      }`}
                    >
                      {bannedExecutors.includes(selectedUser.id) ? 'Unblock' : 'Block'}
                    </button>
                  </div>
                  <div className="mt-3 text-sm text-red-200">
                    {bannedExecutors.includes(selectedUser.id) 
                      ? "This user cannot send commands to your PiShock device"
                      : "Block this user to prevent them from sending commands to your PiShock device"
                    }
                  </div>
                </div>
              )}
            <div className="flex-1 flex flex-col space-y-6">

            {/* Scrollable Controls Container */}
            <div className="flex-1 overflow-y-auto min-h-0 px-1">
              <div className="space-y-6 pb-4">
                {/* Intensity Control */}
                <div>
                  <label className={`block font-medium text-gray-300 mb-3 ${isPipMode ? 'text-xs' : 'text-sm sm:text-base'}`}>
                    <div className="flex items-center justify-between">
                      <span>Intensity: {intensity}%</span>
                      {effectiveLimits.maxIntensity < 100 && !isPipMode && (
                        <div className="flex items-center space-x-1 text-sm text-yellow-400">
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
                    } slider-large`}
                  />
                  {!isPipMode && (
                    <div className="flex justify-between text-sm text-gray-400 mt-2">
                    <span>1%</span>
                    <span>{Math.floor(effectiveLimits.maxIntensity / 2)}%</span>
                    <span className={effectiveLimits.maxIntensity < 100 ? 'text-yellow-400' : ''}>
                      {effectiveLimits.maxIntensity}%{effectiveLimits.maxIntensity < 100 ? ' (Max)' : ''}
                    </span>
                    </div>
                  )}
                </div>

                {/* Duration Control */}
                <div>
                  <label className={`block font-medium text-gray-300 mb-3 ${isPipMode ? 'text-xs' : 'text-sm sm:text-base'}`}>
                    <div className="flex items-center justify-between">
                      <span>Duration: {duration}s</span>
                      {effectiveLimits.maxDuration < 15 && !isPipMode && (
                        <div className="flex items-center space-x-1 text-sm text-yellow-400">
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
                    } slider-large`}
                  />
                  {!isPipMode && (
                    <div className="flex justify-between text-sm text-gray-400 mt-2">
                    <span>1s</span>
                    <span>{Math.floor(effectiveLimits.maxDuration / 2)}s</span>
                    <span className={effectiveLimits.maxDuration < 15 ? 'text-yellow-400' : ''}>
                      {effectiveLimits.maxDuration}s{effectiveLimits.maxDuration < 15 ? ' (Max)' : ''}
                    </span>
                    </div>
                  )}
                </div>

                {/* No PiShock Device Warning */}
                {!isPipMode && selectedUser && !(window as any).userPiShockStatus?.[selectedUser.id]?.isConnected && (
                  <div className="p-4 bg-yellow-900/20 border border-yellow-500/30 rounded-lg">
                    <div className="flex items-start space-x-3">
                      <AlertTriangle className="h-5 w-5 text-yellow-400 flex-shrink-0 mt-0.5" />
                      <div className="flex-1 min-w-0">
                        <p className="text-base font-medium text-yellow-300 mb-2">No PiShock Device</p>
                        <p className="text-sm text-yellow-200 mb-3">
                          {getDisplayName(selectedUser)} hasn't configured their PiShock device yet. 
                          Commands cannot be sent until they set up their credentials.
                        </p>
                        <p className="text-sm text-yellow-200">
                          However, you can still {bannedExecutors.includes(selectedUser.id) ? 'unblock' : 'block'} them 
                          to manage who can shock you when they do set up their device.
                        </p>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Action Buttons - Fixed at bottom */}
            <div className="flex-shrink-0 pt-4 border-t border-white/10">
              <div className={`grid gap-4 ${isPipMode ? 'grid-cols-3 gap-2' : 'grid-cols-1 sm:grid-cols-3 sm:gap-4'}`}>
                <button
                  onClick={() => handleShock(0)}
                  disabled={isShocking}
                  className={`bg-gradient-to-r from-red-600 to-red-700 hover:from-red-700 hover:to-red-800 disabled:from-gray-600 disabled:to-gray-700 disabled:cursor-not-allowed rounded-lg font-semibold flex items-center justify-center transition-all ${
                    isPipMode 
                      ? 'py-2 px-2 text-xs flex-col space-y-1' 
                      : 'py-4 sm:py-5 px-4 sm:px-6 flex-row sm:flex-col space-x-2 sm:space-x-0 sm:space-y-2 text-sm sm:text-base'
                  }`}
                >
                  <Zap className={isPipMode ? 'h-3 w-3' : 'h-5 w-5 sm:h-6 sm:w-6'} />
                  <span>Shock</span>
                </button>

                <button
                  onClick={() => handleShock(1)}
                  disabled={isShocking}
                  className={`bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 disabled:from-gray-600 disabled:to-gray-700 disabled:cursor-not-allowed rounded-lg font-semibold flex items-center justify-center transition-all ${
                    isPipMode 
                      ? 'py-2 px-2 text-xs flex-col space-y-1' 
                      : 'py-4 sm:py-5 px-4 sm:px-6 flex-row sm:flex-col space-x-2 sm:space-x-0 sm:space-y-2 text-sm sm:text-base'
                  }`}
                >
                  <Play className={isPipMode ? 'h-3 w-3' : 'h-5 w-5 sm:h-6 sm:w-6'} />
                  <span>Vibrate</span>
                </button>

                <button
                  onClick={() => handleShock(2)}
                  disabled={isShocking}
                  className={`bg-gradient-to-r from-green-600 to-green-700 hover:from-green-700 hover:to-green-800 disabled:from-gray-600 disabled:to-gray-700 disabled:cursor-not-allowed rounded-lg font-semibold flex items-center justify-center transition-all ${
                    isPipMode 
                      ? 'py-2 px-2 text-xs flex-col space-y-1' 
                      : 'py-4 sm:py-5 px-4 sm:px-6 flex-row sm:flex-col space-x-2 sm:space-x-0 sm:space-y-2 text-sm sm:text-base'
                  }`}
                >
                  <Square className={isPipMode ? 'h-3 w-3' : 'h-5 w-5 sm:h-6 sm:w-6'} />
                  <span>Beep</span>
                </button>
              </div>
              
              {isShocking && (
                <div className={`text-center ${isPipMode ? 'mt-2' : 'mt-4'}`}>
                  <div className={`inline-flex items-center space-x-3 text-yellow-400 ${isPipMode ? 'text-xs' : 'text-base'}`}>
                    <div className={`animate-spin rounded-full border-b-2 border-yellow-400 ${isPipMode ? 'h-4 w-4' : 'h-6 w-6'}`}></div>
                    <span>Executing command...</span>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
    </>
  );
}