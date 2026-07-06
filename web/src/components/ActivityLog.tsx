import { useState, useEffect, useRef } from 'react';
import { Clock, Zap, Play, Square, Users, Eye, EyeOff, RefreshCw } from 'lucide-react';

interface ActivityLogEntry {
  id: string;
  timestamp: string;
  instanceId: string;
  executorUserId: string;
  executorUsername: string;
  executorAvatar?: string;
  targetUserId: string;
  targetUsername: string;
  targetAvatar?: string;
  action: 'shock' | 'vibrate' | 'beep';
  intensity: number;
  duration: number;
  guildId?: string;
  guildName?: string;
}

interface ActivityLogProps {
  instanceId: string;
  auth: any;
  addNotification: (type: 'success' | 'error' | 'warning' | 'info', title: string, message: string) => void;
  authFetch?: typeof fetch;
}

// Helper function to get the correct API base URL
function getApiBaseUrl(): string {
  const urlParams = new URLSearchParams(window.location.search);
  const isEmbedded = urlParams.has('frame_id');
  
  if (isEmbedded) {
    // Use Discord's proxy for embedded environment
    return '/.proxy/api';
  } else {
    // Use direct API calls for development
    return '/api';
  }
}

export function ActivityLog({ auth, addNotification, authFetch = fetch }: ActivityLogProps) {
  const [entries, setEntries] = useState<ActivityLogEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [isVisible, setIsVisible] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const autoDisableTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const logContainerRef = useRef<HTMLDivElement>(null);

  // Load initial activity log only when visible
  useEffect(() => {
    if (auth && isVisible && entries.length === 0) {
      loadActivityLog();
    }
  }, [auth, isVisible]);

  // Set up auto-refresh when enabled with 5-minute auto-disable
  useEffect(() => {
    if (autoRefresh && auth) {
      intervalRef.current = setInterval(() => {
        loadActivityLog(true);
      }, 120000); // Refresh every 120 seconds to minimize KV reads

      // Auto-disable after 3 minutes (180000ms)
      autoDisableTimeoutRef.current = setTimeout(() => {
        setAutoRefresh(false);
        addNotification('info', 'Auto-Refresh Disabled', 'Activity log auto-refresh has been automatically disabled after 3 minutes to reduce KV read operations.');
      }, 180000);

      return () => {
        if (intervalRef.current) {
          clearInterval(intervalRef.current);
        }
        if (autoDisableTimeoutRef.current) {
          clearTimeout(autoDisableTimeoutRef.current);
        }
      };
    }
  }, [autoRefresh, auth, addNotification]);

  const loadActivityLog = async (silent = false) => {
    if (!silent) setLoading(true);
    
    try {
      const response = await authFetch(`${getApiBaseUrl()}/activity-log`, {
        headers: {
          'Authorization': `Bearer ${auth.access_token}`,
        },
      });

      if (response.ok) {
        const data = await response.json();
        const previousCount = entries.length;
        setEntries(data.entries);
        setLastRefresh(new Date());

        if (silent && data.entries.length > previousCount) {
          setTimeout(() => {
            if (logContainerRef.current) {
              logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
            }
          }, 100);
        }
      } else {
        throw new Error('Failed to load activity log');
      }
    } catch {
      if (!silent) {
        addNotification('error', 'Load Failed', 'Failed to load activity log');
      }
    } finally {
      if (!silent) setLoading(false);
    }
  };

  const getActionIcon = (action: string) => {
    switch (action) {
      case 'shock':
        return <Zap className="h-4 w-4 text-red-400" />;
      case 'vibrate':
        return <Play className="h-4 w-4 text-blue-400" />;
      case 'beep':
        return <Square className="h-4 w-4 text-green-400" />;
      default:
        return <Zap className="h-4 w-4 text-gray-400" />;
    }
  };

  const getActionColor = (action: string) => {
    switch (action) {
      case 'shock':
        return 'text-red-400 bg-red-900/20 border-red-500/30';
      case 'vibrate':
        return 'text-blue-400 bg-blue-900/20 border-blue-500/30';
      case 'beep':
        return 'text-green-400 bg-green-900/20 border-green-500/30';
      default:
        return 'text-gray-400 bg-gray-900/20 border-gray-500/30';
    }
  };

  const formatTimestamp = (timestamp: string) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    
    return date.toLocaleDateString();
  };

  const getIntensityColor = (intensity: number) => {
    if (intensity <= 25) return 'text-green-400';
    if (intensity <= 50) return 'text-yellow-400';
    if (intensity <= 75) return 'text-orange-400';
    return 'text-red-400';
  };

  const getDefaultAvatarIndex = (userId: string) => {
    try {
      if (/^\d+$/.test(userId)) {
        return (BigInt(userId) >> 22n) % 6n;
      } else {
        let hash = 0;
        for (let i = 0; i < userId.length; i++) {
          hash = ((hash << 5) - hash + userId.charCodeAt(i)) & 0xffffffff;
        }
        return Math.abs(hash) % 6;
      }
    } catch {
      return 0;
    }
  };

  if (!isVisible) {
    return (
      <div className="ps-panel-shell rounded-md p-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <Clock className="h-4 w-4 text-cyan-300" />
            <h3 className="text-xs font-semibold uppercase tracking-[0.12em]">Activity Feed</h3>
            <span className="text-[10px] ps-muted-text">(Hidden)</span>
          </div>
          <button
            onClick={() => setIsVisible(true)}
            className="ps-btn-compact ps-btn-compact-primary text-[10px]"
          >
            <Eye className="h-4 w-4" />
            <span>Show Log</span>
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="ps-panel-shell rounded-md flex flex-col h-full">
      {/* Header */}
      <div className="p-3 pb-2 flex-shrink-0 border-b border-cyan-500/25">
        <div className="flex items-center space-x-3">
          <Clock className="h-4 w-4 text-cyan-300" />
          <div>
            <h3 className="text-xs sm:text-sm font-semibold uppercase tracking-[0.12em]">Activity Feed</h3>
            <span className="text-[10px] ps-muted-text">({entries.length} entries)</span>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-1.5 mt-2.5">
          <button
            onClick={() => setAutoRefresh(!autoRefresh)}
            className={`ps-btn-compact text-[10px] ${
              autoRefresh 
                ? 'border-emerald-500/55 text-emerald-200 bg-emerald-950/25' 
                : 'ps-btn-compact-ghost'
            }`}
            title={autoRefresh ? 'Auto-refresh enabled (auto-disables after 3min)' : 'Enable auto-refresh (2min intervals)'}
          >
            <RefreshCw className={`h-3 w-3 ${autoRefresh ? 'animate-spin' : ''}`} />
            <span>{autoRefresh ? 'Auto On (3min)' : 'Auto Off'}</span>
          </button>
          <button
            onClick={() => loadActivityLog()}
            disabled={loading}
            className="ps-btn-compact ps-btn-compact-primary text-[10px]"
          >
            Refresh Now
          </button>
          <button
            onClick={() => setIsVisible(false)}
            className="ps-btn-compact text-[10px]"
          >
            <EyeOff className="h-3 w-3" />
            <span>Hide Log</span>
          </button>
        </div>
      </div>

      <div className="text-[10px] ps-muted-text px-3 py-1.5 flex-shrink-0 border-b border-cyan-500/15 uppercase tracking-[0.09em]">
        Last updated: {lastRefresh.toLocaleTimeString()}
        {autoRefresh && <span className="ml-2 text-green-400">(Auto-refresh enabled)</span>}
      </div>

      <div className="flex-1 overflow-hidden px-2.5 py-2">
        {loading ? (
          <div className="flex items-center justify-center h-full">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-400"></div>
          </div>
        ) : entries.length === 0 ? (
          <div className="text-center py-8 text-gray-400 h-full flex flex-col justify-center">
            <Users className="h-12 w-12 mx-auto mb-3 opacity-50" />
            <p>No activity recorded yet</p>
            <p className="text-sm mt-1">Actions will appear here in real-time</p>
          </div>
        ) : (
          <div 
            ref={logContainerRef}
            className="h-full overflow-y-auto space-y-1.5 pr-1"
          >
            {entries.map((entry) => (
              <div
                key={entry.id}
                className={`p-2 rounded border transition-all ${getActionColor(entry.action)}`}
              >
                <div className="flex items-start space-x-3">
                  <div className="flex-shrink-0 mt-1">
                    {getActionIcon(entry.action)}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center space-x-1.5 mb-1.5">
                      <img
                        src={entry.executorAvatar || `https://cdn.discordapp.com/embed/avatars/${getDefaultAvatarIndex(entry.executorUserId)}.png`}
                        alt={`${entry.executorUsername}'s avatar`}
                        className="w-4 h-4 rounded-full flex-shrink-0"
                        onError={(e) => {
                          const target = e.target as HTMLImageElement;
                          target.src = `https://cdn.discordapp.com/embed/avatars/${getDefaultAvatarIndex(entry.executorUserId)}.png`;
                        }}
                      />
                      <span className="font-semibold text-xs truncate">
                        <span 
                          className="hover:bg-white/10 px-1 -mx-1 rounded transition-colors cursor-help"
                          title={entry.executorUsername}
                        >
                          {entry.executorUsername}
                        </span>
                      </span>
                      <span className="text-xs text-gray-400">→</span>
                      <img
                        src={entry.targetAvatar || `https://cdn.discordapp.com/embed/avatars/${getDefaultAvatarIndex(entry.targetUserId)}.png`}
                        alt={`${entry.targetUsername}'s avatar`}
                        className="w-4 h-4 rounded-full flex-shrink-0"
                        onError={(e) => {
                          const target = e.target as HTMLImageElement;
                          target.src = `https://cdn.discordapp.com/embed/avatars/${getDefaultAvatarIndex(entry.targetUserId)}.png`;
                        }}
                      />
                      <span className="font-semibold text-xs truncate">
                        <span 
                          className="hover:bg-white/10 px-1 -mx-1 rounded transition-colors cursor-help"
                          title={entry.targetUsername}
                        >
                          {entry.targetUsername}
                        </span>
                      </span>
                    </div>

                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-2 text-[10px] uppercase tracking-[0.07em]">
                        <span className="capitalize font-medium">
                          {entry.action}
                        </span>
                        <span className={`font-semibold ${getIntensityColor(entry.intensity)}`}>
                          {entry.intensity}%
                        </span>
                        <span className="text-gray-400">
                          {entry.duration}s
                        </span>
                        {entry.guildName && (
                          <span className="text-gray-400 truncate max-w-20">
                            in {entry.guildName}
                          </span>
                        )}
                      </div>
                      <span className="text-xs text-gray-400 flex-shrink-0">
                        {formatTimestamp(entry.timestamp)}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}