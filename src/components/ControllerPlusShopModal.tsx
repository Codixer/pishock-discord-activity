import { Crown, X, Loader, ShoppingCart } from 'lucide-react';

interface ControllerPlusShopModalProps {
  isOpen: boolean;
  onClose: () => void;
  loading: boolean;
  hasControllerPlus: boolean;
  hasOverlimitConsumable: boolean;
  onRefresh: () => void;
  onPurchaseControllerPlus: () => void;
  onPurchaseConsumable: () => void;
}

export function ControllerPlusShopModal({
  isOpen,
  onClose,
  loading,
  hasControllerPlus,
  hasOverlimitConsumable,
  onRefresh,
  onPurchaseControllerPlus,
  onPurchaseConsumable,
}: ControllerPlusShopModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-gray-900 rounded-2xl border border-white/20 max-w-xl w-full">
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
          <div className="p-4 bg-indigo-900/20 border border-indigo-500/30 rounded-lg">
            <p className="text-sm text-indigo-100 font-medium">Controller+ subscription</p>
            <p className="text-xs text-indigo-200 mt-1">
              Required to enable multishock mode and execute multi-target commands.
            </p>
            <p className="text-xs text-indigo-200 mt-2">
              Status: {loading ? 'Checking...' : hasControllerPlus ? 'Active' : 'Not active'}
            </p>
            {!hasControllerPlus && !loading && (
              <button
                onClick={onPurchaseControllerPlus}
                className="mt-3 px-3 py-2 bg-indigo-600 hover:bg-indigo-700 rounded text-sm font-medium flex items-center gap-2"
              >
                <ShoppingCart className="h-4 w-4" />
                Buy Controller+
              </button>
            )}
          </div>

          <div className="p-4 bg-purple-900/20 border border-purple-500/30 rounded-lg">
            <p className="text-sm text-purple-100 font-medium">Over-limit consumable</p>
            <p className="text-xs text-purple-200 mt-1">
              Used for single-target over-limit commands when target has opt-in enabled.
            </p>
            <p className="text-xs text-purple-200 mt-2">
              Status: {loading ? 'Checking...' : hasOverlimitConsumable ? 'Available' : 'Not available'}
            </p>
            {!loading && (
              <button
                onClick={onPurchaseConsumable}
                className="mt-3 px-3 py-2 bg-purple-600 hover:bg-purple-700 rounded text-sm font-medium flex items-center gap-2"
              >
                <ShoppingCart className="h-4 w-4" />
                Buy Consumable
              </button>
            )}
          </div>
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
