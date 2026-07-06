import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Routes, Route, useNavigate, useLocation } from 'react-router-dom';
import { DiscordSDK, Events, Common } from '@discord/embedded-app-sdk';
import { AlertTriangle } from 'lucide-react';
import { PiShockApp } from './pishock/PiShockApp';
import { SafetyWarning } from './components/SafetyWarning';
import { NotificationSystem } from './components/NotificationSystem';
import { PrivacyPolicy } from './components/PrivacyPolicy';
import { TermsOfService } from './components/TermsOfService';
import { ControllerPlusShopModal } from './components/ControllerPlusShopModal';
import { AdminDevMenu } from './components/AdminDevMenu';
import { useNotifications } from './hooks/useNotifications';
import { useInstanceData } from './hooks/useInstanceData';
import { useParticipants } from './hooks/useParticipants';
import { useUserStatusCache } from './hooks/useUserStatusCache';
import {
  readDiscordTokenCache,
  writeDiscordTokenCache,
  clearDiscordTokenCache,
  isCacheEntryUsable,
  authResultToCacheEntry,
} from './lib/discordTokenCache';
import { fetchWithDiscordAuthRetry } from './lib/discordAuthFetch';

// Global function to refresh user statuses
declare global {
  interface Window {
    refreshAllUserStatuses?: () => void;
  }
}

// Check if we're running in Discord's embedded environment
const urlParams = new URLSearchParams(window.location.search);
const isEmbedded = urlParams.has('frame_id');

// Check if we're in actual development environment
const isDevelopment = import.meta.env.DEV || 
                     window.location.hostname === 'localhost' || 
                     window.location.hostname === '127.0.0.1' ||
                     window.location.hostname.includes('bolt.new');

// If not embedded and not in development, user is visiting directly
const isDirectVisit = !isEmbedded && !isDevelopment;

const discordClientId = import.meta.env.VITE_DISCORD_CLIENT_ID;
const embeddedClientIdMissing =
  isEmbedded && (!discordClientId || discordClientId === 'YOUR_DISCORD_CLIENT_ID_HERE');

// Initialize Discord SDK with dummy parameters if not embedded
let discordSdk: DiscordSDK | null = null;

if (!embeddedClientIdMissing) {
  if (isEmbedded) {
    discordSdk = new DiscordSDK(discordClientId!, { disableConsoleLogOverride: true });
  } else {
    const dummyParams = new URLSearchParams({
      frame_id: 'dummy_frame_id',
      instance_id: 'dummy_instance_id',
      platform: 'desktop',
      sdk_version: '1.0.0',
    });

    const originalSearch = window.location.search;
    const newUrl = `${window.location.pathname}?${dummyParams.toString()}`;
    window.history.replaceState({}, '', newUrl);

    const clientId = discordClientId || 'dev_dummy_client_id';
    discordSdk = new DiscordSDK(clientId, { disableConsoleLogOverride: true });

    window.history.replaceState({}, '', `${window.location.pathname}${originalSearch}`);
  }
}

const DEV_MOCK_USER_ID = 'dev_user_123';
const DEV_MOCK_TARGET_ID = 'test_user_456';

function buildDevPiShockStatus(connected: boolean, shockerName = 'Dev Shocker') {
  return {
    isConnected: connected,
    hasDevice: connected,
    hasCredentials: connected,
    deviceCount: connected ? 1 : 0,
    piShockUserId: connected ? 'dev_pishock_user' : null,
    selectedShockerId: connected ? '1' : null,
    selectedShockerName: connected ? shockerName : null,
    allowedShockerIds: connected ? ['1'] : [],
    allowOverLimitWithConsumable: false,
    commandsPaused: false,
    usingLegacySharecodeFallback: false,
    isRelay: false,
    maxIntensity: 100,
    maxDuration: 15,
    maxIntensityOverriddenByApi: false,
    maxDurationOverriddenByApi: false,
    canShock: true,
    canVibrate: true,
    canBeep: true,
    canPause: false,
    shockerIdsHiddenNotOnDevices: 0,
    bannedExecutors: [] as string[],
    lastChecked: Date.now(),
  };
}

// Helper function to get the correct API base URL
function getApiBaseUrl(): string {
  if (isEmbedded) {
    // Use Discord's proxy for embedded environment
    return '/.proxy/api';
  } else {
    // Use direct API calls for development
    return '/api';
  }
}

/** Reject if `promise` does not settle within `ms` (clears timer when the promise wins). */
function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
  });
  return Promise.race([promise, timeoutPromise]).finally(() => {
    if (timeoutId !== undefined) clearTimeout(timeoutId);
  });
}

const DEFAULT_CLIENT_OWNER_ADMIN_IDS = '173839105615069184';

function parseClientOwnerAdminIds(): Set<string> {
  const raw = import.meta.env.VITE_OWNER_ADMIN_USER_IDS;
  const trimmed = typeof raw === 'string' ? raw.trim() : '';
  const parts = trimmed
    ? trimmed.split(/[\n,]+/).map((s) => s.trim()).filter(Boolean)
    : DEFAULT_CLIENT_OWNER_ADMIN_IDS.split(/[\n,]+/).map((s) => s.trim()).filter(Boolean);
  return new Set(parts);
}

