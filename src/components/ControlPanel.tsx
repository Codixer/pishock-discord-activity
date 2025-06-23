import React, { useState } from 'react';
import { Zap, Play, Volume2, AlertTriangle, Target, Loader } from 'lucide-react';
import type { UserSettings } from '../types/pishock';

interface ControlPanelProps {
  userSettings: UserSettings;
  selectedTarget: any;
  auth: any;
  onOperationComplete: () => void;
}

export function ControlPanel({ 
  userSettings, 
  selectedTarget, 
  auth, 
  onOperationComplete 
}: ControlPanelProps) {
  const [intensity, setIntensity] = useState(1);
  const [duration, setDuration] = useState(1);
  const [selectedShareCode, setSelectedShareCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Get all available share codes from shared shockers
  const availableShares = React.useMemo(() => {
    const shares: Array<{ code: string; name: string; owner: string }> = [];
    
    Object.entries(userSettings.sharedShockers || {}).forEach(([owner, shockers]) => {
      shockers.forEach(shocker => {
        shares.push({
          code: shocker.shareCode,
          name: shocker.shockerName,
          owner,
        });
      });
    });

    return shares;
  }, [userSettings.sharedShockers]);

  const executeOperation = async (operation: number) => {
    if (!selectedTarget) {
      setError('Please select a target participant');
      return;
    }

    if (!selectedShareCode) {
      setError('Please select a share code');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const response = await fetch(`/api/users/${selectedTarget.id}/pishock/operate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${auth.access_token}`,
        },
        body: JSON.stringify({
          shareCode: selectedShareCode,
          operation,
          intensity,
          duration,
          executorId: auth.user.id,
          executorName: auth.user.displayName,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Operation failed');
      }

      onOperationComplete();
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Operation failed');
    } finally {
      setLoading(false);
    }
  };

  const getOperationColor = (operation: number) => {
    switch (operation) {
      case 0: return 'from-red-600 to-red-700 hover:from-red-700 hover:to-red-800';
      case 1: return 'from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800';
      case 2: return 'from-green-600 to-green-700 hover:from-green-700 hover:to-green-800';
      default: return 'from-gray-600 to-gray-700';
    }
  };

  const getOperationIcon = (operation: number) => {
    switch (operation) {
      case 0: return <Zap className="w-5 h-5" />;
      case 1: return <Play className="w-5 h-5" />;
      case 2: return <Volume2 className="w-5 h-5" />;
      default: return null;
    }
  };

  return (
    <div className="bg-black/20 backdrop-blur-md rounded-2xl border border-white/10 p-8">
      <div className="flex items-center space-x-3 mb-6">
        <div className="w-10 h-10 bg-gradient-to-r from-purple-500 to-pink-600 rounded-lg flex items-center justify-center">
          <Target className="w-6 h-6 text-white" />
        </div>
        <div>
          <h2 className="text-2xl font-bold">Control Panel</h2>
          <p className="text-gray-300">Send commands to connected devices</p>
        </div>
      </div>

      {!selectedTarget && (
        <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-lg p-4 mb-6">
          <div className="flex items-center space-x-2">
            <AlertTriangle className="w-5 h-5 text-yellow-400" />
            <p className="text-yellow-300">Select a participant to send commands</p>
          </div>
        </div>
      )}

      {selectedTarget && (
        <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-4 mb-6">
          <div className="flex items-center space-x-3">
            <img
              src={selectedTarget.avatar || `https://cdn.discordapp.com/embed/avatars/0.png`}
              alt={selectedTarget.displayName}
              className="w-8 h-8 rounded-full"
            />
            <div>
              <p className="font-medium text-blue-300">Target: {selectedTarget.displayName}</p>
              <p className="text-xs text-blue-400">Commands will be sent to their devices</p>
            </div>
          </div>
        </div>
      )}

      <div className="space-y-6">
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-2">
            Share Code
          </label>
          <select
            value={selectedShareCode}
            onChange={(e) => setSelectedShareCode(e.target.value)}
            className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all"
          >
            <option value="">Select a share code...</option>
            {availableShares.map((share) => (
              <option key={share.code} value={share.code}>
                {share.name} ({share.owner})
              </option>
            ))}
          </select>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Intensity ({intensity}%)
            </label>
            <input
              type="range"
              min="1"
              max={userSettings.maxIntensity}
              value={intensity}
              onChange={(e) => setIntensity(parseInt(e.target.value))}
              className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer slider"
            />
            <div className="flex justify-between text-xs text-gray-400 mt-1">
              <span>1%</span>
              <span>{userSettings.maxIntensity}%</span>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Duration ({duration}s)
            </label>
            <input
              type="range"
              min="1"
              max={userSettings.maxDuration}
              value={duration}
              onChange={(e) => setDuration(parseInt(e.target.value))}
              className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer slider"
            />
            <div className="flex justify-between text-xs text-gray-400 mt-1">
              <span>1s</span>
              <span>{userSettings.maxDuration}s</span>
            </div>
          </div>
        </div>

        {error && (
          <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-4">
            <div className="flex items-center space-x-2">
              <AlertTriangle className="w-5 h-5 text-red-400" />
              <p className="text-red-300">{error}</p>
            </div>
          </div>
        )}

        <div className="grid grid-cols-3 gap-4">
          {[
            { operation: 0, name: 'Shock', icon: Zap },
            { operation: 1, name: 'Vibrate', icon: Play },
            { operation: 2, name: 'Beep', icon: Volume2 },
          ].map(({ operation, name, icon: Icon }) => (
            <button
              key={operation}
              onClick={() => executeOperation(operation)}
              disabled={loading || !selectedTarget || !selectedShareCode}
              className={`bg-gradient-to-r ${getOperationColor(operation)} disabled:from-gray-600 disabled:to-gray-700 disabled:cursor-not-allowed text-white font-semibold py-4 px-6 rounded-lg transition-all duration-200 flex flex-col items-center space-y-2`}
            >
              {loading ? (
                <Loader className="w-5 h-5 animate-spin" />
              ) : (
                <Icon className="w-5 h-5" />
              )}
              <span className="text-sm">{name}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}