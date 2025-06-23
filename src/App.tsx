import React, { useState, useEffect, useCallback } from 'react';
import { Routes, Route, useNavigate, useLocation } from 'react-router-dom';
import { DiscordSDK, Events, type Types } from '@discord/embedded-app-sdk';
import { Zap, Shield, Users, Settings, AlertTriangle, Power, FileText } from 'lucide-react';
import { PiShockController } from './components/PiShockController';
import { SafetyWarning } from './components/SafetyWarning';
import { UserSelector } from './components/UserSelector';
import { ConnectionStatus } from './components/ConnectionStatus';
import { NotificationSystem } from './components/NotificationSystem';
import { ActivityLog } from './components/ActivityLog';
import { PrivacyPolicy } from './components/PrivacyPolicy';
import { TermsOfService } from './components/TermsOfService';
import { useNotifications } from './hooks/useNotifications';
import { useInstanceData } from './hooks/useInstanceData';
import { useParticipants } from './hooks/useParticipants';
import { useLayoutMode } from './hooks/useLayoutMode';
import { useOrientation } from './hooks/useOrientation';
import { useVersionCheck } from './hooks/useVersionCheck';
import { VersionWarning } from './components/VersionWarning';

// Admin user ID for KV wipe functionality
const ADMIN_USER_ID = '173839105615069184';

// Global function to refresh user statuses
declare global {
  interface Window {
    refreshAllUserStatuses?: () => void;
  }
}

// Check if we're running in Discord's embedded environment
const urlParams = new URLSearchParams(window.location.search);
const isEmbedded = urlParams.has('frame_id');

// Initialize Discord SDK
let discordSdk: DiscordSDK;

const clientId = import.meta.env.VITE_DISCORD_CLIENT_ID;
if (import.meta.env.PROD && (!clientId || clientId === 'YOUR_DISCORD_CLIENT_ID_HERE')) {
  console.error('❌ VITE_DISCORD_CLIENT_ID is not set or still using placeholder value');
  console.error('💡 Solution: Set VITE_DISCORD_CLIENT_ID in Cloudflare Pages Dashboard → Settings → Environment variables');
  throw new Error('Discord Client ID is required. Please set VITE_DISCORD_CLIENT_ID in Cloudflare Pages Dashboard');
}

// Use a development fallback when not in production
if (!import.meta.env.PROD && (!clientId || clientId === 'YOUR_DISCORD_CLIENT_ID_HERE')) {
  console.warn('⚠️ Using development mode without Discord Client ID');
  // You can set a development fallback or leave it undefined for development
}
discordSdk = new DiscordSDK(clientId);

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

