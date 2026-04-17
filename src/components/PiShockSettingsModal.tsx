import { useState, useEffect } from 'react';
import { Settings, X, Save, Loader, ExternalLink, Wifi, RefreshCw } from 'lucide-react';
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
  authFetch?: typeof fetch;
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
  participants = [],
  authFetch = fetch,
}: PiShockSettingsModalProps) {
  const [apiKey, setApiKey] = useState('');
  const [username, setUsername] = useState('');
  const [sharecode, setSharecode] = useState('');
  const [selectedShareCode, setSelectedShareCode] = useState('');
  const [availableShareCodesForSelected, setAvailableShareCodesForSelected] = useState<string[]>([]);
  const [selectedShockerId, setSelectedShockerId] = useState('');
  const [allowedShockerIds, setAllowedShockerIds] = useState<string[]>([]);
  const [allowOverLimitWithConsumable, setAllowOverLimitWithConsumable] = useState(false);
  const [commandsPaused, setCommandsPaused] = useState(false);
  const [availableShockers, setAvailableShockers] = useState<Array<{ id: string; name: string; label?: string }>>([]);
  const [usingLegacySharecodeFallback, setUsingLegacySharecodeFallback] = useState(false);
  const [disableLegacySharecode, setDisableLegacySharecode] = useState(false);
  const [deprecationMessages, setDeprecationMessages] = useState<string[]>([]);
  const [userMaxIntensity, setUserMaxIntensity] = useState(100);
  const [userMaxDuration, setUserMaxDuration] = useState(15);
  const [bannedExecutors, setBannedExecutors] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loadingData, setLoadingData] = useState(false);
  const [refreshingShockers, setRefreshingShockers] = useState(false);
  const [creatingShareCode, setCreatingShareCode] = useState(false);
  const [hasStoredCredentials, setHasStoredCredentials] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [shockerIdsHiddenNotOnDevices, setShockerIdsHiddenNotOnDevices] = useState(0);
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
          await authFetch(`${getApiBaseUrl()}/users/${currentUser.id}/pishock-settings`, {
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

  useEffect(() => {
    const ownedShockerIds = new Set(availableShockers.map((shocker) => String(shocker.id)));
    if (selectedShockerId && !ownedShockerIds.has(String(selectedShockerId))) {
      setSelectedShockerId('');
    }
    setAllowedShockerIds((previous) => previous.filter((id) => ownedShockerIds.has(String(id))));
  }, [availableShockers, selectedShockerId]);

  const checkConnectionStatus = async () => {
    if (!currentUser || !auth) return;

    try {
      const response = await authFetch(`${getApiBaseUrl()}/users/${currentUser.id}/pishock-status`, {
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
        setCommandsPaused(Boolean(status.commandsPaused));
        if (typeof status.shockerIdsHiddenNotOnDevices === 'number') {
          setShockerIdsHiddenNotOnDevices(status.shockerIdsHiddenNotOnDevices);
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
      const response = await authFetch(`${getApiBaseUrl()}/users/${currentUser.id}/pishock-settings`, {
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
          setSelectedShockerId(settings.selectedShockerId || '');
          setSelectedShareCode(settings.selectedShareCode || '');
          setAvailableShareCodesForSelected(
            Array.isArray(settings.availableShareCodesForSelected) ? settings.availableShareCodesForSelected : []
          );
          setAvailableShockers(Array.isArray(settings.availableShockers) ? settings.availableShockers : []);
          setAllowedShockerIds(Array.isArray(settings.allowedShockerIds) ? settings.allowedShockerIds : []);
          setAllowOverLimitWithConsumable(Boolean(settings.allowOverLimitWithConsumable));
          setUsingLegacySharecodeFallback(Boolean(settings.usingLegacySharecodeFallback));
          setDisableLegacySharecode(false);
          setDeprecationMessages(Array.isArray(result.deprecations) ? result.deprecations : []);
          setUserMaxIntensity(settings.maxIntensity || 100);
          setUserMaxDuration(settings.maxDuration || 15);
          setBannedExecutors(settings.bannedExecutors || []);
          setCommandsPaused(Boolean(settings.commandsPaused));
          setShockerIdsHiddenNotOnDevices(
            typeof settings.shockerIdsHiddenNotOnDevices === 'number' ? settings.shockerIdsHiddenNotOnDevices : 0
          );
          const loaded = Array.isArray(settings.availableShockers) ? settings.availableShockers : [];
          if (loaded.length === 0 && (settings.username || settings.piShockUserId)) {
            console.warn(
              '[PiShock:settings UI] availableShockers is empty after GET settings. ' +
                'Worker logs [PiShock:allowedShockers] show why (Account vs GetUserDevices vs /Shockers intersection). ' +
                'Tail: wrangler pages deployment tail --project-name <name> (or your host logs).',
              { shockerIdsHiddenNotOnDevices: settings.shockerIdsHiddenNotOnDevices }
            );
          }
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
      const response = await authFetch(`${getApiBaseUrl()}/users/${currentUser.id}/pishock-test`, {
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
    
    if (isNewUser && (!apiKey || !username || !selectedShockerId)) {
      setFormError('Please fill in all required fields: API Key, Username, and Selected Shocker.');
      return;
    }
    
    if (!username || !selectedShockerId) {
      setFormError('Please fill in Username and Selected Shocker.');
      return;
    }

    setFormError(null);
    setSaving(true);
    try {
      const response = await authFetch(`${getApiBaseUrl()}/users/${currentUser.id}/pishock-settings`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${auth.access_token}`,
        },
        body: JSON.stringify({
          apiKey: apiKey || undefined,
          username,
          selectedShockerId,
          selectedShareCode: selectedShareCode || undefined,
          allowedShockerIds,
          allowOverLimitWithConsumable,
          commandsPaused,
          // Deprecated legacy field retained for read-only compatibility only.
          sharecode: disableLegacySharecode ? undefined : (sharecode.trim() || undefined),
          disableLegacySharecode,
          hasOwnDevice: true,
          maxIntensity: userMaxIntensity,
          maxDuration: userMaxDuration,
          bannedExecutors,
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
        setSelectedShockerId('');
        setSelectedShareCode('');
        setAvailableShareCodesForSelected([]);
        setAllowedShockerIds([]);
        setAllowOverLimitWithConsumable(false);
        setSharecode('');
        setDisableLegacySharecode(false);
        setUsingLegacySharecodeFallback(false);
        setDeprecationMessages(Array.isArray(result.deprecations) ? result.deprecations : []);
        
        if (window.refreshAllUserStatuses) {
          window.refreshAllUserStatuses();
        }
        
        onSettingsSaved();
        onClose();
      } else {
        const debugStep = result?.debug?.step ? ` (step: ${result.debug.step})` : '';
        const debugRawBody = result?.debug?.rawBody ? ` Details: ${String(result.debug.rawBody).slice(0, 300)}` : '';
        throw new Error(`${result.error || 'Failed to save settings'}${debugStep}${debugRawBody}`);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to save settings';
      setFormError(message);
      setConnectionStatus({
        connected: false,
        message: message.slice(0, 120),
        color: 'red'
      });
    } finally {
      setSaving(false);
    }
  };

  const removeCredentials = async () => {
    if (!currentUser || !auth) return;

    if (!confirm('Are you sure you want to remove your PiShock credentials?')) return;

    try {
      const response = await authFetch(`${getApiBaseUrl()}/users/${currentUser.id}/pishock-settings`, {
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

  const toggleAllowedShockerId = (shockerId: string) => {
    setAllowedShockerIds((previous) => {
      if (previous.includes(shockerId)) {
        return previous.filter((id) => id !== shockerId);
      }
      return [...previous, shockerId];
    });
  };

  const refreshOwnedShockers = async () => {
    if (!currentUser || !auth) return;

    setFormError(null);
    setRefreshingShockers(true);
    try {
      const hasCredentialsInput = Boolean(username.trim()) && (Boolean(apiKey.trim()) || hasStoredCredentials);
      const response = hasCredentialsInput
        ? await authFetch(`${getApiBaseUrl()}/users/${currentUser.id}/pishock-settings`, {
            method: 'PUT',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${auth.access_token}`,
            },
            body: JSON.stringify({
              refreshShockersOnly: true,
              apiKey: apiKey.trim() || undefined,
              username: username.trim(),
              selectedShockerId: selectedShockerId || undefined,
              allowedShockerIds,
            }),
          })
        : await authFetch(`${getApiBaseUrl()}/users/${currentUser.id}/pishock-settings`, {
            method: 'GET',
            headers: {
              'Authorization': `Bearer ${auth.access_token}`,
            },
          });
      const result = await response.json();
      if (!response.ok) {
        const debugStep = result?.debug?.step ? ` (step: ${result.debug.step})` : '';
        throw new Error(`${result?.error || 'Unable to refresh owned shockers'}${debugStep}`);
      }
      const settings = result?.settings || result;
      const ownedShockers = Array.isArray(settings?.availableShockers) ? settings.availableShockers : [];
      if (ownedShockers.length === 0) {
        console.warn(
          '[PiShock:settings UI] refresh returned zero availableShockers. See worker [PiShock:allowedShockers] logs.',
          { shockerIdsHiddenNotOnDevices: settings?.shockerIdsHiddenNotOnDevices, debug: result?.debug }
        );
        throw new Error('No owned shockers were found for this PiShock account.');
      }
      setAvailableShockers(ownedShockers);
      if (settings?.selectedShockerId) {
        setSelectedShockerId(settings.selectedShockerId);
      } else if (!selectedShockerId) {
        setSelectedShockerId(String(ownedShockers[0].id));
      }
      setSelectedShareCode(settings?.selectedShareCode || '');
      setAvailableShareCodesForSelected(
        Array.isArray(settings?.availableShareCodesForSelected) ? settings.availableShareCodesForSelected : []
      );
      setAllowedShockerIds(Array.isArray(settings?.allowedShockerIds) ? settings.allowedShockerIds : []);
      setDeprecationMessages(Array.isArray(result.deprecations) ? result.deprecations : []);
      setShockerIdsHiddenNotOnDevices(
        typeof settings?.shockerIdsHiddenNotOnDevices === 'number' ? settings.shockerIdsHiddenNotOnDevices : 0
      );

      if (window.refreshAllUserStatuses) {
        window.refreshAllUserStatuses();
      }
    } catch (error) {
      setFormError(error instanceof Error ? error.message : 'Failed to refresh owned shockers');
    } finally {
      setRefreshingShockers(false);
    }
  };

  const createShareCodeForSelectedShocker = async () => {
    if (!currentUser || !auth) return;
    if (!username.trim() || !selectedShockerId) {
      setFormError('Username and Selected Shocker are required before creating a sharecode.');
      return;
    }

    setFormError(null);
    setCreatingShareCode(true);
    try {
      const response = await authFetch(`${getApiBaseUrl()}/users/${currentUser.id}/pishock-settings`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${auth.access_token}`,
        },
        body: JSON.stringify({
          createShareCodeForSelected: true,
          apiKey: apiKey || undefined,
          username,
          selectedShockerId,
          selectedShareCode: selectedShareCode || undefined,
          allowedShockerIds,
          allowOverLimitWithConsumable,
          commandsPaused,
          hasOwnDevice: true,
          maxIntensity: userMaxIntensity,
          maxDuration: userMaxDuration,
          bannedExecutors,
        }),
      });
      const result = await response.json();
      if (!response.ok || !result.success) {
        const debugStep = result?.debug?.step ? ` (step: ${result.debug.step})` : '';
        throw new Error(`${result?.error || 'Failed to create sharecode'}${debugStep}`);
      }

      const nextCode = String(result.selectedShareCode || '').trim();
      if (nextCode) {
        setSelectedShareCode(nextCode);
        setAvailableShareCodesForSelected((prev) => {
          const merged = new Set<string>([...prev, nextCode]);
          return Array.from(merged);
        });
      }
      setConnectionStatus({
        connected: true,
        message: 'Sharecode created and claimed for selected shocker',
        color: 'green',
      });
      if (window.refreshAllUserStatuses) {
        window.refreshAllUserStatuses();
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to create sharecode';
      setFormError(message);
      setConnectionStatus({
        connected: false,
        message: message.slice(0, 120),
        color: 'red',
      });
    } finally {
      setCreatingShareCode(false);
    }
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
          {formError && (
            <div className="p-4 bg-red-900/20 border border-red-500/30 rounded-lg text-sm text-red-200">
              {formError}
            </div>
          )}

          <div className="space-y-4">
            <div className="p-4 bg-blue-900/20 border border-blue-500/30 rounded-lg text-sm text-blue-200">
              <p className="font-semibold mb-1">
                {hasStoredCredentials ? 'Update Settings:' : 'Account Setup:'}
              </p>
              <p>
                {hasStoredCredentials 
                  ? "Configure your PiShock device settings. Select the shocker you want to share."
                  : "Configure your PiShock device to participate. You'll need your API key, username, and to select a shocker."
                }
              </p>
            </div>

            <div className="p-4 bg-slate-800/80 border border-slate-500/40 rounded-lg text-sm text-slate-200">
              <p className="font-semibold mb-1 text-slate-100">Owned and active shockers only</p>
              <p className="mb-2">
                Only shockers that belong to your PiShock account, appear on your linked devices as active (not paused),
                and are returned by the PiShock API can be used here. This activity cannot control someone else&apos;s
                hardware or shockers that are paused or not reported on your device list.
              </p>
              <p className="text-slate-300">
                If you think a shocker is missing, check that it is online, not paused in PiShock, and linked to your
                account before refreshing the list.
              </p>
              {shockerIdsHiddenNotOnDevices > 0 && (
                <p className="mt-2 text-xs text-amber-200">
                  {shockerIdsHiddenNotOnDevices} shocker{shockerIdsHiddenNotOnDevices === 1 ? '' : 's'} from your PiShock
                  API response {shockerIdsHiddenNotOnDevices === 1 ? 'is' : 'are'} hidden here because {shockerIdsHiddenNotOnDevices === 1 ? 'it is' : 'they are'} not on your active devices list.
                </p>
              )}
            </div>

            {(usingLegacySharecodeFallback || deprecationMessages.length > 0) && (
              <div className="p-4 bg-yellow-900/20 border border-yellow-500/30 rounded-lg text-sm text-yellow-200">
                <p className="font-semibold mb-1">Share code deprecated</p>
                <p className="mb-2">
                  This app now uses direct shocker selection. Legacy share-code fallback is temporary.
                </p>
                {sharecode && (
                  <button
                    type="button"
                    onClick={() => setDisableLegacySharecode((previous) => !previous)}
                    className="flex items-center gap-2 mb-2 text-sm text-yellow-100"
                  >
                    <span
                      className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                        disableLegacySharecode ? 'bg-yellow-500' : 'bg-yellow-900/70'
                      }`}
                    >
                      <span
                        className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                          disableLegacySharecode ? 'translate-x-4' : 'translate-x-0.5'
                        }`}
                      />
                    </span>
                    Disable legacy share-code fallback on next save
                  </button>
                )}
                {deprecationMessages.map((message, idx) => (
                  <p key={`deprecation-${idx}`} className="text-xs text-yellow-300">- {message}</p>
                ))}
              </div>
            )}

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
              <div className="flex items-center justify-between mb-2 gap-2">
                <label className="block text-sm font-medium text-gray-300">
                  Selected Shocker <span className="text-red-400">*</span>
                </label>
                <button
                  type="button"
                  onClick={refreshOwnedShockers}
                  disabled={loadingData || refreshingShockers}
                  className="px-2 py-1 text-xs bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-600 rounded transition-colors inline-flex items-center gap-1"
                  title="Refresh owned shockers from PiShock API"
                >
                  <RefreshCw className={`h-3 w-3 ${refreshingShockers ? 'animate-spin' : ''}`} />
                  <span>{refreshingShockers ? 'Refreshing...' : 'Refresh'}</span>
                </button>
              </div>
              <select
                value={selectedShockerId}
                onChange={(e) => {
                  setSelectedShockerId(e.target.value);
                  setSelectedShareCode('');
                  setAvailableShareCodesForSelected([]);
                }}
                disabled={loadingData || refreshingShockers}
                className="w-full px-3 py-2 bg-gray-800 border border-gray-600 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all"
              >
                <option value="">Select a shocker from your account</option>
                {availableShockers.map((shocker) => (
                  <option key={shocker.id} value={shocker.id}>
                    {shocker.label || shocker.name}
                  </option>
                ))}
              </select>
              <p className="text-xs text-gray-400 mt-1">
                Enter API key + username, click Refresh, then select the device you want to share for receiving commands.
              </p>
            </div>

            <div>
              <div className="flex items-center justify-between mb-2 gap-2">
                <label className="block text-sm font-medium text-gray-300">
                  Select Sharecode <span className="text-red-400">*</span>
                </label>
                <button
                  type="button"
                  onClick={createShareCodeForSelectedShocker}
                  disabled={loadingData || creatingShareCode || !username.trim() || !selectedShockerId}
                  className="px-2 py-1 text-xs bg-emerald-600 hover:bg-emerald-700 disabled:bg-gray-600 rounded transition-colors inline-flex items-center gap-1"
                  title="Create and claim a fresh sharecode for the selected shocker"
                >
                  <RefreshCw className={`h-3 w-3 ${creatingShareCode ? 'animate-spin' : ''}`} />
                  <span>{creatingShareCode ? 'Creating...' : 'Create & Claim Sharecode'}</span>
                </button>
              </div>
              <select
                value={selectedShareCode}
                onChange={(e) => setSelectedShareCode(e.target.value)}
                disabled={loadingData || creatingShareCode}
                className="w-full px-3 py-2 bg-gray-800 border border-gray-600 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all"
              >
                <option value="">
                  {availableShareCodesForSelected.length > 0
                    ? 'Select an available sharecode'
                    : 'No sharecode selected yet'}
                </option>
                {availableShareCodesForSelected.map((code) => (
                  <option key={code} value={code}>
                    {code}
                  </option>
                ))}
              </select>
              <p className="text-xs text-gray-400 mt-1">
                If the selected shocker has no sharecode yet, click "Create & Claim Sharecode". You can click it again to
                force a new claimed sharecode even when one already exists.
              </p>
            </div>

            <div className="p-3 bg-purple-900/20 border border-purple-500/30 rounded-lg">
              <label className="block text-sm font-medium text-purple-200 mb-2">
                Allowed Shockers For Controller+ Multishock
              </label>
              <p className="text-xs text-purple-200 mb-3">
                Choose which of your devices can be targeted when a Controller+ user sends multishock.
              </p>
              <div className="space-y-2 max-h-36 overflow-y-auto">
                {availableShockers.length === 0 && (
                  <p className="text-xs text-purple-300">Save credentials once to load available shockers.</p>
                )}
                {availableShockers.map((shocker) => (
                  <label key={shocker.id} className="flex items-center gap-2 text-sm text-purple-100">
                    <input
                      type="checkbox"
                      checked={allowedShockerIds.includes(shocker.id)}
                      onChange={() => toggleAllowedShockerId(shocker.id)}
                      className="rounded border-purple-500/50 bg-transparent"
                    />
                    <span>{shocker.label || shocker.name}</span>
                  </label>
                ))}
              </div>
            </div>

            {sharecode && (
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Legacy Share Code (deprecated, read-only)
                </label>
                <input
                  type="text"
                  value={sharecode}
                  disabled={true}
                  className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-gray-500"
                />
              </div>
            )}
          </div>

          <div className="space-y-4 p-4 bg-yellow-900/20 border border-yellow-500/30 rounded-lg">
            <h3 className="text-lg font-medium text-yellow-300">Safety Limits</h3>
            <p className="text-sm text-yellow-200">Set your maximum limits for receiving commands</p>
            <button
              type="button"
              onClick={() => setAllowOverLimitWithConsumable((previous) => !previous)}
              className="flex items-center gap-2 text-sm text-yellow-100"
            >
              <span
                className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                  allowOverLimitWithConsumable ? 'bg-yellow-500' : 'bg-yellow-900/70'
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                    allowOverLimitWithConsumable ? 'translate-x-4' : 'translate-x-0.5'
                  }`}
                />
              </span>
              Allow shocks past my limits when sender spends an over-limit consumable
            </button>
            
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