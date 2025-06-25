import { useState, useCallback, useEffect } from 'react';
import { DiscordSDK } from '@discord/embedded-app-sdk';

export interface Entitlement {
  id: string;
  sku_id: string;
  user_id?: string;
  guild_id?: string;
  type: number;
  deleted: boolean;
  starts_at?: string;
  ends_at?: string;
}

interface UseEntitlementsProps {
  discordSdk?: DiscordSDK;
  isEmbedded: boolean;
  auth?: any;
  controllerPlusSkuId?: string;
}

export function useEntitlements({ 
  discordSdk, 
  isEmbedded, 
  auth, 
  controllerPlusSkuId 
}: UseEntitlementsProps) {
  const [entitlements, setEntitlements] = useState<Entitlement[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasControllerPlus, setHasControllerPlus] = useState(false);
  const [lastChecked, setLastChecked] = useState<Date | null>(null);

  // Check if user has Controller+ entitlement
  const checkControllerPlusAccess = useCallback((userEntitlements: Entitlement[] = entitlements) => {
    if (!controllerPlusSkuId) {
      console.log('ENTITLEMENTS: No Controller+ SKU ID configured');
      return false;
    }

    const now = new Date();
    const activeEntitlement = userEntitlements.find(entitlement => {
      // Check if this is a Controller+ entitlement
      const isControllerPlusSku = entitlement.sku_id === controllerPlusSkuId || 
                                 entitlement.sku_id?.includes('controller_plus') ||
                                 entitlement.sku_id?.includes('multishock');
      
      if (!isControllerPlusSku) return false;

      // Check if entitlement is not deleted
      if (entitlement.deleted) return false;

      // Check if entitlement has started (if starts_at is specified)
      if (entitlement.starts_at && new Date(entitlement.starts_at) > now) return false;

      // Check if entitlement hasn't ended (if ends_at is specified)
      if (entitlement.ends_at && new Date(entitlement.ends_at) <= now) return false;

      // Check entitlement type (valid types from Discord docs)
      const validTypes = [1, 3, 4, 5, 7, 8]; // Valid entitlement types per Discord
      if (!validTypes.includes(entitlement.type)) return false;

      return true;
    });

    const hasAccess = !!activeEntitlement;
    console.log('ENTITLEMENTS: Controller+ access check:', {
      skuId: controllerPlusSkuId,
      entitlementsCount: userEntitlements.length,
      hasAccess,
      activeEntitlement: activeEntitlement ? {
        id: activeEntitlement.id,
        sku_id: activeEntitlement.sku_id,
        type: activeEntitlement.type,
        ends_at: activeEntitlement.ends_at
      } : null
    });

    return hasAccess;
  }, [entitlements, controllerPlusSkuId]);

  // Load entitlements from Discord SDK (for Activities)
  const loadEntitlementsFromSDK = useCallback(async () => {
    if (!discordSdk || !isEmbedded) return [];

    try {
      console.log('ENTITLEMENTS: Loading from Discord SDK...');
      const response = await discordSdk.commands.getEntitlements();
      console.log('ENTITLEMENTS: SDK response:', response);
      
      if (response.entitlements) {
        return response.entitlements;
      }
      return [];
    } catch (error) {
      console.error('ENTITLEMENTS: Failed to load from SDK:', error);
      return [];
    }
  }, [discordSdk, isEmbedded]);

  // Load entitlements from HTTP API (fallback)
  const loadEntitlementsFromAPI = useCallback(async () => {
    if (!auth) return [];

    try {
      console.log('ENTITLEMENTS: Loading from HTTP API...');
      const response = await fetch('https://discord.com/api/users/@me/entitlements', {
        headers: {
          'Authorization': `Bearer ${auth.access_token}`,
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data = await response.json();
      console.log('ENTITLEMENTS: API response:', data);
      return Array.isArray(data) ? data : [];
    } catch (error) {
      console.error('ENTITLEMENTS: Failed to load from API:', error);
      return [];
    }
  }, [auth]);

  // Primary entitlement loading function
  const loadEntitlements = useCallback(async () => {
    setLoading(true);
    try {
      let loadedEntitlements: Entitlement[] = [];

      // Try SDK first if available (preferred for Activities)
      if (isEmbedded && discordSdk) {
        loadedEntitlements = await loadEntitlementsFromSDK();
      }

      // Fallback to HTTP API if SDK fails or unavailable
      if (loadedEntitlements.length === 0 && auth) {
        loadedEntitlements = await loadEntitlementsFromAPI();
      }

      console.log('ENTITLEMENTS: Loaded', loadedEntitlements.length, 'entitlements');
      setEntitlements(loadedEntitlements);
      
      // Check Controller+ access with new entitlements
      const hasAccess = checkControllerPlusAccess(loadedEntitlements);
      setHasControllerPlus(hasAccess);
      setLastChecked(new Date());

      return loadedEntitlements;
    } catch (error) {
      console.error('ENTITLEMENTS: Load error:', error);
      return [];
    } finally {
      setLoading(false);
    }
  }, [isEmbedded, discordSdk, auth, loadEntitlementsFromSDK, loadEntitlementsFromAPI, checkControllerPlusAccess]);

  // Start purchase flow for Controller+
  const purchaseControllerPlus = useCallback(async () => {
    if (!controllerPlusSkuId) {
      console.warn('ENTITLEMENTS: No Controller+ SKU ID configured for purchase');
      return false;
    }

    if (!isEmbedded || !discordSdk) {
      console.warn('ENTITLEMENTS: Purchase only available in Discord Activity environment');
      return false;
    }

    try {
      console.log('ENTITLEMENTS: Starting purchase for SKU:', controllerPlusSkuId);
      await discordSdk.commands.startPurchase({ sku_id: controllerPlusSkuId });
      console.log('ENTITLEMENTS: Purchase flow started successfully');
      return true;
    } catch (error) {
      console.error('ENTITLEMENTS: Purchase failed:', error);
      return false;
    }
  }, [controllerPlusSkuId, isEmbedded, discordSdk]);

  // Handle entitlement updates (for Gateway events)
  const handleEntitlementUpdate = useCallback((updatedEntitlements: Entitlement[]) => {
    console.log('ENTITLEMENTS: Handling update with', updatedEntitlements.length, 'entitlements');
    setEntitlements(updatedEntitlements);
    const hasAccess = checkControllerPlusAccess(updatedEntitlements);
    setHasControllerPlus(hasAccess);
    setLastChecked(new Date());
  }, [checkControllerPlusAccess]);

  // Refresh entitlements (public method)
  const refreshEntitlements = useCallback(async () => {
    console.log('ENTITLEMENTS: Manual refresh requested');
    return await loadEntitlements();
  }, [loadEntitlements]);

  // Auto-load entitlements when dependencies change
  useEffect(() => {
    if ((isEmbedded && discordSdk) || auth) {
      loadEntitlements();
    }
  }, [isEmbedded, discordSdk, auth, loadEntitlements]);

  // Set up Gateway event listeners for real-time updates
  useEffect(() => {
    if (!isEmbedded || !discordSdk) return;

    // Note: This would require Discord SDK to support Gateway events
    // Currently Discord Activities don't directly receive Gateway events
    // But we can poll periodically or refresh on user action

    const intervalId = setInterval(() => {
      // Refresh entitlements every 5 minutes to catch changes
      loadEntitlements();
    }, 5 * 60 * 1000);

    return () => clearInterval(intervalId);
  }, [isEmbedded, discordSdk, loadEntitlements]);

  return {
    entitlements,
    hasControllerPlus,
    loading,
    lastChecked,
    loadEntitlements,
    refreshEntitlements,
    purchaseControllerPlus,
    handleEntitlementUpdate,
    checkControllerPlusAccess
  };
}