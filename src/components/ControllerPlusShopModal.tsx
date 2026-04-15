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
  const consumableStatusLabel = useMemo(() => {
    if (loading || warningAcksLoading) return 'Checking...';
    return hasOverlimitConsumable ? `Available (${overlimitConsumableCount})` : 'Not available';
  }, [loading, warningAcksLoading, hasOverlimitConsumable, overlimitConsumableCount]);

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
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-base text-indigo-100 font-semibold flex items-center gap-2">
                  <Sparkles className="h-4 w-4" />
                  Controller+
                </p>
                <p className="text-xs text-indigo-200 mt-1">
                  Unlock multishock mode and multi-target execution.
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <span className="px-2 py-1 rounded-full text-xs bg-indigo-500/20 border border-indigo-400/40 text-indigo-100">
                    Price: See Discord checkout
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
              </div>
              {!hasControllerPlus && (
                <div className="flex-shrink-0">
                  <button
                    onClick={onPurchaseControllerPlus}
                    disabled={loading}
                    className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-600 rounded-lg text-sm font-medium flex items-center gap-2 transition-colors"
                  >
                    <ShoppingCart className="h-4 w-4" />
                    Buy Controller+
                  </button>
                </div>
              )}
            </div>
          </div>

          <div className="p-4 bg-gradient-to-br from-purple-900/35 to-fuchsia-700/15 border border-purple-400/40 rounded-xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-base text-purple-100 font-semibold flex items-center gap-2">
                  <Zap className="h-4 w-4" />
                  Bypass Shock Consumable
                </p>
                <p className="text-xs text-purple-200 mt-1">
                  Spend one consumable to allow an over-limit command when the target has opt-in enabled.
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <span className="px-2 py-1 rounded-full text-xs bg-purple-500/20 border border-purple-400/40 text-purple-100">
                    Price: See Discord checkout
                  </span>
                  <span className="px-2 py-1 rounded-full text-xs bg-purple-500/20 border border-purple-400/40 text-purple-100">
                    Status: {consumableStatusLabel}
                  </span>
                </div>
              </div>
              <div className="flex-shrink-0">
                <button
                  onClick={handleConsumablePurchase}
                  disabled={!canBuyConsumable || agreeingTerms}
                  className="px-4 py-2 bg-purple-600 hover:bg-purple-700 disabled:bg-gray-600 rounded-lg text-sm font-medium flex items-center gap-2 transition-colors"
                >
                  <ShoppingCart className="h-4 w-4" />
                  {agreeingTerms ? 'Saving agreement...' : 'Buy Consumable'}
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

          {!loading && (
            <div className="p-3 bg-gray-800/60 border border-white/10 rounded-lg text-xs text-gray-300">
              Owned now: <span className="font-semibold text-white">{overlimitConsumableCount}</span> consumable{overlimitConsumableCount !== 1 ? 's' : ''}.
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
