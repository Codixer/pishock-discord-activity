import React, { useState, useEffect } from 'react';
import { X, Crown, Zap, Users, Star, Shield } from 'lucide-react';
import { DiscordSDK } from '@discord/embedded-app-sdk';

interface ControllerPlusPurchaseModalProps {
  isOpen: boolean;
  onClose: () => void;
  onPurchase: (skuId: string) => void;
  discordSdk?: DiscordSDK;
  isEmbedded?: boolean;
}

export function ControllerPlusPurchaseModal({ 
  isOpen, 
  onClose, 
  onPurchase,
  discordSdk,
  isEmbedded = false
}: ControllerPlusPurchaseModalProps) {
  const [skus, setSkus] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [purchasing, setPurchasing] = useState(false);
  
  const controllerPlusSkuId = import.meta.env.VITE_CONTROLLER_PLUS_SKU_ID;
  
  // Load SKUs when modal opens
  useEffect(() => {
    if (isOpen && isEmbedded && discordSdk && controllerPlusSkuId) {
      loadSkus();
    }
  }, [isOpen, isEmbedded, discordSdk, controllerPlusSkuId]);
  
  const loadSkus = async () => {
    if (!discordSdk) return;
    
    setLoading(true);
    try {
      console.log('PURCHASE: Loading SKUs from Discord...');
      const response = await discordSdk.commands.getSkus();
      console.log('PURCHASE: Loaded SKUs:', response.skus);
      setSkus(response.skus);
    } catch (error) {
      console.error('PURCHASE: Failed to load SKUs:', error);
    } finally {
      setLoading(false);
    }
  };
  
  const handlePurchase = async () => {
    if (!controllerPlusSkuId) {
      console.warn('PURCHASE: No SKU ID configured');
      onPurchase('');
      return;
    }
    
    if (!isEmbedded || !discordSdk) {
      console.warn('PURCHASE: Not in Discord environment, showing placeholder');
      onPurchase('');
      return;
    }
    
    setPurchasing(true);
    try {
      console.log('PURCHASE: Starting purchase for SKU:', controllerPlusSkuId);
      await discordSdk.commands.startPurchase({ sku_id: controllerPlusSkuId });
      console.log('PURCHASE: Purchase flow initiated');
      onPurchase(controllerPlusSkuId);
    } catch (error) {
      console.error('PURCHASE: Failed to start purchase:', error);
      onPurchase('');
    } finally {
      setPurchasing(false);
    }
  };
  
  // Find the Controller+ SKU
  const controllerPlusSku = skus.find(sku => 
    sku.id === controllerPlusSkuId || 
    sku.name?.toLowerCase().includes('controller') ||
    sku.name?.toLowerCase().includes('multishock')
  );
  
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-gradient-to-br from-purple-900/90 via-blue-900/90 to-indigo-900/90 backdrop-blur-sm rounded-2xl border border-purple-500/30 max-w-2xl w-full shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-purple-500/20">
          <div className="flex items-center space-x-3">
            <div className="p-2 bg-gradient-to-br from-yellow-400 to-orange-500 rounded-lg">
              <Crown className="h-6 w-6 text-white" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-white">Controller+</h2>
              <p className="text-purple-200 text-sm">Premium Multishock Features</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-white/10 rounded-lg transition-colors"
          >
            <X className="h-5 w-5 text-gray-400" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          {/* Hero Section */}
          <div className="text-center">
            <div className="inline-flex items-center space-x-2 px-4 py-2 bg-gradient-to-r from-yellow-500/20 to-orange-500/20 border border-yellow-500/30 rounded-full mb-4">
              <Crown className="h-4 w-4 text-yellow-400" />
              <span className="text-yellow-300 font-semibold text-sm">Premium Feature</span>
            </div>
            <h3 className="text-2xl font-bold text-white mb-2">
              Control Multiple Devices Simultaneously
            </h3>
            <p className="text-gray-300">
              Upgrade to Controller+ to send commands to multiple PiShock devices at once, 
              enabling coordinated experiences across your entire group.
            </p>
          </div>

          {/* Features */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="flex items-start space-x-3">
              <div className="p-2 bg-blue-500/20 rounded-lg flex-shrink-0">
                <Users className="h-5 w-5 text-blue-400" />
              </div>
              <div>
                <h4 className="font-semibold text-white">Multi-Target Control</h4>
                <p className="text-gray-300 text-sm">
                  Send shock, vibrate, or beep commands to up to 10 participants simultaneously
                </p>
              </div>
            </div>

            <div className="flex items-start space-x-3">
              <div className="p-2 bg-purple-500/20 rounded-lg flex-shrink-0">
                <Zap className="h-5 w-5 text-purple-400" />
              </div>
              <div>
                <h4 className="font-semibold text-white">Advanced Controls</h4>
                <p className="text-gray-300 text-sm">
                  Automatically respects each participant's individual safety limits
                </p>
              </div>
            </div>

            <div className="flex items-start space-x-3">
              <div className="p-2 bg-green-500/20 rounded-lg flex-shrink-0">
                <Star className="h-5 w-5 text-green-400" />
              </div>
              <div>
                <h4 className="font-semibold text-white">Premium Status</h4>
                <p className="text-gray-300 text-sm">
                  Display your Controller+ badge and support ongoing development
                </p>
              </div>
            </div>

            <div className="flex items-start space-x-3">
              <div className="p-2 bg-yellow-500/20 rounded-lg flex-shrink-0">
                <Shield className="h-5 w-5 text-yellow-400" />
              </div>
              <div>
                <h4 className="font-semibold text-white">Safety Features</h4>
                <p className="text-gray-300 text-sm">
                  Enhanced logging and activity tracking for all multishock commands
                </p>
              </div>
            </div>
          </div>

          {/* Pricing */}
          <div className="bg-gradient-to-r from-purple-900/40 to-blue-900/40 border border-purple-500/30 rounded-xl p-6">
            <div className="text-center">
              {loading ? (
                <div className="flex items-center justify-center space-x-2">
                  <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-purple-400"></div>
                  <span className="text-purple-200">Loading pricing...</span>
                </div>
              ) : controllerPlusSku?.price ? (
                <>
                  <div className="text-3xl font-bold text-white mb-1">
                    ${(controllerPlusSku.price.amount / 100).toFixed(2)}
                    {controllerPlusSku.type === 2 && <span className="text-lg text-gray-300 font-normal">/month</span>}
                  </div>
                  <p className="text-purple-200 text-sm">
                    {controllerPlusSku.type === 2 ? 'Cancel anytime • ' : ''}Instant activation
                  </p>
                </>
              ) : (
                <>
                  <div className="text-3xl font-bold text-white mb-1">
                    $4.99
                    <span className="text-lg text-gray-300 font-normal">/month</span>
                  </div>
                  <p className="text-purple-200 text-sm">Cancel anytime • Instant activation</p>
                </>
              )}
            </div>
          </div>

          {/* Safety Notice */}
          <div className="bg-yellow-900/20 border border-yellow-500/30 rounded-lg p-3">
            <div className="flex items-center space-x-2 text-yellow-300 text-sm">
              <Shield className="h-4 w-4 flex-shrink-0" />
              <p>
                All multishock commands are logged publicly for safety and accountability. 
                Always ensure explicit consent from all participants.
              </p>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between p-6 border-t border-purple-500/20">
          <div className="flex items-center space-x-4 w-full">
            <button
              onClick={onClose}
              className="flex-1 px-4 py-3 bg-gray-700 hover:bg-gray-600 rounded-lg font-medium transition-colors"
            >
              Maybe Later
            </button>
            <button
              onClick={handlePurchase}
              disabled={purchasing}
              className="flex-1 px-6 py-3 bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 disabled:from-gray-600 disabled:to-gray-700 disabled:cursor-not-allowed rounded-lg font-semibold flex items-center justify-center space-x-2 transition-all shadow-lg"
            >
              {purchasing ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                  <span>Processing...</span>
                </>
              ) : (
                <>
                  <Crown className="h-5 w-5" />
                  <span>Get Controller+</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}