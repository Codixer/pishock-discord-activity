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

// Rate limit tracking
let rateLimitUntil = 0;
const RATE_LIMIT_BACKOFF = 60000; // 1 minute backoff on rate limit

// Track pending requests to prevent duplicate simultaneous requests
let pendingEntitlementsRequest: Promise<void> | null = null;

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
      console.warn('Rate limited, skipping entitlements fetch');
      if (mountedRef.current) {
        setState(prev => ({ ...prev, error: 'Rate limited, please try again later', loading: false }));
      }
      return;
    }

    // Check if there's a pending request - wait for it instead of making duplicate requests
    if (pendingEntitlementsRequest) {
      await pendingEntitlementsRequest;
      return;
    }

    // Create pending request promise
    const requestPromise = (async () => {
      try {
        console.log('[Monetization] Fetching entitlements from Discord SDK');
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
        
        console.log('[Monetization] Raw entitlements from Discord SDK:', entitlementsList.map((e: Entitlement) => ({
          id: e.id,
          sku_id: e.sku_id,
          consumed: e.consumed,
          type: e.type
        })));
        
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
        
        const consumableCount = entitlementsList.filter((ent: Entitlement) => 
          ent.sku_id === SHOCK_PAST_LIMIT_SKU_ID && !(ent.consumed ?? false)
        ).length;
        
        console.log('[Monetization] Processed entitlements result:', {
          total: entitlementsList.length,
          hasShockPastLimit,
          hasControllerPlus,
          consumableCount,
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

        if (mountedRef.current) {
          setState(prev => {
            // Preserve locally consumed entitlements that Discord hasn't updated yet
            // If an entitlement was marked as consumed locally but Discord still shows it as unconsumed,
            // keep it as consumed (since we know the backend already consumed it)
            const preservedConsumedIds = new Set(
              prev.entitlements
                .filter(ent => 
                  ent.sku_id === SHOCK_PAST_LIMIT_SKU_ID && 
                  ent.consumed === true &&
                  // Find if this entitlement still exists in the new list and is unconsumed
                  entitlementsList.some(newEnt => 
                    newEnt.id === ent.id && !(newEnt.consumed ?? false)
                  )
                )
                .map(ent => ent.id)
            );
            
            // Merge entitlements: use new data from Discord, but preserve consumed status for locally consumed ones
            const mergedEntitlements = entitlementsList.map((ent: Entitlement) => {
              if (preservedConsumedIds.has(ent.id)) {
                // This entitlement was consumed locally but Discord hasn't updated yet
                console.log(`[Monetization] Preserving consumed status for entitlement ${ent.id} (Discord not updated yet)`);
                return { ...ent, consumed: true };
              }
              return ent;
            });
            
            // Recalculate consumable count with merged entitlements
            const mergedConsumableCount = mergedEntitlements.filter((ent: Entitlement) => 
              ent.sku_id === SHOCK_PAST_LIMIT_SKU_ID && !(ent.consumed ?? false)
            ).length;
            
            const updated = {
              ...prev,
              entitlements: mergedEntitlements,
              hasShockPastLimit: mergedConsumableCount > 0,
              hasControllerPlus: newState.hasControllerPlus,
              subscriptionExpiresAt: newState.subscriptionExpiresAt,
              loading: false
            };
            
            console.log('[Monetization] State updated in component (with preserved consumed):', {
              ...updated,
              consumableCount: mergedConsumableCount,
              preservedConsumedCount: preservedConsumedIds.size
            });
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
        
        if (mountedRef.current) {
          setState(prev => ({ ...prev, error: 'Failed to load entitlements', loading: false }));
        }
      } finally {
        pendingEntitlementsRequest = null;
      }
    })();

    pendingEntitlementsRequest = requestPromise;
    await requestPromise;
  }, [discordSdk, isEmbedded]);

  // Also fetch from backend for server-side verification
  const fetchBackendSkuStatus = useCallback(async () => {
    if (!auth?.user?.id || !auth?.access_token) {
      return;
    }

    try {
      const url = `${getApiBaseUrl()}/users/${auth.user.id}/sku-verify`;
      const response = await fetch(url, {
        headers: {
          'Authorization': `Bearer ${auth.access_token}`,
        },
      });

      if (response.ok) {
        const data = await response.json();
        console.log('[Monetization] Backend SKU status fetched:', data);
        if (mountedRef.current) {
          setState(prev => {
            // Update state with backend data
            const updated = {
              ...prev,
              hasShockPastLimit: data.hasShockPastLimit ?? prev.hasShockPastLimit,
              hasControllerPlus: data.hasControllerPlus ?? prev.hasControllerPlus,
              subscriptionExpiresAt: data.subscriptionExpiresAt ?? prev.subscriptionExpiresAt
            };
            
            // If backend says no consumables, update entitlements to mark them as consumed
            if (!data.hasShockPastLimit && prev.hasShockPastLimit) {
              console.log('[Monetization] Backend indicates no consumables, updating entitlements state');
              updated.entitlements = prev.entitlements.map((ent: Entitlement) => {
                if (ent.sku_id === SHOCK_PAST_LIMIT_SKU_ID && !ent.consumed) {
                  return { ...ent, consumed: true };
                }
                return ent;
              });
            }
            
            // If backend says we have consumables but frontend doesn't, refresh entitlements from Discord
            if (data.hasShockPastLimit && !prev.hasShockPastLimit) {
              console.log('[Monetization] Backend indicates new consumables available, refreshing from Discord');
              // Trigger a refresh of entitlements from Discord API
              setTimeout(() => {
                fetchEntitlements();
              }, 500);
            }
            
            return updated;
          });
        }
      }
    } catch (error) {
      console.error('Failed to fetch backend SKU status:', error);
    }
  }, [auth, fetchEntitlements]);

  const startPurchase = useCallback(async (skuId: string): Promise<boolean> => {
    if (!discordSdk || !isEmbedded) {
      return false;
    }

    try {
      const result: any = await discordSdk.commands.startPurchase({
        sku_id: skuId
      });
      
      // Purchase may complete immediately or be initiated
      // In either case, refresh entitlements aggressively to ensure UI updates
      if (result) {
        console.log('[Monetization] Purchase completed, starting aggressive refresh');
        
        // Multiple refresh attempts with increasing delays to ensure we get fresh data
        // Discord API may take a few seconds to process the purchase
        const refreshAfterPurchase = async (attempt: number) => {
          console.log(`[Monetization] Refreshing after purchase (attempt ${attempt})`);
          
          // Refresh from Discord API first
          await fetchEntitlements();
          await fetchSkus();
          
          // Refresh backend status to get authoritative data
          await fetchBackendSkuStatus();
          
          // Continue retrying with increasing delays (up to 5 attempts)
          if (attempt < 5) {
            const delays = [2000, 3000, 5000, 8000]; // 2s, 3s, 5s, 8s delays
            const delay = delays[attempt - 1] || 10000;
            setTimeout(() => refreshAfterPurchase(attempt + 1), delay);
          } else {
            console.log('[Monetization] Finished all purchase refresh attempts');
          }
        };
        
        // Start refresh immediately, then continue with retries
        refreshAfterPurchase(1);
        
        return true;
      }
      
      return false;
    } catch (error) {
      console.error('Purchase failed:', error);
      return false;
    }
  }, [discordSdk, isEmbedded, fetchEntitlements, fetchSkus, fetchBackendSkuStatus]);

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
      
      // Refresh entitlements after consumption
      await fetchEntitlements();
      await fetchBackendSkuStatus();
      
      return true;
    } catch (error) {
      console.error('[Monetization] Exception while consuming entitlement:', error);
      return false;
    }
  }, [auth, fetchEntitlements, fetchBackendSkuStatus]);

  // Initial load - fetch SKUs and entitlements
  useEffect(() => {
    if (isEmbedded && discordSdk && auth?.access_token) {
      console.log('[Monetization] Initializing monetization hook');
      fetchSkus();
      fetchEntitlements();
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
      // Only refresh if not rate limited
      const now = Date.now();
      if (now >= rateLimitUntil) {
        fetchEntitlements();
      }
      fetchBackendSkuStatus();
    }, 600000); // 10 minutes (reduced frequency to avoid rate limits)

    return () => clearInterval(interval);
  }, [isEmbedded, discordSdk, fetchEntitlements, fetchBackendSkuStatus]);


  // Log state changes for debugging
  useEffect(() => {
    const count = (state.entitlements || []).filter(
      (ent: Entitlement) => ent.sku_id === SHOCK_PAST_LIMIT_SKU_ID && !(ent.consumed ?? false)
    ).length;
    console.log('[Monetization] Hook state changed:', {
      hasShockPastLimit: state.hasShockPastLimit,
      hasControllerPlus: state.hasControllerPlus,
      consumableCount: count,
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
  }, [state.hasShockPastLimit, state.hasControllerPlus, state.entitlements.length, state.loading, state.error, state.entitlements]);

  // Wrapper for refresh (kept for API compatibility)
  const refreshEntitlements = useCallback(() => {
    return fetchEntitlements();
  }, [fetchEntitlements]);

  // Function to immediately mark an entitlement as consumed in local state
  const markEntitlementConsumed = useCallback((entitlementId: string) => {
    console.log(`[Monetization] Immediately marking entitlement ${entitlementId} as consumed in local state`);
    setState(prev => {
      const updatedEntitlements = prev.entitlements.map((ent: Entitlement) => {
        if (ent.id === entitlementId && ent.sku_id === SHOCK_PAST_LIMIT_SKU_ID) {
          console.log(`[Monetization] Marking entitlement ${ent.id} as consumed`);
          return { ...ent, consumed: true };
        }
        return ent;
      });
      
      const newConsumableCount = updatedEntitlements.filter((ent: Entitlement) => 
        ent.sku_id === SHOCK_PAST_LIMIT_SKU_ID && !(ent.consumed ?? false)
      ).length;
      
      const updated = {
        ...prev,
        entitlements: updatedEntitlements,
        hasShockPastLimit: newConsumableCount > 0
      };
      
      console.log(`[Monetization] Updated state after marking consumed:`, {
        consumableCount: newConsumableCount,
        hasShockPastLimit: updated.hasShockPastLimit
      });
      
      return updated;
    });
  }, []);

  // Calculate consumable count directly from state - recalculated on every render
  const currentConsumableCount = (state.entitlements || []).filter(
    (ent: Entitlement) => ent.sku_id === SHOCK_PAST_LIMIT_SKU_ID && !(ent.consumed ?? false)
  ).length;
  
  // Log when consumable count changes
  useEffect(() => {
    console.log('[Monetization] Consumable count updated:', {
      count: currentConsumableCount,
      entitlements: state.entitlements.length,
      unconsumed: state.entitlements.filter((e: Entitlement) => 
        e.sku_id === SHOCK_PAST_LIMIT_SKU_ID && !(e.consumed ?? false)
      ).map((e: Entitlement) => ({ id: e.id, consumed: e.consumed }))
    });
  }, [currentConsumableCount, state.entitlements]);
  
  return {
    ...state,
    refreshEntitlements,
    refreshSkus: fetchSkus,
    refreshBackendStatus: fetchBackendSkuStatus,
    purchaseSku: startPurchase,
    consumeEntitlement,
    markEntitlementConsumed,
    shockPastLimitSku: state.skus.find(s => s.id === SHOCK_PAST_LIMIT_SKU_ID),
    controllerPlusSku: state.skus.find(s => s.id === CONTROLLER_PLUS_SKU_ID),
    consumableCount: currentConsumableCount,
  };
}

