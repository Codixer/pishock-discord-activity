import { useState, useEffect, useCallback, useRef } from 'react';
import { DiscordSDK } from '@discord/embedded-app-sdk';

// SKU IDs
const SHOCK_PAST_LIMIT_SKU_ID = "1418562984946569267";
const CONTROLLER_PLUS_SKU_ID = "1387037988558606457";

interface Sku {
  id: string;
  name: string;
  type: number; // 3 = consumable, 5 = subscription
  price: {
    amount: number;
    currency: string;
  };
}

interface Entitlement {
  id: string;
  sku_id: string;
  type: number;
  consumed: boolean | null | undefined;
  ends_at?: string | null;
  starts_at?: string | null;
}

interface MonetizationState {
  skus: Sku[];
  entitlements: Entitlement[];
  hasShockPastLimit: boolean;
  hasControllerPlus: boolean;
  subscriptionExpiresAt?: number;
  loading: boolean;
  error: string | null;
}

// Global cache to prevent multiple simultaneous requests
let globalEntitlementsCache: {
  data: MonetizationState | null;
  timestamp: number;
  pendingRequest: Promise<void> | null;
} = {
  data: null,
  timestamp: 0,
  pendingRequest: null
};

const CACHE_DURATION = 60000; // 1 minute cache
const MIN_REQUEST_INTERVAL = 10000; // Minimum 10 seconds between requests
let lastRequestTime = 0;

// Rate limit tracking
let rateLimitUntil = 0;
const RATE_LIMIT_BACKOFF = 60000; // 1 minute backoff on rate limit

function getApiBaseUrl(): string {
  const urlParams = new URLSearchParams(window.location.search);
  const isEmbedded = urlParams.has('frame_id');
  
  if (isEmbedded) {
    return '/.proxy/api';
  } else {
    return '/api';
  }
}

