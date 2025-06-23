import React, { useState, useEffect, useCallback } from 'react';
import { Routes, Route, useNavigate, useLocation } from 'react-router-dom';
import { DiscordSDK, Events } from '@discord/embedded-app-sdk';
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

// Global function to refresh user statuses
declare global {
  interface Window {
    refreshAllUserStatuses?: () => void;
  }
}

// Check if we're running in Discord's embedded environment
const urlParams = new URLSearchParams(window.location.search);
const isEmbedded = urlParams.has('frame_id');

// Check if we're in actual development environment
const isDevelopment = import.meta.env.DEV || 
                     window.location.hostname === 'localhost' || 
                     window.location.hostname === '127.0.0.1' ||
                     window.location.hostname.includes('bolt.new');

// If not embedded and not in development, user is visiting directly
const isDirectVisit = !isEmbedded && !isDevelopment;

// Debug environment variables
const envCheck = {
  client_id: import.meta.env.VITE_DISCORD_CLIENT_ID,
  is_placeholder: import.meta.env.VITE_DISCORD_CLIENT_ID === 'YOUR_DISCORD_CLIENT_ID_HERE',
  dev_mode: import.meta.env.DEV,
  env_keys: Object.keys(import.meta.env).filter(key => key.startsWith('VITE_')),
};
console.log('Environment check:', envCheck);

// Initialize Discord SDK with dummy parameters if not embedded
let discordSdk: DiscordSDK;

if (isEmbedded) {
  const clientId = import.meta.env.VITE_DISCORD_CLIENT_ID;
  if (!clientId || clientId === 'YOUR_DISCORD_CLIENT_ID_HERE') {
    console.error('❌ VITE_DISCORD_CLIENT_ID is not set or still using placeholder value');
    console.error('💡 Solution: Set VITE_DISCORD_CLIENT_ID in Cloudflare Pages Dashboard → Settings → Environment variables');
    throw new Error('Discord Client ID is required. Please set VITE_DISCORD_CLIENT_ID in Cloudflare Pages Dashboard');
  }
  discordSdk = new DiscordSDK(clientId);
} else {
  // Add dummy query parameters for development
  const dummyParams = new URLSearchParams({
    frame_id: 'dummy_frame_id',
    instance_id: 'dummy_instance_id',
    platform: 'desktop',
    sdk_version: '1.0.0'
  });
  
  // Temporarily modify the URL for SDK initialization
  const originalSearch = window.location.search;
  const newUrl = `${window.location.pathname}?${dummyParams.toString()}`;
  window.history.replaceState({}, '', newUrl);
  
  // For development, use a dummy client ID if not set
  const clientId = import.meta.env.VITE_DISCORD_CLIENT_ID || 'dev_dummy_client_id';
  discordSdk = new DiscordSDK(clientId);
  
  // Restore original URL
  window.history.replaceState({}, '', `${window.location.pathname}${originalSearch}`);
}

