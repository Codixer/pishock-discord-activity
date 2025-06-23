import React, { useState, useEffect } from 'react';
import { Activity, Clock, Zap, Play, Volume2, RefreshCw } from '../icons';

interface ActivityFeedProps {
  accessToken: string;
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

export function ActivityFeed({ accessToken }: ActivityFeedProps) {
  const [entries, setEntries] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadActivityLog();
    const interval = setInterval(loadActivityLog, 10000); // Refresh every 10 seconds
    return () => clearInterval(interval);
  }, []);

  const loadActivityLog = async () => {
    try {
      const response = await fetch(`${getApiBaseUrl()}/activity-log?limit=20`, {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
        },
      });

      if (response.ok) {
        const data = await response.json();
        setEntries(data.entries);
      }
    } catch (error) {
      console.error('Failed to load activity log:', error);
    } finally {
      setLoading(false);
    }
  };

  const getActionIcon = (action: string) => {
    switch (action) {
      case 'shock': return <Zap className="w-4 h-4 text-red-400" />;
      case 'vibrate': return <Play className="w-4 h-4 text-blue-400" />;
      case 'beep': return <Volume2 className="w-4 h-4 text-green-400" />;
      default: return <Activity className="w-4 h-4 text-gray-400" />;
    }
  };

  const getActionColor = (action: string) => {
    switch (action) {
      case 'shock': return 'text-red-400 bg-red-900/20';
      case 'vibrate': return 'text-blue-400 bg-blue-900/20';
      case 'beep': return 'text-green-400 bg-green-900/20';
      default: return 'text-gray-400 bg-gray-900/20';
    }
  };

  const formatTime = (timestamp: string) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    return date.toLocaleDateString();
  };

  return (
    <div className="bg-black/20 backdrop-blur-md rounded-2xl border border-white/10 p-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center space-x-3">
          <div className="w-8 h-8 bg-gradient-to-r from-green-500 to-teal-600 rounded-lg flex items-center justify-center">
            <Activity className="w-5 h-5 text-white" />
          </div>
          <div>
            <h3 className="text-lg font-semibold">Activity Feed</h3>
            <p className="text-sm text-gray-400">Recent operations</p>
          </div>
        </div>
        <button
          onClick={loadActivityLog}
          disabled={loading}
          className="p-2 text-gray-400 hover:text-white transition-colors"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      <div className="space-y-3 max-h-96 overflow-y-auto">
        {entries.length === 0 ? (
          <div className="text-center py-8 text-gray-400">
            <Activity className="w-8 h-8 mx-auto mb-2 opacity-50" />
            <p className="text-sm">No activity yet</p>
            <p className="text-xs">Commands will appear here</p>
          </div>
        ) : (
          entries.map((entry) => (
            <div
              key={entry.id}
              className="bg-white/5 rounded-lg p-3 border border-white/10"
            >
              <div className="flex items-start space-x-3">
                <div className={`p-2 rounded-lg ${getActionColor(entry.action)}`}>
                  {getActionIcon(entry.action)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center space-x-2 mb-1">
                    <p className="font-medium text-sm truncate">
                      {entry.executorName}
                    </p>
                    <span className="text-gray-400">→</span>
                    <p className="text-sm text-gray-300 truncate">
                      Target Device
                    </p>
                  </div>
                  <div className="flex items-center space-x-4 text-xs text-gray-400">
                    <span className="capitalize font-medium text-white">
                      {entry.action}
                    </span>
                    <span>{entry.intensity}%</span>
                    <span>{entry.duration}s</span>
                    <div className="flex items-center space-x-1">
                      <Clock className="w-3 h-3" />
                      <span>{formatTime(entry.timestamp)}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}