import React, { useState, useEffect } from 'react';
import { Zap, Settings, Play, Square, AlertTriangle, Lock } from 'lucide-react';
import { DiscordSDK, Common } from '@discord/embedded-app-sdk';
import { PiShockSettingsModal } from './PiShockSettingsModal';

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
  participants?: any[];
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
  discordSdk,
  isEmbedded,
  layoutMode = Common.LayoutModeTypeObject.FOCUSED,
  participants = []
}: PiShockControllerProps) {
  const [intensity, setIntensity] = useState(1);
  const [duration, setDuration] = useState(1);
  const [isShocking, setIsShocking] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [currentUserPiShockConnected, setCurrentUserPiShockConnected] = useState(false);
  const [selectedUserLimits, setSelectedUserLimits] = useState<{ maxIntensity: number; maxDuration: number }>({ maxIntensity: 100, maxDuration: 15 });

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

  // Load current user's PiShock connection status when component mounts
  useEffect(() => {
    if (currentUser && auth) {
      checkCurrentUserCredentials();
    }
  }, [currentUser, auth]);

  const checkCurrentUserCredentials = async () => {
    console.log('STATUS: Checking current user credentials for:', currentUser?.id);
    
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

  const handleSettingsSaved = () => {
    // Refresh current user credentials and trigger global status refresh
    checkCurrentUserCredentials();
    if (window.refreshAllUserStatuses) {
      window.refreshAllUserStatuses();
    }
    addNotification('success', 'Settings Saved', 'Your PiShock settings have been saved successfully');
  };

  const getDisplayName = (user: any) => {
    return user?.guildDisplayName || user?.displayName || user?.global_name || user?.username || 'Unknown User';
  };

  return (
    <>
      {/* Settings Modal */}
      <PiShockSettingsModal
        isOpen={showSettings}
        onClose={() => setShowSettings(false)}
        currentUser={currentUser}
        auth={auth}
        discordSdk={discordSdk}
        isEmbedded={isEmbedded}
        onSettingsSaved={handleSettingsSaved}
        participants={participants}
      />

      <div className="h-full flex flex-col space-y-4 overflow-y-auto">
        {/* Control Panel */}
        <div className={`bg-black/20 backdrop-blur-sm rounded-xl border border-white/10 p-6 flex-1 flex flex-col min-h-0 ${isPipMode ? 'p-2' : ''}`}>
          {/* Header with Settings Button */}
          <div className="flex items-center justify-between mb-6 flex-shrink-0">
            <h3 className={`font-semibold ${isPipMode ? 'text-sm' : 'text-lg sm:text-xl'}`}>
              Control Panel
            </h3>
            {!isPipMode && (
              <button
                onClick={() => setShowSettings(true)}
                className="flex items-center space-x-2 px-4 py-2 bg-purple-600 hover:bg-purple-700 rounded-lg transition-colors text-sm font-medium"
              >
                <Settings className="h-4 w-4" />
                <span>PiShock Settings</span>
              </button>
            )}
          </div>

        {!selectedUser ? (
          <div className="text-center py-12 text-gray-400 flex-1 flex flex-col justify-center">
            <AlertTriangle className="h-16 w-16 mx-auto mb-4 opacity-50" />
            <p className="text-lg mb-2">Please select a participant to continue</p>
            <p className="text-sm opacity-75">Only users with PiShock accounts can be targeted</p>
          </div>
        ) : (
          <div className="flex-1 flex flex-col space-y-6 min-h-0">
            {/* Target User */}
            <div className={`p-4 bg-blue-900/20 border border-blue-500/30 rounded-lg flex-shrink-0 ${isPipMode ? 'p-2' : ''}`}>
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
              <div className="p-4 bg-red-900/20 border border-red-500/30 rounded-lg flex-shrink-0">
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

              {/* No PiShock Device Warning & Ban Option */}
              {!isPipMode && selectedUser && !(window as any).userPiShockStatus?.[selectedUser.id]?.isConnected && (
                <div className="p-4 bg-yellow-900/20 border border-yellow-500/30 rounded-lg flex-shrink-0">
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
              {isShocking && (
                <div className={`text-center flex-shrink-0 ${isPipMode ? 'mt-2' : 'mt-4'}`}>
                  <div className={`inline-flex items-center space-x-3 text-yellow-400 ${isPipMode ? 'text-xs' : 'text-base'}`}>
                    <div className={`animate-spin rounded-full border-b-2 border-yellow-400 ${isPipMode ? 'h-4 w-4' : 'h-6 w-6'}`}></div>
                    <span>Executing command...</span>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
      </div>
    </>
  );
}