// Helper function to get the correct API base URL
function getApiBaseUrl(): string {
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
  const [isInstanceValid, setIsInstanceValid] = useState(true);
  const { notifications, addNotification, dismissNotification } = useNotifications();
  const navigate = useNavigate();
  
  // Get current version from build
  const currentVersion = __BUILD_VERSION__;
  
  // Custom hooks for managing instance data and participants
  const { instanceData, updateInstanceData } = useInstanceData(instanceId);
  const { participants, updateParticipants } = useParticipants(discordSdk, isEmbedded);

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
    
    console.log('Graceful shutdown completed');
  }, [isEmbedded, updateParticipants]);

  // Show Discord-only message for direct visits
  if (isDirectVisit) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-900 via-indigo-900 to-purple-900 text-white flex items-center justify-center p-4">
        <div className="max-w-2xl w-full text-center">
          <div className="mb-8">
            <div className="mx-auto w-20 h-20 bg-blue-500/20 rounded-full flex items-center justify-center mb-6">
              <img 
                src="/kVApvT6y_400x400 copy.jpg" 
                alt="PiShock Controller Logo" 
                className="w-12 h-12 object-contain"
              />
            </div>
            <h1 className="text-4xl font-bold mb-4">PiShock Controller</h1>
            <p className="text-xl text-blue-200 mb-8">Discord Activity Application</p>
          </div>

          <div className="bg-black/20 backdrop-blur-sm rounded-2xl border border-white/10 p-8 mb-8">
            <div className="flex items-center justify-center mb-6">
              <div className="bg-blue-500/20 rounded-full p-4">
                <svg className="w-12 h-12 text-blue-400" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z"/>
                </svg>
              </div>
            </div>
            
            <h2 className="text-2xl font-bold mb-4 text-white">Discord Activity Only</h2>
            <p className="text-gray-300 mb-6 leading-relaxed">
              PiShock Controller is a <strong>Discord Activity</strong> that only works inside Discord. 
              You cannot use this application directly from a web browser.
            </p>
            
            <div className="bg-blue-900/20 border border-blue-500/30 rounded-lg p-4 mb-6">
              <h3 className="text-lg font-semibold text-blue-300 mb-2">How to Use:</h3>
              <ol className="text-left text-sm text-blue-200 space-y-2">
                <li>1. Join a Discord voice channel or start a DM</li>
                <li>2. Click the Activities button (rocket ship icon)</li>
                <li>3. Find and launch "PiShock Controller"</li>
                <li>4. Configure your PiShock credentials safely</li>
              </ol>
            </div>
          </div>

          <div className="space-y-4">
            <a
              href="https://discord.com/oauth2/authorize?client_id=1386335035522809937"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center space-x-3 w-full py-4 px-6 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 rounded-xl font-semibold text-lg transition-all transform hover:scale-105 shadow-lg"
            >
              <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
                <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z"/>
              </svg>
              <span>Open Discord & Add to Server</span>
            </a>
            
            <p className="text-sm text-gray-400">
              Don't have Discord? <a href="https://discord.com/download" target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:text-blue-300 underline">Download it here</a>
            </p>
          </div>

          <div className="mt-12 pt-8 border-t border-white/10">
            <div className="bg-red-900/20 border border-red-500/30 rounded-lg p-4">
              <div className="flex items-center justify-center space-x-2 mb-2">
                <svg className="w-5 h-5 text-red-400" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                </svg>
                <span className="text-red-300 text-sm font-semibold">Safety Notice</span>
              </div>
              <p className="text-red-200 text-xs">
                This application controls electrical shock devices. Only use with explicit consent, 
                proper safety measures, and in compliance with all applicable laws.
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Function to check PiShock status for all participants
  const checkAllUserPiShockStatus = async () => {
    // Don't check PiShock status in development mode
    if (!isEmbedded) return;
    
    if (!instanceId || !auth || participants.length === 0) return;

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
        if (isEmbedded) {
          await discordSdk.ready();
          
          // Get instance ID immediately after SDK construction
          const currentInstanceId = discordSdk.instanceId;
          setInstanceId(currentInstanceId);

          // Verify instance with Discord's API before proceeding
          console.log('Verifying Discord instance:', currentInstanceId);
          const verifyResponse = await fetch(`${getApiBaseUrl()}/verify-instance?application_id=${import.meta.env.VITE_DISCORD_CLIENT_ID}&instance_id=${currentInstanceId}`);
          
          if (!verifyResponse.ok) {
            console.error('Instance verification failed:', verifyResponse.status);
            setIsInstanceValid(false);
            setLoading(false);
            addNotification('error', 'Invalid Session', 'This Discord Activity session is not valid or has expired.');
            return;
          }

          const verifyData = await verifyResponse.json();
          if (!verifyData.valid) {
            console.error('Instance not valid:', verifyData.error);
            setIsInstanceValid(false);
            setLoading(false);
            addNotification('error', 'Invalid Session', verifyData.error || 'This Discord Activity session is not valid.');
            return;
          }

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

          const { access_token, user } = await response.json();
          
          const authResult = await discordSdk.commands.authenticate({
            access_token,
          });

          setAuth(authResult);

          // Subscribe to participant updates
          discordSdk.subscribe(
            Events.ACTIVITY_INSTANCE_PARTICIPANTS_UPDATE,
            (data: any) => {
              updateParticipants(data.participants);
            }
          );

          // Get initial participants
          const initialParticipants = await discordSdk.commands.getInstanceConnectedParticipants();
          updateParticipants(initialParticipants.participants);

          addNotification('success', 'Connected', 'Successfully connected to Discord');
        } else {
          // Development environment - only allow in actual dev mode
          console.log('Development mode: Using mock Discord data');
          const mockInstanceId = 'dev_instance_123';
          setInstanceId(mockInstanceId);
          
          const mockAuth = {
            user: {
              id: 'dev_user_123',
              username: 'DevUser',
              discriminator: '0001',
              avatar: null,
              global_name: 'Development User'
            }
          };
          
          const mockParticipants = [
            {
              id: 'dev_user_123',
              username: 'DevUser',
              discriminator: '0001',
              avatar: null,
              global_name: 'Development User'
            },
            {
              id: 'test_user_456',
              username: 'TestUser',
              discriminator: '0002',
              avatar: null,
              global_name: 'Test User'
            }
          ];

          setAuth(mockAuth);
          updateParticipants(mockParticipants);
          addNotification('info', 'Development Mode', 'Running in development mode with mock data');
        }

        setLoading(false);
      } catch (error) {
        console.error('Discord initialization error:', error);
        // Silently ignore BigInt conversion errors in development mode
        if (!isEmbedded && error instanceof Error && error.message.includes('Cannot convert')) {
          console.warn('Ignoring BigInt conversion error in development mode:', error.message);
          setLoading(false);
          return;
        }
        addNotification('error', 'Connection Failed', 'Failed to connect to Discord. Please try again.');
        setLoading(false);
      }
    };

    initializeDiscord();

    // Cleanup subscriptions on unmount
    return () => {
      if (isEmbedded && discordSdk) {
        discordSdk.unsubscribe(Events.ACTIVITY_INSTANCE_PARTICIPANTS_UPDATE, updateParticipants);
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
            const responseText = await response.text();
            console.warn('Expected JSON response but received:', responseText.substring(0, 200));
            // Silently ignore non-JSON responses in development mode
            if (!isEmbedded) {
              console.warn('Ignoring non-JSON response in development mode');
              return {};
            }
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
          // Silently ignore JSON parsing errors in development mode
          if (!isEmbedded && (error.message.includes('Unexpected token') || error.message.includes('not valid JSON'))) {
            console.warn('Ignoring JSON parsing error in development mode:', error.message);
            return;
          }
          // Only show notification for non-development errors
          if (isEmbedded) {
            addNotification('warning', 'Data Load Failed', 'Could not load instance data');
          }
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
    if (!instanceId || !auth || participants.length === 0) return;

    // Optimized frequency: Check status every 2 minutes to align with backend cache TTL (120 seconds)
    const interval = setInterval(() => {
      checkAllUserPiShockStatus();
    }, 120000); // 2 minutes - matches backend cache duration

    return () => clearInterval(interval);
  }, [instanceId, auth, participants]);

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
        // Silently ignore save errors in development mode
        if (isEmbedded) {
          addNotification('warning', 'Save Failed', 'Could not save instance data');
        }
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

  // Show invalid session message
  if (!isInstanceValid) {
    return (
      <div className="h-screen w-screen bg-gradient-to-br from-red-900 via-red-800 to-orange-900 text-white overflow-hidden flex items-center justify-center">
        <div className="text-center max-w-md p-8">
          <div className="w-16 h-16 mx-auto mb-6 bg-red-500/20 rounded-full flex items-center justify-center">
            <AlertTriangle className="h-8 w-8 text-red-400" />
          </div>
          <h1 className="text-3xl font-bold mb-4">Invalid Session</h1>
          <p className="text-red-200 mb-6">
            This Discord Activity session is not valid or has expired. Discord Activity sessions have a maximum duration of 6 hours for security and performance reasons.
          </p>
          <div className="space-y-3">
            <button
              onClick={() => window.close()}
              className="w-full py-3 px-6 bg-red-600 hover:bg-red-700 rounded-lg font-semibold transition-colors"
            >
              Close Session
            </button>
            <p className="text-sm text-red-300 text-center">
              To continue using PiShock Controller, please start a new Discord Activity session from your Discord server or DM.
            </p>
          </div>
        </div>
      </div>
    );
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
      <div className="flex-1 overflow-hidden">
        <div className="h-full max-w-7xl mx-auto px-4 sm:px-6 py-4">
          <div className={`h-full grid gap-2 sm:gap-4 ${showActivityLog ? 'grid-cols-1 lg:grid-cols-4' : 'grid-cols-1 lg:grid-cols-3'}`}>
            {/* User Selection */}
            <div className="lg:col-span-1 flex flex-col min-h-0">
              <UserSelector
                members={participants}
                selectedUser={selectedUser}
                onUserSelect={setSelectedUser}
                currentUser={auth?.user}
                instanceData={instanceData}
                userPiShockStatus={userPiShockStatus}
              />
            </div>

            {/* Main Controller */}
            <div className={`${showActivityLog ? 'lg:col-span-2' : 'lg:col-span-2'} flex flex-col min-h-0 order-1 lg:order-none`}>
              <PiShockController
                selectedUser={selectedUser}
                onConnectionChange={setPiShockConnected}
                isConnected={piShockConnected}
                addNotification={addNotification}
                instanceId={instanceId}
                auth={auth}
                currentUser={auth?.user}
                discordSdk={discordSdk}
                isEmbedded={isEmbedded}
              />
            </div>

            {/* Activity Log */}
            {showActivityLog && (
              <div className="lg:col-span-1 flex flex-col min-h-0 order-2 lg:order-none">
                <ActivityLog
                  instanceId={instanceId}
                  auth={auth}
                  addNotification={addNotification}
                />
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Footer Safety Information */}
      <div className="flex-shrink-0 bg-red-900/20 border-t border-red-500/30 px-4 sm:px-6 py-2">
        <div className="max-w-7xl mx-auto">
          <div className="flex items-center justify-between">
            <div className="flex items-start space-x-3 flex-1">
            <AlertTriangle className="h-5 w-5 text-red-400 flex-shrink-0 mt-0.5" />
            <div className="min-w-0">
              <h3 className="text-sm font-semibold text-red-300 mb-1">Safety Reminders</h3>
              <div className="text-xs text-red-200 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-4 gap-y-1">
                <span>• Always ensure explicit consent</span>
                <span>• Start with lowest intensity</span>
                <span>• Have emergency procedures ready</span>
                <span>• All actions are publicly logged</span>
              </div>
            </div>
            </div>
            
          </div>
        </div>
      </div>
      
      {/* Version Indicator - Bottom Right */}
      <div className="fixed bottom-4 right-4 z-40 flex items-center space-x-2 bg-black/40 backdrop-blur-sm border border-white/10 rounded-lg px-3 py-2 text-xs">
        <div className="flex items-center space-x-2">
          <div className="w-2 h-2 rounded-full bg-green-400"></div>
          <span className="text-gray-300 font-medium">
            {import.meta.env.DEV ? 'dev' : `v${currentVersion.slice(-8)}`}
          </span>
        </div>
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