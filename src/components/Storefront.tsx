import React, { useState, useEffect } from 'react';
import { ShoppingCart, Zap, Star, Crown, AlertTriangle, Loader, X } from 'lucide-react';
import { DiscordSDK, Events } from '@discord/embedded-app-sdk';

interface StorefrontProps {
  discordSdk: DiscordSDK;
  isEmbedded: boolean;
  auth: any;
  onClose: () => void;
  addNotification: (type: 'success' | 'error' | 'warning' | 'info', title: string, message: string) => void;
}

interface SKU {
  id: string;
  type: number;
  application_id: string;
  name: string;
  slug: string;
  flags: number;
  price: {
    amount: number;
    currency: string;
  };
}

// Known SKU IDs
const MULTI_SHOCK_SKU = '1387037988558606457';
const LIMIT_BYPASS_SKU = '1387033978053197984';

// Helper function to get the correct API base URL
function getApiBaseUrl(): string {
  const urlParams = new URLSearchParams(window.location.search);
  const isEmbedded = urlParams.has('frame_id');
  
  if (isEmbedded) {
    return '/.proxy/api';
  } else {
    return '/api';
  }
}

export function Storefront({ discordSdk, isEmbedded, auth, onClose, addNotification }: StorefrontProps) {
  const [skus, setSkus] = useState<SKU[]>([]);
  const [loading, setLoading] = useState(true);
  const [purchasing, setPurchasing] = useState<string | null>(null);
  const [entitlements, setEntitlements] = useState<any[]>([]);

  useEffect(() => {
    loadSkusAndEntitlements();
  }, []);

  useEffect(() => {
    if (isEmbedded && discordSdk) {
      // Subscribe to entitlement events
      const handleEntitlementCreate = (entitlement: any) => {
        console.log('STOREFRONT: New entitlement created:', entitlement);
        addNotification('success', 'Purchase Complete', 'Your purchase has been processed successfully!');
        loadSkusAndEntitlements(); // Refresh data
      };

      discordSdk.subscribe(Events.ENTITLEMENT_CREATE, handleEntitlementCreate);

      return () => {
        discordSdk.unsubscribe(Events.ENTITLEMENT_CREATE, handleEntitlementCreate);
      };
    }
  }, [isEmbedded, discordSdk, addNotification]);

  const loadSkusAndEntitlements = async () => {
    setLoading(true);
    try {
      if (isEmbedded && discordSdk) {
        // Load SKUs
        const skuData = await discordSdk.commands.getSkus();
        console.log('STOREFRONT: Loaded SKUs:', skuData);
        setSkus(skuData.skus || []);

        // Load entitlements
        const entitlementData = await discordSdk.commands.getEntitlements();
        console.log('STOREFRONT: Loaded entitlements:', entitlementData);
        setEntitlements(entitlementData.entitlements || []);
      } else {
        // Development mode - mock data
        const mockSkus = [
          {
            id: MULTI_SHOCK_SKU,
            type: 5, // Subscription
            application_id: 'mock_app_id',
            name: 'Multi-Shock Premium',
            slug: 'multi-shock-premium',
            flags: 0,
            price: { amount: 299, currency: 'USD' }
          },
          {
            id: LIMIT_BYPASS_SKU,
            type: 8, // Consumable
            application_id: 'mock_app_id',
            name: 'Limit Bypass Token',
            slug: 'limit-bypass-token',
            flags: 0,
            price: { amount: 99, currency: 'USD' }
          }
        ];
        setSkus(mockSkus);
        setEntitlements([]);
      }
    } catch (error) {
      console.error('STOREFRONT: Failed to load SKUs and entitlements:', error);
      addNotification('error', 'Load Failed', 'Failed to load store products');
    } finally {
      setLoading(false);
    }
  };

  const handlePurchase = async (sku: SKU) => {
    if (!isEmbedded) {
      addNotification('info', 'Development Mode', 'Purchases are not available in development mode');
      return;
    }

    setPurchasing(sku.id);
    try {
      console.log('STOREFRONT: Starting purchase for SKU:', sku.id);
      await discordSdk.commands.startPurchase({
        sku_id: sku.id,
      });
    } catch (error) {
      console.error('STOREFRONT: Purchase failed:', error);
      addNotification('error', 'Purchase Failed', 'Failed to start purchase flow');
    } finally {
      setPurchasing(null);
    }
  };

  const formatPrice = (price: { amount: number; currency: string }) => {
    try {
      // Use Discord's PriceUtils if available
      if (isEmbedded && (window as any).PriceUtils) {
        return (window as any).PriceUtils.formatPrice(price);
      }
      
      // Fallback formatting
      const amount = price.amount / 100; // Convert cents to dollars
      return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: price.currency,
      }).format(amount);
    } catch (error) {
      return `$${(price.amount / 100).toFixed(2)}`;
    }
  };

  const getSkuDescription = (sku: SKU) => {
    switch (sku.id) {
      case MULTI_SHOCK_SKU:
        return 'Send commands to multiple users simultaneously. Perfect for group activities and events.';
      case LIMIT_BYPASS_SKU:
        return 'Single-use token to exceed a user\'s safety limits (requires their consent).';
      default:
        return 'Premium feature for enhanced PiShock control.';
    }
  };

  const getSkuIcon = (sku: SKU) => {
    switch (sku.id) {
      case MULTI_SHOCK_SKU:
        return <Crown className="h-8 w-8 text-purple-400" />;
      case LIMIT_BYPASS_SKU:
        return <Zap className="h-8 w-8 text-yellow-400" />;
      default:
        return <Star className="h-8 w-8 text-blue-400" />;
    }
  };

  const hasEntitlement = (skuId: string) => {
    return entitlements.some(e => e.sku_id === skuId && !e.consumed);
  };

  const getEntitlementCount = (skuId: string) => {
    return entitlements.filter(e => e.sku_id === skuId && !e.consumed).length;
  };

  if (loading) {
    return (
      <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center">
        <div className="bg-gray-900 rounded-xl border border-white/10 p-8 max-w-md w-full mx-4">
          <div className="text-center">
            <Loader className="h-12 w-12 animate-spin text-purple-400 mx-auto mb-4" />
            <h3 className="text-xl font-semibold text-white mb-2">Loading Store</h3>
            <p className="text-gray-400">Fetching available products...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-gray-900 rounded-xl border border-white/10 max-w-4xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="p-6 border-b border-white/10">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className="p-2 bg-purple-500/20 rounded-lg">
                <ShoppingCart className="h-6 w-6 text-purple-400" />
              </div>
              <div>
                <h2 className="text-2xl font-bold text-white">Premium Store</h2>
                <p className="text-gray-400">Enhance your PiShock experience</p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-2 hover:bg-gray-800 rounded-lg transition-colors"
            >
              <X className="h-6 w-6 text-gray-400" />
            </button>
          </div>
        </div>

        {/* Safety Notice */}
        <div className="p-6 bg-red-900/20 border-b border-red-500/30">
          <div className="flex items-start space-x-3">
            <AlertTriangle className="h-5 w-5 text-red-400 flex-shrink-0 mt-0.5" />
            <div className="text-sm text-red-200">
              <p className="font-semibold mb-1">Safety Reminder</p>
              <p>Premium features must still be used responsibly with explicit consent from all participants. Enhanced capabilities do not override safety protocols.</p>
            </div>
          </div>
        </div>

        {/* Products Grid */}
        <div className="p-6">
          {skus.length === 0 ? (
            <div className="text-center py-12 text-gray-400">
              <ShoppingCart className="h-16 w-16 mx-auto mb-4 opacity-50" />
              <p className="text-lg mb-2">No products available</p>
              <p className="text-sm">Premium features are not currently available</p>
            </div>
          ) : (
            <div className="grid gap-6 md:grid-cols-2">
              {skus.map((sku) => {
                const owned = hasEntitlement(sku.id);
                const count = getEntitlementCount(sku.id);
                const isPurchasing = purchasing === sku.id;
                
                return (
                  <div
                    key={sku.id}
                    className={`p-6 rounded-xl border transition-all ${
                      owned 
                        ? 'bg-green-900/20 border-green-500/30' 
                        : 'bg-gray-800/50 border-gray-600/50 hover:border-gray-500/50'
                    }`}
                  >
                    <div className="flex items-start space-x-4">
                      <div className="flex-shrink-0">
                        {getSkuIcon(sku)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between mb-2">
                          <h3 className="text-lg font-semibold text-white">{sku.name}</h3>
                          {owned && (
                            <div className="flex items-center space-x-1 text-green-400 text-sm">
                              <span>✓ Owned</span>
                              {count > 1 && <span>({count})</span>}
                            </div>
                          )}
                        </div>
                        <p className="text-gray-300 text-sm mb-4">
                          {getSkuDescription(sku)}
                        </p>
                        <div className="flex items-center justify-between">
                          <div className="text-2xl font-bold text-white">
                            {formatPrice(sku.price)}
                            {sku.type === 5 && <span className="text-sm text-gray-400 ml-1">/month</span>}
                            {sku.type === 8 && <span className="text-sm text-gray-400 ml-1">each</span>}
                          </div>
                          <button
                            onClick={() => handlePurchase(sku)}
                            disabled={isPurchasing}
                            className={`px-4 py-2 rounded-lg font-semibold transition-all ${
                              isPurchasing
                                ? 'bg-gray-600 text-gray-400 cursor-not-allowed'
                                : sku.type === 8 || !owned
                                ? 'bg-purple-600 hover:bg-purple-700 text-white'
                                : 'bg-gray-600 text-gray-400 cursor-not-allowed'
                            }`}
                          >
                            {isPurchasing ? (
                              <div className="flex items-center space-x-2">
                                <Loader className="h-4 w-4 animate-spin" />
                                <span>Processing...</span>
                              </div>
                            ) : sku.type === 8 ? (
                              'Purchase'
                            ) : owned ? (
                              'Subscribed'
                            ) : (
                              'Subscribe'
                            )}
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-white/10 text-center text-gray-400 text-sm">
          <p>All purchases are processed securely through Discord. Refunds subject to Discord's terms.</p>
        </div>
      </div>
    </div>
  );
}