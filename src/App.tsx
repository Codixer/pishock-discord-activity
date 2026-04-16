import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Routes, Route, useNavigate, useLocation } from 'react-router-dom';
import { DiscordSDK, Events, Common } from '@discord/embedded-app-sdk';
import { Zap, Shield, AlertTriangle, FileText, Crown, Bug } from 'lucide-react';
import { PiShockController } from './components/PiShockController';
import { SafetyWarning } from './components/SafetyWarning';
import { UserSelector } from './components/UserSelector';
import { ConnectionStatus } from './components/ConnectionStatus';
import { NotificationSystem } from './components/NotificationSystem';
import { ActivityLog } from './components/ActivityLog';
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

// Debug environment variables
const envCheck = {
  client_id: import.meta.env.VITE_DISCORD_CLIENT_ID,
  is_placeholder: import.meta.env.VITE_DISCORD_CLIENT_ID === 'YOUR_DISCORD_CLIENT_ID_HERE',
  dev_mode: import.meta.env.DEV,
  env_keys: Object.keys(import.meta.env).filter(key => key.startsWith('VITE_')),
};

// Initialize Discord SDK with dummy parameters if not embedded
let discordSdk: DiscordSDK;

if (isEmbedded) {
  const clientId = import.meta.env.VITE_DISCORD_CLIENT_ID;
  if (!clientId || clientId === 'YOUR_DISCORD_CLIENT_ID_HERE') {
    throw new Error('Discord Client ID is required. Please set VITE_DISCORD_CLIENT_ID in Cloudflare Pages Dashboard');
  }
  discordSdk = new DiscordSDK(clientId, {disableConsoleLogOverride: true});
} else {
  const dummyParams = new URLSearchParams({
    frame_id: 'dummy_frame_id',
    instance_id: 'dummy_instance_id',
    platform: 'desktop',
    sdk_version: '1.0.0'
  });
  
  const originalSearch = window.location.search;
  const newUrl = `${window.location.pathname}?${dummyParams.toString()}`;
  window.history.replaceState({}, '', newUrl);
  
  // For development, use a dummy client ID if not set
  const clientId = import.meta.env.VITE_DISCORD_CLIENT_ID || 'dev_dummy_client_id';
  discordSdk = new DiscordSDK(clientId, {disableConsoleLogOverride: true});
  
  window.history.replaceState({}, '', `${window.location.pathname}${originalSearch}`);
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

  const { participants, updateParticipants } = useParticipants(discordSdk, isEmbedded, authFetch);

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
        discordSdk.unsubscribe(Events.ACTIVITY_INSTANCE_PARTICIPANTS_UPDATE, updateParticipants);
        discordSdk.unsubscribeFromLayoutModeUpdatesCompat(handleLayoutModeUpdate);
      } catch (error) {
        // Silently handle cleanup errors
      }
    }
  }, [isEmbedded, updateParticipants, handleLayoutModeUpdate]);

  // Function to check PiShock status for all participants
  const checkAllUserPiShockStatus = useCallback(async () => {
    if (!isEmbedded) return;
    
    if (!instanceId || !auth || participants.length === 0) return;

    try {
      const statusPromises = participants.map(async (participant) => {
        try {
          const cachedStatus = userStatusCache.getCachedStatus(participant.id);
          if (cachedStatus) {
            return { userId: participant.id, status: cachedStatus };
          }
          
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
    if (!isEmbedded) return;
    
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
    await checkAllUserPiShockStatus();
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
      try {
        setLoading(true); // Start loading only after safety accepted
        if (isEmbedded) {
          await discordSdk.ready();
          
          try {
            await discordSdk.commands.setOrientationLockState({
              lock_state: Common.OrientationLockStateTypeObject.UNLOCKED,
              picture_in_picture_lock_state: Common.OrientationLockStateTypeObject.LANDSCAPE,
              grid_lock_state: Common.OrientationLockStateTypeObject.LANDSCAPE,
            });
          } catch (orientationError) {
            // Silently handle orientation errors
          }

          try {
            discordSdk.subscribeToLayoutModeUpdatesCompat(handleLayoutModeUpdate);
          } catch (layoutError) {
            // Silently handle layout subscription errors
          }

          const currentInstanceId = discordSdk.instanceId;
          setInstanceId(currentInstanceId);

          const verifyResponse = await fetch(`${getApiBaseUrl()}/verify-instance?application_id=${import.meta.env.VITE_DISCORD_CLIENT_ID}&instance_id=${currentInstanceId}`);
          
          if (!verifyResponse.ok) {
            setIsInstanceValid(false);
            setLoading(false);
            addNotification('error', 'Invalid Session', 'This Discord Activity session is not valid or has expired.');
            return;
          }

          const verifyData = await verifyResponse.json();
          if (!verifyData.valid) {
            setIsInstanceValid(false);
            setLoading(false);
            addNotification('error', 'Invalid Session', verifyData.error || 'This Discord Activity session is not valid.');
            return;
          }

          const discordClientId = import.meta.env.VITE_DISCORD_CLIENT_ID;

          const completeEmbeddedConnection = async (authResult: any, showSuccessToast: boolean) => {
            setAuth(authResult);
            writeDiscordTokenCache(authResultToCacheEntry(discordClientId, authResult));

            discordSdk.subscribe(
              Events.ACTIVITY_INSTANCE_PARTICIPANTS_UPDATE,
              (data: any) => {
                updateParticipants(data.participants);
                (window as any).discordParticipants = data.participants;
              }
            );

            const initialParticipants = await discordSdk.commands.getInstanceConnectedParticipants();
            updateParticipants(initialParticipants.participants);

            (window as any).discordParticipants = initialParticipants.participants;

            if (showSuccessToast) {
              addNotification('success', 'Connected', 'Successfully connected to Discord');
            }
          };

          let usedFastPath = false;
          const cached = readDiscordTokenCache(discordClientId);
          if (cached && isCacheEntryUsable(cached)) {
            try {
              const authResult = await discordSdk.commands.authenticate({
                access_token: cached.access_token,
              });
              await completeEmbeddedConnection(authResult, false);
              usedFastPath = true;
            } catch {
              clearDiscordTokenCache(discordClientId);
            }
          }

          if (!usedFastPath) {
            const { code } = await discordSdk.commands.authorize({
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
            });

            const response = await fetch(`${getApiBaseUrl()}/auth/discord`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                code,
                instanceId: currentInstanceId,
              }),
            });

            const authPayload = await response.json();
            if (!response.ok || !authPayload.access_token) {
              addNotification(
                'error',
                'Connection Failed',
                authPayload.error || 'Failed to complete Discord sign-in.'
              );
              setLoading(false);
              return;
            }

            const authResult = await discordSdk.commands.authenticate({
              access_token: authPayload.access_token,
            });

            await completeEmbeddedConnection(authResult, true);
          }
        } else {
          const mockInstanceId = 'dev_instance_123';
          setInstanceId(mockInstanceId);
          
          const mockAuth = {
            user: {
              id: 'dev_user_123',
              username: 'DevUser',
              discriminator: '0001',
              avatar: null,
              global_name: 'Development User'
            }
          };
          
          const mockParticipants = [
            {
              id: 'dev_user_123',
              username: 'DevUser',
              discriminator: '0001',
              avatar: null,
              global_name: 'Development User'
            },
            {
              id: 'test_user_456',
              username: 'TestUser',
              discriminator: '0002',
              avatar: null,
              global_name: 'Test User'
            }
          ];

          setAuth(mockAuth);
          updateParticipants(mockParticipants);
          
          (window as any).discordParticipants = mockParticipants;
          
          addNotification('info', 'Development Mode', 'Running in development mode with mock data');
        }

        setLoading(false);
      } catch (error) {
        console.error('Discord initialization error:', error); // Add logging for debugging
        if (!isEmbedded && error instanceof Error && error.message.includes('Cannot convert')) {
          setLoading(false);
          return;
        }
        addNotification('error', 'Connection Failed', 'Failed to connect to Discord. Please try again.');
        setLoading(false);
      }
    };

    initializeDiscord();

    return () => {
      if (isEmbedded && discordSdk) {
        discordSdk.unsubscribe(Events.ACTIVITY_INSTANCE_PARTICIPANTS_UPDATE, updateParticipants);
        if (typeof discordSdk.unsubscribeFromLayoutModeUpdatesCompat === 'function') {
          discordSdk.unsubscribeFromLayoutModeUpdatesCompat(handleLayoutModeUpdate);
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
    if (!instanceId || !auth) return;

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
      <div className="min-h-screen bg-gradient-to-br from-blue-900 via-indigo-900 to-purple-900 text-white flex items-center justify-center p-4">
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

          <div className="bg-black/20 backdrop-blur-sm rounded-2xl border border-white/10 p-8 mb-8">
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
            
            <div className="bg-blue-900/20 border border-blue-500/30 rounded-lg p-4 mb-6">
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
              className="inline-flex items-center justify-center space-x-3 w-full py-4 px-6 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 rounded-xl font-semibold text-lg transition-all transform hover:scale-105 shadow-lg"
            >
              <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
                <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z"/>
              </svg>
              <span>Open Discord & Add to Server</span>
            </a>
            
            <p className="text-sm text-gray-400">
              Don't have Discord? <a href="https://discord.com/download" target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:text-blue-300 underline">Download it here</a>
            </p>
          </div>

          <div className="mt-12 pt-8 border-t border-white/10">
            <div className="bg-red-900/20 border border-red-500/30 rounded-lg p-4">
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
      <div className="h-screen w-screen bg-gradient-to-br from-purple-900 via-blue-900 to-indigo-900 flex items-center justify-center overflow-hidden">
        <div className="text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-white mx-auto mb-4"></div>
          <p className="text-white text-lg">Connecting to Discord...</p>
          {instanceId && (
            <p className="text-gray-300 text-sm mt-2">Instance: {instanceId}</p>
          )}
        </div>
      </div>
    );
  }

  if (!safetyAccepted) {
    return <SafetyWarning onAccept={() => setSafetyAccepted(true)} />;
  }

  // Show invalid session message
  if (!isInstanceValid) {
    return (
      <div className="h-screen w-screen bg-gradient-to-br from-red-900 via-red-800 to-orange-900 text-white overflow-hidden flex items-center justify-center">
        <div className="text-center max-w-md p-8">
          <div className="w-16 h-16 mx-auto mb-6 bg-red-500/20 rounded-full flex items-center justify-center">
            <AlertTriangle className="h-8 w-8 text-red-400" />
          </div>
          <h1 className="text-3xl font-bold mb-4">Invalid Session</h1>
          <p className="text-red-200 mb-6">
            This Discord Activity session is not valid or has expired. Discord Activity sessions have a maximum duration of 6 hours for security and performance reasons.
          </p>
          <div className="space-y-3">
            <button
              onClick={() => window.close()}
              className="w-full py-3 px-6 bg-red-600 hover:bg-red-700 rounded-lg font-semibold transition-colors"
            >
              Close Session
            </button>
            <p className="text-sm text-red-300 text-center">
              To continue using PiShock Controller, please start a new Discord Activity session from your Discord server or DM.
            </p>
          </div>
        </div>
      </div>
    );
  }

  const currentUserMultishockSelections = auth?.user?.id
    ? (multishockSelectionsByExecutor[auth.user.id] || {})
    : {};

  // Render minimal PIP interface
  if (isPipMode) {
    return (
      <div className="h-screen w-screen bg-gradient-to-br from-purple-900 via-blue-900 to-indigo-900 text-white overflow-hidden flex items-center justify-center">
        <NotificationSystem 
          notifications={notifications} 
          onDismiss={dismissNotification} 
        />
        <AdminDevMenu
          isOpen={showAdminMenu}
          onClose={() => setShowAdminMenu(false)}
          auth={auth}
          addNotification={addNotification}
        />
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
        
        <div className="w-full h-full max-w-sm mx-auto p-4 flex flex-col">
          <div className="text-center mb-4 flex-shrink-0">
            <div className="w-12 h-12 mx-auto bg-purple-500/20 rounded-full flex items-center justify-center mb-2">
              <Zap className="h-6 w-6 text-purple-400" />
            </div>
            <h1 className="text-lg font-bold">PiShock Controller</h1>
            <p className="text-xs text-gray-300">
              {participants.length} participant{participants.length !== 1 ? 's' : ''}
            </p>
          </div>

          <div className="flex-1 flex flex-col min-h-0">
            <PiShockController
              selectedUser={selectedUser}
              onConnectionChange={setPiShockConnected}
              isConnected={piShockConnected}
              addNotification={addNotification}
              instanceId={instanceId}
              auth={auth}
              currentUser={auth?.user}
              discordSdk={discordSdk}
              isEmbedded={isEmbedded}
              layoutMode={layoutMode}
              multishockMode={multishockMode}
              onMultishockModeChange={handleMultishockToggle}
              hasControllerPlus={hasControllerPlus}
              hasOverlimitConsumable={hasOverlimitConsumable}
              overlimitConsumableCount={overlimitConsumableCount}
              entitlementsLoading={entitlementsLoading}
              onOpenShop={openShop}
              onRefreshEntitlements={refreshEntitlements}
              multishockSelections={currentUserMultishockSelections}
              onUpdateMultishockSelection={updateMultishockSelection}
              authFetch={authFetch}
            />
          </div>

          {participants.length > 1 && (
            <div className="mt-4 flex-shrink-0">
              <select
                value={selectedUser?.id || ''}
                onChange={(e) => {
                  const user = participants.find(p => p.id === e.target.value);
                  if (user && user.id !== auth?.user?.id) {
                    setSelectedUser(user);
                  }
                }}
                className="w-full px-3 py-2 bg-gray-800 border border-gray-600 rounded-lg text-sm focus:ring-2 focus:ring-purple-500 focus:border-transparent"
              >
                <option value="">Select target...</option>
                {participants
                  .filter(p => p.id !== auth?.user?.id)
                  .map(participant => {
                    const userStatus = userPiShockStatus[participant.id];
                    const isConnected = userStatus?.isConnected;
                    const displayName = participant.guildDisplayName || participant.displayName || participant.global_name || participant.username;
                    
                    return (
                      <option 
                        key={participant.id} 
                        value={participant.id}
                        disabled={!isConnected}
                      >
                        {displayName} {isConnected ? '⚡' : '🚫'}
                      </option>
                    );
                  })}
              </select>
            </div>
          )}
        </div>
      </div>
    );
  }
  return (
    <div className="h-screen w-screen bg-gradient-to-br from-purple-900 via-blue-900 to-indigo-900 text-white overflow-hidden flex flex-col">
      <NotificationSystem 
        notifications={notifications} 
        onDismiss={dismissNotification} 
      />
      <AdminDevMenu
        isOpen={showAdminMenu}
        onClose={() => setShowAdminMenu(false)}
        auth={auth}
        addNotification={addNotification}
      />
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
      
      <div className="bg-black/20 backdrop-blur-sm border-b border-white/10 flex-shrink-0">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 rounded-lg overflow-hidden bg-black/20 flex items-center justify-center">
                <img 
                  src="/kVApvT6y_400x400 copy.jpg" 
                  alt="PiShock Controller Logo" 
                  className="w-8 h-8 object-contain"
                />
              </div>
              <div>
                <h1 className="text-lg font-bold">PiShock Controller</h1>
                <p className="text-xs text-gray-300">
                  Discord Activity • {participants.length} participant{participants.length !== 1 ? 's' : ''}
                </p>
              </div>
            </div>
            <div className="flex items-center space-x-4">
              {auth?.user?.id && (
                <button
                  type="button"
                  onClick={toggleEmergencyStop}
                  disabled={togglingEmergencyStop}
                  className={`px-2 py-1 rounded-md text-xs font-semibold transition-colors border ${
                    ownCommandsPaused
                      ? 'bg-red-600 hover:bg-red-700 border-red-400 text-white'
                      : 'bg-emerald-700/40 hover:bg-emerald-700 border-emerald-500/70 text-emerald-100'
                  } disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center space-x-1`}
                  title="Emergency stop for incoming commands to your PiShock"
                >
                  <AlertTriangle className="h-3 w-3" />
                  <span>{togglingEmergencyStop ? 'Updating...' : ownCommandsPaused ? 'Emergency Stop ON' : 'Emergency Stop OFF'}</span>
                </button>
              )}
              {instanceId && (
                <div className="text-xs text-gray-400">
                  Instance: {instanceId.slice(-8)}
                </div>
              )}
              <button
                onClick={openShop}
                className="px-2 py-1 rounded-md bg-indigo-700 hover:bg-indigo-600 text-xs transition-colors flex items-center space-x-1"
                title="Open Controller+ shop"
              >
                <Crown className="h-3 w-3" />
                <span className="hidden sm:inline">Shop ({overlimitConsumableCount})</span>
              </button>
              {isAdminUser && (
                <button
                  onClick={() => setShowAdminMenu(true)}
                  className="px-2 py-1 rounded-md bg-amber-700 hover:bg-amber-600 text-xs transition-colors flex items-center space-x-1"
                  title="Open admin/dev tools"
                >
                  <Bug className="h-3 w-3" />
                  <span className="hidden sm:inline">Admin</span>
                </button>
              )}
              <button
                onClick={() => handleMultishockToggle(!multishockMode)}
                className={`flex items-center gap-2 px-2 py-1 rounded-md text-xs border transition-colors ${
                  hasControllerPlus
                    ? 'bg-gray-700 hover:bg-gray-600 border-gray-500 text-gray-100'
                    : 'bg-gray-800/70 border-gray-600 text-gray-400'
                }`}
                title={hasControllerPlus ? 'Toggle multishock mode' : 'Controller+ required. Click to open shop.'}
              >
                <span>Multishock</span>
                <span
                  className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                    multishockMode && hasControllerPlus ? 'bg-indigo-500' : 'bg-gray-500/60'
                  }`}
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                      multishockMode && hasControllerPlus ? 'translate-x-4' : 'translate-x-0.5'
                    }`}
                  />
                </span>
              </button>
              <button
                onClick={() => navigate('/terms')}
                className="px-2 py-1 rounded-md bg-gray-700 hover:bg-gray-600 text-xs transition-colors flex items-center space-x-1"
              >
                <FileText className="h-3 w-3" />
                <span className="hidden sm:inline">Terms</span>
              </button>
              <button
                onClick={() => navigate('/privacy')}
                className="px-2 py-1 rounded-md bg-gray-700 hover:bg-gray-600 text-xs transition-colors flex items-center space-x-1"
              >
                <Shield className="h-3 w-3" />
                <span className="hidden sm:inline">Privacy</span>
              </button>
              <button
                onClick={() => setShowActivityLog(!showActivityLog)}
                className={`px-3 py-1 rounded-md text-sm transition-colors ${
                  showActivityLog 
                    ? 'bg-purple-600 hover:bg-purple-700 text-white' 
                    : 'bg-gray-700 hover:bg-gray-600 text-gray-300'
                }`}
              >
                Activity Log
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-hidden">
        <div className="h-full max-w-7xl mx-auto px-4 sm:px-6 py-4">
          <div className={`h-full grid gap-2 sm:gap-4 ${showActivityLog ? 'grid-cols-1 lg:grid-cols-4' : 'grid-cols-1 lg:grid-cols-3'}`}>
            <div className="lg:col-span-1 flex flex-col min-h-0">
              <UserSelector
                members={participants}
                selectedUser={selectedUser}
                onUserSelect={setSelectedUser}
                currentUser={auth?.user}
                instanceData={instanceData}
                userPiShockStatus={userPiShockStatus}
                refreshParticipants={refreshParticipants}
                refreshUserStatuses={refreshUserStatuses}
                isEmbedded={isEmbedded}
              />
            </div>

            <div className={`${showActivityLog ? 'lg:col-span-2' : 'lg:col-span-2'} flex flex-col min-h-0 order-1 lg:order-none`}>
              <PiShockController
                selectedUser={selectedUser}
                onConnectionChange={setPiShockConnected}
                isConnected={piShockConnected}
                addNotification={addNotification}
                instanceId={instanceId}
                auth={auth}
                currentUser={auth?.user}
                discordSdk={discordSdk}
                isEmbedded={isEmbedded}
                layoutMode={layoutMode}
                participants={participants}
                multishockMode={multishockMode}
                onMultishockModeChange={handleMultishockToggle}
                hasControllerPlus={hasControllerPlus}
                hasOverlimitConsumable={hasOverlimitConsumable}
                overlimitConsumableCount={overlimitConsumableCount}
                entitlementsLoading={entitlementsLoading}
                onOpenShop={openShop}
                onRefreshEntitlements={refreshEntitlements}
                multishockSelections={currentUserMultishockSelections}
                onUpdateMultishockSelection={updateMultishockSelection}
                authFetch={authFetch}
              />
            </div>

            {showActivityLog && (
              <div className="lg:col-span-1 flex flex-col min-h-0 order-2 lg:order-none">
                <ActivityLog
                  instanceId={instanceId}
                  auth={auth}
                  addNotification={addNotification}
                  authFetch={authFetch}
                />
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="flex-shrink-0 bg-red-900/20 border-t border-red-500/30 px-4 sm:px-6 py-2">
        <div className="max-w-7xl mx-auto">
          <div className="flex items-center justify-between">
            <div className="flex items-start space-x-3 flex-1">
            <AlertTriangle className="h-5 w-5 text-red-400 flex-shrink-0 mt-0.5" />
            <div className="min-w-0">
              <h3 className="text-sm font-semibold text-red-300 mb-1">Safety Reminders</h3>
              <div className="text-xs text-red-200 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-4 gap-y-1">
                <span>• Always ensure explicit consent</span>
                <span>• Start with lowest intensity</span>
                <span>• Have emergency procedures ready</span>
                <span>• All actions are publicly logged</span>
              </div>
            </div>
            </div>
            
          </div>
        </div>
      </div>
      
      <div className="fixed bottom-4 right-4 z-40 flex items-center space-x-2 bg-black/40 backdrop-blur-sm border border-white/10 rounded-lg px-3 py-2 text-xs">
        <div className="flex items-center space-x-2">
          <div className="w-2 h-2 rounded-full bg-green-400"></div>
          <span className="text-gray-300 font-medium">
            {import.meta.env.DEV ? 'dev' : `v${currentVersion.slice(-8)}`}
          </span>
        </div>
      </div>
    </div>
  );
}

function App() {
  const navigate = useNavigate();

  const handleBackToApp = () => {
    navigate('/');
  };

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