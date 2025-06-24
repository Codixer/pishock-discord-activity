import React, { useState, useEffect } from 'react';
import { Zap, Settings, Play, Square, AlertTriangle, Wifi, Save, Loader, User, Shield, Lock, ExternalLink, Star, Crown } from 'lucide-react';
import { DiscordSDK, Common } from '@discord/embedded-app-sdk';

interface PiShockControllerProps {
  selectedUsers: any[];
  onConnectionChange: (connected: boolean) => void;
  isConnected: boolean;
  addNotification: (type: 'success' | 'error' | 'warning' | 'info', title: string, message: string) => void;
  instanceId: string;
  auth: any;
  currentUser: any;
  discordSdk: DiscordSDK;
  isEmbedded: boolean;
  layoutMode?: number;
  participants?: any[];
  multiShockEnabled: boolean;
  hasLimitBypassEntitlement: boolean;
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
  selectedUsers, 
  onConnectionChange, 
  isConnected, 
  addNotification, 
  instanceId, 
  auth,
  currentUser,
  discordSdk,
  isEmbedded,
  layoutMode = Common.LayoutModeTypeObject.FOCUSED,
  participants = [],
  multiShockEnabled,
  hasLimitBypassEntitlement
}: PiShockControllerProps) {
  const [apiKey, setApiKey] = useState('');
  const [username, setUsername] = useState('');
  const [sharecode, setSharecode] = useState('');
  const [hasOwnDevice, setHasOwnDevice] = useState(true); // Always true now since everyone needs a device
  const [userMaxIntensity, setUserMaxIntensity] = useState(100);
  const [userMaxDuration, setUserMaxDuration] = useState(15);
  const [allowLimitBypass, setAllowLimitBypass] = useState(false);
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
  const [bannedExecutors, setBannedExecutors] = useState<string[]>([]);
  const [settingsExpanded, setSettingsExpanded] = useState(false);
  const [bypassLimitsEnabled, setBypassLimitsEnabled] = useState(false);

  // Check if we're in PIP mode
  const isPipMode = layoutMode === Common.LayoutModeTypeObject.PIP;

  // Get the effective limits based on selected users and bypass status
  const getEffectiveLimits = () => {
    if (bypassLimitsEnabled && hasLimitBypassEntitlement) {
      // Check if ALL selected users allow limit bypass
      const allUsersAllowBypass = selectedUsers.every(user => {
        const userStatus = (window as any).userPiShockStatus?.[user.id];
        return userStatus?.allowLimitBypass;
      });
      
      if (allUsersAllowBypass) {
        return { maxIntensity: 100, maxDuration: 15 };
      }
    }
    
    if (selectedUsers.length === 0) return { maxIntensity: 100, maxDuration: 15 };
    
    // Find the most restrictive limits among all selected users
    let minIntensity = 100;
    let minDuration = 15;
    
    selectedUsers.forEach(user => {
      const userStatus = (window as any).userPiShockStatus?.[user.id];
      if (userStatus) {
        minIntensity = Math.min(minIntensity, userStatus.maxIntensity || 100);
        minDuration = Math.min(minDuration, userStatus.maxDuration || 15);
      }
    });
    
    return { maxIntensity: minIntensity, maxDuration: minDuration };
  };

  const effectiveLimits = getEffectiveLimits();

  // Update intensity and duration when limits change
  useEffect(() => {
    const limits = getEffectiveLimits();
    
    // Clamp current values to new limits
    if (intensity > limits.maxIntensity) {
      setIntensity(limits.maxIntensity);
    }
    if (duration > limits.maxDuration) {
      setDuration(limits.maxDuration);
    }
  }, [selectedUsers, intensity, duration, bypassLimitsEnabled]);

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

  // Auto-save ban list and settings whenever they change
  useEffect(() => {
    if (currentUser && auth && (bannedExecutors.length >= 0 || allowLimitBypass !== undefined)) {
      // Debounce the save to avoid excessive API calls
      const saveTimeout = setTimeout(async () => {
        try {
          console.log('SETTINGS: Auto-saving settings:', { bannedExecutors, allowLimitBypass });
          
          await fetch(`${getApiBaseUrl()}/users/${currentUser.id}/pishock-settings`, {
            method: 'PUT',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${auth.access_token}`,
            },
            body: JSON.stringify({
              // Only send the settings fields to update
              bannedExecutors,
              allowLimitBypass,
            }),
          });
          
          console.log('SETTINGS: ✓ Settings saved successfully');
        } catch (error) {
          console.error('SETTINGS: Failed to save settings:', error);
          // Silently fail - user will see the change in UI immediately
        }
      }, 1000); // 1 second debounce
      
      return () => clearTimeout(saveTimeout);
    }
  }, [bannedExecutors, allowLimitBypass, currentUser, auth]);

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
          maxDuration: status.maxDuration,
          allowLimitBypass: status.allowLimitBypass
        });
        
        setHasStoredCredentials(status.hasCredentials);
        setCurrentUserPiShockConnected(status.isConnected);
        onConnectionChange(status.isConnected);
        
        // Store user's PiShock ID for display
        if (status.piShockUserId) {
          setCurrentUserPiShockUserId(status.piShockUserId);
        }
        
        // Load user's max limits and settings
        if (status.maxIntensity !== undefined && status.maxDuration !== undefined) {
          setUserMaxIntensity(status.maxIntensity);
          setUserMaxDuration(status.maxDuration);
        }
        
        if (status.allowLimitBypass !== undefined) {
          setAllowLimitBypass(status.allowLimitBypass);
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
          setAllowLimitBypass(settings.allowLimitBypass || false);
          
          console.log('SETTINGS: ✓ Successfully loaded existing settings:', {
            username: settings.username,
            sharecode: settings.sharecode ? 'Present' : 'Not set',
            hasOwnDevice: true,
            maxIntensity: settings.maxIntensity,
            maxDuration: settings.maxDuration,
            bannedExecutors: settings.bannedExecutors?.length || 0,
            allowLimitBypass: settings.allowLimitBypass,
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
            setAllowLimitBypass(false);
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
          allowLimitBypass,
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
    if (selectedUsers.length === 0) {
      addNotification('warning', 'No Users Selected', 'Please select at least one user first');
      return;
    }

    // Check if selected users have PiShock configured
    const usersWithoutPiShock = selectedUsers.filter(user => {
      const userStatus = (window as any).userPiShockStatus?.[user.id];
      return !userStatus?.isConnected;
    });

    if (usersWithoutPiShock.length > 0) {
      const userNames = usersWithoutPiShock.map(user => getDisplayName(user)).join(', ');
      addNotification(
        'error', 
        'PiShock Setup Required', 
        `The following users need to configure their PiShock devices first: ${userNames}\n\nThey should:\n1. Open app settings (gear icon)\n2. Add their PiShock credentials\n3. Test the connection\n\nOnly users with configured devices can receive commands.`
      );
      return;
    }

    setIsShocking(true);

    try {
      const actionName = operation === 0 ? 'Shock' : operation === 1 ? 'Vibration' : 'Beep';
      
      // Send commands to all selected users simultaneously
      const commandPromises = selectedUsers.map(async (user) => {
        const endpoint = `${getApiBaseUrl()}/users/${user.id}/pishock-execute`;

        const response = await fetch(endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${auth.access_token}`,
          },
          body: JSON.stringify({
            executorUserId: currentUser.id,
            targetUserId: user.id,
            intensity,
            duration,
            operation, // 0 = shock, 1 = vibrate, 2 = beep
            bypassLimits: bypassLimitsEnabled && hasLimitBypassEntitlement,
          }),
        });

        if (!response.ok) {
          throw new Error(`Failed to send command to ${getDisplayName(user)}`);
        }

        const result = await response.json();
        if (!result.success) {
          throw new Error(result.error || `Command failed for ${getDisplayName(user)}`);
        }

        return { user, success: true };
      });

      const results = await Promise.allSettled(commandPromises);
      
      // Count successful and failed commands
      const successful = results.filter(result => result.status === 'fulfilled').length;
      const failed = results.filter(result => result.status === 'rejected').length;

      if (successful > 0) {
        const targetNames = selectedUsers.slice(0, 3).map(user => getDisplayName(user)).join(', ');
        const moreText = selectedUsers.length > 3 ? ` and ${selectedUsers.length - 3} more` : '';
        
        addNotification(
          'success', 
          `${actionName} Commands Sent`, 
          `${actionName} sent to ${targetNames}${moreText} - Intensity: ${intensity}%, Duration: ${duration}s${bypassLimitsEnabled ? ' (Bypass Active)' : ''}`
        );
      }

      if (failed > 0) {
        const failedResults = results.filter(result => result.status === 'rejected') as PromiseRejectedResult[];
        const errorMessages = failedResults.map(result => result.reason.message).join('; ');
        addNotification('error', `${failed} Commands Failed`, errorMessages);
      }

    } catch (error) {
      console.error('Multi-shock error:', error);
      addNotification('error', 'Commands Failed', error instanceof Error ? error.message : 'Failed to send commands');
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
    <div className="h-full flex flex-col space-y-4 overflow-y-auto">
      {/* Settings Panel */}
      {!isPipMode && (
        <div className="bg-black/20 backdrop-blur-sm rounded-xl border border-white/10 p-4 flex-shrink-0">
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

              {/* Premium Limit Bypass Setting */}
              <div className="space-y-3 p-3 bg-purple-900/20 border border-purple-500/30 rounded-lg">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="text-sm font-medium text-purple-300 flex items-center space-x-2">
                      <Crown className="h-4 w-4" />
                      <span>Premium Limit Bypass</span>
                    </h4>
                    <p className="text-xs text-purple-200 mt-1">
                      Allow premium users with bypass tokens to exceed your safety limits
                    </p>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={allowLimitBypass}
                      onChange={(e) => setAllowLimitBypass(e.target.checked)}
                      disabled={settingsLoadingData}
                      className="sr-only peer"
                    />
                    <div className="w-11 h-6 bg-gray-600 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-purple-300/20 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-purple-600"></div>
                  </label>
                </div>
                <div className="text-xs text-purple-200">
                  {allowLimitBypass ? (
                    <p>✓ Premium users can bypass your limits with special tokens</p>
                  ) : (
                    <p>✗ Your safety limits cannot be bypassed</p>
                  )}
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
      )}

      {/* Control Panel */}
      <div className={`bg-black/20 backdrop-blur-sm rounded-xl border border-white/10 p-6 flex-1 flex flex-col min-h-0 ${isPipMode ? 'p-2' : ''}`}>
        {!isPipMode && (
          <div className="flex items-center justify-between mb-6 flex-shrink-0">
            <h3 className="text-lg sm:text-xl font-semibold">Control Panel</h3>
            {multiShockEnabled && (
              <div className="flex items-center space-x-2 px-3 py-1 bg-purple-600/20 border border-purple-500/30 rounded-lg">
                <Crown className="h-4 w-4 text-purple-400" />
                <span className="text-sm text-purple-300 font-medium">Multi-Shock Premium</span>
              </div>
            )}
          </div>
        )}

        {selectedUsers.length === 0 ? (
          <div className="text-center py-12 text-gray-400 flex-1 flex flex-col justify-center">
            <AlertTriangle className="h-16 w-16 mx-auto mb-4 opacity-50" />
            <p className="text-lg mb-2">Please select participants to continue</p>
            <p className="text-sm opacity-75">
              {multiShockEnabled 
                ? 'Select multiple users for multi-shock commands'
                : 'Only users with PiShock accounts can be targeted'
              }
            </p>
          </div>
        ) : (
          <div className="flex-1 flex flex-col space-y-6 min-h-0">
            {/* Target Users Display */}
            <div className={`p-4 bg-blue-900/20 border border-blue-500/30 rounded-lg flex-shrink-0 ${isPipMode ? 'p-2' : ''}`}>
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <p className={`text-blue-300 font-medium ${isPipMode ? 'text-xs' : 'text-base'}`}>
                    <span className="font-semibold">
                      {selectedUsers.length === 1 ? 'Target:' : `Targets (${selectedUsers.length}):`}
                    </span>
                  </p>
                  {multiShockEnabled && selectedUsers.length > 1 && !isPipMode && (
                    <div className="flex items-center space-x-1 text-xs text-purple-400">
                      <Crown className="h-3 w-3" />
                      <span>Multi-Shock</span>
                    </div>
                  )}
                </div>
                
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {selectedUsers.map((user, index) => (
                    <div key={user.id} className="flex items-center space-x-2">
                      <img
                        src={user.guildAvatarUrl || user.avatarUrl || `https://cdn.discordapp.com/embed/avatars/0.png`}
                        alt={`${getDisplayName(user)}'s avatar`}
                        className={`rounded-full flex-shrink-0 ${isPipMode ? 'w-4 h-4' : 'w-6 h-6'}`}
                        onError={(e) => {
                          const target = e.target as HTMLImageElement;
                          target.src = `https://cdn.discordapp.com/embed/avatars/0.png`;
                        }}
                      />
                      <span className={`text-blue-200 truncate ${isPipMode ? 'text-xs' : 'text-sm'}`}>
                        {getDisplayName(user)}
                      </span>
                      <div className="w-2 h-2 bg-green-400 rounded-full flex-shrink-0"></div>
                    </div>
                  ))}
                </div>
                
                {!isPipMode && (
                  <p className="text-sm text-blue-400 mt-2">
                    {selectedUsers.length === 1 
                      ? 'Commands will be sent to this user'
                      : `Commands will be sent to all ${selectedUsers.length} users simultaneously`
                    }
                  </p>
                )}
              </div>
            </div>

            {/* Premium Limit Bypass Toggle */}
            {!isPipMode && hasLimitBypassEntitlement && selectedUsers.some(user => {
              const userStatus = (window as any).userPiShockStatus?.[user.id];
              return userStatus?.allowLimitBypass;
            }) && (
              <div className="p-4 bg-purple-900/20 border border-purple-500/30 rounded-lg flex-shrink-0">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-3">
                    <div className="flex items-center space-x-2">
                      <Star className="h-5 w-5 text-purple-400" />
                      <span className="text-base font-medium text-purple-300">Limit Bypass</span>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        checked={bypassLimitsEnabled}
                        onChange={(e) => setBypassLimitsEnabled(e.target.checked)}
                        className="sr-only peer"
                      />
                      <div className="w-11 h-6 bg-gray-600 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-purple-300/20 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-purple-600"></div>
                    </label>
                  </div>
                </div>
                <div className="mt-3 text-sm text-purple-200">
                  {bypassLimitsEnabled ? (
                    <p>✓ Will attempt to bypass safety limits (requires consent from all targets)</p>
                  ) : (
                    <p>Respecting individual safety limits</p>
                  )}
                </div>
              </div>
            )}

            {/* Controls Container */}
            <div className="flex-1 flex flex-col space-y-6 min-h-0">
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
                      {bypassLimitsEnabled && selectedUsers.every(user => {
                        const userStatus = (window as any).userPiShockStatus?.[user.id];
                        return userStatus?.allowLimitBypass;
                      }) ? '100% (Bypass)' : `${effectiveLimits.maxIntensity}%${effectiveLimits.maxIntensity < 100 ? ' (Max)' : ''}`}
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
                      {bypassLimitsEnabled && selectedUsers.every(user => {
                        const userStatus = (window as any).userPiShockStatus?.[user.id];
                        return userStatus?.allowLimitBypass;
                      }) ? '15s (Bypass)' : `${effectiveLimits.maxDuration}s${effectiveLimits.maxDuration < 15 ? ' (Max)' : ''}`}
                    </span>
                  </div>
                )}
              </div>

              {/* Action Buttons */}
              <div className={`grid gap-4 flex-shrink-0 ${isPipMode ? 'grid-cols-3 gap-2' : 'grid-cols-1 sm:grid-cols-3 sm:gap-4'}`}>
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

              {/* Multi-User No PiShock Warning */}
              {!isPipMode && selectedUsers.length > 0 && selectedUsers.some(user => {
                const userStatus = (window as any).userPiShockStatus?.[user.id];
                return !userStatus?.isConnected;
              }) && (
                <div className="p-4 bg-yellow-900/20 border border-yellow-500/30 rounded-lg flex-shrink-0">
                  <div className="flex items-start space-x-3">
                    <AlertTriangle className="h-5 w-5 text-yellow-400 flex-shrink-0 mt-0.5" />
                    <div className="flex-1 min-w-0">
                      <p className="text-base font-medium text-yellow-300 mb-2">Some Users Missing PiShock Setup</p>
                      <div className="space-y-1">
                        {selectedUsers.filter(user => {
                          const userStatus = (window as any).userPiShockStatus?.[user.id];
                          return !userStatus?.isConnected;
                        }).map(user => (
                          <p key={user.id} className="text-sm text-yellow-200">
                            • {getDisplayName(user)} needs to configure their PiShock device
                          </p>
                        ))}
                      </div>
                      <p className="text-sm text-yellow-200 mt-2">
                        Commands will only be sent to users with properly configured devices.
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {isShocking && (
                <div className={`text-center flex-shrink-0 ${isPipMode ? 'mt-2' : 'mt-4'}`}>
                  <div className={`inline-flex items-center space-x-3 text-yellow-400 ${isPipMode ? 'text-xs' : 'text-base'}`}>
                    <div className={`animate-spin rounded-full border-b-2 border-yellow-400 ${isPipMode ? 'h-4 w-4' : 'h-6 w-6'}`}></div>
                    <span>
                      {selectedUsers.length === 1 
                        ? 'Executing command...' 
                        : `Sending to ${selectedUsers.length} users...`
                      }
                    </span>
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