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
  onManageControllerPlusSubscription: () => void;
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
  onManageControllerPlusSubscription,
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
  const consumableButtonLabel = useMemo(() => {
    if (agreeingTerms) return 'Saving agreement...';
    if (loading || warningAcksLoading) return 'Checking inventory...';
    return `Buy Shock Past User Limit${shockPastLimitPriceLabel ? ` (${shockPastLimitPriceLabel})` : ''} - ${overlimitConsumableCount} owned`;
  }, [agreeingTerms, loading, warningAcksLoading, overlimitConsumableCount, shockPastLimitPriceLabel]);

  const controllerPlusButtonLabel = useMemo(() => {
    if (loading) return 'Loading...';
    return controllerPlusPriceLabel ? `Buy Controller+ (${controllerPlusPriceLabel}/month)` : 'Buy Controller+';
  }, [loading, controllerPlusPriceLabel]);

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

    await Promise.resolve();
    onPurchaseConsumable();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-gray-900 rounded-2xl border border-white/20 max-w-3xl w-full max-h-[90vh] flex flex-col">
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

        <div className="p-5 overflow-y-auto flex-1 min-h-0">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
          <div className="p-4 bg-gradient-to-br from-indigo-900/35 to-indigo-700/15 border border-indigo-400/40 rounded-xl">
            <div className="space-y-4">
              <div>
                <p className="text-base text-indigo-100 font-semibold flex items-center gap-2">
                  <Sparkles className="h-4 w-4" />
                  Control Multiple Devices Simultaneously (Controller+)
                </p>
                <p className="text-sm text-indigo-100 mt-1">
                  Upgrade to Controller+ to send commands to multiple PiShock devices at once, enabling coordinated experiences across your entire group.
                </p>
              </div>

              <p className={`text-xs ${
                loading
                  ? 'text-gray-200'
                  : hasControllerPlus
                    ? 'text-emerald-200'
                    : 'text-gray-200'
              }`}>
                Status: {loading ? 'Checking...' : hasControllerPlus ? 'Active' : 'Not active'}
              </p>

              <div>
                <p className="text-xs uppercase tracking-wide text-indigo-200/80 mb-2">Benefits</p>
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
                  className="w-full px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-600 rounded-lg text-sm font-medium flex items-center justify-center gap-2 transition-colors"
                >
                  <ShoppingCart className="h-4 w-4" />
                  {controllerPlusButtonLabel}
                </button>
              )}

              <button
                onClick={onManageControllerPlusSubscription}
                className="w-full px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg text-sm font-medium transition-colors"
              >
                Manage / Cancel Subscription
              </button>

              <p className="text-xs text-indigo-100/80">
                Subscription SKUs are automatically charged each month unless cancelled. To cancel, open Discord User Settings and go to Billing/Subscriptions.
              </p>
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

              <p className="text-xs text-purple-200">
                Status: {loading || warningAcksLoading ? 'Checking...' : hasOverlimitConsumable ? 'Available' : 'Not available'}
              </p>

              <div className="space-y-2 text-sm text-purple-100">
                <p><span className="font-semibold">Use case:</span> Helps groups continue intense scenes without changing each user's permanent safety cap.</p>
                <p><span className="font-semibold">Fairness:</span> One purchase grants one consumable unit that is spent only when an over-limit command is successfully consumed.</p>
                <p><span className="font-semibold">Control:</span> Overrides only work for users who enabled over-limit opt-in; all other protections still apply.</p>
              </div>

              <div>
                <button
                  onClick={handleConsumablePurchase}
                  disabled={!canBuyConsumable || agreeingTerms}
                  className="w-full px-4 py-2 bg-purple-600 hover:bg-purple-700 disabled:bg-gray-600 rounded-lg text-sm font-medium flex items-center justify-center gap-2 transition-colors"
                >
                  <ShoppingCart className="h-4 w-4" />
                  {consumableButtonLabel}
                </button>
              </div>
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
