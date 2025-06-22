import { useState, useEffect } from 'react';
import { Zap, User, Wifi, WifiOff, Clock, Target, RefreshCw } from 'lucide-react';

interface AvailableShocker {
  shockerId: string;
  ownerUserId: string;
  ownerUsername: string;
  ownerDisplayName: string;
  ownerAvatar?: string;
  deviceName: string;
  maxIntensity: number;
  maxDuration: number;
  isOnline: boolean;
  lastSeen?: string;
}

interface ShockerSelectorProps {
  selectedShockerId: string | null;
  onShockerSelect: (shockerId: string | null) => void;
  auth: any;
  addNotification: (type: 'success' | 'error' | 'warning' | 'info', title: string, message: string) => void;
  isCompactMode?: boolean;
}

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

export function ShockerSelector({ 
  selectedShockerId, 
  onShockerSelect, 
  auth, 
  addNotification,
  isCompactMode = false 
}: ShockerSelectorProps) {
  const [shockers, setShockers] = useState<AvailableShocker[]>([]);
  const [loading, setLoading] = useState(false);
  const [lastFetch, setLastFetch] = useState<number>(0);

  const fetchShockers = async (showLoadingIndicator = true) => {
    if (!auth) return;

    if (showLoadingIndicator) setLoading(true);
    try {
      const response = await fetch(`${getApiBaseUrl()}/available-shockers`, {
        headers: {
          'Authorization': `Bearer ${auth.access_token}`,
          'Cache-Control': 'no-cache',
        },
      });

      if (response.ok) {
        const result = await response.json();
        if (result.success) {
          setShockers(result.shockers || []);
          setLastFetch(Date.now());
          
          // If the currently selected shocker is no longer available, clear the selection
          if (selectedShockerId && !result.shockers.find((s: AvailableShocker) => s.shockerId === selectedShockerId)) {
            onShockerSelect(null);
            addNotification('warning', 'Shocker Unavailable', 'The selected shocker is no longer available');
          }
        } else {
          console.error('Failed to fetch shockers:', result.error);
          addNotification('error', 'Fetch Failed', result.error || 'Failed to fetch available shockers');
        }
      } else {
        throw new Error(`HTTP ${response.status}`);
      }
    } catch (error) {
      console.error('Error fetching shockers:', error);
      addNotification('error', 'Connection Error', 'Failed to fetch available shockers');
    } finally {
      if (showLoadingIndicator) setLoading(false);
    }
  };

  // Auto-refresh every 30 seconds
  useEffect(() => {
    fetchShockers();
    
    const interval = setInterval(() => {
      // Only auto-refresh if we haven't fetched recently (avoid spam)
      if (Date.now() - lastFetch > 25000) {
        fetchShockers(false); // Silent refresh
      }
    }, 30000);

    return () => clearInterval(interval);
  }, [auth]);

  const handleRefresh = () => {
    fetchShockers(true);
  };

  const selectedShocker = shockers.find(s => s.shockerId === selectedShockerId);
  const onlineShockers = shockers.filter(s => s.isOnline);
  const offlineShockers = shockers.filter(s => !s.isOnline);

  return (
    <div className="bg-black/20 backdrop-blur-sm rounded-xl border border-white/10 p-4">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center space-x-2">
          <Target className={`${isCompactMode ? 'h-4 w-4' : 'h-5 w-5'} text-orange-400`} />
          <h3 className={`${isCompactMode ? 'text-sm' : 'text-base'} font-semibold`}>
            {isCompactMode ? 'Shockers' : 'Available Shockers'}
          </h3>
        </div>
        <div className="flex items-center space-x-2">
          <span className="text-xs text-gray-400">({shockers.length})</span>
          <button
            onClick={handleRefresh}
            disabled={loading}
            className="p-1 text-gray-400 hover:text-white transition-colors disabled:opacity-50"
            title="Refresh"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Selected Shocker Display */}
      {selectedShocker && (
        <div className="mb-4 p-3 bg-orange-900/20 border border-orange-500/30 rounded-lg">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              {selectedShocker.ownerAvatar ? (
                <img
                  src={selectedShocker.ownerAvatar}
                  alt={`${selectedShocker.ownerDisplayName}'s avatar`}
                  className={`${isCompactMode ? 'w-5 h-5' : 'w-6 h-6'} rounded-full`}
                />
              ) : (
                <User className={`${isCompactMode ? 'h-5 w-5' : 'h-6 w-6'} text-gray-400`} />
              )}
              <div>
                <p className={`${isCompactMode ? 'text-xs' : 'text-sm'} font-medium text-orange-300`}>
                  {selectedShocker.deviceName}
                </p>
                <p className="text-xs text-gray-400">
                  Owner: {selectedShocker.ownerDisplayName}
                </p>
              </div>
            </div>
            <div className="flex items-center space-x-1">
              {selectedShocker.isOnline ? (
                <Wifi className="h-4 w-4 text-green-400" />
              ) : (
                <WifiOff className="h-4 w-4 text-red-400" />
              )}
              <button
                onClick={() => onShockerSelect(null)}
                className="text-xs text-gray-400 hover:text-white transition-colors"
              >
                Clear
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Shocker List */}
      <div className="space-y-2 max-h-64 overflow-y-auto">
        {loading && shockers.length === 0 ? (
          <div className="text-center py-6 text-gray-400">
            <RefreshCw className="h-8 w-8 mx-auto mb-2 animate-spin" />
            <p className="text-sm">Loading shockers...</p>
          </div>
        ) : shockers.length === 0 ? (
          <div className="text-center py-6 text-gray-400">
            <Zap className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p className="text-sm">No shockers available</p>
            <p className="text-xs mt-1">Users need to configure their devices</p>
          </div>
        ) : (
          <>
            {/* Online Shockers */}
            {onlineShockers.length > 0 && (
              <div>
                <h4 className="text-xs font-medium text-green-400 mb-2 flex items-center space-x-1">
                  <Wifi className="h-3 w-3" />
                  <span>Online ({onlineShockers.length})</span>
                </h4>
                {onlineShockers.map((shocker) => (
                  <button
                    key={shocker.shockerId}
                    onClick={() => onShockerSelect(
                      selectedShockerId === shocker.shockerId ? null : shocker.shockerId
                    )}
                    className={`w-full p-3 rounded-lg border transition-all text-left ${
                      selectedShockerId === shocker.shockerId
                        ? 'bg-orange-600/20 border-orange-500/50 ring-2 ring-orange-500/20'
                        : 'bg-gray-800/50 border-gray-600/50 hover:bg-gray-700/50 hover:border-gray-500/50'
                    }`}
                  >
                    <div className="flex items-center space-x-3">
                      {shocker.ownerAvatar ? (
                        <img
                          src={shocker.ownerAvatar}
                          alt={`${shocker.ownerDisplayName}'s avatar`}
                          className="w-6 h-6 rounded-full flex-shrink-0"
                        />
                      ) : (
                        <User className="h-6 w-6 text-gray-400 flex-shrink-0" />
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="font-medium text-white text-sm truncate">
                          {shocker.deviceName}
                        </p>
                        <p className="text-xs text-gray-400 truncate">
                          {shocker.ownerDisplayName}
                        </p>
                        <p className="text-xs text-green-400">
                          Limits: {shocker.maxIntensity}%/{shocker.maxDuration}s
                        </p>
                      </div>
                      <div className="flex items-center space-x-1 flex-shrink-0">
                        <Wifi className="h-4 w-4 text-green-400" />
                        {selectedShockerId === shocker.shockerId && (
                          <div className="w-2 h-2 bg-orange-400 rounded-full"></div>
                        )}
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )}

            {/* Offline Shockers */}
            {offlineShockers.length > 0 && (
              <div className={onlineShockers.length > 0 ? 'mt-4' : ''}>
                <h4 className="text-xs font-medium text-gray-400 mb-2 flex items-center space-x-1">
                  <WifiOff className="h-3 w-3" />
                  <span>Offline ({offlineShockers.length})</span>
                </h4>
                {offlineShockers.map((shocker) => (
                  <div
                    key={shocker.shockerId}
                    className="w-full p-3 rounded-lg border bg-gray-800/30 border-gray-600/30 opacity-50 text-left"
                  >
                    <div className="flex items-center space-x-3">
                      {shocker.ownerAvatar ? (
                        <img
                          src={shocker.ownerAvatar}
                          alt={`${shocker.ownerDisplayName}'s avatar`}
                          className="w-6 h-6 rounded-full flex-shrink-0"
                        />
                      ) : (
                        <User className="h-6 w-6 text-gray-400 flex-shrink-0" />
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="font-medium text-gray-300 text-sm truncate">
                          {shocker.deviceName}
                        </p>
                        <p className="text-xs text-gray-400 truncate">
                          {shocker.ownerDisplayName}
                        </p>
                        {shocker.lastSeen && (
                          <div className="flex items-center space-x-1 text-xs text-gray-500">
                            <Clock className="h-3 w-3" />
                            <span>Last seen: {new Date(shocker.lastSeen).toLocaleTimeString()}</span>
                          </div>
                        )}
                      </div>
                      <WifiOff className="h-4 w-4 text-red-400 flex-shrink-0" />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>

      {/* No Selection Warning */}
      {!selectedShockerId && shockers.length > 0 && (
        <div className="mt-4 p-2 bg-yellow-900/20 border border-yellow-500/30 rounded-lg">
          <p className="text-xs text-yellow-300">
            ⚠️ Select a shocker to send commands
          </p>
        </div>
      )}
    </div>
  );
}
