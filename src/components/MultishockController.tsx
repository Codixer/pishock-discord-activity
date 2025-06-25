import React from 'react';
import { Users, Crown, Zap, AlertTriangle, Lock } from 'lucide-react';

interface MultishockControllerProps {
  selectedUsers: any[];
  hasControllerPlus: boolean;
  isRateLimited?: boolean;
  effectiveLimits: { maxIntensity: number; maxDuration: number };
  isExecuting: boolean;
  onMultishock: (operation: number) => void;
  onUpgradePrompt?: () => boolean;
}

export function MultishockController({ 
  selectedUsers, 
  hasControllerPlus, 
  isRateLimited = false,
  effectiveLimits,
  isExecuting,
  onMultishock,
  onUpgradePrompt
}: MultishockControllerProps) {
  const getDisplayName = (user: any) => {
    return user?.guildDisplayName || user?.displayName || user?.global_name || user?.username || 'Unknown User';
  };

  const handleActionClick = (operation: number) => {
    if (!hasControllerPlus && onUpgradePrompt) {
      const promptShown = onUpgradePrompt();
      if (promptShown) return; // Don't proceed if upgrade prompt was shown
    }
    
    if (hasControllerPlus) {
      onMultishock(operation);
    }
  };
  if (!hasControllerPlus) {
    return (
      <div className="bg-yellow-900/20 border border-yellow-500/30 rounded-xl p-6 text-center relative">
        {isRateLimited && (
          <div className="absolute top-2 right-2 bg-orange-500/20 border border-orange-500/30 rounded px-2 py-1">
            <span className="text-xs text-orange-300">Rate Limited</span>
          </div>
        )}
        <div className="w-12 h-12 mx-auto bg-yellow-500/20 rounded-full flex items-center justify-center mb-4">
          <Crown className="h-6 w-6 text-yellow-400" />
        </div>
        <h3 className="text-lg font-semibold text-yellow-300 mb-2">Controller+ Required</h3>
        <p className="text-yellow-200 text-sm">
          Upgrade to Controller+ to send commands to multiple participants simultaneously.
        </p>
        <button
          onClick={() => onUpgradePrompt?.()}
          className="px-4 py-2 bg-yellow-600 hover:bg-yellow-700 disabled:bg-gray-600 disabled:cursor-not-allowed rounded-lg font-medium transition-colors"
          disabled={isRateLimited}
        >
          {isRateLimited ? 'Temporarily Unavailable' : 'Learn More & Upgrade'}
        </button>
      </div>
    );
  }

  return (
    <div className="bg-gradient-to-br from-purple-900/20 to-blue-900/20 border border-purple-500/30 rounded-xl p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-4 relative">
        {isRateLimited && (
          <div className="absolute top-0 right-0 bg-orange-500/20 border border-orange-500/30 rounded px-2 py-1">
            <span className="text-xs text-orange-300">Discord Rate Limited</span>
          </div>
        )}
        <div className="flex items-center space-x-3">
          <div className="p-2 bg-gradient-to-br from-yellow-400/20 to-orange-500/20 rounded-lg">
            <Crown className="h-5 w-5 text-yellow-400" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-white">Multishock Mode</h3>
            <p className="text-purple-200 text-sm">Controller+ Active</p>
          </div>
        </div>
        <div className="flex items-center space-x-2 px-3 py-1 bg-purple-600/20 border border-purple-500/30 rounded-full">
          <Users className="h-4 w-4 text-purple-400" />
          <span className="text-purple-300 text-sm font-medium">
            {selectedUsers.length} target{selectedUsers.length !== 1 ? 's' : ''}
          </span>
        </div>
      </div>

      {/* Selected Users */}
      {selectedUsers.length > 0 && (
        <div className="mb-4">
          <h4 className="text-sm font-medium text-gray-300 mb-2">Selected Targets:</h4>
          <div className="flex flex-wrap gap-2 max-h-24 overflow-y-auto">
            {selectedUsers.map((user) => (
              <div
                key={user.id}
                className="flex items-center space-x-2 px-3 py-1 bg-gray-800/50 border border-gray-600/50 rounded-lg"
              >
                <img
                  src={user.guildAvatarUrl || user.avatarUrl || `https://cdn.discordapp.com/embed/avatars/0.png`}
                  alt={`${getDisplayName(user)}'s avatar`}
                  className="w-4 h-4 rounded-full"
                  onError={(e) => {
                    const target = e.target as HTMLImageElement;
                    target.src = `https://cdn.discordapp.com/embed/avatars/0.png`;
                  }}
                />
                <span className="text-sm text-gray-300 truncate max-w-20">
                  {getDisplayName(user)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Effective Limits Warning */}
      {(effectiveLimits.maxIntensity < 100 || effectiveLimits.maxDuration < 15) && (
        <div className="mb-4 p-3 bg-yellow-900/20 border border-yellow-500/30 rounded-lg">
          <div className="flex items-start space-x-2">
            <Lock className="h-4 w-4 text-yellow-400 flex-shrink-0 mt-0.5" />
            <div className="text-xs text-yellow-200">
              <p className="font-semibold mb-1">Limited by Target Restrictions</p>
              <p>
                Commands are limited to {effectiveLimits.maxIntensity}% intensity 
                and {effectiveLimits.maxDuration}s duration to respect the most 
                restrictive participant's safety settings.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Action Buttons */}
      <div className="grid grid-cols-3 gap-3">
        <button
          onClick={() => handleActionClick(0)}
          disabled={isExecuting || selectedUsers.length === 0}
          className="bg-gradient-to-r from-red-600 to-red-700 hover:from-red-700 hover:to-red-800 disabled:from-gray-600 disabled:to-gray-700 disabled:cursor-not-allowed text-white py-3 px-4 rounded-lg font-semibold flex flex-col items-center space-y-1 transition-all"
        >
          <Zap className="h-5 w-5" />
          <span className="text-sm">Shock All</span>
        </button>

        <button
          onClick={() => handleActionClick(1)}
          disabled={isExecuting || selectedUsers.length === 0}
          className="bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 disabled:from-gray-600 disabled:to-gray-700 disabled:cursor-not-allowed text-white py-3 px-4 rounded-lg font-semibold flex flex-col items-center space-y-1 transition-all"
        >
          <Users className="h-5 w-5" />
          <span className="text-sm">Vibrate All</span>
        </button>

        <button
          onClick={() => handleActionClick(2)}
          disabled={isExecuting || selectedUsers.length === 0}
          className="bg-gradient-to-r from-green-600 to-green-700 hover:from-green-700 hover:to-green-800 disabled:from-gray-600 disabled:to-gray-700 disabled:cursor-not-allowed text-white py-3 px-4 rounded-lg font-semibold flex flex-col items-center space-y-1 transition-all"
        >
          <AlertTriangle className="h-5 w-5" />
          <span className="text-sm">Beep All</span>
        </button>
      </div>

      {/* Execution Status */}
      {isExecuting && (
        <div className="mt-4 text-center">
          <div className="inline-flex items-center space-x-3 text-purple-400">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-purple-400"></div>
            <span>Executing multishock command...</span>
          </div>
        </div>
      )}

      {selectedUsers.length === 0 && !isExecuting && (
        <div className="mt-4 text-center text-gray-400 text-sm">
          Select multiple participants to enable multishock commands
        </div>
      )}
    </div>
  );
}