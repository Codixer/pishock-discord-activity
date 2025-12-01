import { useState, useEffect, useCallback } from 'react';
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
  consumed: boolean;
  ends_at?: string;
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
  const [state, setState] = useState<MonetizationState>({
    skus: [],
    entitlements: [],
    hasShockPastLimit: false,
    hasControllerPlus: false,
    loading: true,
    error: null
  });

  const fetchSkus = useCallback(async () => {
    if (!discordSdk || !isEmbedded) {
      setState(prev => ({ ...prev, loading: false }));
      return;
    }

    try {
      const skus = await discordSdk.commands.getSkus();
      setState(prev => ({ ...prev, skus: skus.skus || [] }));
    } catch (error) {
      console.error('Failed to fetch SKUs:', error);
      setState(prev => ({ ...prev, error: 'Failed to load SKUs' }));
    }
  }, [discordSdk, isEmbedded]);

  const fetchEntitlements = useCallback(async () => {
    if (!discordSdk || !isEmbedded) {
      setState(prev => ({ ...prev, loading: false }));
      return;
    }

    try {
      const entitlements = await discordSdk.commands.getEntitlements();
      const entitlementsList = entitlements.entitlements || [];
      
      let hasShockPastLimit = false;
      let hasControllerPlus = false;
      let subscriptionExpiresAt: number | undefined;

      for (const entitlement of entitlementsList) {
        // Check for consumable SKU (Shock Past Limit)
        if (entitlement.sku_id === SHOCK_PAST_LIMIT_SKU_ID) {
          if (entitlement.type === 3 && !entitlement.consumed) {
            hasShockPastLimit = true;
          }
        }
        
        // Check for subscription SKU (Controller+)
        if (entitlement.sku_id === CONTROLLER_PLUS_SKU_ID) {
          if (entitlement.type === 5) {
            if (entitlement.ends_at) {
              const expiresAt = new Date(entitlement.ends_at).getTime() / 1000;
              const now = Math.floor(Date.now() / 1000);
              if (expiresAt > now) {
                hasControllerPlus = true;
                subscriptionExpiresAt = expiresAt;
              }
            } else {
              hasControllerPlus = true;
            }
          }
        }
      }

      setState(prev => ({
        ...prev,
        entitlements: entitlementsList,
        hasShockPastLimit,
        hasControllerPlus,
        subscriptionExpiresAt,
        loading: false
      }));
    } catch (error) {
      console.error('Failed to fetch entitlements:', error);
      setState(prev => ({ ...prev, error: 'Failed to load entitlements', loading: false }));
    }
  }, [discordSdk, isEmbedded]);

  const startPurchase = useCallback(async (skuId: string): Promise<boolean> => {
    if (!discordSdk || !isEmbedded) {
      return false;
    }

    try {
      const result = await discordSdk.commands.startPurchase({
        sku_id: skuId
      });
      
      if (result.status === 'purchase_complete') {
        // Refresh entitlements after purchase
        await fetchEntitlements();
        return true;
      }
      
      return false;
    } catch (error) {
      console.error('Purchase failed:', error);
      return false;
    }
  }, [discordSdk, isEmbedded, fetchEntitlements]);

  const consumeEntitlement = useCallback(async (entitlementId: string): Promise<boolean> => {
    if (!discordSdk || !isEmbedded) {
      return false;
    }

    try {
      await discordSdk.commands.consumeEntitlement({
        entitlement_id: entitlementId
      });
      
      // Refresh entitlements after consumption
      await fetchEntitlements();
      return true;
    } catch (error) {
      console.error('Failed to consume entitlement:', error);
      return false;
    }
  }, [discordSdk, isEmbedded, fetchEntitlements]);

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
        setState(prev => ({
          ...prev,
          hasShockPastLimit: data.hasShockPastLimit || prev.hasShockPastLimit,
          hasControllerPlus: data.hasControllerPlus || prev.hasControllerPlus,
          subscriptionExpiresAt: data.subscriptionExpiresAt || prev.subscriptionExpiresAt
        }));
      }
    } catch (error) {
      console.error('Failed to fetch backend SKU status:', error);
    }
  }, [auth]);

  // Initial load
  useEffect(() => {
    if (isEmbedded && discordSdk) {
      fetchSkus();
      fetchEntitlements();
    } else {
      setState(prev => ({ ...prev, loading: false }));
    }
  }, [isEmbedded, discordSdk, fetchSkus, fetchEntitlements]);

  // Fetch backend status when auth is available
  useEffect(() => {
    if (auth?.user?.id) {
      fetchBackendSkuStatus();
    }
  }, [auth, fetchBackendSkuStatus]);

  // Refresh entitlements periodically (every 5 minutes)
  useEffect(() => {
    if (!isEmbedded || !discordSdk) return;

    const interval = setInterval(() => {
      fetchEntitlements();
      fetchBackendSkuStatus();
    }, 300000); // 5 minutes

    return () => clearInterval(interval);
  }, [isEmbedded, discordSdk, fetchEntitlements, fetchBackendSkuStatus]);

  return {
    ...state,
    refreshEntitlements: fetchEntitlements,
    purchaseSku: startPurchase,
    consumeEntitlement,
    shockPastLimitSku: state.skus.find(s => s.id === SHOCK_PAST_LIMIT_SKU_ID),
    controllerPlusSku: state.skus.find(s => s.id === CONTROLLER_PLUS_SKU_ID),
  };
}