function MainApp() {
  const [auth, setAuth] = useState<any>(null);
  const [selectedUser, setSelectedUser] = useState<any>(null);
  const [piShockConnected, setPiShockConnected] = useState(false);
  const [safetyAccepted, setSafetyAccepted] = useState(false);
  const [loading, setLoading] = useState(true);
  const [instanceId, setInstanceId] = useState<string>('');
  const [showActivityLog, setShowActivityLog] = useState(true);
  const [userPiShockStatus, setUserPiShockStatus] = useState<Record<string, any>>({});
  const { notifications, addNotification, dismissNotification } = useNotifications();
  const { layoutMode, isCompactMode } = useLayoutMode(discordSdk, isEmbedded);
  const { orientation, isLandscape, isPortrait } = useOrientation(discordSdk, isEmbedded);
  const navigate = useNavigate();
  const [isWipingKV, setIsWipingKV] = useState(false);
  
  // Get current version from build
  const currentVersion = __BUILD_VERSION__;
  
  // Custom hooks for managing instance data and participants
  const { instanceData, updateInstanceData } = useInstanceData(instanceId);
  const { participants, updateParticipants } = useParticipants(discordSdk, isEmbedded);
  
  // Version checking and session management
  const {
    isOutdated,
    isShuttingDown,
    timeRemaining,
    forceShutdown,
    checkVersion
  } = useVersionCheck({
    currentVersion,
    onOutdated: (remaining) => {
      console.log('Version outdated warning, time remaining:', remaining);
    },
    onShutdown: () => {
      console.log('Shutting down due to version mismatch');
      // Gracefully handle shutdown
      handleGracefulShutdown();
    },
    addNotification
  });

  // Graceful shutdown handler
  const handleGracefulShutdown = useCallback(() => {
    console.log('Starting graceful shutdown...');
    
    // Clean up Discord SDK subscriptions
    if (isEmbedded && discordSdk) {
      try {
        discordSdk.unsubscribe(Events.ACTIVITY_INSTANCE_PARTICIPANTS_UPDATE, updateParticipants);
      } catch (error) {
        console.warn('Error unsubscribing from Discord events:', error);
      }
    }
    
    // Clear any running intervals
    if (window.refreshAllUserStatuses) {
      window.refreshAllUserStatuses = undefined;
    }
    
    // Add a brief delay then reload to ensure cleanup
    setTimeout(() => {
      window.location.href = window.location.href; // Hard refresh
    }, 500);
  }, [isEmbedded, updateParticipants]);

  // Function to check PiShock status for all participants
  const checkAllUserPiShockStatus = async () => {
    if (!instanceId || !auth || participants.length === 0) return;

    // Skip expensive status checks in PIP mode to preserve performance
    if (isCompactMode) {
      console.log('Skipping status check in compact mode for performance');
      return;
    }

    console.log('Checking PiShock status for participants:', participants.map(p => ({ id: p.id, username: p.username })));

    try {
      const statusPromises = participants.map(async (participant) => {
        try {
          console.log(`Checking status for ${participant.username} (${participant.id})`);
          const response = await fetch(`${getApiBaseUrl()}/users/${participant.id}/pishock-status`, {
            headers: {
              'Authorization': `Bearer ${auth.access_token}`,
            },
          });
          
          if (response.ok) {
            const status = await response.json();
            console.log(`Status for ${participant.username}:`, status);
            return { 
              userId: participant.id, 
              status: {
                isConnected: status.isConnected,
                hasDevice: status.hasDevice,
                hasCredentials: status.hasCredentials,
                deviceCount: status.deviceCount || 0,
                piShockUserId: status.piShockUserId,
                isRelay: status.isRelay || false, // Track if using relay account
                maxIntensity: status.maxIntensity || 100,
                maxDuration: status.maxDuration || 15
              }
            };
          } else {
            console.warn(`Failed to check status for ${participant.username}: ${response.status} ${response.statusText}`);
          }
        } catch (error) {
          console.error(`Failed to check PiShock status for ${participant.username}:`, error);
        }
        return { 
          userId: participant.id, 
          status: {
            isConnected: false,
            hasDevice: false,
            hasCredentials: false,
            deviceCount: 0,
            piShockUserId: null,
            isRelay: false,
            maxIntensity: 100,
            maxDuration: 15
          }
        };
      });

      const statuses = await Promise.all(statusPromises);
      const statusMap: Record<string, any> = {};
      statuses.forEach(({ userId, status }) => {
        statusMap[userId] = status;
      });
      
      console.log('Final status map:', statusMap);
      
      setUserPiShockStatus(prevStatus => {
        // Only update if there are actual changes
        const hasChanges = Object.keys(statusMap).some(userId => 
          !prevStatus[userId] || 
          prevStatus[userId].isConnected !== statusMap[userId].isConnected ||
          prevStatus[userId].hasDevice !== statusMap[userId].hasDevice ||
          prevStatus[userId].hasCredentials !== statusMap[userId].hasCredentials ||
          prevStatus[userId].maxIntensity !== statusMap[userId].maxIntensity ||
          prevStatus[userId].maxDuration !== statusMap[userId].maxDuration
        );
        
        if (hasChanges) {
          console.log('PiShock status updated:', statusMap);
        }
        
        return statusMap;
      });
    } catch (error) {
      console.error('Failed to check user PiShock statuses:', error);
    }
  };

  // Make the refresh function available globally
  window.refreshAllUserStatuses = checkAllUserPiShockStatus;
  
  // Make user status available globally for PiShockController
  (window as any).userPiShockStatus = userPiShockStatus;

  useEffect(() => {
    const initializeDiscord = async () => {
      try {
        await discordSdk.ready();
        
        // Set orientation lock based on device type and layout preferences
        try {
          await discordSdk.commands.setOrientationLockState({
            lock_state: 2, // UNLOCKED - Allow both orientations for flexibility
            picture_in_picture_lock_state: 1, // LANDSCAPE - PIP works better in landscape
            grid_lock_state: 2, // PORTRAIT - Grid tiles work better in portrait
          });
          console.log('✓ Orientation lock state configured');
        } catch (orientationError) {
          // Non-critical error, continue without orientation lock
          console.warn('Failed to set orientation lock:', orientationError);
        }
        
        // Get instance ID immediately after SDK construction
        const currentInstanceId = discordSdk.instanceId;
        setInstanceId(currentInstanceId);
        
        // Authenticate with Discord
        const { code } = await discordSdk.commands.authorize({
          client_id: import.meta.env.VITE_DISCORD_CLIENT_ID,
          response_type: 'code',
          state: '',
          prompt: 'none',
          scope: [
            'identify',
            'guilds',
            'guilds.members.read',
            'rpc.activities.write',
          ],
        });

        // Exchange code for access token via backend using proxy
        const response = await fetch(`${getApiBaseUrl()}/auth/discord`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            code,
            instanceId: currentInstanceId,
          }),
        });

        const { access_token } = await response.json();
        
        const authResult = await discordSdk.commands.authenticate({
          access_token,
        });

        setAuth(authResult);

        // Subscribe to participant updates
        discordSdk.subscribe(
          Events.ACTIVITY_INSTANCE_PARTICIPANTS_UPDATE,
          (data: Types.GetActivityInstanceConnectedParticipantsResponse) => {
            updateParticipants(data.participants);
          }
        );

        // Get initial participants
        const initialParticipants = await discordSdk.commands.getInstanceConnectedParticipants();
        updateParticipants(initialParticipants.participants);

        addNotification('success', 'Connected', 'Successfully connected to Discord');
        setLoading(false);
      } catch (error) {
        console.error('Discord initialization error:', error);
        addNotification('error', 'Connection Failed', 'Failed to connect to Discord. Please try again.');
        setLoading(false);
      }
    };

    initializeDiscord();

    // Cleanup subscriptions on unmount
    return () => {
      if (discordSdk) {
        try {
          discordSdk.unsubscribe(Events.ACTIVITY_INSTANCE_PARTICIPANTS_UPDATE, updateParticipants);
        } catch (error) {
          console.warn('Error unsubscribing from Discord events:', error);
        }
      }
    };
  }, [addNotification, updateParticipants]);

  // Load instance data when instanceId changes
  useEffect(() => {
    if (instanceId && auth) {
      // Load instance-specific data from backend using proxy
      fetch(`${getApiBaseUrl()}/instances/${instanceId}/data`, {
        headers: {
          'Authorization': `Bearer ${auth.access_token}`,
        },
      })
        .then(async response => {
          if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
          }
          
          // Check if response is actually JSON
          const contentType = response.headers.get('content-type');
          if (!contentType || !contentType.includes('application/json')) {
            throw new Error('Response is not JSON');
          }
          
          return response.json();
        })
        .then(data => {
          updateInstanceData(data);
          if (data.selectedUserId) {
            const selectedParticipant = participants.find(p => p.id === data.selectedUserId);
            if (selectedParticipant) {
              setSelectedUser(selectedParticipant);
            }
          }
        })
        .catch(error => {
          console.error('Failed to load instance data:', error);
          addNotification('warning', 'Data Load Failed', 'Could not load instance data');
        });
    }
  }, [instanceId, auth, participants, updateInstanceData, addNotification]);

  // Check PiShock status for all participants
  useEffect(() => {
    if (instanceId && auth && participants.length > 0) {
      checkAllUserPiShockStatus();
    }
  }, [instanceId, auth, participants]);

  // Set up periodic status checking for real-time updates
  useEffect(() => {
    if (!auth || participants.length === 0 || isCompactMode) return;

    // Adjust frequency based on layout mode
    const interval = isCompactMode ? 60000 : 15000; // 1 minute in compact mode, 15s normally
    
    const intervalId = setInterval(() => {
      checkAllUserPiShockStatus();
    }, interval);

    return () => clearInterval(intervalId);
  }, [auth, participants, isCompactMode]);

  // Admin KV wipe function
  const handleWipeKV = async () => {
    if (!auth || auth.user?.id !== ADMIN_USER_ID) {
      return;
    }

    const confirmed = window.confirm(
      '⚠️ CRITICAL WARNING ⚠️\n\n' +
      'This will PERMANENTLY DELETE ALL DATA from the KV namespace including:\n' +
      '• All user PiShock credentials\n' +
      '• All activity logs\n' +
      '• All instance data\n' +
      '• All cached data\n\n' +
      'This action is IRREVERSIBLE and will affect ALL USERS.\n\n' +
      'Are you absolutely sure you want to proceed?'
    );

    if (!confirmed) {
      return;
    }

    const doubleConfirmed = window.confirm(
      'FINAL CONFIRMATION\n\n' +
      'You are about to wipe ALL data from the PiShock Discord Activity.\n' +
      'This will log out all users and delete everything.\n\n' +
      'Type YES in the next prompt to confirm.'
    );

    if (!doubleConfirmed) {
      return;
    }

    const finalConfirm = window.prompt(
      'Type "DELETE ALL DATA" (without quotes) to confirm:'
    );

    if (finalConfirm !== 'DELETE ALL DATA') {
      addNotification('info', 'Cancelled', 'KV wipe operation cancelled');
      return;
    }

    setIsWipingKV(true);

    try {
      const response = await fetch(`${getApiBaseUrl()}/admin/wipe-kv`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${auth.access_token}`,
          'Content-Type': 'application/json'
        }
      });

      const result = await response.json();

      if (response.ok && result.success) {
        addNotification('success', 'KV Wiped', 
          `Successfully deleted ${result.keysDeleted} keys from KV namespace. All user data has been cleared.`);
        
        // Force reload after a delay to clear any cached data
        setTimeout(() => {
          window.location.reload();
        }, 3000);
      } else {
        throw new Error(result.error || 'KV wipe failed');
      }
    } catch (error) {
      console.error('KV wipe error:', error);
      addNotification('error', 'Wipe Failed', 
        error instanceof Error ? error.message : 'Failed to wipe KV namespace');
    } finally {
      setIsWipingKV(false);
    }
  };

  // Save instance data when selectedUser changes
  useEffect(() => {
    if (instanceId && auth && selectedUser) {
      fetch(`${getApiBaseUrl()}/instances/${instanceId}/data`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${auth.access_token}`,
        },
        body: JSON.stringify({
          selectedUserId: selectedUser.id,
          lastUpdated: new Date().toISOString(),
        }),
      }).catch(error => {
        console.error('Failed to save instance data:', error);
        addNotification('warning', 'Save Failed', 'Could not save instance data');
      });
    }
  }, [instanceId, auth, selectedUser, addNotification]);

  if (loading) {
    return (
      <div className="h-screen w-screen bg-gradient-to-br from-purple-900 via-blue-900 to-indigo-900 flex items-center justify-center overflow-hidden">
        <div className="text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-white mx-auto mb-4"></div>
          <p className="text-white text-lg">Connecting to Discord...</p>
          {instanceId && (
            <p className="text-gray-300 text-sm mt-2">Instance: {instanceId}</p>
          )}
        </div>
      </div>
    );
  }

  if (!safetyAccepted) {
    return <SafetyWarning onAccept={() => setSafetyAccepted(true)} />;
  }

  return (
    <div className="h-screen w-screen bg-gradient-to-br from-purple-900 via-blue-900 to-indigo-900 text-white overflow-hidden flex flex-col">
      <NotificationSystem 
        notifications={notifications} 
        onDismiss={dismissNotification} 
      />
      
      {/* Header */}
      <div className="bg-black/20 backdrop-blur-sm border-b border-white/10 flex-shrink-0">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 rounded-lg overflow-hidden bg-black/20 flex items-center justify-center">
                <img 
                  src="/kVApvT6y_400x400 copy.jpg" 
                  alt="PiShock Controller Logo" 
                  className="w-8 h-8 object-contain"
                />
              </div>
              <div>
                <h1 className="text-lg font-bold">PiShock Controller</h1>
                <p className="text-xs text-gray-300">
                  Discord Activity • {participants.length} participant{participants.length !== 1 ? 's' : ''}
                </p>
              </div>
            </div>
            <div className="flex items-center space-x-4">
              {instanceId && (
                <div className="text-xs text-gray-400">
                  Instance: {instanceId.slice(-8)}
                </div>
              )}
              {/* Admin KV Wipe Button */}
              {auth?.user?.id === ADMIN_USER_ID && (
                <button
                  onClick={handleWipeKV}
                  disabled={isWipingKV}
                  className="px-2 py-1 rounded-md bg-red-700 hover:bg-red-600 disabled:bg-gray-600 disabled:cursor-not-allowed text-xs transition-colors flex items-center space-x-1"
                  title="ADMIN: Wipe all KV data"
                >
                  {isWipingKV ? (
                    <div className="animate-spin rounded-full h-3 w-3 border-b border-white"></div>
                  ) : (
                    <span>🗑️</span>
                  )}
                  <span className="hidden sm:inline">
                    {isWipingKV ? 'Wiping...' : 'Admin Wipe'}
                  </span>
                </button>
              )}
              <button
                onClick={() => navigate('/terms')}
                className="px-2 py-1 rounded-md bg-gray-700 hover:bg-gray-600 text-xs transition-colors flex items-center space-x-1"
              >
                <FileText className="h-3 w-3" />
                <span className="hidden sm:inline">Terms</span>
              </button>
              <button
                onClick={() => navigate('/privacy')}
                className="px-2 py-1 rounded-md bg-gray-700 hover:bg-gray-600 text-xs transition-colors flex items-center space-x-1"
              >
                <Shield className="h-3 w-3" />
                <span className="hidden sm:inline">Privacy</span>
              </button>
              <button
                onClick={() => setShowActivityLog(!showActivityLog)}
                className={`px-3 py-1 rounded-md text-sm transition-colors ${
                  showActivityLog 
                    ? 'bg-purple-600 hover:bg-purple-700 text-white' 
                    : 'bg-gray-700 hover:bg-gray-600 text-gray-300'
                }`}
              >
                Activity Log
              </button>
              <ConnectionStatus 
                discordConnected={!!auth} 
                piShockConnected={piShockConnected}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 overflow-hidden" data-layout-mode={layoutMode}>
        <div className="h-full max-w-7xl mx-auto px-4 sm:px-6 py-4">
          <div className={`h-full grid gap-2 sm:gap-4 ${
            isCompactMode 
              ? 'grid-cols-1' // Single column in compact modes
              : isPortrait 
                ? 'grid-cols-1' // Single column in portrait
                : showActivityLog 
                  ? 'grid-cols-1 lg:grid-cols-4' 
                  : 'grid-cols-1 lg:grid-cols-3'
          }`}>
            {/* User Selection and Shocker Selection */}
            <div className={`${isCompactMode ? 'order-2' : 'lg:col-span-1'} flex flex-col min-h-0 space-y-4`}>
              <UserSelector
                members={participants}
                selectedUser={selectedUser}
                onUserSelect={setSelectedUser}
                currentUser={auth?.user}
                instanceData={instanceData}
                userPiShockStatus={userPiShockStatus}
                isCompactMode={isCompactMode}
              />
            </div>

            {/* Main Controller */}
            <div className={`${
              isCompactMode 
                ? 'order-1' 
                : showActivityLog 
                  ? 'lg:col-span-2' 
                  : 'lg:col-span-2'
            } flex flex-col min-h-0 order-1 lg:order-none`}>
              <PiShockController
                selectedUser={selectedUser}
                onConnectionChange={setPiShockConnected}
                isConnected={piShockConnected}
                addNotification={addNotification}
                instanceId={instanceId}
                auth={auth}
                currentUser={auth?.user}
                isCompactMode={isCompactMode}
                orientation={orientation}
              />
            </div>

            {/* Activity Log */}
            {showActivityLog && !isCompactMode && (
              <div className="lg:col-span-1 flex flex-col min-h-0 order-3 lg:order-none">
                <ActivityLog
                  instanceId={instanceId}
                  auth={auth}
                  addNotification={addNotification}
                  isCompactMode={isCompactMode}
                />
              </div>
            )}
            
            {/* Compact Activity Log Toggle */}
            {isCompactMode && showActivityLog && (
              <div className="order-3 flex flex-col min-h-0">
                <div className="bg-black/20 backdrop-blur-sm rounded-xl border border-white/10 p-3">
                  <button
                    onClick={() => setShowActivityLog(false)}
                    className="w-full text-center text-sm text-gray-400 hover:text-white transition-colors"
                  >
                    Hide Activity Log (Compact Mode)
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Footer Safety Information */}
      <div className={`flex-shrink-0 bg-red-900/20 border-t border-red-500/30 px-4 sm:px-6 ${isCompactMode ? 'py-1' : 'py-2'}`}>
        <div className="max-w-7xl mx-auto">
          <div className="flex items-center justify-between">
            <div className="flex items-start space-x-3 flex-1">
              <AlertTriangle className={`${isCompactMode ? 'h-4 w-4' : 'h-5 w-5'} text-red-400 flex-shrink-0 mt-0.5`} />
              <div className="min-w-0">
                <h3 className={`${isCompactMode ? 'text-xs' : 'text-sm'} font-semibold text-red-300 mb-1`}>
                  {isCompactMode ? 'Safety' : 'Safety Reminders'}
                </h3>
                <div className={`text-xs text-red-200 ${
                  isCompactMode 
                    ? 'grid grid-cols-1 gap-y-1' 
                    : 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-4 gap-y-1'
                }`}>
                  <span>• Always ensure explicit consent</span>
                  {!isCompactMode && (
                    <>
                      <span>• Start with lowest intensity</span>
                      <span>• Have emergency procedures ready</span>
                      <span>• All actions are publicly logged</span>
                    </>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
      
      {/* Version Warning Modal */}
      {isOutdated && isShuttingDown && (
        <VersionWarning
          timeRemaining={timeRemaining}
          onForceShutdown={forceShutdown}
          onRefresh={handleGracefulShutdown}
        />
      )}
      
      {/* Version Indicator - Bottom Right */}
      <div className="fixed bottom-4 right-4 z-40 flex items-center space-x-2 bg-black/40 backdrop-blur-sm border border-white/10 rounded-lg px-3 py-2 text-xs">
        <div className="flex items-center space-x-2">
          <div className={`w-2 h-2 rounded-full ${
            isShuttingDown ? 'bg-yellow-400 animate-pulse' : 'bg-green-400'
          }`}></div>
          <span className="text-gray-300 font-medium">
            v{currentVersion.slice(-8)}
          </span>
          {/* Layout mode indicator */}
          {isCompactMode && (
            <span className="text-xs text-blue-400 font-medium">
              {layoutMode === 'PICTURE_IN_PICTURE' ? 'PIP' : 
               layoutMode === 'GRID' ? 'Grid' : 
               'Compact'}
            </span>
          )}
        </div>
        {isShuttingDown && (
          <span className="text-yellow-400 animate-pulse font-semibold">
            Update in {timeRemaining}s
          </span>
        )}
      </div>
    </div>
  );
}

function App() {
  const location = useLocation();
  const navigate = useNavigate();

  // Handle navigation back to main app
  const handleBackToApp = () => {
    navigate('/');
  };

  return (
    <Routes>
      <Route path="/" element={<MainApp />} />
      <Route path="/privacy" element={<PrivacyPolicy onBack={handleBackToApp} />} />
      <Route path="/terms" element={<TermsOfService onBack={handleBackToApp} />} />
      {/* Fallback route for any unmatched paths */}
      <Route path="*" element={<MainApp />} />
    </Routes>
  );
}

export default App;