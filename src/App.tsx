import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Routes, Route, useNavigate } from 'react-router-dom';
import { DiscordSDK, Common } from '@discord/embedded-app-sdk';
import { Settings, Users, Activity, Crown, Zap, Shield, FileText, Eye, AlertTriangle, RefreshCw } from 'lucide-react';

import { SafetyWarning } from './components/SafetyWarning';
import { TermsOfService } from './components/TermsOfService';
import { PrivacyPolicy } from './components/PrivacyPolicy';
import { PiShockController } from './components/PiShockController';
import { UserSelector } from './components/UserSelector';
import { ActivityLog } from './components/ActivityLog';
import { NotificationSystem } from './components/NotificationSystem';
import { ControllerPlusPurchaseModal } from './components/ControllerPlusPurchaseModal';
import { MultishockController } from './components/MultishockController';
import { ConnectionStatus } from './components/ConnectionStatus';

import { useNotifications } from './hooks/useNotifications';
import { useParticipants } from './hooks/useParticipants';
import { useInstanceData } from './hooks/useInstanceData';
import { useEntitlements } from './hooks/useEntitlements';
import { useVersionCheck } from './hooks/useVersionCheck';
import { useUserStatusCache } from './hooks/useUserStatusCache';

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

// Helper function to check if we're in the Discord embedded environment
function isDiscordEmbedded(): boolean {
  const urlParams = new URLSearchParams(window.location.search);
  return urlParams.has('frame_id');
}

// Get instance ID from URL
function getInstanceId(): string {
  const urlParams = new URLSearchParams(window.location.search);
  return urlParams.get('instance_id') || 'dev_instance_' + Date.now();
}

// Mock participants for development
const mockParticipants = [
  {
    id: 'dev_user_123',
    username: 'TestUser1',
    global_name: 'Test User 1',
    avatar: null,
    displayName: 'Test User 1',
    avatarUrl: 'https://cdn.discordapp.com/embed/avatars/0.png'
  },
  {
    id: 'dev_user_456',
    username: 'TestUser2', 
    global_name: 'Test User 2',
    avatar: null,
    displayName: 'Test User 2',
    avatarUrl: 'https://cdn.discordapp.com/embed/avatars/1.png'
  }
];

