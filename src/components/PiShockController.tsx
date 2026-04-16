import { useState, useEffect, useRef } from 'react';
import { Zap, Settings, Play, Square, AlertTriangle, Lock, Wifi, WifiOff } from 'lucide-react';
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
  multishockMode: boolean;
  onMultishockModeChange: (enabled: boolean) => void;
  hasControllerPlus: boolean;
  hasOverlimitConsumable: boolean;
  overlimitConsumableCount: number;
  entitlementsLoading: boolean;
  onOpenShop: () => void;
  onRefreshEntitlements: () => void;
  multishockSelections: Record<string, string[]>;
  onUpdateMultishockSelection: (targetUserId: string, shockerIds: string[]) => void;
  /** Defaults to global fetch; use App’s wrapped fetch for Discord token 401 retry. */
  authFetch?: typeof fetch;
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
  multishockMode,
  onMultishockModeChange,
  hasControllerPlus,
  hasOverlimitConsumable,
  overlimitConsumableCount,
  entitlementsLoading,
  onOpenShop,
  onRefreshEntitlements,
  multishockSelections,
  onUpdateMultishockSelection,
  authFetch = fetch,
}: PiShockControllerProps) {
  const [intensity, setIntensity] = useState(1);
  const [duration, setDuration] = useState(1);
  const [isShocking, setIsShocking] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [currentUserPiShockConnected, setCurrentUserPiShockConnected] = useState(false);
  const [discordConnected, setDiscordConnected] = useState(!!auth);
  const [isMultishocking, setIsMultishocking] = useState(false);
  const [bypassModeEnabled, setBypassModeEnabled] = useState(false);
  const embeddedBypassWaiter = useRef<{ resolve: (accepted: boolean) => void } | null>(null);
  const [embeddedBypassModalOpen, setEmbeddedBypassModalOpen] = useState(false);
  const effectivePiShockConnected = currentUserPiShockConnected || isConnected;

  // Check if we're in PIP mode
  const isPipMode = layoutMode === Common.LayoutModeTypeObject.PIP;

  // Update Discord connection status when auth changes
  useEffect(() => {
    setDiscordConnected(!!auth);
  }, [auth]);

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
  const selectedUserStatus = selectedUser ? (window as any).userPiShockStatus?.[selectedUser.id] : null;
  const selectedUserCommandsPaused = Boolean(selectedUserStatus?.commandsPaused);
  const targetAllowsBypass = Boolean(selectedUserStatus?.allowOverLimitWithConsumable);
  const selectedUserCapabilities = {
    canShock: selectedUserStatus?.canShock !== false,
    canVibrate: selectedUserStatus?.canVibrate !== false,
    canBeep: selectedUserStatus?.canBeep !== false,
  };
  const isSelectionOverLimit =
    intensity > effectiveLimits.maxIntensity || duration > effectiveLimits.maxDuration;
  const canArmBypassMode = Boolean(selectedUser && !multishockMode && targetAllowsBypass && hasOverlimitConsumable);
  const bypassReadyWithoutSpend = bypassModeEnabled && canArmBypassMode && !isSelectionOverLimit;
  const bypassWillSpendConsumable = bypassModeEnabled && canArmBypassMode && isSelectionOverLimit;
  const limitIndicatorColor: 'yellow' | 'green' | 'red' =
    bypassWillSpendConsumable ? 'red' : bypassReadyWithoutSpend ? 'green' : 'yellow';
  const limitTextColorClass = limitIndicatorColor === 'red'
    ? 'text-red-400'
    : limitIndicatorColor === 'green'
      ? 'text-green-400'
      : 'text-yellow-400';
  const sliderStateClass = limitIndicatorColor === 'red'
    ? 'consumable-slider'
    : limitIndicatorColor === 'green'
      ? 'unlocked-slider'
      : 'limited-slider';
  const sliderMaxIntensity = bypassModeEnabled && !multishockMode ? 100 : effectiveLimits.maxIntensity;
  const sliderMaxDuration = bypassModeEnabled && !multishockMode ? 15 : effectiveLimits.maxDuration;

  // Update intensity and duration when selected user or limits change
  useEffect(() => {
    const limits = getEffectiveLimits();
    const clampMaxIntensity = bypassModeEnabled && !multishockMode ? 100 : limits.maxIntensity;
    const clampMaxDuration = bypassModeEnabled && !multishockMode ? 15 : limits.maxDuration;
    // Clamp current values to new limits
    setIntensity(prevIntensity => {
      if (prevIntensity > clampMaxIntensity) {
        return clampMaxIntensity;
      }
      return prevIntensity;
    });
    
    setDuration(prevDuration => {
      if (prevDuration > clampMaxDuration) {
        return clampMaxDuration;
      }
      return prevDuration;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedUser, bypassModeEnabled, multishockMode]); // Only depend on mode inputs, not intensity/duration

  useEffect(() => {
    if (!canArmBypassMode && bypassModeEnabled) {
      setBypassModeEnabled(false);
    }
  }, [canArmBypassMode, bypassModeEnabled]);

  const ensureFirstBypassWarningAcknowledged = async (): Promise<boolean> => {
    if (!auth?.access_token) {
      addNotification('error', 'Bypass Unavailable', 'Missing auth token for warning acknowledgement.');
      return false;
    }

    try {
      const statusResponse = await authFetch(`${getApiBaseUrl()}/monetization/warning-acks`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${auth.access_token}`,
        },
      });
      if (!statusResponse.ok) {
        throw new Error('Unable to verify warning acknowledgement status.');
      }

      const status = await statusResponse.json();
      if (status.hasSeenFirstBypassWarning) {
        return true;
      }

      let warningAccepted = false;
      if (isEmbedded) {
        addNotification(
          'warning',
          'Bypass Warning (First Use)',
          'Conditions: target may disable bypass, command delivery is not guaranteed due to device/API constraints, and consumable purchases go to the developer (not the shocked user). Use the in-app button to acknowledge.'
        );
        warningAccepted = await new Promise<boolean>((resolve) => {
          embeddedBypassWaiter.current = { resolve };
          setEmbeddedBypassModalOpen(true);
        });
      } else {
        warningAccepted = window.confirm(
          'Bypass Warning (one-time acknowledgement)\n\n' +
          '- This application cannot guarantee people will have bypass enabled.\n' +
          '- This application cannot guarantee the command will deliver; users can still limit their shocker itself.\n' +
          '- Money used for this feature goes to the developer, not the shocked user.\n\n' +
          'Do you understand and want to continue?'
        );
      }
      if (!warningAccepted) {
        return false;
      }

      if (!isEmbedded) {
        const ackResponse = await authFetch(`${getApiBaseUrl()}/monetization/warning-acks`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${auth.access_token}`,
          },
          body: JSON.stringify({ hasSeenFirstBypassWarning: true }),
        });
        if (!ackResponse.ok) {
          throw new Error('Unable to persist warning acknowledgement.');
        }
      }

      return true;
    } catch (error) {
      addNotification(
        'error',
        'Bypass Warning',
        error instanceof Error ? error.message : 'Failed to process bypass warning acknowledgement.'
      );
      return false;
    }
  };

  // Load current user's PiShock connection status when component mounts
  const checkCurrentUserCredentials = async () => {
    if (!currentUser || !auth) return;
    
    try {
      const response = await authFetch(`${getApiBaseUrl()}/users/${currentUser.id}/pishock-status`, {
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
    if (userStatus?.commandsPaused) {
      addNotification('warning', 'Commands Paused', `${getDisplayName(selectedUser)} has paused incoming commands.`);
      return;
    }
    if (operation === 0 && userStatus?.canShock === false) {
      addNotification('warning', 'Shock Disabled', `${getDisplayName(selectedUser)} has disabled shock for this device.`);
      return;
    }
    if (operation === 1 && userStatus?.canVibrate === false) {
      addNotification('warning', 'Vibrate Disabled', `${getDisplayName(selectedUser)} has disabled vibrate for this device.`);
      return;
    }
    if (operation === 2 && userStatus?.canBeep === false) {
      addNotification('warning', 'Beep Disabled', `${getDisplayName(selectedUser)} has disabled beep for this device.`);
      return;
    }

    const bypassEligibleOperation = operation === 0 || operation === 1;
    const bypassActiveForOperation = bypassModeEnabled && bypassEligibleOperation && !multishockMode;
    const requestIntensity = bypassActiveForOperation
      ? intensity
      : Math.min(intensity, effectiveLimits.maxIntensity);
    const requestDuration = bypassActiveForOperation
      ? duration
      : Math.min(duration, effectiveLimits.maxDuration);
    const willAttemptOverLimit =
      requestIntensity > effectiveLimits.maxIntensity || requestDuration > effectiveLimits.maxDuration;

    if (bypassModeEnabled && operation === 2 && isSelectionOverLimit) {
      addNotification(
        'info',
        'Bypass Not Applied',
        `Bypass applies to shock/vibrate only. Beep will use ${requestIntensity}% / ${requestDuration}s.`
      );
    }

    if (bypassActiveForOperation) {
      const warningReady = await ensureFirstBypassWarningAcknowledged();
      if (!warningReady) {
        return;
      }
    }

    setIsShocking(true);

    try {
      const endpoint = `${getApiBaseUrl()}/users/${selectedUser.id}/pishock-execute`;

      const response = await authFetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${auth.access_token}`,
        },
        body: JSON.stringify({
          executorUserId: currentUser.id,
          targetUserId: selectedUser.id,
          intensity: requestIntensity,
          duration: requestDuration,
          operation, // 0 = shock, 1 = vibrate, 2 = beep
        }),
      });

      if (response.ok) {
        const result = await response.json();
        if (result.success) {
          const actionName = operation === 0 ? 'Shock' : operation === 1 ? 'Vibration' : 'Beep';
          const bypassLabel = bypassActiveForOperation ? ' [Bypass Armed]' : '';
          const consumableNotice = result.overLimitUsed
            ? ' Consumable spent for over-limit execution.'
            : (bypassActiveForOperation && !willAttemptOverLimit ? ' Bypass armed; no consumable spent.' : '');
          addNotification(
            'success',
            'Command Sent',
            `${actionName}${bypassLabel} sent to ${selectedUser.displayName || selectedUser.username} - Intensity: ${requestIntensity}%, Duration: ${requestDuration}s.${consumableNotice}`
          );
          if (result.overLimitUsed) {
            onRefreshEntitlements();
          }
        } else {
          throw new Error(result.error || 'Command failed');
        }
      } else {
        throw new Error('Shock command failed');
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

  const getSelectableShockersForUser = (targetUserId: string): Array<{ id: string; name: string }> => {
    const status = (window as any).userPiShockStatus?.[targetUserId];
    const allowedIds = Array.isArray(status?.allowedShockerIds)
      ? status.allowedShockerIds.map((id: string) => String(id))
      : [];

    const selectedName = status?.selectedShockerName || status?.selectedShockerId;
    if (allowedIds.length === 0 && status?.selectedShockerId) {
      return [{ id: String(status.selectedShockerId), name: selectedName || `Shocker ${status.selectedShockerId}` }];
    }

    return allowedIds.map((id: string) => ({
      id,
      name: id === String(status?.selectedShockerId) && selectedName
        ? selectedName
        : `Shocker ${id}`,
    }));
  };

  const toggleSelectedShockerForCurrentTarget = (shockerId: string) => {
    if (!selectedUser?.id) return;

    const currentSelection = multishockSelections[selectedUser.id] || [];
    const nextSelection = currentSelection.includes(shockerId)
      ? currentSelection.filter((id) => id !== shockerId)
      : [...currentSelection, shockerId];
    onUpdateMultishockSelection(selectedUser.id, nextSelection);
  };

  const runMultishock = async (operation: number) => {
    if (!hasControllerPlus) {
      addNotification('warning', 'Controller+ Required', 'Multishock is only available with Controller+.');
      return;
    }
    const targetsPayload = Object.entries(multishockSelections)
      .filter(([, shockerIds]) => Array.isArray(shockerIds) && shockerIds.length > 0)
      .map(([userId, shockerIds]) => ({ userId, shockerIds }));

    if (targetsPayload.length === 0) {
      addNotification('warning', 'No Targets', 'Select users and at least one shocker per user for multishock.');
      return;
    }

    setIsMultishocking(true);
    try {
      const response = await authFetch(`${getApiBaseUrl()}/instances/${instanceId}/pishock-multishock`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${auth.access_token}`,
        },
        body: JSON.stringify({
          executorUserId: currentUser.id,
          targets: targetsPayload,
          intensity,
          duration,
          operation,
        }),
      });
      const result = await response.json().catch(() => ({} as Record<string, unknown>));
      const partialOk = response.status === 207 || result.partialSuccess === true;
      const fatal = !response.ok && response.status !== 207;
      if (fatal || (!result.success && !partialOk)) {
        throw new Error(
          (typeof result.error === 'string' && result.error) || `Multishock failed (${response.status})`
        );
      }
      if (partialOk && Array.isArray(result.failures) && result.failures.length > 0) {
        const failures = result.failures as Array<{ targetUserId?: string; shockerId?: string; error?: string }>;
        const detail = failures
          .slice(0, 5)
          .map(
            (f) =>
              `${f.targetUserId ?? '?'}${f.shockerId ? ` / ${f.shockerId}` : ''}: ${f.error ?? 'failed'}`
          )
          .join('; ');
        addNotification(
          'warning',
          'Multishock partial success',
          `${String(result.targetCount ?? '')} target(s); failures: ${detail}${failures.length > 5 ? '…' : ''}`
        );
      } else {
        addNotification(
          'success',
          'Multishock Sent',
          `Executed multishock across ${String(result.targetCount ?? 0)} targets.`
        );
      }
    } catch (error) {
      addNotification('error', 'Multishock Failed', error instanceof Error ? error.message : 'Multishock failed');
    } finally {
      setIsMultishocking(false);
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
      {embeddedBypassModalOpen && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/70 p-4">
          <div className="max-w-md rounded-xl border border-amber-500/40 bg-gray-900 p-5 shadow-xl">
            <h4 className="text-lg font-semibold text-amber-100 mb-2">Bypass warning</h4>
            <p className="text-sm text-gray-300 mb-4">
              Target may disable bypass; delivery is not guaranteed; consumable purchases go to the developer, not
              the shocked user. This acknowledgement is saved to your account after you confirm.
            </p>
            <div className="flex flex-wrap gap-2 justify-end">
              <button
                type="button"
                className="px-3 py-2 rounded-lg bg-gray-700 text-sm text-gray-100 hover:bg-gray-600"
                onClick={() => {
                  embeddedBypassWaiter.current?.resolve(false);
                  embeddedBypassWaiter.current = null;
                  setEmbeddedBypassModalOpen(false);
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                className="px-3 py-2 rounded-lg bg-amber-600 text-sm text-white hover:bg-amber-500"
                onClick={async () => {
                  try {
                    const ackResponse = await authFetch(`${getApiBaseUrl()}/monetization/warning-acks`, {
                      method: 'POST',
                      headers: {
                        'Content-Type': 'application/json',
                        Authorization: `Bearer ${auth.access_token}`,
                      },
                      body: JSON.stringify({ hasSeenFirstBypassWarning: true }),
                    });
                    if (!ackResponse.ok) {
                      throw new Error('Unable to persist warning acknowledgement.');
                    }
                    embeddedBypassWaiter.current?.resolve(true);
                    embeddedBypassWaiter.current = null;
                    setEmbeddedBypassModalOpen(false);
                  } catch (err) {
                    addNotification(
                      'error',
                      'Bypass Warning',
                      err instanceof Error ? err.message : 'Failed to save acknowledgement.'
                    );
                    embeddedBypassWaiter.current?.resolve(false);
                    embeddedBypassWaiter.current = null;
                    setEmbeddedBypassModalOpen(false);
                  }
                }}
              >
                I understand — continue
              </button>
            </div>
          </div>
        </div>
      )}
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
        authFetch={authFetch}
      />

      <div className="h-full flex flex-col space-y-4 overflow-y-auto">
        <div className={`bg-black/20 backdrop-blur-sm rounded-xl border border-white/10 p-6 flex-1 flex flex-col min-h-0 ${isPipMode ? 'p-2' : ''}`}>
          <div className="flex items-center justify-between mb-6 flex-shrink-0">
            <h3 className={`font-semibold ${isPipMode ? 'text-sm' : 'text-lg sm:text-xl'}`}>
              Control Panel
            </h3>
            <div className="flex items-center space-x-4">
              <div className="flex items-center space-x-4">
                <div className="flex items-center space-x-2">
                  <div className={`w-2 h-2 rounded-full ${discordConnected ? 'bg-green-400' : 'bg-red-400'}`} />
                  <span className={`text-sm text-gray-300 ${isPipMode ? 'hidden' : ''}`}>Discord</span>
                  {discordConnected ? (
                    <Wifi className="h-4 w-4 text-green-400" />
                  ) : (
                    <WifiOff className="h-4 w-4 text-red-400" />
                  )}
                </div>
                
                <div className="flex items-center space-x-2">
                  <div className={`w-2 h-2 rounded-full ${effectivePiShockConnected ? 'bg-green-400' : 'bg-red-400'}`} />
                  <span className={`text-sm text-gray-300 ${isPipMode ? 'hidden' : ''}`}>PiShock</span>
                  <Zap className={`h-4 w-4 ${effectivePiShockConnected ? 'text-green-400' : 'text-red-400'}`} />
                </div>
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
          </div>

        {!selectedUser && !multishockMode ? (
          <div className="text-center py-12 text-gray-400 flex-1 flex flex-col justify-center">
            <AlertTriangle className="h-16 w-16 mx-auto mb-4 opacity-50" />
            <p className="text-lg mb-2">Please select a participant to continue</p>
            <p className="text-sm opacity-75">Only users with PiShock accounts can be targeted</p>
          </div>
        ) : (
          <div className="flex-1 flex flex-col space-y-6 min-h-0">
            {!isPipMode && multishockMode && (
              <div className="p-3 bg-indigo-900/20 border border-indigo-500/30 rounded-lg">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm text-indigo-100 font-medium">Multishock mode enabled</p>
                    <p className="text-xs text-indigo-200 mt-1">
                      Over-limit bypass is disabled for multishock commands.
                    </p>
                    <p className="text-xs text-indigo-200 mt-1">
                      Controller+: {entitlementsLoading ? 'Checking...' : hasControllerPlus ? 'Active' : 'Inactive'} •
                      Consumable: {entitlementsLoading ? 'Checking...' : hasOverlimitConsumable ? 'Available' : 'Not available'}
                    </p>
                    <p className="text-xs text-indigo-200 mt-1">
                      Consumables owned: {entitlementsLoading ? '...' : overlimitConsumableCount}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => onMultishockModeChange(false)}
                      className="px-2 py-1 bg-gray-700 hover:bg-gray-600 rounded text-xs"
                    >
                      Disable
                    </button>
                    <button
                      onClick={onRefreshEntitlements}
                      className="px-2 py-1 bg-indigo-700 hover:bg-indigo-800 rounded text-xs"
                    >
                      Refresh
                    </button>
                    <button
                      onClick={onOpenShop}
                      className="px-2 py-1 bg-indigo-600 hover:bg-indigo-700 rounded text-xs"
                    >
                      Shop
                    </button>
                  </div>
                </div>
              </div>
            )}
            {!isPipMode && selectedUser && (
              <div className="p-3 bg-blue-900/20 border border-blue-500/30 rounded-lg">
                <p className="text-sm text-blue-200">
                  Target device: <span className="font-semibold">
                    {(window as any).userPiShockStatus?.[selectedUser.id]?.selectedShockerName ||
                     (window as any).userPiShockStatus?.[selectedUser.id]?.selectedShockerId ||
                     'Not selected'}
                  </span>
                </p>
                {(window as any).userPiShockStatus?.[selectedUser.id]?.usingLegacySharecodeFallback && (
                  <p className="text-xs text-yellow-300 mt-1">
                    Legacy share code fallback is active for this user.
                  </p>
                )}
                {typeof (window as any).userPiShockStatus?.[selectedUser.id]?.shockerIdsHiddenNotOnDevices === 'number' &&
                  (window as any).userPiShockStatus[selectedUser.id].shockerIdsHiddenNotOnDevices > 0 && (
                  <p className="text-xs text-slate-300 mt-1">
                    Some shockers on this user&apos;s PiShock account are not listed here because they are not active on
                    their linked devices list (paused or offline). Only listed shockers can receive commands.
                  </p>
                )}
                {selectedUserCommandsPaused && (
                  <p className="text-xs text-red-300 mt-1">
                    This user has paused all incoming commands.
                  </p>
                )}
                {!selectedUserCapabilities.canShock && (
                  <p className="text-xs text-orange-300 mt-1">Shock is disabled by the selected PiShock device.</p>
                )}
                {!selectedUserCapabilities.canVibrate && (
                  <p className="text-xs text-orange-300 mt-1">Vibrate is disabled by the selected PiShock device.</p>
                )}
                {!selectedUserCapabilities.canBeep && (
                  <p className="text-xs text-orange-300 mt-1">Beep is disabled by the selected PiShock device.</p>
                )}
              </div>
            )}
            {!isPipMode && multishockMode && selectedUser && (
              <div className="p-3 bg-purple-900/20 border border-purple-500/30 rounded-lg">
                <p className="text-sm text-purple-200 font-medium">
                  Multishock selection for {getDisplayName(selectedUser)}
                </p>
                <p className="text-xs text-purple-300 mt-1">
                  Select which of this user&apos;s allowed shockers should be included in multishock.
                </p>
                <div className="mt-2 grid grid-cols-1 gap-1 max-h-32 overflow-y-auto">
                  {getSelectableShockersForUser(selectedUser.id).map((shocker) => (
                    <label key={shocker.id} className="flex items-center gap-2 text-xs text-purple-100">
                      <input
                        type="checkbox"
                        checked={(multishockSelections[selectedUser.id] || []).includes(shocker.id)}
                        onChange={() => toggleSelectedShockerForCurrentTarget(shocker.id)}
                      />
                      <span>{shocker.name}</span>
                    </label>
                  ))}
                  {getSelectableShockersForUser(selectedUser.id).length === 0 && (
                    <p className="text-xs text-purple-300">
                      This user has no allowed shockers configured for multishock.
                    </p>
                  )}
                </div>
              </div>
            )}
            {!isPipMode && selectedUser && !multishockMode && (
              <div className={`p-3 rounded-lg border ${
                limitIndicatorColor === 'red'
                  ? 'bg-red-900/20 border-red-500/40'
                  : limitIndicatorColor === 'green'
                    ? 'bg-emerald-900/20 border-emerald-500/40'
                    : 'bg-yellow-900/20 border-yellow-500/40'
              }`}>
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className={`text-sm font-medium ${limitTextColorClass}`}>
                      Over-limit bypass for Shock/Vibrate
                    </p>
                    <p className="text-xs text-gray-200 mt-1">
                      Yellow = normal limits, Green = bypass armed, Red = consumable will be spent on activation.
                    </p>
                    {!targetAllowsBypass && (
                      <p className="text-xs text-red-300 mt-1">
                        Target has not enabled over-limit bypass in their settings.
                      </p>
                    )}
                    {targetAllowsBypass && !hasOverlimitConsumable && (
                      <p className="text-xs text-red-300 mt-1">
                        You do not currently have an over-limit consumable.
                      </p>
                    )}
                    {targetAllowsBypass && hasOverlimitConsumable && (
                      <p className="text-xs text-emerald-300 mt-1">
                        Consumables available: {overlimitConsumableCount}
                      </p>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => setBypassModeEnabled((previous) => !previous)}
                    disabled={!canArmBypassMode}
                    className={`px-3 py-1.5 rounded text-xs font-semibold transition-colors ${
                      bypassModeEnabled
                        ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
                        : 'bg-gray-700 hover:bg-gray-600 text-gray-100'
                    } disabled:opacity-50 disabled:cursor-not-allowed`}
                  >
                    {bypassModeEnabled ? 'Bypass ON' : 'Bypass OFF'}
                  </button>
                </div>
              </div>
            )}
            <div className="flex-1 flex flex-col space-y-4 min-h-0">
              <div>
                <label className={`block font-medium text-gray-300 mb-3 ${isPipMode ? 'text-xs' : 'text-sm sm:text-base'}`}>
                  <div className="flex items-center justify-between">
                    <span>Intensity: {intensity}%</span>
                    {effectiveLimits.maxIntensity < 100 && !isPipMode && (
                      <div className={`flex items-center space-x-1 text-sm ${limitTextColorClass}`}>
                        <Lock className="h-3 w-3" />
                        <span>
                          Max: {effectiveLimits.maxIntensity}%
                        </span>
                      </div>
                    )}
                  </div>
                </label>
                <input
                  type="range"
                  min="1"
                  max={sliderMaxIntensity}
                  value={intensity}
                  onChange={(e) => setIntensity(parseInt(e.target.value))}
                  className={`w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer slider ${
                    bypassModeEnabled || effectiveLimits.maxIntensity < 100 ? sliderStateClass : ''
                  } slider-large`}
                />
                {!isPipMode && (
                  <div className="flex justify-between text-sm text-gray-400 mt-2">
                  <span>1%</span>
                  <span>{Math.floor(sliderMaxIntensity / 2)}%</span>
                  <span className={bypassModeEnabled || effectiveLimits.maxIntensity < 100 ? limitTextColorClass : ''}>
                    {sliderMaxIntensity}%{bypassModeEnabled || effectiveLimits.maxIntensity < 100 ? ' (Max)' : ''}
                  </span>
                  </div>
                )}
              </div>

              <div>
                <label className={`block font-medium text-gray-300 mb-3 ${isPipMode ? 'text-xs' : 'text-sm sm:text-base'}`}>
                  <div className="flex items-center justify-between">
                    <span>Duration: {duration}s</span>
                    {effectiveLimits.maxDuration < 15 && !isPipMode && (
                      <div className={`flex items-center space-x-1 text-sm ${limitTextColorClass}`}>
                        <Lock className="h-3 w-3" />
                        <span>
                          Max: {effectiveLimits.maxDuration}s
                        </span>
                      </div>
                    )}
                  </div>
                </label>
                <input
                  type="range"
                  min="1"
                  max={sliderMaxDuration}
                  value={duration}
                  onChange={(e) => setDuration(parseInt(e.target.value))}
                  className={`w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer slider ${
                    bypassModeEnabled || effectiveLimits.maxDuration < 15 ? sliderStateClass : ''
                  } slider-large`}
                />
                {!isPipMode && (
                  <div className="flex justify-between text-sm text-gray-400 mt-2">
                  <span>1s</span>
                  <span>{Math.floor(sliderMaxDuration / 2)}s</span>
                  <span className={bypassModeEnabled || effectiveLimits.maxDuration < 15 ? limitTextColorClass : ''}>
                    {sliderMaxDuration}s{bypassModeEnabled || effectiveLimits.maxDuration < 15 ? ' (Max)' : ''}
                  </span>
                  </div>
                )}
              </div>

              <div className={`grid gap-3 flex-shrink-0 ${isPipMode ? 'grid-cols-3 gap-2' : 'grid-cols-1 sm:grid-cols-3 sm:gap-3'}`}>
                <button
                  onClick={() => (multishockMode ? runMultishock(0) : handleShock(0))}
                  disabled={
                    isShocking ||
                    isMultishocking ||
                    (!multishockMode && (selectedUserCommandsPaused || !selectedUserCapabilities.canShock))
                  }
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
                  onClick={() => (multishockMode ? runMultishock(1) : handleShock(1))}
                  disabled={
                    isShocking ||
                    isMultishocking ||
                    (!multishockMode && (selectedUserCommandsPaused || !selectedUserCapabilities.canVibrate))
                  }
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
                  onClick={() => (multishockMode ? runMultishock(2) : handleShock(2))}
                  disabled={
                    isShocking ||
                    isMultishocking ||
                    (!multishockMode && (selectedUserCommandsPaused || !selectedUserCapabilities.canBeep))
                  }
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
              {(isShocking || isMultishocking) && (
                <div className={`text-center flex-shrink-0 ${isPipMode ? 'mt-1' : 'mt-2'}`}>
                  <div className={`inline-flex items-center space-x-3 text-yellow-400 ${isPipMode ? 'text-xs' : 'text-base'}`}>
                    <div className={`animate-spin rounded-full border-b-2 border-yellow-400 ${isPipMode ? 'h-4 w-4' : 'h-6 w-6'}`}></div>
                    <span>{isMultishocking ? 'Executing multishock...' : 'Executing command...'}</span>
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