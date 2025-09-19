import React, { useState, useEffect } from 'react';
import { X, Zap, Eye, EyeOff, AlertTriangle, Lock, Check, ExternalLink, UserX } from 'lucide-react';
import { DiscordSDK } from '@discord/embedded-app-sdk';

interface PiShockSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser: any;
  auth: any;
  discordSdk: DiscordSDK;
  isEmbedded: boolean;
  onSettingsSaved: () => void;
  participants: any[];
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

export function PiShockSettingsModal({
  isOpen,
  onClose,
  currentUser,
  auth,
  discordSdk,
  isEmbedded,
  onSettingsSaved,
  participants
}: PiShockSettingsModalProps) {
  const [apiKey, setApiKey] = useState('');
  const [username, setUsername] = useState('');
  const [sharecode, setSharecode] = useState('');
  const [maxIntensity, setMaxIntensity] = useState(100);
  const [maxDuration, setMaxDuration] = useState(15);
  const [enableShockBypass, setEnableShockBypass] = useState(false);
  const [showApiKey, setShowApiKey] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<string>('');
  const [lastTested, setLastTested] = useState<string>('');
  const [bannedExecutors, setBannedExecutors] = useState<string[]>([]);
  const [debugInfo, setDebugInfo] = useState<any>(null);

  // Load existing settings when modal opens
  useEffect(() => {
    if (isOpen && currentUser && auth) {
      loadSettings();
    }
  }, [isOpen, currentUser, auth]);

  const loadSettings = async () => {
    setIsLoading(true);
    try {
      const response = await fetch(`${getApiBaseUrl()}/users/${currentUser.id}/pishock-settings`, {
        headers: {
          'Authorization': `Bearer ${auth.access_token}`,
        },
      });

      if (response.ok) {
        const result = await response.json();
        if (result.hasSettings && result.settings) {
          setUsername(result.settings.username || '');
          setSharecode(result.settings.sharecode || '');
          setMaxIntensity(result.settings.maxIntensity || 100);
          setMaxDuration(result.settings.maxDuration || 15);
          setEnableShockBypass(result.settings.enableShockBypass || false);
          setBannedExecutors(result.bannedExecutors || []);
          setLastTested(result.settings.lastUpdated || '');
        } else {
          setBannedExecutors(result.bannedExecutors || []);
        }
      }
    } catch (error) {
      setConnectionStatus('Failed to load settings');
    } finally {
      setIsLoading(false);
    }
  };

  const testConnection = async () => {
    if (!currentUser || !auth) return;

    setIsLoading(true);
    setConnectionStatus('Testing connection...');
    
    try {
      const response = await fetch(`${getApiBaseUrl()}/users/${currentUser.id}/pishock-test`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${auth.access_token}`,
        },
      });

      if (response.ok) {
        const result = await response.json();
        setIsConnected(result.success);
        setDebugInfo(result.debug);
        
        if (result.success) {
          setConnectionStatus('✅ Connection successful!');
          setLastTested(result.lastTested || new Date().toISOString());
        } else {
          setConnectionStatus(`❌ Connection failed: ${result.error || 'Unknown error'}`);
        }
      } else {
        setConnectionStatus('❌ Connection test failed');
      }
    } catch (error) {
      setConnectionStatus('❌ Network error during test');
    } finally {
      setIsLoading(false);
    }
  };

  const saveSettings = async () => {
    if (!currentUser || !auth) return;

    setIsSaving(true);
    setConnectionStatus('Saving settings...');

    try {
      const response = await fetch(`${getApiBaseUrl()}/users/${currentUser.id}/pishock-settings`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${auth.access_token}`,
        },
        body: JSON.stringify({
          apiKey: apiKey || undefined,
          username,
          sharecode,
          maxIntensity,
          maxDuration,
          enableShockBypass,
          bannedExecutors
        }),
      });

      if (response.ok) {
        const result = await response.json();
        setIsConnected(result.success);
        setDebugInfo(result.debug);
        
        if (result.success) {
          setConnectionStatus('✅ Settings saved and connection verified!');
          setApiKey(''); // Clear the API key field for security
          setLastTested(new Date().toISOString());
          onSettingsSaved();
        } else {
          setConnectionStatus(`❌ Save failed: ${result.error || 'Unknown error'}`);
        }
      } else {
        const errorData = await response.json();
        setConnectionStatus(`❌ Save failed: ${errorData.error || 'Server error'}`);
      }
    } catch (error) {
      setConnectionStatus('❌ Network error during save');
    } finally {
      setIsSaving(false);
    }
  };

  const updateBanList = async () => {
    if (!currentUser || !auth) return;

    try {
      const response = await fetch(`${getApiBaseUrl()}/users/${currentUser.id}/pishock-settings`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${auth.access_token}`,
        },
        body: JSON.stringify({
          bannedExecutors
        }),
      });

      if (response.ok) {
        setConnectionStatus('✅ Ban list updated');
        onSettingsSaved();
      }
    } catch (error) {
      setConnectionStatus('❌ Failed to update ban list');
    }
  };

  const toggleBanUser = (userId: string) => {
    setBannedExecutors(prev => {
      const newList = prev.includes(userId) 
        ? prev.filter(id => id !== userId)
        : [...prev, userId];
      
      // Auto-save ban list changes
      setTimeout(() => updateBanList(), 100);
      return newList;
    });
  };

  const getDisplayName = (user: any) => {
    return user?.guildDisplayName || user?.displayName || user?.global_name || user?.username || 'Unknown User';
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
    } catch (error) {
      return 0;
    }
  };

  const getAvatarUrl = (user: any) => {
    return user?.guildAvatarUrl || user?.avatarUrl || `https://cdn.discordapp.com/embed/avatars/${getDefaultAvatarIndex(user.id)}.png`;
  };

  if (!isOpen) return null;

  const otherParticipants = participants.filter(p => p.id !== currentUser?.id);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="bg-gray-900 rounded-2xl border border-gray-700 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-gray-900 border-b border-gray-700 p-6 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="p-2 bg-purple-500/20 rounded-lg">
              <Zap className="h-6 w-6 text-purple-400" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-white">PiShock Settings</h2>
              <p className="text-sm text-gray-400">Configure your PiShock device and safety settings</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-800 rounded-lg transition-colors"
          >
            <X className="h-5 w-5 text-gray-400" />
          </button>
        </div>

        <div className="p-6 space-y-6">
          {/* Safety Warning */}
          <div className="bg-red-900/20 border border-red-500/30 rounded-lg p-4">
            <div className="flex items-start space-x-3">
              <AlertTriangle className="h-5 w-5 text-red-400 flex-shrink-0 mt-0.5" />
              <div className="text-sm">
                <p className="font-semibold text-red-300 mb-2">Safety First!</p>
                <ul className="text-red-200 space-y-1">
                  <li>• Only share your PiShock credentials with trusted applications</li>
                  <li>• Set appropriate maximum intensity and duration limits</li>
                  <li>• Always test with low settings first</li>
                  <li>• You can revoke access at any time by changing your PiShock password</li>
                </ul>
              </div>
            </div>
          </div>

          {/* Connection Status */}
          {connectionStatus && (
            <div className={`p-3 rounded-lg border ${
              connectionStatus.includes('✅') 
                ? 'bg-green-900/20 border-green-500/30 text-green-300'
                : connectionStatus.includes('❌')
                ? 'bg-red-900/20 border-red-500/30 text-red-300'
                : 'bg-blue-900/20 border-blue-500/30 text-blue-300'
            }`}>
              <p className="text-sm font-medium">{connectionStatus}</p>
              {lastTested && (
                <p className="text-xs opacity-75 mt-1">
                  Last tested: {new Date(lastTested).toLocaleString()}
                </p>
              )}
            </div>
          )}

          {/* Credentials Form */}
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                PiShock API Key
              </label>
              <div className="relative">
                <input
                  type={showApiKey ? 'text' : 'password'}
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder="Enter your PiShock API key..."
                  className="w-full px-4 py-3 bg-gray-800 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:ring-2 focus:ring-purple-500 focus:border-transparent pr-12"
                />
                <button
                  type="button"
                  onClick={() => setShowApiKey(!showApiKey)}
                  className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-300"
                >
                  {showApiKey ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                </button>
              </div>
              <p className="text-xs text-gray-500 mt-1">
                Find this in your PiShock account settings. Leave blank to keep existing key.
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                PiShock Username
              </label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Your PiShock username"
                className="w-full px-4 py-3 bg-gray-800 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:ring-2 focus:ring-purple-500 focus:border-transparent"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Share Code
              </label>
              <input
                type="text"
                value={sharecode}
                onChange={(e) => setSharecode(e.target.value)}
                placeholder="Your device share code"
                className="w-full px-4 py-3 bg-gray-800 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:ring-2 focus:ring-purple-500 focus:border-transparent"
              />
              <p className="text-xs text-gray-500 mt-1">
                Generate this in your PiShock device settings for others to control your device.
              </p>
            </div>
          </div>

          {/* Safety Limits */}
          <div className="space-y-4">
            <h3 className="text-lg font-semibold text-white flex items-center space-x-2">
              <Lock className="h-5 w-5 text-yellow-400" />
              <span>Safety Limits</span>
            </h3>
            
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Maximum Intensity: {maxIntensity}%
              </label>
              <input
                type="range"
                min="1"
                max="100"
                value={maxIntensity}
                onChange={(e) => setMaxIntensity(parseInt(e.target.value))}
                className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer slider slider-large"
              />
              <div className="flex justify-between text-sm text-gray-400 mt-1">
                <span>1%</span>
                <span>50%</span>
                <span>100%</span>
              </div>
              <p className="text-xs text-gray-500 mt-2">
                Other users cannot exceed this intensity when controlling your device.
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Maximum Duration: {maxDuration}s
              </label>
              <input
                type="range"
                min="1"
                max="15"
                value={maxDuration}
                onChange={(e) => setMaxDuration(parseInt(e.target.value))}
                className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer slider slider-large"
              />
              <div className="flex justify-between text-sm text-gray-400 mt-1">
                <span>1s</span>
                <span>8s</span>
                <span>15s</span>
              </div>
              <p className="text-xs text-gray-500 mt-2">
                Other users cannot exceed this duration when controlling your device.
              </p>
            </div>

            <div className="bg-gray-800 rounded-lg p-4">
              <label className="flex items-start space-x-3">
                <input
                  type="checkbox"
                  checked={enableShockBypass}
                  onChange={(e) => setEnableShockBypass(e.target.checked)}
                  className="mt-0.5 h-4 w-4 text-purple-600 rounded border-gray-600 bg-gray-700 focus:ring-purple-500"
                />
                <div className="flex-1">
                  <span className="text-sm font-medium text-gray-300">
                    Enable Bypass System
                  </span>
                  <p className="text-xs text-gray-500 mt-1">
                    Allow users with "Shock Past User Limit" consumables to exceed your safety limits.
                    They must purchase these consumables from the Discord store.
                  </p>
                  {enableShockBypass && (
                    <div className="mt-2 p-2 bg-yellow-900/20 border border-yellow-500/30 rounded text-xs text-yellow-200">
                      ⚡ Bypass enabled: Users can exceed your limits using Discord store consumables
                    </div>
                  )}
                </div>
              </label>
            </div>
          </div>

          {/* Ban List Management */}
          {otherParticipants.length > 0 && (
            <div className="space-y-4">
              <h3 className="text-lg font-semibold text-white flex items-center space-x-2">
                <UserX className="h-5 w-5 text-red-400" />
                <span>Block Users</span>
              </h3>
              <p className="text-sm text-gray-400">
                Block specific users from controlling your PiShock device. They will see that you're online but cannot send commands.
              </p>
              
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {otherParticipants.map((participant) => (
                  <div key={participant.id} className="flex items-center space-x-3 p-3 bg-gray-800 rounded-lg">
                    <img
                      src={getAvatarUrl(participant)}
                      alt={`${getDisplayName(participant)}'s avatar`}
                      className="w-8 h-8 rounded-full"
                      onError={(e) => {
                        const target = e.target as HTMLImageElement;
                        target.src = `https://cdn.discordapp.com/embed/avatars/${getDefaultAvatarIndex(participant.id)}.png`;
                      }}
                    />
                    <div className="flex-1">
                      <p className="text-sm font-medium text-white">
                        {getDisplayName(participant)}
                      </p>
                      <p className="text-xs text-gray-400">
                        @{participant.username}
                      </p>
                    </div>
                    <button
                      onClick={() => toggleBanUser(participant.id)}
                      className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                        bannedExecutors.includes(participant.id)
                          ? 'bg-red-600 hover:bg-red-700 text-white'
                          : 'bg-gray-600 hover:bg-gray-700 text-gray-300'
                      }`}
                    >
                      {bannedExecutors.includes(participant.id) ? 'Blocked' : 'Allow'}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* How to get credentials */}
          <div className="bg-blue-900/20 border border-blue-500/30 rounded-lg p-4">
            <div className="flex items-start space-x-3">
              <ExternalLink className="h-5 w-5 text-blue-400 flex-shrink-0 mt-0.5" />
              <div className="text-sm">
                <p className="font-semibold text-blue-300 mb-2">How to get your PiShock credentials:</p>
                <ol className="text-blue-200 space-y-1 list-decimal list-inside">
                  <li>Log into your PiShock account at pishock.com</li>
                  <li>Go to Account Settings → API</li>
                  <li>Copy your API Key and Username</li>
                  <li>Go to your device settings and generate a Share Code</li>
                  <li>Paste all three values above and click "Save & Test"</li>
                </ol>
              </div>
            </div>
          </div>

          {/* Debug Information (only in dev mode) */}
          {debugInfo && !isEmbedded && (
            <div className="bg-gray-800 rounded-lg p-4">
              <h4 className="text-sm font-semibold text-gray-300 mb-2">Debug Information</h4>
              <pre className="text-xs text-gray-400 whitespace-pre-wrap overflow-x-auto">
                {JSON.stringify(debugInfo, null, 2)}
              </pre>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex space-x-3 pt-4">
            <button
              onClick={testConnection}
              disabled={isLoading || !username || !sharecode}
              className="flex-1 px-4 py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 disabled:cursor-not-allowed rounded-lg font-semibold transition-colors flex items-center justify-center space-x-2"
            >
              {isLoading ? (
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
              ) : (
                <>
                  <Zap className="h-4 w-4" />
                  <span>Test Connection</span>
                </>
              )}
            </button>

            <button
              onClick={saveSettings}
              disabled={isSaving || !username || !sharecode}
              className="flex-1 px-4 py-3 bg-purple-600 hover:bg-purple-700 disabled:bg-gray-600 disabled:cursor-not-allowed rounded-lg font-semibold transition-colors flex items-center justify-center space-x-2"
            >
              {isSaving ? (
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
              ) : (
                <>
                  <Check className="h-4 w-4" />
                  <span>Save & Test</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}