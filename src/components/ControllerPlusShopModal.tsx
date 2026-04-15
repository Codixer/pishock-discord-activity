import { useEffect, useMemo, useState } from 'react';
import { Crown, X, Loader, ShoppingCart, ShieldAlert, Sparkles, Zap } from 'lucide-react';

interface ControllerPlusShopModalProps {
  isOpen: boolean;
  onClose: () => void;
  loading: boolean;
  warningAcksLoading: boolean;
  hasSeenFirstOverlimitPurchaseWarning: boolean;
  hasControllerPlus: boolean;
  hasOverlimitConsumable: boolean;
  overlimitConsumableCount: number;
  onRefresh: () => void;
  onAcknowledgeOverlimitPurchaseWarning: () => Promise<boolean>;
  onPurchaseControllerPlus: () => void;
  onPurchaseConsumable: () => void;
  controllerPlusPriceLabel: string | null;
  shockPastLimitPriceLabel: string | null;
}

export function ControllerPlusShopModal({
  isOpen,
  onClose,
  loading,
  warningAcksLoading,
  hasSeenFirstOverlimitPurchaseWarning,
  hasControllerPlus,
  hasOverlimitConsumable,
  overlimitConsumableCount,
  onRefresh,
  onAcknowledgeOverlimitPurchaseWarning,
  onPurchaseControllerPlus,
  onPurchaseConsumable,
  controllerPlusPriceLabel,
  shockPastLimitPriceLabel,
}: ControllerPlusShopModalProps) {
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [agreeingTerms, setAgreeingTerms] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setTermsAccepted(false);
      setAgreeingTerms(false);
    }
  }, [isOpen]);

  const requiresOneTimeAgreement = !hasSeenFirstOverlimitPurchaseWarning;
  const canBuyConsumable = !loading && !warningAcksLoading && (!requiresOneTimeAgreement || termsAccepted);
  const controllerPlusPriceText = useMemo(() => {
    if (loading) return 'Price: Loading...';
    if (!controllerPlusPriceLabel) return 'Price: See Discord checkout';
    return `Price per month: ${controllerPlusPriceLabel}`;
  }, [loading, controllerPlusPriceLabel]);

  const shockPastLimitPriceText = useMemo(() => {
    if (loading) return 'Price: Loading...';
    if (!shockPastLimitPriceLabel) return 'Price: See Discord checkout';
    return `Price: ${shockPastLimitPriceLabel}`;
  }, [loading, shockPastLimitPriceLabel]);

  const consumableButtonLabel = useMemo(() => {
    if (agreeingTerms) return 'Saving agreement...';
    if (loading || warningAcksLoading) return 'Checking inventory...';
    return `Buy Shock Past User Limit (${overlimitConsumableCount} owned)`;
  }, [agreeingTerms, loading, warningAcksLoading, overlimitConsumableCount]);

  const handleConsumablePurchase = async () => {
    if (!canBuyConsumable) return;

    if (requiresOneTimeAgreement) {
      setAgreeingTerms(true);
      const ackSaved = await onAcknowledgeOverlimitPurchaseWarning();
      setAgreeingTerms(false);
      if (!ackSaved) {
        return;
      }
    }

    onPurchaseConsumable();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-gray-900 rounded-2xl border border-white/20 max-w-3xl w-full">
        <div className="flex items-center justify-between p-5 border-b border-white/10">
          <div className="flex items-center gap-2">
            <Crown className="h-5 w-5 text-indigo-300" />
            <h2 className="text-lg font-semibold text-white">Controller+ Shop</h2>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-800 rounded-lg transition-colors"
          >
            <X className="h-4 w-4 text-gray-300" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <div className="p-4 bg-gradient-to-br from-indigo-900/35 to-indigo-700/15 border border-indigo-400/40 rounded-xl">
            <div className="space-y-4">
              <div>
                <p className="text-base text-indigo-100 font-semibold flex items-center gap-2">
                  <Sparkles className="h-4 w-4" />
                  Subscription Name
                </p>
                <p className="text-sm text-white font-semibold mt-1">
                  Control Multiple Devices Simultaneously (Controller+)
                </p>
              </div>

              <div>
                <p className="text-xs uppercase tracking-wide text-indigo-200/80">Subscription Description</p>
                <p className="text-sm text-indigo-100 mt-1">
                  Upgrade to Controller+ to send commands to multiple PiShock devices at once, enabling coordinated experiences across your entire group.
                </p>
              </div>

              <div className="flex flex-wrap gap-2">
                <span className="px-2 py-1 rounded-full text-xs bg-indigo-500/20 border border-indigo-400/40 text-indigo-100">
                  {controllerPlusPriceText}
                </span>
                <span className={`px-2 py-1 rounded-full text-xs border ${
                  loading
                    ? 'bg-gray-700/40 border-gray-500 text-gray-200'
                    : hasControllerPlus
                      ? 'bg-emerald-700/30 border-emerald-500/60 text-emerald-100'
                      : 'bg-gray-700/40 border-gray-500 text-gray-200'
                }`}>
                  Status: {loading ? 'Checking...' : hasControllerPlus ? 'Active' : 'Not active'}
                </span>
              </div>

              <div className="rounded-lg border border-indigo-300/30 bg-indigo-900/30 p-3 space-y-1">
                <p className="text-xs text-indigo-200">135 / 1500</p>
                <p className="text-xs text-indigo-200">Price Per Month</p>
                <p className="text-base font-semibold text-white">{controllerPlusPriceLabel ?? '$9.99'} <span className="text-xs text-indigo-200">USD</span></p>
                <p className="text-xs text-indigo-100/90 pt-1">
                  Subscription SKUs are automatically charged each month unless cancelled. Changing the price of this SKU will only change it for new subscribers. Existing subscribers will continue to be charged the existing price.
                </p>
              </div>

              <div>
                <p className="text-xs uppercase tracking-wide text-indigo-200/80 mb-2">Benefits</p>
                <p className="text-xs text-indigo-100/90 mb-2">Explain what your customer will get when purchasing this SKU.</p>
                <div className="space-y-2 text-sm text-indigo-50">
                  <p>🫂 <span className="font-semibold">Multi-Target Control</span> - Send shock, vibrate, or beep commands to up to 10 participants simultaneously</p>
                  <p>👑 <span className="font-semibold">Be treated like a king</span> - Display your Controller+ badge and support ongoing development</p>
                  <p>🌩️ <span className="font-semibold">Advanced Controls</span> - Automatically respects each participant's individual safety limits</p>
                  <p>🛡️ <span className="font-semibold">Safety Features</span> - Enhanced logging and activity tracking for all multishock commands</p>
                </div>
              </div>

              {!hasControllerPlus && (
                <button
                  onClick={onPurchaseControllerPlus}
                  disabled={loading}
                  className="w-full sm:w-auto px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-600 rounded-lg text-sm font-medium flex items-center justify-center gap-2 transition-colors"
                >
                  <ShoppingCart className="h-4 w-4" />
                  Subscribe to Controller+
                </button>
              )}
            </div>
          </div>

          <div className="p-4 bg-gradient-to-br from-purple-900/35 to-fuchsia-700/15 border border-purple-400/40 rounded-xl">
            <div className="space-y-4">
              <div>
                <p className="text-base text-purple-100 font-semibold flex items-center gap-2">
                  <Zap className="h-4 w-4" />
                  Shock Past User Limit
                </p>
                <p className="text-xs text-purple-200 mt-1">
                  Single-use override for high-intensity sessions when a participant has explicitly opted in to allow over-limit commands.
                </p>
              </div>

              <div className="flex flex-wrap gap-2">
                <span className="px-2 py-1 rounded-full text-xs bg-purple-500/20 border border-purple-400/40 text-purple-100">
                  {shockPastLimitPriceText}
                </span>
                <span className="px-2 py-1 rounded-full text-xs bg-purple-500/20 border border-purple-400/40 text-purple-100">
                  Status: {loading || warningAcksLoading ? 'Checking...' : hasOverlimitConsumable ? 'Available' : 'Not available'}
                </span>
              </div>

              <div className="space-y-2 text-sm text-purple-100">
                <p><span className="font-semibold">Use case:</span> Helps groups continue intense scenes without changing each user's permanent safety cap.</p>
                <p><span className="font-semibold">Fairness:</span> One purchase grants one consumable unit that is spent only when an over-limit command is successfully consumed.</p>
                <p><span className="font-semibold">Control:</span> Overrides only work for users who enabled over-limit opt-in; all other protections still apply.</p>
              </div>

              <div>
                <button
                  onClick={handleConsumablePurchase}
                  disabled={!canBuyConsumable || agreeingTerms}
                  className="w-full sm:w-auto px-4 py-2 bg-purple-600 hover:bg-purple-700 disabled:bg-gray-600 rounded-lg text-sm font-medium flex items-center justify-center gap-2 transition-colors"
                >
                  <ShoppingCart className="h-4 w-4" />
                  {consumableButtonLabel}
                </button>
              </div>
            </div>
          </div>

          {requiresOneTimeAgreement && (
            <div className="p-4 bg-amber-900/20 border border-amber-500/40 rounded-xl space-y-3">
              <p className="text-sm text-amber-100 font-semibold flex items-center gap-2">
                <ShieldAlert className="h-4 w-4" />
                One-time agreement required before first consumable purchase
              </p>
              <div className="text-xs text-amber-200 space-y-1">
                <p>- Target users may disable bypass; purchase does not guarantee feature availability.</p>
                <p>- Command delivery is not guaranteed; device/API limits and online status still apply.</p>
                <p>- Consumable purchases go to the developer, not the shocked user.</p>
              </div>
              <label className="flex items-start gap-2 text-xs text-amber-100">
                <input
                  type="checkbox"
                  checked={termsAccepted}
                  onChange={(event) => setTermsAccepted(event.target.checked)}
                  className="mt-0.5 rounded border-amber-400/60 bg-transparent"
                  disabled={agreeingTerms || warningAcksLoading}
                />
                <span>I acknowledge and agree to these conditions.</span>
              </label>
            </div>
          )}

        </div>

        <div className="px-5 pb-5 flex items-center justify-between">
          <button
            onClick={onRefresh}
            disabled={loading}
            className="px-3 py-2 bg-gray-700 hover:bg-gray-600 rounded text-sm flex items-center gap-2 disabled:opacity-50"
          >
            {loading ? <Loader className="h-4 w-4 animate-spin" /> : null}
            Refresh status
          </button>
          <button
            onClick={onClose}
            className="px-3 py-2 bg-indigo-600 hover:bg-indigo-700 rounded text-sm"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
