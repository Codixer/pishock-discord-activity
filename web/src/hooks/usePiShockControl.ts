import { useState, useEffect, useRef, useCallback } from 'react';
import type { DiscordSDK } from '@discord/embedded-app-sdk';

export function getApiBaseUrl(): string {
  const isEmbedded = new URLSearchParams(window.location.search).has('frame_id');
  return isEmbedded ? '/.proxy/api' : '/api';
}

export type NotifyFn = (type: 'success' | 'error' | 'warning' | 'info', title: string, message: string) => void;

export interface UsePiShockControlOptions {
  selectedUser: any;
  onConnectionChange: (connected: boolean) => void;
  isConnected: boolean;
  addNotification: NotifyFn;
  instanceId: string;
  auth: any;
  currentUser: any;
  isEmbedded: boolean;
  multishockMode: boolean;
  hasControllerPlus: boolean;
  hasOverlimitConsumable: boolean;
  multishockSelections: Record<string, string[]>;
  onUpdateMultishockSelection: (targetUserId: string, shockerIds: string[]) => void;
  onRefreshEntitlements: () => void;
  authFetch?: typeof fetch;
}

const SHOCK_DURATIONS = [0.3, 0.5, 1, 1.5, 2, 3, 5, 10, 15];

export function usePiShockControl({
  selectedUser,
  onConnectionChange,
  isConnected,
  addNotification,
  instanceId,
  auth,
  currentUser,
  isEmbedded,
  multishockMode,
  hasControllerPlus,
  hasOverlimitConsumable,
  multishockSelections,
  onUpdateMultishockSelection,
  onRefreshEntitlements,
  authFetch = fetch,
}: UsePiShockControlOptions) {
  const [intensity, setIntensity] = useState(1);
  const [duration, setDuration] = useState(1);
  const [vibrateIntensity, setVibrateIntensity] = useState(50);
  const [vibrateDuration, setVibrateDuration] = useState(1);
  const [isExecuting, setIsExecuting] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [currentUserPiShockConnected, setCurrentUserPiShockConnected] = useState(false);
  const [bypassModeEnabled, setBypassModeEnabled] = useState(false);
  const embeddedBypassWaiter = useRef<{ resolve: (accepted: boolean) => void } | null>(null);
  const [embeddedBypassModalOpen, setEmbeddedBypassModalOpen] = useState(false);

  const getDisplayName = useCallback((user: any) => {
    return user?.guildDisplayName || user?.displayName || user?.global_name || user?.username || 'Unknown User';
  }, []);

  const getEffectiveLimits = useCallback(() => {
    if (!selectedUser) return { maxIntensity: 100, maxDuration: 15 };
    const userStatus = (window as any).userPiShockStatus?.[selectedUser.id];
    if (userStatus?.maxIntensity && userStatus?.maxDuration) {
      return { maxIntensity: userStatus.maxIntensity, maxDuration: userStatus.maxDuration };
    }
    return { maxIntensity: 100, maxDuration: 15 };
  }, [selectedUser]);

  const effectiveLimits = getEffectiveLimits();
  const selectedUserStatus = selectedUser ? (window as any).userPiShockStatus?.[selectedUser.id] : null;
  const selectedUserCommandsPaused = Boolean(selectedUserStatus?.commandsPaused);
  const targetAllowsBypass = Boolean(selectedUserStatus?.allowOverLimitWithConsumable);
  const capabilities = {
    canShock: selectedUserStatus?.canShock !== false,
    canVibrate: selectedUserStatus?.canVibrate !== false,
    canBeep: selectedUserStatus?.canBeep !== false,
  };
  const isSelectionOverLimit = intensity > effectiveLimits.maxIntensity || duration > effectiveLimits.maxDuration;
  const canArmBypassMode = Boolean(selectedUser && !multishockMode && targetAllowsBypass && hasOverlimitConsumable);
  const bypassWillSpendConsumable = bypassModeEnabled && canArmBypassMode && isSelectionOverLimit;
  const sliderMaxIntensity = bypassModeEnabled && !multishockMode ? 100 : effectiveLimits.maxIntensity;
  const sliderMaxDuration = bypassModeEnabled && !multishockMode ? 15 : effectiveLimits.maxDuration;
  const targetConnected = Boolean(selectedUserStatus?.isConnected);
  const controlsDisabled = selectedUserCommandsPaused || !targetConnected;

  useEffect(() => {
    const limits = getEffectiveLimits();
    const maxI = bypassModeEnabled && !multishockMode ? 100 : limits.maxIntensity;
    const maxD = bypassModeEnabled && !multishockMode ? 15 : limits.maxDuration;
    setIntensity((v) => Math.min(v, maxI));
    setDuration((v) => Math.min(v, maxD));
  }, [selectedUser, bypassModeEnabled, multishockMode, getEffectiveLimits]);

  useEffect(() => {
    if (!canArmBypassMode && bypassModeEnabled) setBypassModeEnabled(false);
  }, [canArmBypassMode, bypassModeEnabled]);

  const checkCurrentUserCredentials = useCallback(async () => {
    if (!currentUser || !auth) return;
    try {
      const response = await authFetch(`${getApiBaseUrl()}/users/${currentUser.id}/pishock-status`, {
        headers: { Authorization: `Bearer ${auth.access_token}` },
      });
      if (response.ok) {
        const status = await response.json();
        setCurrentUserPiShockConnected(status.isConnected);
        onConnectionChange(status.isConnected);
      }
    } catch { /* ignore */ }
  }, [auth, authFetch, currentUser, onConnectionChange]);

  useEffect(() => {
    void checkCurrentUserCredentials();
  }, [checkCurrentUserCredentials]);

  const cycleShockDuration = () => {
    const idx = SHOCK_DURATIONS.findIndex((d) => Math.abs(d - duration) < 0.05);
    const next = SHOCK_DURATIONS[(idx + 1) % SHOCK_DURATIONS.length];
    setDuration(Math.min(next, sliderMaxDuration));
  };

  const ensureFirstBypassWarningAcknowledged = async (): Promise<boolean> => {
    if (!auth?.access_token) return false;
    try {
      const statusResponse = await authFetch(`${getApiBaseUrl()}/monetization/warning-acks`, {
        headers: { Authorization: `Bearer ${auth.access_token}` },
      });
      if (!statusResponse.ok) throw new Error('Unable to verify warning acknowledgement status.');
      const status = await statusResponse.json();
      if (status.hasSeenFirstBypassWarning) return true;

      let warningAccepted = false;
      if (isEmbedded) {
        warningAccepted = await new Promise<boolean>((resolve) => {
          embeddedBypassWaiter.current = { resolve };
          setEmbeddedBypassModalOpen(true);
        });
      } else {
        warningAccepted = window.confirm('Bypass warning: delivery not guaranteed. Continue?');
        if (warningAccepted) {
          await authFetch(`${getApiBaseUrl()}/monetization/warning-acks`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${auth.access_token}` },
            body: JSON.stringify({ hasSeenFirstBypassWarning: true }),
          });
        }
      }
      return warningAccepted;
    } catch (error) {
      addNotification('error', 'Bypass Warning', error instanceof Error ? error.message : 'Failed');
      return false;
    }
  };

  const executeCommand = async (operation: number, opIntensity?: number, opDuration?: number) => {
    const reqIntensity = opIntensity ?? (operation === 1 ? vibrateIntensity : intensity);
    const reqDuration = opDuration ?? (operation === 1 ? vibrateDuration : duration);

    if (multishockMode) {
      if (!hasControllerPlus) {
        addNotification('warning', 'Controller+ Required', 'Multishock requires Controller+.');
        return;
      }
      const targetsPayload = Object.entries(multishockSelections)
        .filter(([, ids]) => Array.isArray(ids) && ids.length > 0)
        .map(([userId, shockerIds]) => ({ userId, shockerIds }));
      if (targetsPayload.length === 0) {
        addNotification('warning', 'No Targets', 'Select shockers in PISHOCKS menu.');
        return;
      }
      setIsExecuting(true);
      try {
        const response = await authFetch(`${getApiBaseUrl()}/instances/${instanceId}/pishock-multishock`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${auth.access_token}` },
          body: JSON.stringify({
            executorUserId: currentUser.id,
            targets: targetsPayload,
            intensity: reqIntensity,
            duration: reqDuration,
            operation,
          }),
        });
        const result = await response.json().catch(() => ({}));
        if (!response.ok && response.status !== 207) throw new Error(result.error || 'Multishock failed');
        addNotification('success', 'Multishock Sent', `Executed across ${result.targetCount ?? 0} targets.`);
      } catch (e) {
        addNotification('error', 'Multishock Failed', e instanceof Error ? e.message : 'Failed');
      } finally {
        setIsExecuting(false);
      }
      return;
    }

    if (!selectedUser) {
      addNotification('warning', 'No Target', 'Select a participant from PISHOCKS.');
      return;
    }
    const userStatus = (window as any).userPiShockStatus?.[selectedUser.id];
    if (!userStatus?.isConnected) {
      addNotification('error', 'Not Connected', `${getDisplayName(selectedUser)} has no PiShock device configured.`);
      return;
    }

    const bypassActive = bypassModeEnabled && (operation === 0 || operation === 1);
    if (bypassActive && !(await ensureFirstBypassWarningAcknowledged())) return;

    const finalIntensity = bypassActive ? reqIntensity : Math.min(reqIntensity, effectiveLimits.maxIntensity);
    const finalDuration = bypassActive ? reqDuration : Math.min(reqDuration, effectiveLimits.maxDuration);

    setIsExecuting(true);
    try {
      const response = await authFetch(`${getApiBaseUrl()}/users/${selectedUser.id}/pishock-execute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${auth.access_token}` },
        body: JSON.stringify({
          executorUserId: currentUser.id,
          targetUserId: selectedUser.id,
          intensity: finalIntensity,
          duration: finalDuration,
          operation,
        }),
      });
      const result = await response.json();
      if (!response.ok || !result.success) throw new Error(result.error || 'Command failed');
      addNotification('success', 'Command Sent', `${['Shock', 'Vibrate', 'Beep'][operation]} sent.`);
      if (result.overLimitUsed) onRefreshEntitlements();
    } catch (e) {
      addNotification('error', 'Command Failed', e instanceof Error ? e.message : 'Failed');
    } finally {
      setIsExecuting(false);
    }
  };

  const resolveBypassModal = async (accepted: boolean) => {
    if (accepted && auth?.access_token) {
      try {
        await authFetch(`${getApiBaseUrl()}/monetization/warning-acks`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${auth.access_token}` },
          body: JSON.stringify({ hasSeenFirstBypassWarning: true }),
        });
      } catch { /* ignore */ }
    }
    embeddedBypassWaiter.current?.resolve(accepted);
    embeddedBypassWaiter.current = null;
    setEmbeddedBypassModalOpen(false);
  };

  const handleSettingsSaved = () => {
    void checkCurrentUserCredentials();
    window.refreshAllUserStatuses?.();
    addNotification('success', 'Settings Saved', 'PiShock settings updated.');
  };

  return {
    intensity, setIntensity,
    duration, setDuration,
    vibrateIntensity, setVibrateIntensity,
    vibrateDuration, setVibrateDuration,
    isExecuting,
    showSettings, setShowSettings,
    embeddedBypassModalOpen, resolveBypassModal,
    bypassModeEnabled, setBypassModeEnabled,
    canArmBypassMode, bypassWillSpendConsumable,
    sliderMaxIntensity, sliderMaxDuration,
    selectedUserStatus, selectedUserCommandsPaused,
    capabilities, controlsDisabled, targetConnected,
    currentUserPiShockConnected: currentUserPiShockConnected || isConnected,
    getDisplayName, cycleShockDuration,
    executeCommand, handleSettingsSaved,
  };
}

export type PiShockControl = ReturnType<typeof usePiShockControl>;
