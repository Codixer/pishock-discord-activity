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
  const [isRateLimited, setIsRateLimited] = useState(false);
  const [retryAfter, setRetryAfter] = useState<number | null>(null);

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
    if (!discordSdk || !isEmbedded) {
      console.log('ENTITLEMENTS: SDK not available or not embedded');
      return [];
    }

    try {
      console.log('ENTITLEMENTS: Loading from Discord SDK...');
      const response = await discordSdk.commands.getEntitlements();
      console.log('ENTITLEMENTS: SDK response:', response);
      
      // Handle the case where entitlements might be undefined due to rate limiting
      if (response && response.entitlements && Array.isArray(response.entitlements)) {
        setIsRateLimited(false);
        setRetryAfter(null);
        return response.entitlements;
      } else if (response && response.entitlements === undefined) {
        console.warn('ENTITLEMENTS: SDK returned undefined entitlements (likely rate limited)');
        setIsRateLimited(true);
        // Set a default retry after 60 seconds if not specified
        setRetryAfter(Date.now() + 60000);
        return [];
      }
      return [];
    } catch (error) {
      // Check if it's a rate limiting error
      if (error && typeof error === 'object' && 'message' in error) {
        const errorMessage = error.message.toLowerCase();
        if (errorMessage.includes('429') || errorMessage.includes('rate limit')) {
          console.warn('ENTITLEMENTS: Rate limited by Discord SDK');
          setIsRateLimited(true);
          setRetryAfter(Date.now() + 60000); // Retry after 1 minute
          return [];
        }
      }
      console.error('ENTITLEMENTS: Failed to load from SDK:', error);
      return [];
    }
  }, [discordSdk, isEmbedded]);

  // Load entitlements from HTTP API (fallback)
  const loadEntitlementsFromAPI = useCallback(async () => {
    if (!auth) {
      console.log('ENTITLEMENTS: No auth token for API fallback');
      return [];
    }

    try {
      console.log('ENTITLEMENTS: Loading from HTTP API...');
      
      // Add parameters to reduce load and avoid rate limiting
      const url = new URL('https://discord.com/api/users/@me/entitlements');
      url.searchParams.set('exclude_ended', 'true');
      url.searchParams.set('exclude_deleted', 'true');
      url.searchParams.set('exclude_consumed', 'true');
      
      const response = await fetch(url.toString(), {
        headers: {
          'Authorization': `Bearer ${auth.access_token}`,
        },
      });

      if (response.status === 429) {
        const retryAfterHeader = response.headers.get('retry-after');
        const retryAfterMs = retryAfterHeader ? parseInt(retryAfterHeader) * 1000 : 60000;
        console.warn('ENTITLEMENTS: Rate limited by Discord API, retry after:', retryAfterMs);
        setIsRateLimited(true);
        setRetryAfter(Date.now() + retryAfterMs);
        return [];
      }
      
      if (!response.ok) {
        console.error('ENTITLEMENTS: API error:', response.status, response.statusText);
        return [];
      }

      const data = await response.json();
      console.log('ENTITLEMENTS: API response:', data);
      setIsRateLimited(false);
      setRetryAfter(null);
      return Array.isArray(data) ? data : [];
    } catch (error) {
      console.error('ENTITLEMENTS: Failed to load from API:', error);
      return [];
    }
  }, [auth]);

  // Primary entitlement loading function
  const loadEntitlements = useCallback(async () => {
    // Skip entitlement loading in development mode when not embedded
    if (import.meta.env.DEV && !isEmbedded) {
      console.log('ENTITLEMENTS: Skipping in development mode (not embedded)');
      setLoading(false);
      return [];
    }

    setLoading(true);
    try {
      let loadedEntitlements: Entitlement[] = [];
      
      // Check if we're currently rate limited
      if (isRateLimited && retryAfter && Date.now() < retryAfter) {
        console.log('ENTITLEMENTS: Currently rate limited, skipping load');
        setLoading(false);
        return [];
      }

      // Try SDK first if available (preferred for Activities)
      if (isEmbedded && discordSdk) {
        loadedEntitlements = await loadEntitlementsFromSDK();
      }

      // Fallback to HTTP API if SDK fails or unavailable (only in embedded mode)
      if (loadedEntitlements.length === 0 && auth && isEmbedded && !isRateLimited) {
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
    // Only auto-load in embedded mode when core dependencies change
    if (isEmbedded && (discordSdk || auth)) {
      // Only load if not currently rate limited
      if (!isRateLimited) {
        loadEntitlements();
      }
    }
  }, [isEmbedded, discordSdk, auth]); // Removed loadEntitlements to prevent circular dependency

  // Set up Gateway event listeners for real-time updates
  useEffect(() => {
    if (!isEmbedded || !discordSdk) return;

    // Set up periodic polling - the interval itself will check rate limiting
    const intervalId = setInterval(() => {
      // Only refresh if not currently rate limited and rate limit window has passed
      if (!isRateLimited || (retryAfter && Date.now() >= retryAfter)) {
        console.log('ENTITLEMENTS: Periodic refresh (10min interval)');
        loadEntitlements();
      } else {
        console.log('ENTITLEMENTS: Skipping periodic refresh due to rate limiting');
      }
    }, 10 * 60 * 1000); // 10 minutes to reduce rate limiting

    return () => clearInterval(intervalId);
  }, [isEmbedded, discordSdk]); // Removed loadEntitlements and isRateLimited to prevent circular dependency

  // Separate effect to handle rate limit recovery
  useEffect(() => {
    if (isRateLimited && retryAfter) {
      const timeUntilRetry = retryAfter - Date.now();
      if (timeUntilRetry > 0 && timeUntilRetry < 5 * 60 * 1000) { // Only if less than 5 minutes
        console.log(`ENTITLEMENTS: Setting up retry timer for ${Math.round(timeUntilRetry / 1000)}s`);
        const retryTimeout = setTimeout(() => {
          console.log('ENTITLEMENTS: Rate limit window expired, attempting refresh');
          loadEntitlements();
        }, timeUntilRetry);

        return () => clearTimeout(retryTimeout);
      }
    }
  }, [isRateLimited, retryAfter]); // This effect only depends on rate limiting state

  return {
    entitlements,
    hasControllerPlus,
    loading,
    lastChecked,
    isRateLimited,
    retryAfter,
    loadEntitlements,
    refreshEntitlements,
    purchaseControllerPlus,
    handleEntitlementUpdate,
    checkControllerPlusAccess
  };
}