import React from 'react';
import { Crown, ShoppingCart } from 'lucide-react';

interface ControllerPlusStoreProps {
  loading: boolean;
  hasControllerPlus: boolean;
  hasOverlimitConsumable: boolean;
  onPurchase: () => void;
  onRefresh: () => void;
}

export function ControllerPlusStore({
  loading,
  hasControllerPlus,
  hasOverlimitConsumable,
  onPurchase,
  onRefresh,
}: ControllerPlusStoreProps) {
  return (
    <div className="p-3 bg-indigo-900/20 border border-indigo-500/30 rounded-lg">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-indigo-200 flex items-center gap-2">
            <Crown className="h-4 w-4" />
            Controller+ (Multishock)
          </p>
          <p className="text-xs text-indigo-100 mt-1">
            {loading
              ? 'Checking entitlements...'
              : hasControllerPlus
                ? 'Active subscription'
                : 'Subscription required to enable multishock'}
          </p>
          <p className="text-xs text-indigo-100 mt-1">
            Over-limit consumable: {hasOverlimitConsumable ? 'available' : 'not available'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={onRefresh}
            className="px-2 py-1 bg-indigo-700 hover:bg-indigo-800 rounded text-xs"
          >
            Refresh
          </button>
          {!hasControllerPlus && !loading && (
            <button
              onClick={onPurchase}
              className="px-3 py-1 bg-indigo-600 hover:bg-indigo-700 rounded text-xs flex items-center gap-1"
            >
              <ShoppingCart className="h-3 w-3" />
              Buy
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