function MainApp() {
  const clientOwnerAdminIds = useMemo(() => parseClientOwnerAdminIds(), []);
  interface EmbeddedSku {
    id: string;
    price?: {
      amount?: number;
      currency?: string;
    };
  }

  const CONTROLLER_PLUS_SKU_ID = '1387037988558606457';
  const OVERLIMIT_SKU_ID = '1418562984946569267';
  const [auth, setAuth] = useState<any>(null);
  const authRef = useRef<any>(null);
  authRef.current = auth;
  const [selectedUser, setSelectedUser] = useState<any>(null);
  const [piShockConnected, setPiShockConnected] = useState(false);
  const [safetyAccepted, setSafetyAccepted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [instanceId, setInstanceId] = useState<string>('');
  const [showActivityLog, setShowActivityLog] = useState(true);
  const [userPiShockStatus, setUserPiShockStatus] = useState<Record<string, any>>({});
  const [isInstanceValid, setIsInstanceValid] = useState(true);
  const [layoutMode, setLayoutMode] = useState<number>(Common.LayoutModeTypeObject.FOCUSED);
  const [isPipMode, setIsPipMode] = useState(false);
  const [entitlementsLoading, setEntitlementsLoading] = useState(false);
  const [hasControllerPlus, setHasControllerPlus] = useState(false);
  const [hasOverlimitConsumable, setHasOverlimitConsumable] = useState(false);
  const [overlimitConsumableCount, setOverlimitConsumableCount] = useState(0);
  const [showControllerPlusShop, setShowControllerPlusShop] = useState(false);
  const [showAdminMenu, setShowAdminMenu] = useState(false);
  const [multishockMode, setMultishockMode] = useState(false);
  const [togglingEmergencyStop, setTogglingEmergencyStop] = useState(false);
  const [warningAcksLoading, setWarningAcksLoading] = useState(false);
  const [hasSeenFirstOverlimitPurchaseWarning, setHasSeenFirstOverlimitPurchaseWarning] = useState(false);
  const [controllerPlusPriceLabel, setControllerPlusPriceLabel] = useState<string | null>(null);
  const [shockPastLimitPriceLabel, setShockPastLimitPriceLabel] = useState<string | null>(null);
  const [multishockSelectionsByExecutor, setMultishockSelectionsByExecutor] = useState<Record<string, Record<string, string[]>>>({});
  const userPiShockStatusRef = useRef<Record<string, any>>({});
  const lastStatusFetchByUserRef = useRef<Record<string, number>>({});
  const { notifications, addNotification, dismissNotification } = useNotifications();
  const navigate = useNavigate();
  
  // Client-side cache for user status
  const userStatusCache = useUserStatusCache();
  
  // Get current version from build
  const currentVersion = __BUILD_VERSION__;
  
  // Custom hooks for managing instance data and participants
  const { instanceData, updateInstanceData } = useInstanceData(instanceId);

  // Handle layout mode updates
  const handleLayoutModeUpdate = useCallback((update: { layout_mode: number }) => {
    setLayoutMode(update.layout_mode);
    setIsPipMode(update.layout_mode === Common.LayoutModeTypeObject.PIP);
  }, []);

  const performTokenRefresh = useCallback(async (): Promise<string | null> => {
    const token = authRef.current?.access_token;
    if (!token) return null;
    const clientId = import.meta.env.VITE_DISCORD_CLIENT_ID;
    try {
      const res = await fetch(`${getApiBaseUrl()}/token/refresh`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return null;
      const data = await res.json();
      if (!data.access_token) return null;
      const expiresIso =
        typeof data.expires_at === 'number'
          ? new Date(data.expires_at * 1000).toISOString()
          : new Date(Date.now() + 6 * 24 * 60 * 60 * 1000).toISOString();
      const newToken: string = data.access_token;
      setAuth((prev: any) => {
        if (!prev?.user?.id) return prev;
        writeDiscordTokenCache({
          access_token: newToken,
          expires: expiresIso,
          userId: prev.user.id,
          clientId,
        });
        return { ...prev, access_token: newToken, expires: expiresIso };
      });
      return newToken;
    } catch {
      return null;
    }
  }, []);

  const authFetch = useCallback(
    (input: RequestInfo | URL, init?: RequestInit) =>
      fetchWithDiscordAuthRetry(input, init, {
        getAccessToken: () => authRef.current?.access_token ?? null,
        refreshAccessToken: performTokenRefresh,
      }),
    [performTokenRefresh]
  );

  const { participants, updateParticipants } = useParticipants(discordSdk!, isEmbedded, authFetch);

  const persistInstanceDataPatch = useCallback(async (patch: Record<string, any>) => {
    if (!instanceId || !auth?.access_token) return;

    try {
      const response = await authFetch(`${getApiBaseUrl()}/instances/${instanceId}/data`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${auth.access_token}`,
        },
        body: JSON.stringify({
          ...patch,
          lastUpdated: new Date().toISOString(),
        }),
      });
      const rawText = await response.text();
      let result: Record<string, unknown> = {};
      try {
        result = rawText ? (JSON.parse(rawText) as Record<string, unknown>) : {};
      } catch {
        result = {};
      }
      if (!response.ok || result.success === false) {
        const detail =
          typeof result.error === 'string'
            ? result.error
            : typeof result.message === 'string'
              ? result.message
              : rawText?.slice(0, 200) || `HTTP ${response.status}`;
        addNotification('warning', 'Save Failed', `Could not persist instance data: ${detail}`);
        return;
      }
      updateInstanceData(patch);
    } catch (error) {
      addNotification('warning', 'Save Failed', 'Could not persist instance data');
    }
  }, [instanceId, auth?.access_token, updateInstanceData, addNotification, authFetch]);

  const refreshEntitlements = useCallback(async () => {
    if (!auth?.access_token) return;

    setEntitlementsLoading(true);
    try {
      const response = await authFetch(`${getApiBaseUrl()}/monetization/entitlements`, {
        headers: {
          'Authorization': `Bearer ${auth.access_token}`,
        },
      });
      if (!response.ok) {
        throw new Error('Failed to load entitlements');
      }
      const data = await response.json();
      setHasControllerPlus(Boolean(data.hasControllerPlus));
      setHasOverlimitConsumable(Boolean(data.hasOverlimitConsumable));
      const count = Array.isArray(data.entitlements)
        ? data.entitlements.filter((entitlement: any) =>
            entitlement?.sku_id === OVERLIMIT_SKU_ID &&
            entitlement?.deleted !== true &&
            entitlement?.consumed !== true
          ).length
        : 0;
      setOverlimitConsumableCount(count);
    } catch (error) {
      addNotification('warning', 'Entitlements', 'Unable to refresh premium status');
    } finally {
      setEntitlementsLoading(false);
    }
  }, [auth?.access_token, addNotification, authFetch]);

  const formatSkuPrice = useCallback((amount?: number, currency?: string): string | null => {
    if (typeof amount !== 'number' || amount < 0 || !currency) {
      return null;
    }

    try {
      return new Intl.NumberFormat(undefined, {
        style: 'currency',
        currency: currency.toUpperCase(),
      }).format(amount / 100);
    } catch (error) {
      return `${(amount / 100).toFixed(2)} ${currency.toUpperCase()}`;
    }
  }, []);

  const refreshSkus = useCallback(async () => {
    if (!isEmbedded || !discordSdk) {
      setControllerPlusPriceLabel(null);
      setShockPastLimitPriceLabel(null);
      return;
    }

    try {
      const commands = discordSdk.commands as any;
      if (typeof commands.getSkus !== 'function') {
        setControllerPlusPriceLabel(null);
        setShockPastLimitPriceLabel(null);
        return;
      }

      const response = await commands.getSkus();
      const skus: EmbeddedSku[] = Array.isArray(response?.skus) ? response.skus : [];
      const controllerPlusSku = skus.find((sku) => sku.id === CONTROLLER_PLUS_SKU_ID);
      const overlimitSku = skus.find((sku) => sku.id === OVERLIMIT_SKU_ID);

      setControllerPlusPriceLabel(
        formatSkuPrice(controllerPlusSku?.price?.amount, controllerPlusSku?.price?.currency)
      );
      setShockPastLimitPriceLabel(
        formatSkuPrice(overlimitSku?.price?.amount, overlimitSku?.price?.currency)
      );
    } catch (error) {
      setControllerPlusPriceLabel(null);
      setShockPastLimitPriceLabel(null);
    }
  }, [formatSkuPrice]);

  const purchaseSku = useCallback(async (skuId: string) => {
    if (!isEmbedded || !discordSdk) {
      window.open('https://discord.com/channels/@me', '_blank');
      return;
    }

    try {
      const commands = discordSdk.commands as any;
      if (typeof commands.startPurchase === 'function') {
        await commands.startPurchase({ sku_id: skuId });
      } else if (typeof commands.openExternalLink === 'function') {
        await commands.openExternalLink({ url: 'https://discord.com/channels/@me' });
      }
      await refreshEntitlements();
    } catch (error) {
      addNotification('warning', 'Purchase', 'Unable to open Discord purchase flow');
    }
  }, [refreshEntitlements, addNotification, auth?.access_token]);

  const purchaseControllerPlus = useCallback(async () => {
    await purchaseSku(CONTROLLER_PLUS_SKU_ID);
  }, [purchaseSku]);

  const manageControllerPlusSubscription = useCallback(async () => {
    const billingUrl = 'https://discord.com/settings/billing';

    if (!isEmbedded || !discordSdk) {
      window.open(billingUrl, '_blank');
      return;
    }

    try {
      const commands = discordSdk.commands as any;
      if (typeof commands.openExternalLink === 'function') {
        await commands.openExternalLink({ url: billingUrl });
      } else {
        window.open(billingUrl, '_blank');
      }
    } catch (error) {
      addNotification('warning', 'Subscription', 'Open Discord billing settings to manage or cancel your subscription.');
    }
  }, [addNotification]);

  const purchaseOverlimitConsumable = useCallback(async () => {
    if (!hasSeenFirstOverlimitPurchaseWarning) {
      addNotification('warning', 'Agreement Required', 'Please acknowledge and agree to the consumable conditions before buying.');
      return;
    }
    await purchaseSku(OVERLIMIT_SKU_ID);
  }, [purchaseSku, hasSeenFirstOverlimitPurchaseWarning, addNotification]);

  const refreshWarningAcks = useCallback(async () => {
    if (!auth?.access_token) return;
    setWarningAcksLoading(true);
    try {
      const response = await authFetch(`${getApiBaseUrl()}/monetization/warning-acks`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${auth.access_token}`,
        },
      });
      if (!response.ok) {
        throw new Error('Failed to load warning acknowledgements');
      }
      const result = await response.json();
      setHasSeenFirstOverlimitPurchaseWarning(Boolean(result.hasSeenFirstOverlimitPurchaseWarning));
    } catch (error) {
      addNotification('warning', 'Warnings', 'Unable to verify consumable warning acknowledgement status.');
    } finally {
      setWarningAcksLoading(false);
    }
  }, [auth?.access_token, addNotification, authFetch]);

  const acknowledgeOverlimitPurchaseWarning = useCallback(async (): Promise<boolean> => {
    if (!auth?.access_token) return false;
    try {
      const response = await authFetch(`${getApiBaseUrl()}/monetization/warning-acks`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${auth.access_token}`,
        },
        body: JSON.stringify({ hasSeenFirstOverlimitPurchaseWarning: true }),
      });
      if (!response.ok) {
        throw new Error('Failed to persist acknowledgement');
      }
      setHasSeenFirstOverlimitPurchaseWarning(true);
      return true;
    } catch (error) {
      addNotification('error', 'Agreement', 'Unable to persist your agreement. Please try again.');
      return false;
    }
  }, [auth?.access_token, addNotification, authFetch]);

  const refreshShopData = useCallback(() => {
    refreshEntitlements();
    refreshWarningAcks();
    refreshSkus();
  }, [refreshEntitlements, refreshWarningAcks, refreshSkus]);

  const openShop = useCallback(() => {
    setShowControllerPlusShop(true);
    refreshShopData();
  }, [refreshShopData]);

  const handleMultishockToggle = useCallback((enabled: boolean) => {
    if (enabled && !hasControllerPlus) {
      openShop();
      return;
    }
    setMultishockMode(enabled);
  }, [hasControllerPlus, openShop]);

  const ownCommandsPaused = Boolean(auth?.user?.id && userPiShockStatus[auth.user.id]?.commandsPaused);
  const isAdminUser = Boolean(auth?.user?.id && clientOwnerAdminIds.has(auth.user.id));

  useEffect(() => {
    if (!isAdminUser && showAdminMenu) {
      setShowAdminMenu(false);
    }
  }, [isAdminUser, showAdminMenu]);

  const toggleEmergencyStop = useCallback(async () => {
    if (!auth?.user?.id || !auth?.access_token || togglingEmergencyStop) return;
    const nextPausedValue = !ownCommandsPaused;
    setTogglingEmergencyStop(true);
    try {
      const response = await authFetch(`${getApiBaseUrl()}/users/${auth.user.id}/pishock-settings`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${auth.access_token}`,
        },
        body: JSON.stringify({
          commandsPaused: nextPausedValue,
        }),
      });
      const result = await response.json();
      if (!response.ok || !result.success) {
        throw new Error(result.error || 'Unable to update emergency stop');
      }

      setUserPiShockStatus((previous) => ({
        ...previous,
        [auth.user.id]: {
          ...(previous[auth.user.id] || {}),
          commandsPaused: nextPausedValue,
          lastChecked: Date.now(),
        },
      }));
      addNotification(
        'success',
        nextPausedValue ? 'Emergency Stop Enabled' : 'Emergency Stop Disabled',
        nextPausedValue
          ? 'Incoming commands to your PiShock are now blocked.'
          : 'Incoming commands to your PiShock are now allowed.'
      );
      if (window.refreshAllUserStatuses) {
        window.refreshAllUserStatuses();
      }
    } catch (error) {
      addNotification(
        'error',
        'Emergency Stop',
        error instanceof Error ? error.message : 'Failed to update emergency stop'
      );
    } finally {
      setTogglingEmergencyStop(false);
    }
  }, [auth?.user?.id, auth?.access_token, togglingEmergencyStop, ownCommandsPaused, addNotification, authFetch]);

  const updateMultishockSelection = useCallback(async (targetUserId: string, shockerIds: string[]) => {
    if (!auth?.user?.id) return;
    const executorId = auth.user.id;
    let nextMultishock: Record<string, Record<string, string[]>> = {};
    setMultishockSelectionsByExecutor((previous) => {
      const executorSelections = previous[executorId] || {};
      const nextTargetSelection = shockerIds.length > 0
        ? { ...executorSelections, [targetUserId]: shockerIds }
        : Object.fromEntries(Object.entries(executorSelections).filter(([id]) => id !== targetUserId));
      nextMultishock = {
        ...previous,
        [executorId]: nextTargetSelection,
      };
      return nextMultishock;
    });
    await persistInstanceDataPatch({ multishockSelectionsByExecutor: nextMultishock });
  }, [auth?.user?.id, persistInstanceDataPatch]);

  useEffect(() => {
    if (!instanceId || !auth?.access_token || participants.length === 0) return;
    persistInstanceDataPatch({
      activityParticipantIds: participants.map((p) => p.id),
    });
  }, [participants, instanceId, auth?.access_token, persistInstanceDataPatch]);

  // Graceful shutdown handler
  const handleGracefulShutdown = useCallback(() => {
    if (isEmbedded && discordSdk) {
      try {
        discordSdk.unsubscribe(Events.ACTIVITY_INSTANCE_PARTICIPANTS_UPDATE, updateParticipants as any);
        (discordSdk as any).unsubscribeFromLayoutModeUpdatesCompat?.(handleLayoutModeUpdate);
      } catch (error) {
        // Silently handle cleanup errors
      }
    }
  }, [isEmbedded, updateParticipants, handleLayoutModeUpdate]);

  // Function to check PiShock status for all participants
  const checkAllUserPiShockStatus = useCallback(async (forceRefresh = false) => {
    if (!isEmbedded && !isDevelopment) return;
    
    if (!instanceId || !auth || participants.length === 0) return;

    try {
      const statusPromises = participants.map(async (participant) => {
        try {
          const nowMs = Date.now();

          if (!forceRefresh) {
            const cachedStatus = userStatusCache.getCachedStatus(participant.id);
            if (cachedStatus) {
              return { userId: participant.id, status: cachedStatus };
            }
          }

          if (!forceRefresh) {
            const lastFetchMs = lastStatusFetchByUserRef.current[participant.id] || 0;
            const minRefetchIntervalMs = 30_000;
            if (nowMs - lastFetchMs < minRefetchIntervalMs) {
              const existingStatus = userPiShockStatusRef.current[participant.id];
              if (existingStatus) {
                return { userId: participant.id, status: existingStatus };
              }
            }
          }

          const requestJitterMs = forceRefresh ? 0 : Math.floor(Math.random() * 1_000);
          if (requestJitterMs > 0) {
            await new Promise((resolve) => setTimeout(resolve, requestJitterMs));
          }
          lastStatusFetchByUserRef.current[participant.id] = Date.now();
          
          const response = await authFetch(`${getApiBaseUrl()}/users/${participant.id}/pishock-status`, {
            headers: {
              'Authorization': `Bearer ${auth.access_token}`,
            },
          });
          
          if (response.ok) {
            const status = await response.json();
            
            const processedStatus = {
              userId: participant.id, 
              status: {
                isConnected: status.isConnected,
                hasDevice: status.hasDevice,
                hasCredentials: status.hasCredentials,
                deviceCount: status.deviceCount || 0,
                piShockUserId: status.piShockUserId,
                selectedShockerId: status.selectedShockerId || null,
                selectedShockerName: status.selectedShockerName || null,
                allowedShockerIds: Array.isArray(status.allowedShockerIds) ? status.allowedShockerIds : [],
                allowOverLimitWithConsumable: Boolean(status.allowOverLimitWithConsumable),
                commandsPaused: Boolean(status.commandsPaused),
                usingLegacySharecodeFallback: Boolean(status.usingLegacySharecodeFallback),
                isRelay: status.isRelay || false, // Track if using relay account
                maxIntensity: status.maxIntensity || 100,
                maxDuration: status.maxDuration || 15,
                maxIntensityOverriddenByApi: Boolean(status.maxIntensityOverriddenByApi),
                maxDurationOverriddenByApi: Boolean(status.maxDurationOverriddenByApi),
                canShock: status.canShock !== false,
                canVibrate: status.canVibrate !== false,
                canBeep: status.canBeep !== false,
                canPause: Boolean(status.canPause),
                shockerIdsHiddenNotOnDevices:
                  typeof status.shockerIdsHiddenNotOnDevices === 'number' ? status.shockerIdsHiddenNotOnDevices : 0,
                bannedExecutors: [],
                lastChecked: Date.now(),
              }
            };
            
            userStatusCache.setCachedStatus(participant.id, processedStatus.status);
            
            return processedStatus;
          } else {
            // Silently handle failed status checks
          }
        } catch (error) {
          // Silently handle individual user errors
        }
        return { 
          userId: participant.id, 
          status: {
            isConnected: false,
            hasDevice: false,
            hasCredentials: false,
            deviceCount: 0,
            piShockUserId: null,
            allowedShockerIds: [],
            allowOverLimitWithConsumable: false,
            commandsPaused: false,
            isRelay: false,
            maxIntensity: 100,
            maxDuration: 15,
            maxIntensityOverriddenByApi: false,
            maxDurationOverriddenByApi: false,
            canShock: true,
            canVibrate: true,
            canBeep: true,
            canPause: false,
            bannedExecutors: [],
            lastChecked: Date.now(),
          }
        };
      });

      const statuses = await Promise.all(statusPromises);
      const statusMap: Record<string, any> = {};
      statuses.forEach(({ userId, status }) => {
        statusMap[userId] = status;
      });
      
      
      setUserPiShockStatus(prevStatus => {
        const hasChanges = Object.keys(statusMap).some(userId => 
          !prevStatus[userId] || 
          prevStatus[userId].isConnected !== statusMap[userId].isConnected ||
          prevStatus[userId].hasDevice !== statusMap[userId].hasDevice ||
          prevStatus[userId].hasCredentials !== statusMap[userId].hasCredentials ||
          prevStatus[userId].maxIntensity !== statusMap[userId].maxIntensity ||
          prevStatus[userId].maxDuration !== statusMap[userId].maxDuration
        );
        
        return statusMap;
      });
    } catch (error) {
      // Silently handle status check errors
    }
  }, [instanceId, auth, participants, userStatusCache, authFetch]);

  // Load ban lists for current user (who can be banned from shocking them)
  const loadCurrentUserBanList = useCallback(async () => {
    if (!isEmbedded && !isDevelopment) return;
    
    if (!auth?.user?.id) return;

    try {
      const response = await authFetch(`${getApiBaseUrl()}/users/${auth.user.id}/pishock-settings`, {
        headers: {
          'Authorization': `Bearer ${auth.access_token}`,
        },
      });

      if (response.ok) {
        const result = await response.json();
        if (result.bannedExecutors) {
          setUserPiShockStatus(prevStatus => ({
            ...prevStatus,
            [auth.user.id]: {
              ...prevStatus[auth.user.id],
              bannedExecutors: result.bannedExecutors
            }
          }));
        }
      }
    } catch (error) {
      // Silently handle ban list errors
    }
  }, [auth, authFetch]);

  const refreshParticipants = useCallback(async () => {
    if (!isEmbedded || !discordSdk || !auth) {
      return;
    }

    try {
      const participantsData = await discordSdk.commands.getInstanceConnectedParticipants();
      updateParticipants(participantsData.participants);
      
      setTimeout(() => {
        checkAllUserPiShockStatus();
      }, 1000);
      
      addNotification('success', 'Participants Refreshed', `Found ${participantsData.participants.length} participant${participantsData.participants.length !== 1 ? 's' : ''}`);
    } catch (error) {
      addNotification('error', 'Refresh Failed', 'Failed to refresh participant list');
    }
  }, [auth, updateParticipants, checkAllUserPiShockStatus, addNotification]);

  // Manual refresh for user statuses (event-driven approach)
  const refreshUserStatuses = useCallback(async () => {
    if (!instanceId || !auth || participants.length === 0) {
      addNotification('warning', 'Cannot Refresh', 'No participants to refresh');
      return;
    }

    addNotification('info', 'Refreshing...', 'Checking PiShock status for all participants');
    userStatusCache.clearCache();
    await checkAllUserPiShockStatus(true);
    addNotification('success', 'Status Refreshed', 'All participant statuses have been updated');
  }, [instanceId, auth, participants, checkAllUserPiShockStatus, addNotification, userStatusCache]);

  // Make the refresh function available globally
  useEffect(() => {
    window.refreshAllUserStatuses = checkAllUserPiShockStatus;
  }, [checkAllUserPiShockStatus]);
  
  useEffect(() => {
    if (auth?.user?.id) {
      loadCurrentUserBanList();
    }
  }, [auth?.user?.id, loadCurrentUserBanList]);

  useEffect(() => {
    const activeIds = new Set(participants.map((participant) => participant.id));
    lastStatusFetchByUserRef.current = Object.fromEntries(
      Object.entries(lastStatusFetchByUserRef.current).filter(([userId]) => activeIds.has(userId))
    );
  }, [participants]);

  useEffect(() => {
    if (auth?.access_token) {
      refreshEntitlements();
      refreshWarningAcks();
      refreshSkus();
    }
  }, [auth?.access_token, refreshEntitlements, refreshWarningAcks, refreshSkus]);

  useEffect(() => {
    if (!isEmbedded || !auth?.access_token || !auth?.expires) return;

    const exp = new Date(auth.expires).getTime();
    if (Number.isNaN(exp)) return;

    const skewMs = 10 * 60 * 1000;
    const msUntilRefresh = exp - Date.now() - skewMs;
    const delay = Math.max(5_000, msUntilRefresh);

    const timer = window.setTimeout(() => {
      void performTokenRefresh();
    }, delay);

    return () => window.clearTimeout(timer);
  }, [isEmbedded, auth?.access_token, auth?.expires, performTokenRefresh]);
  
  useEffect(() => {
    userPiShockStatusRef.current = userPiShockStatus;
    (window as any).userPiShockStatus = userPiShockStatus;
  }, [userPiShockStatus]);

  // Expose globally for external triggers (e.g., after settings save)
  useEffect(() => {
    (window as any).refreshAllUserStatuses = refreshUserStatuses;
    return () => {
      delete (window as any).refreshAllUserStatuses;
    };
  }, [refreshUserStatuses]);

  useEffect(() => {
    // Only initialize Discord after safety has been accepted
    if (!safetyAccepted) {
      return;
    }

    const initializeDiscord = async () => {
      const sdk = discordSdk;
      if (!sdk) return;

      try {
        setLoading(true); // Start loading only after safety accepted
        if (isEmbedded) {
          await withTimeout(sdk.ready(), 60_000, 'discordSdk.ready');
          
          try {
            await sdk.commands.setOrientationLockState({
              lock_state: Common.OrientationLockStateTypeObject.UNLOCKED,
              picture_in_picture_lock_state: Common.OrientationLockStateTypeObject.LANDSCAPE,
              grid_lock_state: Common.OrientationLockStateTypeObject.LANDSCAPE,
            });
          } catch (orientationError) {
            // Silently handle orientation errors
          }

          try {
            (sdk as any).subscribeToLayoutModeUpdatesCompat?.(handleLayoutModeUpdate);
          } catch (layoutError) {
            // Silently handle layout subscription errors
          }

          const currentInstanceId = sdk.instanceId;
          setInstanceId(currentInstanceId);

          if (!isDevelopment) {
            const verifyResponse = await withTimeout(
              fetch(
                `${getApiBaseUrl()}/verify-instance?application_id=${import.meta.env.VITE_DISCORD_CLIENT_ID}&instance_id=${currentInstanceId}`
              ),
              25_000,
              'verify-instance'
            );

            if (!verifyResponse.ok) {
              setIsInstanceValid(false);
              addNotification('error', 'Invalid Session', 'This Discord Activity session is not valid or has expired.');
              return;
            }

            const verifyData = await verifyResponse.json();
            if (!verifyData.valid) {
              setIsInstanceValid(false);
              addNotification('error', 'Invalid Session', verifyData.error || 'This Discord Activity session is not valid.');
              return;
            }
          }

          const discordClientId = import.meta.env.VITE_DISCORD_CLIENT_ID;

          // Do not await getInstanceConnectedParticipants here: that RPC can hang and leaves the UI
          // stuck on "Connecting to Discord..." forever.
          const completeEmbeddedConnection = (authResult: any, showSuccessToast: boolean) => {
            setAuth(authResult);
            writeDiscordTokenCache(authResultToCacheEntry(discordClientId, authResult));

            sdk.subscribe(
              Events.ACTIVITY_INSTANCE_PARTICIPANTS_UPDATE,
              (data: any) => {
                updateParticipants(data.participants);
                (window as any).discordParticipants = data.participants;
              }
            );

            void (async () => {
              try {
                const initialParticipants = await withTimeout(
                  sdk.commands.getInstanceConnectedParticipants(),
                  15_000,
                  'getInstanceConnectedParticipants'
                );
                updateParticipants(initialParticipants.participants);
                (window as any).discordParticipants = initialParticipants.participants;
              } catch (participantError) {
                console.warn('Initial participants load failed:', participantError);
                updateParticipants([]);
                addNotification(
                  'warning',
                  'Participant list',
                  'Could not load activity participants yet. Use refresh in the menu if the list stays empty.'
                );
              }
            })();

            if (showSuccessToast) {
              addNotification('success', 'Connected', 'Successfully connected to Discord');
            }
          };

          let usedFastPath = false;
          const cached = readDiscordTokenCache(discordClientId);
          if (cached && isCacheEntryUsable(cached)) {
            try {
              const authResult = await sdk.commands.authenticate({
                access_token: cached.access_token,
              });
              completeEmbeddedConnection(authResult, false);
              usedFastPath = true;
            } catch {
              clearDiscordTokenCache(discordClientId);
            }
          }

          if (!usedFastPath) {
            const { code } = await withTimeout(
              sdk.commands.authorize({
                client_id: discordClientId,
                response_type: 'code',
                state: '',
                prompt: 'none',
                scope: [
                  'identify',
                  'guilds',
                  'guilds.members.read',
                  'rpc.activities.write',
                ],
              }),
              120_000,
              'discordSdk.authorize'
            );

            const response = await withTimeout(
              fetch(`${getApiBaseUrl()}/auth/discord`, {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                  code,
                  instanceId: currentInstanceId,
                }),
              }),
              25_000,
              'auth/discord'
            );

            const authPayload = await response.json();
            if (!response.ok || !authPayload.access_token) {
              addNotification(
                'error',
                'Connection Failed',
                authPayload.error || 'Failed to complete Discord sign-in.'
              );
              return;
            }

            const authResult = await sdk.commands.authenticate({
              access_token: authPayload.access_token,
            });

            completeEmbeddedConnection(authResult, true);
          }
        } else {
          const mockInstanceId = 'dev_instance_123';
          setInstanceId(mockInstanceId);

          const mockAuth = {
            access_token: `dev_mock_token_${DEV_MOCK_USER_ID}`,
            expires: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
            user: {
              id: DEV_MOCK_USER_ID,
              username: 'DevUser',
              discriminator: '0001',
              avatar: null,
              global_name: 'Development User',
            },
          };

          const mockParticipants = [
            {
              id: DEV_MOCK_USER_ID,
              username: 'DevUser',
              discriminator: '0001',
              avatar: null,
              global_name: 'Development User',
            },
            {
              id: DEV_MOCK_TARGET_ID,
              username: 'TestUser',
              discriminator: '0002',
              avatar: null,
              global_name: 'Test User',
            },
          ];

          const seededStatuses = {
            [DEV_MOCK_USER_ID]: buildDevPiShockStatus(true, 'My Shocker'),
            [DEV_MOCK_TARGET_ID]: buildDevPiShockStatus(true, 'Dev Shocker'),
          };

          setAuth(mockAuth);
          updateParticipants(mockParticipants);
          setUserPiShockStatus(seededStatuses);
          userPiShockStatusRef.current = seededStatuses;
          (window as any).userPiShockStatus = seededStatuses;
          setSelectedUser(mockParticipants[1]);

          (window as any).discordParticipants = mockParticipants;

          addNotification('info', 'Development Mode', 'Running in development mode with mock data');
        }
      } catch (error) {
        console.error('Discord initialization error:', error); // Add logging for debugging
        if (!isEmbedded && error instanceof Error && error.message.includes('Cannot convert')) {
          return;
        }
        const message = error instanceof Error ? error.message : 'Unknown error';
        addNotification(
          'error',
          'Connection Failed',
          message.includes('timed out')
            ? `${message}. Check your network or try closing and reopening the activity.`
            : 'Failed to connect to Discord. Please try again.'
        );
      } finally {
        setLoading(false);
      }
    };

    initializeDiscord();

    return () => {
      if (isEmbedded && discordSdk) {
        discordSdk.unsubscribe(Events.ACTIVITY_INSTANCE_PARTICIPANTS_UPDATE, updateParticipants as any);
        if (typeof (discordSdk as any).unsubscribeFromLayoutModeUpdatesCompat === 'function') {
          (discordSdk as any).unsubscribeFromLayoutModeUpdatesCompat(handleLayoutModeUpdate);
        }
      }
    };
  }, [safetyAccepted, addNotification, updateParticipants, handleLayoutModeUpdate]);

  useEffect(() => {
    if (instanceId && auth) {
      authFetch(`${getApiBaseUrl()}/instances/${instanceId}/data`, {
        headers: {
          'Authorization': `Bearer ${auth.access_token}`,
        },
      })
        .then(async response => {
          if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
          }
          
          const contentType = response.headers.get('content-type');
          if (!contentType || !contentType.includes('application/json')) {
            await response.text();
            if (!isEmbedded) {
              return {};
            }
            throw new Error('Response is not JSON');
          }
          
          return response.json();
        })
        .then(data => {
          updateInstanceData(data);
          setMultishockSelectionsByExecutor(
            data?.multishockSelectionsByExecutor && typeof data.multishockSelectionsByExecutor === 'object'
              ? data.multishockSelectionsByExecutor
              : {}
          );
          if (data.selectedUserId) {
            const selectedParticipant = participants.find(p => p.id === data.selectedUserId);
            if (selectedParticipant) {
              setSelectedUser(selectedParticipant);
            }
          }
        })
        .catch(error => {
          if (!isEmbedded && (error.message.includes('Unexpected token') || error.message.includes('not valid JSON'))) {
            return;
          }
          if (isEmbedded) {
            addNotification('warning', 'Data Load Failed', 'Could not load instance data');
          }
        });
    }
  }, [instanceId, auth, participants, updateInstanceData, addNotification, authFetch]);

  // Event-driven status check: Run when participants change (join/leave)
  useEffect(() => {
    if (instanceId && auth && participants.length > 0) {
      checkAllUserPiShockStatus();
    }
  }, [instanceId, auth, participants, checkAllUserPiShockStatus]);

  // Hybrid approach: Slow background polling as safety net for edge cases
  // Checks every 10 minutes instead of 90 seconds (93% reduction in API calls)
  useEffect(() => {
    if (!instanceId || !auth || participants.length === 0) return;

    // Cleanup expired cache entries and refresh statuses every 10 minutes
    const interval = setInterval(() => {
      userStatusCache.cleanupExpired();
      checkAllUserPiShockStatus();
    }, 600000); // 10 minutes (600,000ms) instead of 90 seconds

    return () => clearInterval(interval);
  }, [instanceId, auth, participants, userStatusCache, checkAllUserPiShockStatus]);

  // Hourly instance status check - read-only, no writes
  // If instance status expires (6hr TTL), mark instance as invalid
  useEffect(() => {
    if (!instanceId || !auth || isDevelopment) return;

    const checkInstanceStatus = async () => {
      try {
        const response = await authFetch(`${getApiBaseUrl()}/instances/${instanceId}/status`, {
          headers: {
            'Authorization': `Bearer ${auth.access_token}`,
          },
        });

        if (!response.ok) {
          // Instance status has expired (404) or is invalid
          setIsInstanceValid(false);
          addNotification('error', 'Session Expired', 'Your Discord Activity session has expired after 6 hours of inactivity.');
        }
      } catch (error) {
        // Network error or instance expired
        console.warn('Instance status check failed:', error);
      }
    };

    // Check immediately on mount
    checkInstanceStatus();

    // Then check every hour (3,600,000 ms)
    const interval = setInterval(checkInstanceStatus, 3600000);

    return () => clearInterval(interval);
  }, [instanceId, auth, addNotification, authFetch]);

  useEffect(() => {
    if (selectedUser) {
      persistInstanceDataPatch({ selectedUserId: selectedUser.id });
    }
  }, [selectedUser, persistInstanceDataPatch]);

  // Show Discord-only message for direct visits
  if (isDirectVisit) {
    return (
      <div className="boot-screen p-4">
        <div className="max-w-2xl w-full text-center">
          <div className="mb-8">
            <div className="mx-auto w-20 h-20 bg-blue-500/20 rounded-full flex items-center justify-center mb-6">
              <img 
                src="/kVApvT6y_400x400 copy.jpg" 
                alt="PiShock Controller Logo" 
                className="w-12 h-12 object-contain"
              />
            </div>
            <h1 className="text-4xl font-bold mb-4">PiShock Controller</h1>
            <p className="text-xl text-blue-200 mb-8">Discord Activity Application</p>
          </div>

          <div className="ps-panel-shell rounded-lg p-8 mb-8">
            <div className="flex items-center justify-center mb-6">
              <div className="bg-blue-500/20 rounded-full p-4">
                <svg className="w-12 h-12 text-blue-400" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z"/>
                </svg>
              </div>
            </div>
            
            <h2 className="text-2xl font-bold mb-4 text-white">Discord Activity Only</h2>
            <p className="text-gray-300 mb-6 leading-relaxed">
              PiShock Controller is a <strong>Discord Activity</strong> that only works inside Discord. 
              You cannot use this application directly from a web browser.
            </p>
            
            <div className="ps-panel-shell rounded-md p-4 mb-6">
              <h3 className="text-lg font-semibold text-blue-300 mb-2">How to Use:</h3>
              <ol className="text-left text-sm text-blue-200 space-y-2">
                <li>1. Join a Discord voice channel or start a DM</li>
                <li>2. Click the Activities button (rocket ship icon)</li>
                <li>3. Find and launch "PiShock Controller"</li>
                <li>4. Configure your PiShock credentials safely</li>
              </ol>
            </div>
          </div>

          <div className="space-y-4">
            <a
              href="https://discord.com/oauth2/authorize?client_id=1386335035522809937"
              target="_blank"
              rel="noopener noreferrer"
              className="ps-btn-compact ps-btn-compact-primary inline-flex items-center justify-center space-x-3 w-full py-4 px-6 rounded-md font-semibold text-lg transition-all"
            >
              <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
                <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z"/>
              </svg>
              <span>Open Discord & Add to Server</span>
            </a>
            
            <p className="text-sm ps-muted-text">
              Don't have Discord? <a href="https://discord.com/download" target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:text-blue-300 underline">Download it here</a>
            </p>
          </div>

          <div className="mt-12 pt-8 border-t border-cyan-900/30">
            <div className="rounded-lg p-4 border border-red-500/40 bg-red-950/30">
              <div className="flex items-center justify-center space-x-2 mb-2">
                <svg className="w-5 h-5 text-red-400" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                </svg>
                <span className="text-red-300 text-sm font-semibold">Safety Notice</span>
              </div>
              <p className="text-red-200 text-xs">
                This application controls electrical shock devices. Only use with explicit consent, 
                proper safety measures, and in compliance with all applicable laws.
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="boot-screen">
        <div className="text-center">
          <div className="ps-loading-ring mx-auto mb-4" />
          <p className="text-grey-3 text-caption uppercase tracking-widest">Connecting to Discord...</p>
          {instanceId && (
            <p className="text-secondary text-caption mt-2">Instance: {instanceId}</p>
          )}
        </div>
      </div>
    );
  }

  if (!safetyAccepted) {
    return <SafetyWarning onAccept={() => setSafetyAccepted(true)} />;
  }

  // Show invalid session message (skipped in development)
  if (!isInstanceValid && !isDevelopment) {
    return (
      <div className="boot-screen">
        <div className="boot-panel text-center">
          <div className="w-16 h-16 mx-auto mb-6 flex items-center justify-center border border-color-secondary rounded">
            <AlertTriangle className="h-8 w-8 text-negative" />
          </div>
          <h1 className="text-h4 text-grey-3 mb-4">Invalid Session</h1>
          <p className="text-grey-3 mb-6 text-caption">
            This Discord Activity session is not valid or has expired. Sessions have a maximum duration of 6 hours.
          </p>
          <button type="button" onClick={() => window.close()} className="boot-btn boot-btn-warn w-full py-3">
            Close Session
          </button>
        </div>
      </div>
    );
  }

  const currentUserMultishockSelections = auth?.user?.id
    ? (multishockSelectionsByExecutor[auth.user.id] || {})
    : {};

  const pishockAppProps = {
    selectedUser,
    onSelectUser: setSelectedUser,
    participants,
    userPiShockStatus,
    onConnectionChange: setPiShockConnected,
    isConnected: piShockConnected,
    addNotification,
    instanceId,
    auth,
    currentUser: auth?.user,
    discordSdk: discordSdk!,
    isEmbedded,
    multishockMode,
    onMultishockModeChange: handleMultishockToggle,
    hasControllerPlus,
    hasOverlimitConsumable,
    overlimitConsumableCount,
    onOpenShop: openShop,
    onRefreshEntitlements: refreshEntitlements,
    multishockSelections: currentUserMultishockSelections,
    onUpdateMultishockSelection: updateMultishockSelection,
    authFetch,
    showActivityLog,
    onToggleActivityLog: () => setShowActivityLog((v) => !v),
    isAdminUser,
    onOpenAdmin: () => setShowAdminMenu(true),
    onNavigateTerms: () => navigate('/terms'),
    onNavigatePrivacy: () => navigate('/privacy'),
    togglingEmergencyStop,
    ownCommandsPaused,
    toggleEmergencyStop,
  };

  const sharedModals = (
    <>
      <NotificationSystem notifications={notifications} onDismiss={dismissNotification} />
      <AdminDevMenu isOpen={showAdminMenu} onClose={() => setShowAdminMenu(false)} auth={auth} addNotification={addNotification} />
      <ControllerPlusShopModal
        isOpen={showControllerPlusShop}
        onClose={() => setShowControllerPlusShop(false)}
        loading={entitlementsLoading}
        warningAcksLoading={warningAcksLoading}
        hasSeenFirstOverlimitPurchaseWarning={hasSeenFirstOverlimitPurchaseWarning}
        hasControllerPlus={hasControllerPlus}
        hasOverlimitConsumable={hasOverlimitConsumable}
        overlimitConsumableCount={overlimitConsumableCount}
        onRefresh={refreshShopData}
        onAcknowledgeOverlimitPurchaseWarning={acknowledgeOverlimitPurchaseWarning}
        onPurchaseControllerPlus={purchaseControllerPlus}
        onPurchaseConsumable={purchaseOverlimitConsumable}
        onManageControllerPlusSubscription={manageControllerPlusSubscription}
        controllerPlusPriceLabel={controllerPlusPriceLabel}
        shockPastLimitPriceLabel={shockPastLimitPriceLabel}
      />
    </>
  );

  if (isPipMode) {
    return (
      <>
        {sharedModals}
        <PiShockApp {...pishockAppProps} />
      </>
    );
  }

  return (
    <>
      {sharedModals}
      <PiShockApp {...pishockAppProps} />
    </>
  );
}