export function useMonetization(discordSdk: DiscordSDK | null, isEmbedded: boolean, auth: any) {
  const mountedRef = useRef(true);
  const [state, setState] = useState<MonetizationState>({
    skus: [],
    entitlements: [],
    hasShockPastLimit: false,
    hasControllerPlus: false,
    loading: true,
    error: null
  });

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const fetchSkus = useCallback(async () => {
    if (!discordSdk || !isEmbedded) {
      setState(prev => ({ ...prev, loading: false }));
      return;
    }

    // Check rate limit
    if (Date.now() < rateLimitUntil) {
      console.warn('Rate limited, skipping SKU fetch');
      return;
    }

    try {
      const skus = await discordSdk.commands.getSkus();
      if (mountedRef.current) {
        setState(prev => ({ ...prev, skus: skus.skus || [] }));
      }
    } catch (error: any) {
      console.error('Failed to fetch SKUs:', error);
      // Handle rate limiting
      if (error?.code === 1000 || error?.message?.includes('429') || error?.message?.includes('rate limit')) {
        rateLimitUntil = Date.now() + RATE_LIMIT_BACKOFF;
        console.warn('Rate limited on SKU fetch, backing off for 1 minute');
      }
      if (mountedRef.current) {
        setState(prev => ({ ...prev, error: 'Failed to load SKUs' }));
      }
    }
  }, [discordSdk, isEmbedded]);

  const fetchEntitlements = useCallback(async () => {
    if (!discordSdk || !isEmbedded) {
      setState(prev => ({ ...prev, loading: false }));
      return;
    }

    // Check rate limit
    if (Date.now() < rateLimitUntil) {
      console.warn('Rate limited, using cached entitlements');
      if (globalEntitlementsCache.data) {
        setState(prev => ({ ...prev, ...globalEntitlementsCache.data, loading: false }));
      }
      return;
    }

    // Check if there's a pending request
    if (globalEntitlementsCache.pendingRequest) {
      await globalEntitlementsCache.pendingRequest;
      if (globalEntitlementsCache.data) {
        setState(prev => ({ ...prev, ...globalEntitlementsCache.data, loading: false }));
      }
      return;
    }

    // Check cache
    const now = Date.now();
    if (globalEntitlementsCache.data && (now - globalEntitlementsCache.timestamp) < CACHE_DURATION) {
      setState(prev => ({ ...prev, ...globalEntitlementsCache.data, loading: false }));
      return;
    }

    // Throttle requests
    const timeSinceLastRequest = now - lastRequestTime;
    if (timeSinceLastRequest < MIN_REQUEST_INTERVAL) {
      // Use cached data if available
      if (globalEntitlementsCache.data) {
        setState(prev => ({ ...prev, ...globalEntitlementsCache.data, loading: false }));
      }
      return;
    }

    lastRequestTime = now;

    // Create pending request promise
    const requestPromise = (async () => {
      try {
        const entitlements = await discordSdk.commands.getEntitlements();
        const entitlementsList: Entitlement[] = Array.isArray(entitlements?.entitlements) 
          ? entitlements.entitlements.map((ent: any) => ({
              id: ent.id,
              sku_id: ent.sku_id,
              type: ent.type,
              consumed: ent.consumed ?? false,
              ends_at: ent.ends_at,
              starts_at: ent.starts_at,
            }))
          : [];
        
        let hasShockPastLimit = false;
        let hasControllerPlus = false;
        let subscriptionExpiresAt: number | undefined;

        for (const entitlement of entitlementsList) {
          // Check for consumable SKU (Shock Past Limit)
          // Note: Discord entitlement types: 1=Purchase, 2=Premium Subscription, 3=Developer Gift, 4=One-time Purchase, 5=Subscription
          // For consumables, we check by SKU ID and that it's not consumed, regardless of type
          if (entitlement.sku_id === SHOCK_PAST_LIMIT_SKU_ID) {
            console.log('[Monetization] Found Shock Past Limit entitlement:', {
              id: entitlement.id,
              type: entitlement.type,
              consumed: entitlement.consumed,
              sku_id: entitlement.sku_id
            });
            // Check if not consumed (type 4 is one-time purchase, but we check consumed status)
            if (!(entitlement.consumed ?? false)) {
              hasShockPastLimit = true;
            }
          }
          
          // Check for subscription SKU (Controller+)
          // Type 1 = Purchase, Type 5 = Subscription - both can be valid for subscriptions
          if (entitlement.sku_id === CONTROLLER_PLUS_SKU_ID) {
            console.log('[Monetization] Found Controller+ entitlement:', {
              id: entitlement.id,
              type: entitlement.type,
              ends_at: entitlement.ends_at,
              sku_id: entitlement.sku_id
            });
            // Accept type 1 (Purchase) or type 5 (Subscription) for Controller+
            if (entitlement.type === 1 || entitlement.type === 5) {
              if (entitlement.ends_at) {
                const expiresAt = new Date(entitlement.ends_at).getTime();
                const now = Date.now();
                if (expiresAt > now) {
                  hasControllerPlus = true;
                  subscriptionExpiresAt = expiresAt;
                }
              } else {
                hasControllerPlus = true; // Perpetual subscription or purchase
              }
            }
          }
        }
        
        console.log('[Monetization] Processed entitlements result:', {
          total: entitlementsList.length,
          hasShockPastLimit,
          hasControllerPlus,
          consumableCount: entitlementsList.filter((ent: Entitlement) => 
            ent.sku_id === SHOCK_PAST_LIMIT_SKU_ID && !(ent.consumed ?? false)
          ).length,
          subscriptionExpiresAt
        });

        const newState: MonetizationState = {
          skus: [],
          entitlements: entitlementsList,
          hasShockPastLimit,
          hasControllerPlus,
          subscriptionExpiresAt,
          loading: false,
          error: null
        };

        console.log('[Monetization] Setting new state:', newState);

        // Update global cache
        globalEntitlementsCache = {
          data: newState,
          timestamp: now,
          pendingRequest: null
        };

        if (mountedRef.current) {
          setState(prev => {
            const updated = {
              ...prev,
              ...newState,
              loading: false
            };
            console.log('[Monetization] State updated in component:', updated);
            return updated;
          });
        }
      } catch (error: any) {
        console.error('Failed to fetch entitlements:', error);
        
        // Handle rate limiting
        if (error?.code === 1000 || error?.message?.includes('429') || error?.message?.includes('rate limit') || error?.message?.includes('Too Many Requests')) {
          rateLimitUntil = Date.now() + RATE_LIMIT_BACKOFF;
          console.warn('Rate limited on entitlements fetch, backing off for 1 minute');
        }
        
        // Use cached data if available
        if (mountedRef.current) {
          if (globalEntitlementsCache.data) {
            setState(prev => ({ ...prev, ...globalEntitlementsCache.data, loading: false, error: 'Using cached data due to rate limit' }));
          } else {
            setState(prev => ({ ...prev, error: 'Failed to load entitlements', loading: false }));
          }
        }
        
        globalEntitlementsCache.pendingRequest = null;
      }
    })();

    globalEntitlementsCache.pendingRequest = requestPromise;
    await requestPromise;
  }, [discordSdk, isEmbedded]);

  const startPurchase = useCallback(async (skuId: string): Promise<boolean> => {
    if (!discordSdk || !isEmbedded) {
      return false;
    }

    try {
      const result: any = await discordSdk.commands.startPurchase({
        sku_id: skuId
      });
      
      // Purchase may complete immediately or be initiated
      // In either case, refresh entitlements after a delay
      if (result) {
        // Invalidate cache and refresh entitlements after purchase
        globalEntitlementsCache.data = null;
        globalEntitlementsCache.timestamp = 0;
        lastRequestTime = 0; // Reset request throttle
        // Wait a bit for Discord to process the purchase, then refresh
        setTimeout(async () => {
          await fetchEntitlements();
          await fetchSkus();
        }, 2000);
        return true;
      }
      
      return false;
    } catch (error) {
      console.error('Purchase failed:', error);
      return false;
    }
  }, [discordSdk, isEmbedded, fetchEntitlements, fetchSkus]);

  const consumeEntitlement = useCallback(async (entitlementId: string): Promise<boolean> => {
    if (!auth?.user?.id || !auth?.access_token) {
      console.error('[Monetization] Cannot consume entitlement: missing auth');
      return false;
    }

    try {
      console.log(`[Monetization] Consuming entitlement ${entitlementId} via backend API`);
      
      // Call the backend API to consume the entitlement
      const response = await fetch(`${getApiBaseUrl()}/users/${auth.user.id}/sku-consume`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${auth.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          skuId: SHOCK_PAST_LIMIT_SKU_ID
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        console.error('[Monetization] Failed to consume entitlement:', {
          status: response.status,
          error: errorData
        });
        return false;
      }

      const result = await response.json();
      console.log('[Monetization] Entitlement consumed successfully:', result);
      
      // Invalidate cache and refresh entitlements after consumption
      globalEntitlementsCache.data = null;
      globalEntitlementsCache.timestamp = 0;
      lastRequestTime = 0; // Reset request throttle
      await fetchEntitlements();
      await fetchBackendSkuStatus();
      
      return true;
    } catch (error) {
      console.error('[Monetization] Exception while consuming entitlement:', error);
      return false;
    }
  }, [auth, fetchEntitlements, fetchBackendSkuStatus]);

  // Also fetch from backend for server-side verification
  const fetchBackendSkuStatus = useCallback(async () => {
    if (!auth?.user?.id || !auth?.access_token) {
      return;
    }

    try {
      const response = await fetch(`${getApiBaseUrl()}/users/${auth.user.id}/sku-verify`, {
        headers: {
          'Authorization': `Bearer ${auth.access_token}`,
        },
      });

      if (response.ok) {
        const data = await response.json();
        if (mountedRef.current) {
          setState(prev => ({
            ...prev,
            hasShockPastLimit: data.hasShockPastLimit || prev.hasShockPastLimit,
            hasControllerPlus: data.hasControllerPlus || prev.hasControllerPlus,
            subscriptionExpiresAt: data.subscriptionExpiresAt || prev.subscriptionExpiresAt
          }));
        }
      }
    } catch (error) {
      console.error('Failed to fetch backend SKU status:', error);
    }
  }, [auth]);

  // Initial load - only fetch SKUs once, entitlements are cached globally
  useEffect(() => {
    if (isEmbedded && discordSdk && auth?.access_token) {
      console.log('[Monetization] Initializing monetization hook');
      // Fetch SKUs only once (they don't change often)
      const now = Date.now();
      if (!globalEntitlementsCache.data || (now - globalEntitlementsCache.timestamp) > CACHE_DURATION) {
        console.log('[Monetization] Fetching SKUs and entitlements (cache miss)');
        fetchSkus();
        fetchEntitlements();
      } else {
        // Use cached data
        console.log('[Monetization] Using cached entitlements data');
        setState(prev => ({ ...prev, ...globalEntitlementsCache.data, loading: false }));
        fetchSkus(); // SKUs can be fetched separately
      }
    } else {
      if (!isEmbedded) console.log('[Monetization] Not embedded, skipping fetch');
      if (!discordSdk) console.log('[Monetization] No Discord SDK, skipping fetch');
      if (!auth?.access_token) console.log('[Monetization] No auth token, skipping fetch');
      setState(prev => ({ ...prev, loading: false }));
    }
  }, [isEmbedded, discordSdk, auth?.access_token, fetchSkus, fetchEntitlements]);

  // Fetch backend status when auth is available
  useEffect(() => {
    if (auth?.user?.id) {
      fetchBackendSkuStatus();
    }
  }, [auth, fetchBackendSkuStatus]);

  // Refresh entitlements periodically (every 10 minutes, longer to avoid rate limits)
  useEffect(() => {
    if (!isEmbedded || !discordSdk) return;

    const interval = setInterval(() => {
      // Only refresh if cache is stale and not rate limited
      const now = Date.now();
      if (now >= rateLimitUntil && (!globalEntitlementsCache.data || (now - globalEntitlementsCache.timestamp) > CACHE_DURATION * 10)) {
        fetchEntitlements();
      }
      fetchBackendSkuStatus();
    }, 600000); // 10 minutes (reduced frequency to avoid rate limits)

    return () => clearInterval(interval);
  }, [isEmbedded, discordSdk, fetchEntitlements, fetchBackendSkuStatus]);

  const consumableCount = (state.entitlements || []).filter(
    (ent: Entitlement) => ent.sku_id === SHOCK_PAST_LIMIT_SKU_ID && !(ent.consumed ?? false)
  ).length;

  // Log state changes for debugging
  useEffect(() => {
    console.log('[Monetization] Hook state changed:', {
      hasShockPastLimit: state.hasShockPastLimit,
      hasControllerPlus: state.hasControllerPlus,
      consumableCount,
      entitlementsCount: state.entitlements.length,
      loading: state.loading,
      error: state.error,
      entitlements: state.entitlements.map((e: Entitlement) => ({
        id: e.id,
        sku_id: e.sku_id,
        type: e.type,
        consumed: e.consumed
      }))
    });
  }, [state.hasShockPastLimit, state.hasControllerPlus, consumableCount, state.entitlements.length, state.loading, state.error, state.entitlements]);

  return {
    ...state,
    refreshEntitlements: fetchEntitlements,
    refreshSkus: fetchSkus,
    purchaseSku: startPurchase,
    consumeEntitlement,
    shockPastLimitSku: state.skus.find(s => s.id === SHOCK_PAST_LIMIT_SKU_ID),
    controllerPlusSku: state.skus.find(s => s.id === CONTROLLER_PLUS_SKU_ID),
    consumableCount,
  };
}

