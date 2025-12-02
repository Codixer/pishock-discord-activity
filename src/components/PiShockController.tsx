import React, { useState, useEffect } from 'react';
import { Zap, Settings, Play, Square, AlertTriangle, Lock, Users, Sparkles } from 'lucide-react';
import { DiscordSDK, Common } from '@discord/embedded-app-sdk';
import { PiShockSettingsModal } from './PiShockSettingsModal';
import { useMonetization } from '../hooks/useMonetization';

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
  useConsumable: boolean;
  setUseConsumable: (value: boolean) => void;
  onOpenStore: () => void;
  multiTargetMode: boolean;
  setMultiTargetMode: (value: boolean) => void;
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
  participants = [],
  useConsumable,
  setUseConsumable,
  onOpenStore,
  multiTargetMode,
  setMultiTargetMode
}: PiShockControllerProps) {
  const [intensity, setIntensity] = useState(1);
  const [duration, setDuration] = useState(1);
  const [isShocking, setIsShocking] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [currentUserPiShockConnected, setCurrentUserPiShockConnected] = useState(false);
  const [selectedUserLimits, setSelectedUserLimits] = useState<{ maxIntensity: number; maxDuration: number }>({ maxIntensity: 100, maxDuration: 15 });
  const [selectedTargets, setSelectedTargets] = useState<string[]>([]);
  
  const monetization = useMonetization(discordSdk, isEmbedded, auth);

  // Get consumable count from monetization hook
  const consumableCount = monetization.consumableCount || 0;

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
  
  // Get the maximum allowed limits (either normal limits or 100/15 if consumable is enabled)
  const getMaxAllowedLimits = () => {
    if (useConsumable) {
      // When consumable toggle is enabled, allow up to 100% intensity and 15s duration
      // (we already checked they have consumables when they enabled the toggle)
      return { maxIntensity: 100, maxDuration: 15 };
    }
    return effectiveLimits;
  };

  const maxAllowedLimits = getMaxAllowedLimits();

  // Update intensity and duration when selected user or limits change
  useEffect(() => {
    const limits = getEffectiveLimits();
    setSelectedUserLimits(limits);
    
    // Get max allowed based on consumable toggle
    const maxAllowed = getMaxAllowedLimits();
    
    // Clamp current values to max allowed limits
    setIntensity(prevIntensity => {
      if (prevIntensity > maxAllowed.maxIntensity) {
        return maxAllowed.maxIntensity;
      }
      return prevIntensity;
    });
    
    setDuration(prevDuration => {
      if (prevDuration > maxAllowed.maxDuration) {
        return maxAllowed.maxDuration;
      }
      return prevDuration;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedUser, useConsumable, monetization.hasShockPastLimit, consumableCount]); // Include consumable state
  
  // Reset consumable toggle when consumables run out
  useEffect(() => {
    if (useConsumable && consumableCount === 0) {
      setUseConsumable(false);
      addNotification('warning', 'No Consumables', 'You have no more "Shock Past Limit" consumables. Purchase more in settings.');
    }
  }, [consumableCount, useConsumable, addNotification]);

  // Load current user's PiShock connection status when component mounts
  const checkCurrentUserCredentials = async () => {
    if (!currentUser || !auth) return;
    
    try {
      const response = await fetch(`${getApiBaseUrl()}/users/${currentUser.id}/pishock-status`, {
        headers: {
          'Authorization': `Bearer ${auth.access_token}`,
        },
      });

      if (response.ok) {
        const status = await response.json();
        
        setCurrentUserPiShockConnected(status.isConnected);
        onConnectionChange(status.isConnected);
        
        if (status.hasCredentials && !status.isConnected) {
          addNotification('warning', 'Connection Issue', 'Your PiShock credentials found but connection failed. Please check your settings.');
        } else if (status.isConnected) {
          addNotification('success', 'Connected', 'Your PiShock account is connected and ready');
        }
      } else {
        // Silently handle failed status check
      }
    } catch (error) {
      // Silently handle credential check errors
    }
  };
  
  useEffect(() => {
    checkCurrentUserCredentials();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser?.id, auth?.access_token]); // Only run when user or auth token changes

  // Check subscription expiration and disable multi-target if expired
  useEffect(() => {
    if (monetization.subscriptionExpiresAt) {
      const expiresAt = monetization.subscriptionExpiresAt * 1000;
      const now = Date.now();
      const timeUntilExpiry = expiresAt - now;
      
      // If subscription expires in less than 1 minute, disable multi-target mode
      if (timeUntilExpiry < 60000 && multiTargetMode) {
        setMultiTargetMode(false);
        setSelectedTargets([]);
        addNotification('warning', 'Subscription Expiring', 'Your Controller+ subscription is expiring soon. Multi-target mode has been disabled.');
      }
    } else if (!monetization.hasControllerPlus && multiTargetMode) {
      // Subscription expired or cancelled
      setMultiTargetMode(false);
      setSelectedTargets([]);
      addNotification('warning', 'Subscription Expired', 'Your Controller+ subscription has expired. Multi-target mode has been disabled.');
    }
  }, [monetization.hasControllerPlus, monetization.subscriptionExpiresAt, multiTargetMode, addNotification]);

  const handleShock = async (operation: number) => {
    // Multi-target mode
    if (multiTargetMode && monetization.hasControllerPlus) {
      if (selectedTargets.length === 0) {
        addNotification('warning', 'No Targets Selected', 'Please select at least one target for multi-target command');
        return;
      }

      if (selectedTargets.length > 10) {
        addNotification('error', 'Too Many Targets', 'Maximum 10 targets allowed for multi-target commands');
        return;
      }

      setIsShocking(true);

      try {
        const endpoint = `${getApiBaseUrl()}/instances/${instanceId}/pishock-execute-multi`;

        const response = await fetch(endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${auth.access_token}`,
          },
          body: JSON.stringify({
            targetUserIds: selectedTargets,
            intensity,
            duration,
            operation,
          }),
        });

        if (response.ok) {
          const result = await response.json();
          if (result.success) {
            const actionName = operation === 0 ? 'Shock' : operation === 1 ? 'Vibration' : 'Beep';
            addNotification('success', 'Multi-Target Command Sent', `${actionName} sent to ${result.summary.successful} of ${result.summary.total} targets - Intensity: ${intensity}%, Duration: ${duration}s`);
          } else {
            throw new Error(result.error || 'Command failed');
          }
        } else {
          const errorData = await response.json().catch(() => ({}));
          if (errorData.requiresControllerPlus) {
            addNotification('error', 'Controller+ Required', 'Controller+ subscription required for multi-target commands. Please purchase Controller+ in settings.');
            setMultiTargetMode(false);
            setSelectedTargets([]);
            return;
          }
          throw new Error(errorData.error || 'Multi-target command failed');
        }
      } catch (error) {
        let errorMessage = 'Failed to send multi-target command. Please try again.';
        
        if (error instanceof Error) {
          if (error.message.includes('Controller+ subscription required')) {
            errorMessage = 'Controller+ subscription required for multi-target commands. Please purchase Controller+ in settings.';
            setMultiTargetMode(false);
            setSelectedTargets([]);
          } else {
            errorMessage = `Command failed: ${error.message}`;
          }
        }
        
        addNotification('error', 'Command Failed', errorMessage);
      } finally {
        setIsShocking(false);
      }
      return;
    }

    // Single-target mode
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
          bypassLimits: useConsumable && monetization.hasShockPastLimit && consumableCount > 0,
        }),
      });

      if (response.ok) {
        const result = await response.json();
        if (result.success) {
          const actionName = operation === 0 ? 'Shock' : operation === 1 ? 'Vibration' : 'Beep';
          let message = `${actionName} sent to ${selectedUser.displayName || selectedUser.username} - Intensity: ${intensity}%, Duration: ${duration}s`;
          if (result.consumeSku) {
            message += ' (Limit bypassed - consumable used)';
            
            // Immediately update local state to mark the entitlement as consumed
            // This provides instant UI feedback while we wait for Discord API to update
            if (result.consumeSku.entitlementId && monetization.markEntitlementConsumed) {
              console.log('[PiShockController] Immediately updating UI to reflect consumed entitlement:', result.consumeSku.entitlementId);
              monetization.markEntitlementConsumed(result.consumeSku.entitlementId);
            }
            
            // Refresh entitlements after consumption (backend already consumed it)
            // Use multiple attempts with increasing delays to ensure Discord API has updated
            const refreshEntitlements = async (attempt = 1) => {
              console.log(`[PiShockController] Refreshing entitlements after SKU consumption (attempt ${attempt})`);
              
              // Refresh entitlements from Discord
              if (monetization.refreshEntitlements) {
                await monetization.refreshEntitlements();
              }
              
              // Also refresh backend status to ensure consistency
              if (auth?.user?.id) {
                try {
                  const statusResponse = await fetch(`${getApiBaseUrl()}/users/${auth.user.id}/sku-verify`, {
                    headers: {
                      'Authorization': `Bearer ${auth.access_token}`,
                    },
                  });
                  if (statusResponse.ok) {
                    const statusData = await statusResponse.json();
                    console.log('[PiShockController] Backend SKU status refreshed:', statusData);
                    
                    // Update monetization state with backend data if available
                    if (monetization.refreshBackendStatus) {
                      await monetization.refreshBackendStatus();
                    }
                  }
                } catch (e) {
                  console.error('[PiShockController] Failed to refresh backend SKU status:', e);
                }
              }
              
              // Continue retrying with increasing delays (up to 5 attempts)
              if (attempt < 5) {
                const delays = [2000, 3000, 5000, 8000]; // 2s, 3s, 5s, 8s delays
                const delay = delays[attempt - 1] || 10000;
                setTimeout(() => refreshEntitlements(attempt + 1), delay);
              } else {
                console.log('[PiShockController] Finished all refresh attempts');
              }
            };
            
            // Start refresh immediately, then continue with retries
            refreshEntitlements(1);
          }
          addNotification('success', 'Command Sent', message);
          
          // Reset consumable toggle after use
          if (useConsumable) {
            setUseConsumable(false);
          }
        } else {
          // Check for specific error types
          if (result.error && result.error.includes('consent')) {
            addNotification('warning', 'Consent Required', 'Limit bypass requires consent from both users. Please enable "Shock Past Limit" in settings.');
          } else if (result.error && result.error.includes('SKU')) {
            addNotification('warning', 'SKU Required', 'No available "Shock Past Limit" SKU found. Please purchase more in settings.');
          } else {
            throw new Error(result.error || 'Command failed');
          }
        }
      } else {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || 'Shock command failed');
      }
    } catch (error) {
      
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
        <div className={`bg-black/20 backdrop-blur-sm rounded-xl border border-white/10 p-6 flex-1 flex flex-col min-h-0 ${isPipMode ? 'p-2' : ''}`}>
          <div className="flex items-center justify-between mb-6 flex-shrink-0">
            <div className="flex items-center space-x-3">
              <h3 className={`font-semibold ${isPipMode ? 'text-sm' : 'text-lg sm:text-xl'}`}>
                Control Panel
              </h3>
            </div>
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
            {/* Multi-Target Selection - Only show when multi-target mode is enabled */}
            {multiTargetMode && participants.length > 1 && (
              <div className="p-3 bg-yellow-900/20 border border-yellow-500/30 rounded-lg flex-shrink-0">
                <div className="flex items-center space-x-2 mb-3">
                  <Users className="h-4 w-4 text-yellow-400" />
                  <span className="text-sm font-medium text-yellow-300">Select Targets</span>
                </div>
                <div className="space-y-2 max-h-32 overflow-y-auto">
                  {participants
                    .map(participant => {
                      const userStatus = (window as any).userPiShockStatus?.[participant.id];
                      const isConnected = userStatus?.isConnected;
                      const isSelected = selectedTargets.includes(participant.id);
                      const displayName = getDisplayName(participant);
                      
                      return (
                        <label
                          key={participant.id}
                          className={`flex items-center space-x-2 p-2 rounded border cursor-pointer transition-colors ${
                            isSelected
                              ? 'bg-yellow-600/20 border-yellow-500/50'
                              : 'bg-black/20 border-gray-600'
                          } ${!isConnected ? 'opacity-50 cursor-not-allowed' : ''}`}
                        >
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={(e) => {
                              if (e.target.checked) {
                                if (selectedTargets.length < 10) {
                                  setSelectedTargets([...selectedTargets, participant.id]);
                                } else {
                                  addNotification('warning', 'Maximum Targets', 'You can select up to 10 targets');
                                }
                              } else {
                                setSelectedTargets(selectedTargets.filter(id => id !== participant.id));
                              }
                            }}
                            disabled={!isConnected}
                            className="rounded"
                          />
                          <span className="text-sm text-gray-300 flex-1">
                            {displayName}
                            {participant.id === currentUser?.id && <span className="text-xs text-blue-400 ml-1">(You)</span>}
                          </span>
                          {isConnected ? (
                            <Zap className="h-3 w-3 text-green-400" />
                          ) : (
                            <AlertTriangle className="h-3 w-3 text-red-400" />
                          )}
                        </label>
                      );
                    })}
                  {selectedTargets.length > 0 && (
                    <p className="text-xs text-yellow-300 mt-2">
                      {selectedTargets.length} target{selectedTargets.length !== 1 ? 's' : ''} selected
                    </p>
                  )}
                </div>
              </div>
            )}
            
            {/* Consumable Warning - Only show if consumable is enabled and in single-target mode */}
            {!multiTargetMode && useConsumable && selectedUser && (
              <div className="p-3 bg-yellow-900/20 border border-yellow-500/30 rounded-lg flex-shrink-0">
                <div className="flex items-start space-x-2">
                  <AlertTriangle className="h-4 w-4 text-yellow-400 flex-shrink-0 mt-0.5" />
                  <div className="text-xs text-yellow-200">
                    <strong>Warning:</strong> Bypass mode is enabled. This will bypass the target's safety limits. Requires consent from both parties. One consumable will be used.
                    {consumableCount > 0 && (
                      <span className="block mt-1 text-purple-300">
                        {consumableCount} consumable{consumableCount !== 1 ? 's' : ''} remaining
                      </span>
                    )}
                  </div>
                </div>
              </div>
            )}
            <div className="flex-1 flex flex-col space-y-4 min-h-0">
              <div>
                <label className={`block font-medium text-gray-300 mb-3 ${isPipMode ? 'text-xs' : 'text-sm sm:text-base'}`}>
                  <div className="flex items-center justify-between">
                    <span>Intensity: {intensity}%</span>
                    {!isPipMode && (
                      <div className="flex items-center space-x-2">
                        {useConsumable && intensity > effectiveLimits.maxIntensity && (
                          <div className="flex items-center space-x-1 text-sm text-yellow-400">
                            <Sparkles className="h-3 w-3" />
                            <span className="font-semibold">BYPASSED</span>
                          </div>
                        )}
                        {effectiveLimits.maxIntensity < 100 && (
                          <div className={`flex items-center space-x-1 text-sm ${useConsumable ? 'text-gray-400 line-through' : 'text-yellow-400'}`}>
                            <Lock className="h-3 w-3" />
                            <span>Safe Max: {effectiveLimits.maxIntensity}%</span>
                          </div>
                        )}
                        {useConsumable && (
                          <div className="flex items-center space-x-1 text-sm text-red-400">
                            <AlertTriangle className="h-3 w-3" />
                            <span>Max: {maxAllowedLimits.maxIntensity}%</span>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </label>
                <input
                  type="range"
                  min="1"
                  max={maxAllowedLimits.maxIntensity}
                  value={intensity}
                  onChange={(e) => setIntensity(parseInt(e.target.value))}
                  style={useConsumable && effectiveLimits.maxIntensity < 100 ? {
                    '--limit-percent': `${(effectiveLimits.maxIntensity / maxAllowedLimits.maxIntensity) * 100}%`
                  } as React.CSSProperties : undefined}
                  className={`w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer slider slider-large ${
                    useConsumable 
                      ? (intensity > effectiveLimits.maxIntensity ? 'slider-danger' : 'slider-safe')
                      : (effectiveLimits.maxIntensity < 100 ? 'limited-slider' : '')
                  } ${useConsumable && effectiveLimits.maxIntensity < 100 ? 'slider-safe-track' : ''}`}
                />
                {!isPipMode && (
                  <div className="flex justify-between text-sm mt-2">
                    <span className="text-gray-400">1%</span>
                    <span className="text-gray-400">{Math.floor(maxAllowedLimits.maxIntensity / 2)}%</span>
                    <div className="flex items-center space-x-2">
                      {effectiveLimits.maxIntensity < 100 && (
                        <span className={`text-xs ${useConsumable ? 'text-gray-500 line-through' : 'text-yellow-400'}`}>
                          {effectiveLimits.maxIntensity}% (Safe)
                        </span>
                      )}
                      {useConsumable && (
                        <span className="text-xs text-red-400 font-semibold">
                          {maxAllowedLimits.maxIntensity}% (Bypassed)
                        </span>
                      )}
                      {!useConsumable && effectiveLimits.maxIntensity >= 100 && (
                        <span className="text-gray-400">{maxAllowedLimits.maxIntensity}%</span>
                      )}
                    </div>
                  </div>
                )}
              </div>

              <div>
                <label className={`block font-medium text-gray-300 mb-3 ${isPipMode ? 'text-xs' : 'text-sm sm:text-base'}`}>
                  <div className="flex items-center justify-between">
                    <span>Duration: {duration}s</span>
                    {!isPipMode && (
                      <div className="flex items-center space-x-2">
                        {useConsumable && duration > effectiveLimits.maxDuration && (
                          <div className="flex items-center space-x-1 text-sm text-yellow-400">
                            <Sparkles className="h-3 w-3" />
                            <span className="font-semibold">BYPASSED</span>
                          </div>
                        )}
                        {effectiveLimits.maxDuration < 15 && (
                          <div className={`flex items-center space-x-1 text-sm ${useConsumable ? 'text-gray-400 line-through' : 'text-yellow-400'}`}>
                            <Lock className="h-3 w-3" />
                            <span>Safe Max: {effectiveLimits.maxDuration}s</span>
                          </div>
                        )}
                        {useConsumable && (
                          <div className="flex items-center space-x-1 text-sm text-red-400">
                            <AlertTriangle className="h-3 w-3" />
                            <span>Max: {maxAllowedLimits.maxDuration}s</span>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </label>
                <input
                  type="range"
                  min="1"
                  max={maxAllowedLimits.maxDuration}
                  value={duration}
                  onChange={(e) => setDuration(parseInt(e.target.value))}
                  style={useConsumable && effectiveLimits.maxDuration < 15 ? {
                    '--limit-percent': `${(effectiveLimits.maxDuration / maxAllowedLimits.maxDuration) * 100}%`
                  } as React.CSSProperties : undefined}
                  className={`w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer slider slider-large ${
                    useConsumable 
                      ? (duration > effectiveLimits.maxDuration ? 'slider-danger' : 'slider-safe')
                      : (effectiveLimits.maxDuration < 15 ? 'limited-slider' : '')
                  } ${useConsumable && effectiveLimits.maxDuration < 15 ? 'slider-safe-track' : ''}`}
                />
                {!isPipMode && (
                  <div className="flex justify-between text-sm mt-2">
                    <span className="text-gray-400">1s</span>
                    <span className="text-gray-400">{Math.floor(maxAllowedLimits.maxDuration / 2)}s</span>
                    <div className="flex items-center space-x-2">
                      {effectiveLimits.maxDuration < 15 && (
                        <span className={`text-xs ${useConsumable ? 'text-gray-500 line-through' : 'text-yellow-400'}`}>
                          {effectiveLimits.maxDuration}s (Safe)
                        </span>
                      )}
                      {useConsumable && (
                        <span className="text-xs text-red-400 font-semibold">
                          {maxAllowedLimits.maxDuration}s (Bypassed)
                        </span>
                      )}
                      {!useConsumable && effectiveLimits.maxDuration >= 15 && (
                        <span className="text-gray-400">{maxAllowedLimits.maxDuration}s</span>
                      )}
                    </div>
                  </div>
                )}
              </div>

              <div className={`grid gap-3 flex-shrink-0 ${isPipMode ? 'grid-cols-3 gap-2' : 'grid-cols-1 sm:grid-cols-3 sm:gap-3'}`}>
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

              {!isPipMode && selectedUser && !(window as any).userPiShockStatus?.[selectedUser.id]?.isConnected && (
                <div className="p-3 bg-yellow-900/20 border border-yellow-500/30 rounded-lg flex-shrink-0">
                  <div className="flex items-start space-x-3">
                    <AlertTriangle className="h-5 w-5 text-yellow-400 flex-shrink-0 mt-0.5" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-yellow-300 mb-2">No PiShock Device</p>
                      <p className="text-sm text-yellow-200 mb-3">
                        {getDisplayName(selectedUser)} hasn't configured their PiShock device yet. 
                        Commands cannot be sent until they set up their credentials.
                      </p>
                      <p className="text-sm text-yellow-200">
                        They need to click the "PiShock Settings" button to configure their device.
                      </p>
                    </div>
                  </div>
                </div>
              )}
              {isShocking && (
                <div className={`text-center flex-shrink-0 ${isPipMode ? 'mt-1' : 'mt-2'}`}>
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