function MissingDiscordClientIdScreen() {
  return (
    <div className="boot-screen">
      <div className="boot-panel text-center">
        <div className="w-16 h-16 mx-auto mb-6 flex items-center justify-center border border-color-secondary rounded">
          <AlertTriangle className="h-8 w-8 text-negative" />
        </div>
        <h1 className="text-h4 text-grey-3 mb-4">Discord Client ID Required</h1>
        <p className="text-grey-3 mb-6 text-caption">
          Set <code className="text-secondary">VITE_DISCORD_CLIENT_ID</code> in the project root{' '}
          <code className="text-secondary">.env</code> file (same value as{' '}
          <code className="text-secondary">DISCORD_CLIENT_ID</code>), then restart the dev server.
        </p>
      </div>
    </div>
  );
}

function App() {
  const navigate = useNavigate();

  const handleBackToApp = () => {
    navigate('/');
  };

  if (embeddedClientIdMissing) {
    return <MissingDiscordClientIdScreen />;
  }

  return (
    <Routes>
      <Route path="/" element={<MainApp />} />
      <Route path="/privacy" element={<PrivacyPolicy onBack={handleBackToApp} />} />
      <Route path="/terms" element={<TermsOfService onBack={handleBackToApp} />} />
      <Route path="*" element={<MainApp />} />
    </Routes>
  );
}

export default App;