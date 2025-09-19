import React, { useState, useEffect } from 'react';
import { Settings, X, Save, Loader, ExternalLink, Wifi, AlertTriangle, Shield, User, Lock } from 'lucide-react';
import { DiscordSDK } from '@discord/embedded-app-sdk';

interface PiShockSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser: any;
  auth: any;
  discordSdk: DiscordSDK;
  isEmbedded: boolean;
  onSettingsSaved: () => void;
  participants?: any[];
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

export function PiShockSettingsModal({ 
  isOpen, 
  onClose, 
  currentUser, 
  auth, 
  discordSdk, 
  isEmbedded,
  onSettingsSaved,
  participants = []
}: PiShockSettingsModalProps) {
  const [apiKey, setApiKey] = useState('');
  const [username, setUsername] = useState('');
  const [sharecode, setSharecode] = useState('');
  const [userMaxIntensity, setUserMaxIntensity] = useState(100);
  const [userMaxDuration, setUserMaxDuration] = useState(15);
  const [bannedExecutors, setBannedExecutors] = useState<string[]>([]);
  const [enableShockBypass, setEnableShockBypass] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loadingData, setLoadingData] = useState(false);
  const [hasStoredCredentials, setHasStoredCredentials] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<{
    connected: boolean;
    message: string;
    color: string;
  }>({ connected: false, message: 'Loading...', color: 'gray' });

  // Load settings when modal opens
  useEffect(() => {
    if (isOpen && currentUser && auth) {
      loadExistingSettings();
      checkConnectionStatus();
    }
  }, [isOpen, currentUser, auth]);

  // Auto-save ban list when it changes
  useEffect(() => {
    if (isOpen && currentUser && auth && bannedExecutors.length >= 0) {
      const saveTimeout = setTimeout(async () => {
        try {
          await fetch(`${getApiBaseUrl()}/users/${currentUser.id}/pishock-settings`, {
            method: 'PUT',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${auth.access_token}`,
            },
            body: JSON.stringify({ bannedExecutors }),
          });
        } catch (error) {
          console.error('Failed to save ban list:', error);
        }
      }, 1000);
      
      return () => clearTimeout(saveTimeout);
    }
  }, [bannedExecutors, currentUser, auth, isOpen]);

  const checkConnectionStatus = async () => {
    if (!currentUser || !auth) return;

    try {
      const response = await fetch(`${getApiBaseUrl()}/users/${currentUser.id}/pishock-status`, {
        headers: {
          'Authorization': `Bearer ${auth.access_token}`,
        },
      });

      if (response.ok) {
        const status = await response.json();
        setHasStoredCredentials(status.hasCredentials);
        
        if (status.isConnected) {
          setConnectionStatus({
            connected: true,
            message: 'Your PiShock Account is Connected',
            color: 'green'
          });
        } else if (status.hasCredentials) {
          setConnectionStatus({
            connected: false,
            message: 'Credentials stored but connection failed',
            color: 'yellow'
          });
        } else {
          setConnectionStatus({
            connected: false,
            message: 'No PiShock account configured',
            color: 'gray'
          });
        }

        if (status.maxIntensity !== undefined && status.maxDuration !== undefined) {
          setUserMaxIntensity(status.maxIntensity);
          setUserMaxDuration(status.maxDuration);
        }
      }
    } catch (error) {
      console.error('Failed to check connection status:', error);
    }
  };

  const loadExistingSettings = async () => {
    if (!currentUser || !auth) return;

    setLoadingData(true);
    try {
      const response = await fetch(`${getApiBaseUrl()}/users/${currentUser.id}/pishock-settings`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${auth.access_token}`,
        },
      });

      if (response.ok) {
        const result = await response.json();
        
        if (result.hasSettings && result.settings) {
          const settings = result.settings;
          setUsername(settings.username || '');
          setSharecode(settings.sharecode || '');
          setUserMaxIntensity(settings.maxIntensity || 100);
          setUserMaxDuration(settings.maxDuration || 15);
          setBannedExecutors(settings.bannedExecutors || []);
          setEnableShockBypass(settings.enableShockBypass || false);
        }
      }
    } catch (error) {
      console.error('Failed to load existing settings:', error);
    } finally {
      setLoadingData(false);
    }
  };

  const testConnection = async () => {
    if (!currentUser || !auth) return;

    setLoading(true);
    try {
      const response = await fetch(`${getApiBaseUrl()}/users/${currentUser.id}/pishock-test`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${auth.access_token}`,
        },
      });

      if (response.ok) {
        const result = await response.json();
        if (result.success) {
          setConnectionStatus({
            connected: true,
            message: 'Connection test successful',
            color: 'green'
          });
          
          if (window.refreshAllUserStatuses) {
            window.refreshAllUserStatuses();
          }
        } else {
          throw new Error(result.error || 'Connection test failed');
        }
      } else {
        throw new Error('Connection test failed');
      }
    } catch (error) {
      console.error('Connection test error:', error);
      setConnectionStatus({
        connected: false,
        message: 'Connection test failed',
        color: 'red'
      });
    } finally {
      setLoading(false);
    }
  };

  const saveSettings = async () => {
    if (!currentUser || !auth) return;
    
    const isNewUser = !hasStoredCredentials;
    
    if (isNewUser && (!apiKey || !username || !sharecode)) {
      alert('Please fill in all required fields: API Key, Username, and Share Code');
      return;
    }
    
    if (!username || !sharecode) {
      alert('Please fill in Username and Share Code');
      return;
    }

    setSaving(true);
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
          sharecode: sharecode.trim(),
          hasOwnDevice: true,
          maxIntensity: userMaxIntensity,
          maxDuration: userMaxDuration,
          bannedExecutors,
          enableShockBypass,
        }),
      });

      const result = await response.json();
      
      if (response.ok && result.success) {
        setHasStoredCredentials(true);
        setConnectionStatus({
          connected: true,
          message: 'Settings saved and connection verified',
          color: 'green'
        });
        
        setApiKey('');
        setUsername('');
        setSharecode('');
        
        if (window.refreshAllUserStatuses) {
          window.refreshAllUserStatuses();
        }
        
        onSettingsSaved();
        onClose();
      } else {
        throw new Error(result.error || 'Failed to save settings');
      }
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  const removeCredentials = async () => {
    if (!currentUser || !auth) return;

    if (!confirm('Are you sure you want to remove your PiShock credentials?')) return;

    try {
      const response = await fetch(`${getApiBaseUrl()}/users/${currentUser.id}/pishock-settings`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${auth.access_token}`,
        },
      });

      if (response.ok) {
        setHasStoredCredentials(false);
        setConnectionStatus({
          connected: false,
          message: 'Credentials removed',
          color: 'gray'
        });
        onSettingsSaved();
      }
    } catch (error) {
      // Silently handle removal errors
    }
  };

  const openPiShockAccount = async () => {
    if (isEmbedded && discordSdk) {
      try {
        await discordSdk.commands.openExternalLink({
          url: 'https://pishock.com/#/account',
        });
      } catch (error) {
        // Silently handle external link errors
      }
    } else {
      window.open('https://pishock.com/#/account', '_blank');
    }
  };

  const getOtherParticipants = () => {
    return participants.filter((p: any) => p.id !== currentUser?.id);
  };

  const toggleBanUser = (userId: string) => {
    setBannedExecutors(prev => {
      if (prev.includes(userId)) {
        return prev.filter(id => id !== userId);
      } else {
        return [...prev, userId];
      }
    });
  };

  const getDisplayName = (user: any) => {
    return user?.guildDisplayName || user?.displayName || user?.global_name || user?.username || 'Unknown User';
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-gray-900 rounded-2xl border border-white/20 max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-6 border-b border-white/10">
          <div className="flex items-center space-x-3">
            <Settings className="h-6 w-6 text-purple-400" />
            <h2 className="text-xl font-bold text-white">PiShock Settings</h2>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-800 rounded-lg transition-colors"
          >
            <X className="h-5 w-5 text-gray-400" />
          </button>
        </div>

        <div className="p-6 space-y-6">
          <div className={`p-4 border rounded-lg ${
            connectionStatus.color === 'green' ? 'bg-green-900/20 border-green-500/30' :
            connectionStatus.color === 'yellow' ? 'bg-yellow-900/20 border-yellow-500/30' :
            connectionStatus.color === 'red' ? 'bg-red-900/20 border-red-500/30' :
            'bg-gray-900/20 border-gray-500/30'
          }`}>
            <div className="flex items-center justify-between">
              <div className={`flex items-center space-x-2 ${
                connectionStatus.color === 'green' ? 'text-green-400' :
                connectionStatus.color === 'yellow' ? 'text-yellow-400' :
                connectionStatus.color === 'red' ? 'text-red-400' :
                'text-gray-400'
              }`}>
                <Wifi className="h-5 w-5" />
                <span className="font-medium">{connectionStatus.message}</span>
              </div>
              <button
                onClick={testConnection}
                disabled={loading}
                className={`px-3 py-1 rounded text-sm transition-colors ${
                  connectionStatus.color === 'green' ? 'bg-green-600 hover:bg-green-700' :
                  connectionStatus.color === 'yellow' ? 'bg-yellow-600 hover:bg-yellow-700' :
                  'bg-gray-600 hover:bg-gray-700'
                } disabled:opacity-50`}
              >
                {loading ? <Loader className="h-4 w-4 animate-spin" /> : 'Test'}
              </button>
            </div>
          </div>

          {loadingData && (
            <div className="p-4 bg-blue-900/20 border border-blue-500/30 rounded-lg text-sm text-blue-200">
              <div className="flex items-center space-x-2">
                <Loader className="h-4 w-4 animate-spin" />
                <span>Loading your saved settings...</span>
              </div>
            </div>
          )}

          <div className="space-y-4">
            <div className="p-4 bg-blue-900/20 border border-blue-500/30 rounded-lg text-sm text-blue-200">
              <p className="font-semibold mb-1">
                {hasStoredCredentials ? 'Update Settings:' : 'Account Setup:'}
              </p>
              <p>
                {hasStoredCredentials 
                  ? "Configure your PiShock device settings. Fields will auto-populate if you have saved settings."
                  : "Configure your PiShock device to participate. You'll need your API key, username, and device share code."
                }
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                API Key {!hasStoredCredentials && <span className="text-red-400">*</span>}
              </label>
              <div className="flex space-x-2">
                <input
                  type="password"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  disabled={loadingData}
                  className="flex-1 px-3 py-2 bg-gray-800 border border-gray-600 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all"
                  placeholder={hasStoredCredentials ? "Leave blank to keep your current API key" : "Enter your PiShock API key"}
                />
                <button
                  onClick={openPiShockAccount}
                  type="button"
                  disabled={loadingData}
                  className="px-3 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 rounded-lg transition-colors flex items-center space-x-1"
                  title="Open PiShock Account Page"
                >
                  <ExternalLink className="h-4 w-4" />
                  <span className="hidden sm:inline">Get API Key</span>
                </button>
              </div>
              {hasStoredCredentials && (
                <p className="text-xs text-gray-400 mt-1">
                  ✓ Your current API key is saved. Leave blank to keep it unchanged.
                </p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Username <span className="text-red-400">*</span>
              </label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                disabled={loadingData}
                className="w-full px-3 py-2 bg-gray-800 border border-gray-600 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all"
                placeholder="Your PiShock username"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Share Code <span className="text-red-400">*</span>
              </label>
              <input
                type="text"
                value={sharecode}
                onChange={(e) => setSharecode(e.target.value)}
                disabled={loadingData}
                className="w-full px-3 py-2 bg-gray-800 border border-gray-600 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all"
                placeholder="Device share code (required to receive commands)"
              />
              <p className="text-xs text-gray-400 mt-1">
                Your PiShock device share code is required to receive commands from other users
              </p>
            </div>
          </div>

          <div className="space-y-4 p-4 bg-yellow-900/20 border border-yellow-500/30 rounded-lg">
            <h3 className="text-lg font-medium text-yellow-300">Safety Limits</h3>
            <p className="text-sm text-yellow-200">Set your maximum limits for receiving commands</p>
            
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Maximum Intensity: {userMaxIntensity}%
              </label>
              <input
                type="range"
                min="1"
                max="100"
                value={userMaxIntensity}
                onChange={(e) => setUserMaxIntensity(parseInt(e.target.value))}
                disabled={loadingData}
                className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer slider"
              />
              <div className="flex justify-between text-xs text-gray-400 mt-1">
                <span>1%</span>
                <span>50%</span>
                <span>100%</span>
              </div>
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Maximum Duration: {userMaxDuration}s
              </label>
              <input
                type="range"
                min="1"
                max="15"
                value={userMaxDuration}
                onChange={(e) => setUserMaxDuration(parseInt(e.target.value))}
                disabled={loadingData}
                className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer slider"
              />
              <div className="flex justify-between text-xs text-gray-400 mt-1">
                <span>1s</span>
                <span>8s</span>
                <span>15s</span>
              </div>
            </div>
          </div>

          <div className="space-y-4 p-4 bg-purple-900/20 border border-purple-500/30 rounded-lg">
            <h3 className="text-lg font-medium text-purple-300">Shock Bypass Settings</h3>
            <p className="text-sm text-purple-200">Allow other users to exceed your safety limits using consumables</p>
            
            <div className="flex items-center justify-between p-3 bg-black/20 rounded border border-gray-600">
              <div className="flex-1 min-w-0">
                <h4 className="text-sm font-medium text-white mb-1">Enable Shock Bypass</h4>
                <p className="text-sm text-gray-300">
                  When enabled, other users can use "Shock Past User Limit" consumables to exceed your safety limits.
                </p>
              </div>
              <div className="ml-4 flex-shrink-0">
                <button
                  onClick={() => setEnableShockBypass(!enableShockBypass)}
                  disabled={loadingData}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                    enableShockBypass
                      ? 'bg-purple-600'
                      : 'bg-gray-600'
                  }`}
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                      enableShockBypass ? 'translate-x-6' : 'translate-x-1'
                    }`}
                  />
                </button>
              </div>
            </div>
            
            <div className="p-3 bg-blue-900/20 border border-blue-500/30 rounded">
              <h4 className="text-sm font-medium text-blue-300 mb-2">Your Consumable Inventory</h4>
              <div className="flex items-center justify-between">
                <span className="text-sm text-blue-200">Shock Past User Limit:</span>
                <span className="text-sm font-semibold text-blue-300">
                  {consumableInventory['YOUR_SKU_ID_HERE'] || 0} available
                </span>
              </div>
              <p className="text-xs text-blue-200 mt-2">
                Purchase more from the Discord store to bypass other users' limits (when they enable it).
              </p>
            </div>
          </div>

          <div className="space-y-4 p-4 bg-red-900/20 border border-red-500/30 rounded-lg">
            <h3 className="text-lg font-medium text-red-300">Manage Who Can Shock You</h3>
            <p className="text-sm text-red-200">Block specific users from sending commands to your device</p>
            
            {getOtherParticipants().length > 0 ? (
              <div className="space-y-2 max-h-40 overflow-y-auto">
                {getOtherParticipants().map((participant) => {
                  const isBanned = bannedExecutors.includes(participant.id);
                  const displayName = getDisplayName(participant);
                  
                  return (
                    <div key={participant.id} className="flex items-center justify-between p-3 bg-black/20 rounded border border-gray-600">
                      <div className="flex items-center space-x-3 flex-1 min-w-0">
                        <img
                          src={participant.avatarUrl || `https://cdn.discordapp.com/embed/avatars/0.png`}
                          alt={`${displayName}'s avatar`}
                          className="w-6 h-6 rounded-full flex-shrink-0"
                          onError={(e) => {
                            const target = e.target as HTMLImageElement;
                            target.src = `https://cdn.discordapp.com/embed/avatars/0.png`;
                          }}
                        />
                        <span className="text-sm text-gray-300 truncate">{displayName}</span>
                        {isBanned && <span className="text-xs text-red-400 font-semibold">BANNED</span>}
                      </div>
                      <button
                        onClick={() => toggleBanUser(participant.id)}
                        disabled={loadingData}
                        className={`px-3 py-1 rounded text-sm transition-colors ${
                          isBanned
                            ? 'bg-green-600 hover:bg-green-700 text-white'
                            : 'bg-red-600 hover:bg-red-700 text-white'
                        }`}
                      >
                        {isBanned ? 'Unban' : 'Ban'}
                      </button>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="text-sm text-gray-400">No other participants available to manage</p>
            )}
            
            {bannedExecutors.length > 0 && (
              <div className="text-sm text-red-300">
                Currently blocking {bannedExecutors.length} user{bannedExecutors.length !== 1 ? 's' : ''}
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center justify-between p-6 border-t border-white/10">
          <div className="flex space-x-3">
            {hasStoredCredentials && (
              <button
                onClick={removeCredentials}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 rounded-lg text-sm font-medium transition-colors"
              >
                Remove Credentials
              </button>
            )}
          </div>
          
          <div className="flex space-x-3">
            <button
              onClick={onClose}
              className="px-4 py-2 bg-gray-600 hover:bg-gray-700 rounded-lg text-sm font-medium transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={saveSettings}
              disabled={saving || loadingData}
              className="px-4 py-2 bg-gradient-to-r from-green-600 to-green-700 hover:from-green-700 hover:to-green-800 disabled:from-gray-600 disabled:to-gray-700 disabled:cursor-not-allowed rounded-lg font-medium flex items-center space-x-2 transition-all"
            >
              {(saving || loadingData) ? (
                <Loader className="h-4 w-4 animate-spin" />
              ) : (
                <Save className="h-4 w-4" />
              )}
              <span>
                {loadingData ? 'Loading...' : 'Save & Test Connection'}
              </span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}