function App() {
  const navigate = useNavigate();
  const { notifications, addNotification, dismissNotification } = useNotifications();
  const { getCachedStatus, setCachedStatus, clearCache } = useUserStatusCache();
  
  // Core state
  const [discordSdk, setDiscordSdk] = useState<DiscordSDK | null>(null);
  const [auth, setAuth] = useState<any>(null);
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [selectedUser, setSelectedUser] = useState<any>(null);
  const [isEmbedded] = useState(isDiscordEmbedded());
  const [instanceId] = useState(getInstanceId());
  const [layoutMode, setLayoutMode] = useState(Common.LayoutModeTypeObject.FOCUSED);
  
  // UI state
  const [safetyAccepted, setSafetyAccepted] = useState(!isEmbedded); // Skip safety in dev
  const [piShockConnected, setPiShockConnected] = useState(false);
  const [loading, setLoading] = useState(true);
  const [showPurchaseModal, setShowPurchaseModal] = useState(false);
  const [isMultiSelectMode, setIsMultiSelectMode] = useState(false);
  const [selectedUsers, setSelectedUsers] = useState<any[]>([]);
  const [userPiShockStatus, setUserPiShockStatus] = useState<Record<string, any>>({});
  const [lastStatusRefresh, setLastStatusRefresh] = useState(0);
  
  // Hooks
  const { participants, updateParticipants, enrichParticipantsWithGuildData } = useParticipants(discordSdk!, isEmbedded);
  const { instanceData, updateInstanceData } = useInstanceData(instanceId);
  const { 
    hasControllerPlus, 
    loading: entitlementsLoading,
    isRateLimited,
    retryAfter,
    refreshEntitlements,
    purchaseControllerPlus
  } = useEntitlements({
    discordSdk: discordSdk!,
    isEmbedded,
    auth,
    controllerPlusSkuId: import.meta.env.VITE_CONTROLLER_PLUS_SKU_ID
  });
  
  const { 
    isOutdated, 
    isShuttingDown, 
    timeRemaining, 
    checkVersion 
  } = useVersionCheck({
    currentVersion: __BUILD_VERSION__,
    onOutdated: (remaining) => {
      addNotification('warning', 'App Update Required', 
        `A new version is available. The app will reload in ${Math.ceil(remaining / 1000)} seconds.`);
    },
    onShutdown: () => {
      addNotification('info', 'Reloading App', 'Loading the latest version...');
      setTimeout(() => window.location.reload(), 2000);
    },
    addNotification
  });

  // Initialize Discord SDK
  useEffect(() => {
    if (!isEmbedded) {
      setLoading(false);
      setCurrentUser({
        id: 'dev_user_current',
        username: 'DevUser',
        global_name: 'Development User',
        avatar: null
      });
      updateParticipants([
        {
          id: 'dev_user_current',
          username: 'DevUser',
          global_name: 'Development User',
          avatar: null
        },
        ...mockParticipants
      ]);
      return;
    }

    const clientId = import.meta.env.VITE_DISCORD_CLIENT_ID;
    if (!clientId) {
      console.error('Discord Client ID not found');
      addNotification('error', 'Configuration Error', 'Discord Client ID not configured');
      setLoading(false);
      return;
    }

    console.log('Initializing Discord SDK with client ID:', clientId);
    
    const sdk = new DiscordSDK(clientId);
    setDiscordSdk(sdk);

    sdk.ready().then(() => {
      console.log('Discord SDK ready');
      
      // Set up layout mode listener
      if (sdk.subscribe) {
        sdk.subscribe(Common.Commands.GET_LAYOUT_MODE, (data: any) => {
          console.log('Layout mode changed:', data.layout_mode);
          setLayoutMode(data.layout_mode);
        });
      }
      
      authenticate(sdk);
    }).catch(error => {
      console.error('Discord SDK initialization failed:', error);
      addNotification('error', 'Discord Connection Failed', 'Failed to connect to Discord');
      setLoading(false);
    });
  }, [isEmbedded]);

  // Authentication
  const authenticate = async (sdk: DiscordSDK) => {
    try {
      console.log('Starting Discord authentication...');
      
      const { code } = await sdk.commands.authorize({
        client_id: import.meta.env.VITE_DISCORD_CLIENT_ID,
        response_type: 'code',
        state: '',
        prompt: 'none',
        scope: ['identify', 'guilds', 'guilds.members.read'],
      });

      console.log('Got authorization code, exchanging for token...');

      const response = await fetch(`${getApiBaseUrl()}/auth/discord`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code, instanceId }),
      });

      if (response.ok) {
        const authData = await response.json();
        console.log('Authentication successful:', authData.user.username);
        
        setAuth(authData);
        setCurrentUser(authData.user);
        
        // Get participants
        await getParticipants(sdk, authData);
        
        setLoading(false);
        addNotification('success', 'Connected', 'Successfully connected to Discord');
      } else {
        const error = await response.json();
        throw new Error(error.error || 'Authentication failed');
      }
    } catch (error) {
      console.error('Authentication failed:', error);
      addNotification('error', 'Authentication Failed', error instanceof Error ? error.message : 'Failed to authenticate with Discord');
      setLoading(false);
    }
  };

  // Get participants
  const getParticipants = async (sdk: DiscordSDK, authData: any) => {
    try {
      console.log('Getting participants...');
      
      if (sdk.instanceId) {
        const activity = await sdk.commands.getInstanceConnectedParticipants();
        console.log('Got participants:', activity.participants.length);
        
        updateParticipants(activity.participants);
        
        // Enrich with guild data if in a guild
        if (sdk.guildId) {
          await enrichParticipantsWithGuildData(authData);
        }
      }
    } catch (error) {
      console.error('Failed to get participants:', error);
      // Don't show error notification for this as it's not critical
    }
  };

  // Refresh participants
  const refreshParticipants = useCallback(async () => {
    if (!discordSdk || !auth || !isEmbedded) return;
    
    try {
      await getParticipants(discordSdk, auth);
      addNotification('success', 'Refreshed', 'Participant list updated');
    } catch (error) {
      console.error('Failed to refresh participants:', error);
      addNotification('error', 'Refresh Failed', 'Failed to refresh participant list');
    }
  }, [discordSdk, auth, isEmbedded]);

  // User status management
  const checkUserPiShockStatus = useCallback(async (userId: string) => {
    if (!auth || !isEmbedded) return;

    try {
      // Check cache first
      const cached = getCachedStatus(userId);
      if (cached) {
        return cached;
      }

      const response = await fetch(`${getApiBaseUrl()}/users/${userId}/pishock-status`, {
        headers: { 'Authorization': `Bearer ${auth.access_token}` },
      });

      if (response.ok) {
        const status = await response.json();
        setCachedStatus(userId, status);
        return status;
      }
    } catch (error) {
      console.error('Failed to check user status:', error);
    }
    return null;
  }, [auth, isEmbedded, getCachedStatus, setCachedStatus]);

  const refreshAllUserStatuses = useCallback(async () => {
    if (!auth || !isEmbedded) return;

    const allUsers = [currentUser, ...participants].filter(Boolean);
    const statusPromises = allUsers.map(user => 
      checkUserPiShockStatus(user.id).then(status => ({ userId: user.id, status }))
    );

    try {
      const results = await Promise.all(statusPromises);
      const newStatus: Record<string, any> = {};
      
      results.forEach(({ userId, status }) => {
        if (status) {
          newStatus[userId] = status;
        }
      });

      setUserPiShockStatus(prev => ({ ...prev, ...newStatus }));
      setLastStatusRefresh(Date.now());
    } catch (error) {
      console.error('Failed to refresh user statuses:', error);
    }
  }, [auth, isEmbedded, currentUser, participants, checkUserPiShockStatus]);

  // Set up global refresh function
  useEffect(() => {
    (window as any).refreshAllUserStatuses = refreshAllUserStatuses;
    return () => {
      delete (window as any).refreshAllUserStatuses;
    };
  }, [refreshAllUserStatuses]);

  // Auto-refresh user statuses
  useEffect(() => {
    if (currentUser && participants.length > 0) {
      refreshAllUserStatuses();
    }
  }, [currentUser, participants, refreshAllUserStatuses]);

  // Handle multishock
  const handleMultishock = async (operation: number) => {
    if (!hasControllerPlus) {
      setShowPurchaseModal(true);
      return;
    }

    if (selectedUsers.length === 0) {
      addNotification('warning', 'No Targets Selected', 'Please select participants for multishock');
      return;
    }

    try {
      const response = await fetch(`${getApiBaseUrl()}/multishock-execute`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${auth.access_token}`,
        },
        body: JSON.stringify({
          targetUserIds: selectedUsers.map(u => u.id),
          intensity: 50, // This should come from the controller
          duration: 2,   // This should come from the controller
          operation,
          instanceId,
        }),
      });

      if (response.ok) {
        const result = await response.json();
        if (result.success) {
          const operationName = ['Shock', 'Vibration', 'Beep'][operation];
          addNotification('success', 'Multishock Sent', 
            `${operationName} sent to ${result.successfulTargets}/${result.totalTargets} targets`);
        } else {
          throw new Error(result.error || 'Multishock command failed');
        }
      } else if (response.status === 403) {
        const error = await response.json();
        if (error.requiresControllerPlus) {
          setShowPurchaseModal(true);
          return;
        }
        throw new Error(error.error || 'Access denied');
      } else {
        throw new Error('Multishock command failed');
      }
    } catch (error) {
      console.error('Multishock error:', error);
      
      const errorMessage = error instanceof Error ? error.message : 'Failed to execute multishock command';
      
      if (!errorMessage.includes('Controller+')) {
        addNotification('error', 'Multishock Failed', errorMessage);
      }
    }
  };

  // Handle participant click in multi-select mode
  const handleParticipantClick = useCallback((user: any) => {
    if (isMultiSelectMode) {
      setSelectedUsers(prev => {
        const isSelected = prev.some(u => u.id === user.id);
        if (isSelected) {
          return prev.filter(u => u.id !== user.id);
        } else {
          return [...prev, user];
        }
      });
    } else {
      setSelectedUser(user);
    }
  }, [isMultiSelectMode]);

  // Get effective limits for multishock
  const getEffectiveLimits = useCallback(() => {
    if (selectedUsers.length === 0) {
      return { maxIntensity: 100, maxDuration: 15 };
    }

    let minIntensity = 100;
    let minDuration = 15;

    selectedUsers.forEach(user => {
      const status = userPiShockStatus[user.id];
      if (status) {
        if (status.maxIntensity < minIntensity) {
          minIntensity = status.maxIntensity;
        }
        if (status.maxDuration < minDuration) {
          minDuration = status.maxDuration;
        }
      }
    });

    return { maxIntensity: minIntensity, maxDuration: minDuration };
  }, [selectedUsers, userPiShockStatus]);

  // Check version on mount
  useEffect(() => {
    checkVersion();
  }, [checkVersion]);

  // Handle safety warning acceptance
  const handleSafetyAccept = () => {
    setSafetyAccepted(true);
  };

  // Handle purchase modal
  const handlePurchaseComplete = () => {
    refreshEntitlements();
    addNotification('success', 'Purchase Complete', 'Controller+ features are now available!');
  };

  const handleShowUpgradePrompt = () => {
    setShowPurchaseModal(true);
    return true; // Return true to indicate prompt was shown
  };

  // Loading screen
  if (loading) {
    return (
      <div className="h-screen w-screen bg-gradient-to-br from-purple-900 via-blue-900 to-indigo-900 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-white mx-auto mb-4"></div>
          <p className="text-white text-lg">Connecting to Discord...</p>
          <p className="text-gray-300 text-sm mt-2">Please wait while we establish a secure connection</p>
        </div>
      </div>
    );
  }

  // Safety warning (only in embedded mode)
  if (!safetyAccepted && isEmbedded) {
    return <SafetyWarning onAccept={handleSafetyAccept} />;
  }

  // Routes for legal pages
  return (
    <div className="h-screen w-screen bg-gradient-to-br from-purple-900 via-blue-900 to-indigo-900 text-white overflow-hidden">
      <Routes>
        <Route path="/terms" element={<TermsOfService onBack={() => navigate('/')} />} />
        <Route path="/privacy" element={<PrivacyPolicy onBack={() => navigate('/')} />} />
        <Route path="/" element={
          <div className="h-full flex flex-col">
            {/* Header */}
            <div className="flex-shrink-0 p-4 border-b border-white/10">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <div className="p-2 bg-purple-600/20 rounded-lg">
                    <Zap className="h-6 w-6 text-purple-400" />
                  </div>
                  <div>
                    <h1 className="text-xl font-bold">PiShock Controller</h1>
                    <p className="text-gray-300 text-sm">Discord Activity</p>
                  </div>
                  {hasControllerPlus && (
                    <div className="flex items-center space-x-1 px-2 py-1 bg-gradient-to-r from-yellow-500/20 to-orange-500/20 border border-yellow-500/30 rounded-full">
                      <Crown className="h-3 w-3 text-yellow-400" />
                      <span className="text-yellow-300 text-xs font-semibold">Controller+</span>
                    </div>
                  )}
                </div>
                
                <div className="flex items-center space-x-4">
                  <ConnectionStatus 
                    discordConnected={!!auth} 
                    piShockConnected={piShockConnected} 
                  />
                  
                  <div className="flex items-center space-x-2">
                    {!isMultiSelectMode && hasControllerPlus && (
                      <button
                        onClick={() => setIsMultiSelectMode(true)}
                        className="flex items-center space-x-1 px-3 py-1 bg-purple-600 hover:bg-purple-700 rounded-lg transition-colors text-sm font-medium"
                      >
                        <Users className="h-4 w-4" />
                        <span>Multi-Select</span>
                      </button>
                    )}
                    
                    {isMultiSelectMode && (
                      <button
                        onClick={() => {
                          setIsMultiSelectMode(false);
                          setSelectedUsers([]);
                        }}
                        className="flex items-center space-x-1 px-3 py-1 bg-gray-600 hover:bg-gray-700 rounded-lg transition-colors text-sm font-medium"
                      >
                        <Users className="h-4 w-4" />
                        <span>Exit Multi-Select</span>
                      </button>
                    )}
                    
                    <button
                      onClick={() => navigate('/terms')}
                      className="p-2 hover:bg-white/10 rounded-lg transition-colors"
                      title="Terms of Service"
                    >
                      <FileText className="h-4 w-4" />
                    </button>
                    
                    <button
                      onClick={() => navigate('/privacy')}
                      className="p-2 hover:bg-white/10 rounded-lg transition-colors"
                      title="Privacy Policy"
                    >
                      <Shield className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* Main Content */}
            <div className="flex-1 min-h-0 p-4">
              <div className="h-full grid grid-cols-1 lg:grid-cols-3 gap-4">
                {/* Left Column - User Selection */}
                <div className="lg:col-span-1">
                  <UserSelector
                    members={participants}
                    selectedUser={selectedUser}
                    onUserSelect={setSelectedUser}
                    currentUser={currentUser}
                    instanceData={instanceData}
                    userPiShockStatus={userPiShockStatus}
                    refreshParticipants={refreshParticipants}
                    isEmbedded={isEmbedded}
                    isMultiSelectMode={isMultiSelectMode}
                    selectedUsers={selectedUsers}
                    onParticipantClick={handleParticipantClick}
                    hasControllerPlus={hasControllerPlus}
                  />
                </div>

                {/* Middle Column - Controls */}
                <div className="lg:col-span-1 space-y-4">
                  {/* Multishock Controller (when in multi-select mode) */}
                  {isMultiSelectMode && (
                    <MultishockController
                      selectedUsers={selectedUsers}
                      hasControllerPlus={hasControllerPlus}
                      isRateLimited={isRateLimited}
                      effectiveLimits={getEffectiveLimits()}
                      isExecuting={false}
                      onMultishock={handleMultishock}
                      onUpgradePrompt={handleShowUpgradePrompt}
                    />
                  )}
                  
                  {/* Regular PiShock Controller */}
                  <PiShockController
                    selectedUser={isMultiSelectMode ? null : selectedUser}
                    onConnectionChange={setPiShockConnected}
                    isConnected={piShockConnected}
                    addNotification={addNotification}
                    instanceId={instanceId}
                    auth={auth}
                    currentUser={currentUser}
                    discordSdk={discordSdk!}
                    isEmbedded={isEmbedded}
                    layoutMode={layoutMode}
                    participants={participants}
                    isMultiSelectMode={isMultiSelectMode}
                    selectedUsers={selectedUsers}
                    hasControllerPlus={hasControllerPlus}
                    onMultishock={handleMultishock}
                  />
                </div>

                {/* Right Column - Activity Log */}
                <div className="lg:col-span-1">
                  <ActivityLog
                    instanceId={instanceId}
                    auth={auth}
                    addNotification={addNotification}
                  />
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="flex-shrink-0 p-4 border-t border-white/10">
              <div className="flex items-center justify-between text-sm text-gray-400">
                <div className="flex items-center space-x-4">
                  <span>Version: {__BUILD_VERSION__}</span>
                  {isOutdated && (
                    <span className="text-yellow-400">Update available - reloading in {Math.ceil(timeRemaining / 1000)}s</span>
                  )}
                  {isShuttingDown && (
                    <span className="text-red-400">Reloading...</span>
                  )}
                </div>
                
                <div className="flex items-center space-x-2">
                  <span>Last status check: {lastStatusRefresh ? new Date(lastStatusRefresh).toLocaleTimeString() : 'Never'}</span>
                  <button
                    onClick={refreshAllUserStatuses}
                    className="p-1 hover:bg-white/10 rounded transition-colors"
                    title="Refresh all user statuses"
                  >
                    <RefreshCw className="h-3 w-3" />
                  </button>
                </div>
              </div>
            </div>
          </div>
        } />
      </Routes>

      {/* Modals */}
      <ControllerPlusPurchaseModal
        isOpen={showPurchaseModal}
        onClose={() => setShowPurchaseModal(false)}
        onPurchaseComplete={handlePurchaseComplete}
        discordSdk={discordSdk}
        isEmbedded={isEmbedded}
        auth={auth}
      />

      {/* Notification System */}
      <NotificationSystem
        notifications={notifications}
        onDismiss={dismissNotification}
      />
    </div>
  );
}

export default App;