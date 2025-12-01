import React, { useState } from 'react';
import { X, Crown, Sparkles, ShoppingCart, Check } from 'lucide-react';
import { DiscordSDK } from '@discord/embedded-app-sdk';
import { useMonetization } from '../hooks/useMonetization';

interface StoreModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser: any;
  auth: any;
  discordSdk: DiscordSDK;
  isEmbedded: boolean;
}

export function StoreModal({ 
  isOpen, 
  onClose, 
  currentUser, 
  auth, 
  discordSdk, 
  isEmbedded 
}: StoreModalProps) {
  const monetization = useMonetization(discordSdk, isEmbedded, auth);
  const [purchasing, setPurchasing] = useState<string | null>(null);

  if (!isOpen) return null;

  const handlePurchase = async (skuId: string) => {
    if (!monetization.purchaseSku) return;
    
    setPurchasing(skuId);
    try {
      const success = await monetization.purchaseSku(skuId);
      if (success) {
        // Purchase initiated - Discord SDK will handle the flow
        setTimeout(() => {
          setPurchasing(null);
        }, 2000);
      } else {
        setPurchasing(null);
      }
    } catch (error) {
      console.error('Purchase failed:', error);
      setPurchasing(null);
    }
  };

  const controllerPlusSku = monetization.controllerPlusSku;
  const shockPastLimitSku = monetization.shockPastLimitSku;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-gray-900 border border-gray-700 rounded-xl shadow-2xl max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-gray-900 border-b border-gray-700 px-6 py-4 flex items-center justify-between">
          <h2 className="text-2xl font-bold text-white flex items-center space-x-2">
            <ShoppingCart className="h-6 w-6 text-purple-400" />
            <span>Store</span>
          </h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white transition-colors"
          >
            <X className="h-6 w-6" />
          </button>
        </div>

        <div className="p-6 space-y-6">
          {/* Controller+ Subscription */}
          <div className="bg-gradient-to-br from-yellow-900/20 to-yellow-800/10 border border-yellow-500/30 rounded-lg p-6">
            <div className="flex items-start justify-between mb-4">
              <div className="flex items-center space-x-3">
                <div className="w-12 h-12 bg-yellow-600/20 rounded-lg flex items-center justify-center">
                  <Crown className="h-6 w-6 text-yellow-400" />
                </div>
                <div>
                  <h3 className="text-xl font-bold text-white flex items-center space-x-2">
                    <span>Controller+</span>
                    {monetization.hasControllerPlus && (
                      <span className="text-xs bg-green-600/20 text-green-400 px-2 py-1 rounded flex items-center space-x-1">
                        <Check className="h-3 w-3" />
                        <span>Active</span>
                      </span>
                    )}
                  </h3>
                  <p className="text-sm text-gray-400 mt-1">Premium Subscription</p>
                </div>
              </div>
            </div>
            
            <div className="space-y-3 mb-4">
              <div className="flex items-center space-x-2 text-sm text-gray-300">
                <Check className="h-4 w-4 text-green-400" />
                <span>Send commands to up to 10 participants simultaneously</span>
              </div>
              <div className="flex items-center space-x-2 text-sm text-gray-300">
                <Check className="h-4 w-4 text-green-400" />
                <span>Display Controller+ badge</span>
              </div>
              <div className="flex items-center space-x-2 text-sm text-gray-300">
                <Check className="h-4 w-4 text-green-400" />
                <span>Automatically respects individual safety limits</span>
              </div>
              <div className="flex items-center space-x-2 text-sm text-gray-300">
                <Check className="h-4 w-4 text-green-400" />
                <span>Enhanced logging and activity tracking</span>
              </div>
            </div>

            {controllerPlusSku && (
              <button
                onClick={() => handlePurchase(controllerPlusSku.id)}
                disabled={monetization.hasControllerPlus || purchasing === controllerPlusSku.id}
                className={`w-full py-3 px-4 rounded-lg font-semibold transition-all flex items-center justify-center space-x-2 ${
                  monetization.hasControllerPlus
                    ? 'bg-gray-700 text-gray-400 cursor-not-allowed'
                    : purchasing === controllerPlusSku.id
                    ? 'bg-yellow-600/50 text-yellow-200 cursor-wait'
                    : 'bg-yellow-600 hover:bg-yellow-700 text-white'
                }`}
              >
                {purchasing === controllerPlusSku.id ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                    <span>Processing...</span>
                  </>
                ) : monetization.hasControllerPlus ? (
                  <>
                    <Check className="h-5 w-5" />
                    <span>Already Owned</span>
                  </>
                ) : (
                  <>
                    <ShoppingCart className="h-5 w-5" />
                    <span>Purchase Controller+</span>
                  </>
                )}
              </button>
            )}
          </div>

          {/* Shock Past User Limit - Consumable */}
          <div className="bg-gradient-to-br from-purple-900/20 to-purple-800/10 border border-purple-500/30 rounded-lg p-6">
            <div className="flex items-start justify-between mb-4">
              <div className="flex items-center space-x-3">
                <div className="w-12 h-12 bg-purple-600/20 rounded-lg flex items-center justify-center">
                  <Sparkles className="h-6 w-6 text-purple-400" />
                </div>
                <div>
                  <h3 className="text-xl font-bold text-white">Shock Past User Limit</h3>
                  <p className="text-sm text-gray-400 mt-1">Consumable Item</p>
                </div>
              </div>
            </div>
            
            <div className="space-y-3 mb-4">
              <div className="flex items-center space-x-2 text-sm text-gray-300">
                <Check className="h-4 w-4 text-green-400" />
                <span>Bypass target user's safety limits (requires 2-sided consent)</span>
              </div>
              <div className="flex items-center space-x-2 text-sm text-gray-300">
                <Check className="h-4 w-4 text-green-400" />
                <span>One consumable used per successful command</span>
              </div>
              <div className="flex items-center space-x-2 text-sm text-gray-300">
                <Check className="h-4 w-4 text-green-400" />
                <span>Only consumed if command succeeds</span>
              </div>
            </div>

            {monetization.consumableCount > 0 && (
              <div className="mb-4 p-3 bg-purple-600/20 border border-purple-500/30 rounded-lg">
                <p className="text-sm text-purple-300">
                  You have <span className="font-bold">{monetization.consumableCount}</span> consumable{monetization.consumableCount !== 1 ? 's' : ''} available
                </p>
              </div>
            )}

            {shockPastLimitSku && (
              <button
                onClick={() => handlePurchase(shockPastLimitSku.id)}
                disabled={purchasing === shockPastLimitSku.id}
                className={`w-full py-3 px-4 rounded-lg font-semibold transition-all flex items-center justify-center space-x-2 ${
                  purchasing === shockPastLimitSku.id
                    ? 'bg-purple-600/50 text-purple-200 cursor-wait'
                    : 'bg-purple-600 hover:bg-purple-700 text-white'
                }`}
              >
                {purchasing === shockPastLimitSku.id ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                    <span>Processing...</span>
                  </>
                ) : (
                  <>
                    <ShoppingCart className="h-5 w-5" />
                    <span>Purchase Consumable</span>
                  </>
                )}
              </button>
            )}
          </div>

          {monetization.loading && (
            <div className="text-center py-4">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-purple-400 mx-auto"></div>
              <p className="text-sm text-gray-400 mt-2">Loading store items...</p>
            </div>
          )}

          {monetization.error && (
            <div className="p-4 bg-red-900/20 border border-red-500/30 rounded-lg">
              <p className="text-sm text-red-300">{monetization.error}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

