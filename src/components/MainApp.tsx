import React, { useState, useEffect } from 'react';
import { DiscordSDK, Events } from '@discord/embedded-app-sdk';
import { Header } from './Header';
import { SetupPanel } from './SetupPanel';
import { ControlPanel } from './ControlPanel';
import { ParticipantsList } from './ParticipantsList';
import { ActivityFeed } from './ActivityFeed';
import { NotificationSystem } from './NotificationSystem';
import { useNotifications } from '../hooks/useNotifications';
import { useParticipants } from '../hooks/useParticipants';
import type { UserSettings } from '../types/pishock';

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

interface MainAppProps {
  discordSdk: DiscordSDK;
  auth: any;
  instanceId: string;
}

export function MainApp({ discordSdk, auth, instanceId }: MainAppProps) {
  const [userSettings, setUserSettings] = useState<UserSettings | null>(null);
  const [selectedTarget, setSelectedTarget] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  
  const { notifications, addNotification, removeNotification } = useNotifications();
  const { participants, updateParticipants } = useParticipants();

  useEffect(() => {
    initializeActivity();
  }, []);

  const initializeActivity = async () => {
    try {
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

      // Load user's PiShock settings
      await loadUserSettings();

      setLoading(false);
    } catch (error) {
      console.error('Failed to initialize activity:', error);
      addNotification('error', 'Initialization Failed', 'Could not initialize the activity');
      setLoading(false);
    }
  };

  const loadUserSettings = async () => {
    try {
      const response = await fetch(`${getApiBaseUrl()}/users/${auth.user.id}/pishock/setup`, {
        headers: {
          'Authorization': `Bearer ${auth.access_token}`,
        },
      });

      if (response.ok) {
        const data = await response.json();
        if (data.configured) {
          setUserSettings(data);
        }
      }
    } catch (error) {
      console.error('Failed to load user settings:', error);
    }
  };

  const handleSetupComplete = (settings: UserSettings) => {
    setUserSettings(settings);
    addNotification('success', 'Setup Complete', 'PiShock configuration saved successfully');
  };

  const handleOperationComplete = () => {
    addNotification('success', 'Command Sent', 'Operation executed successfully');
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-indigo-900 via-purple-900 to-pink-900 flex items-center justify-center">
        <div className="text-white text-lg">Loading activity...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-900 via-purple-900 to-pink-900 text-white">
      <Header 
        user={auth.user}
        participantCount={participants.length}
        instanceId={instanceId}
      />
      
      <div className="container mx-auto px-4 py-6">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Setup and Control */}
          <div className="lg:col-span-2 space-y-6">
            {!userSettings ? (
              <SetupPanel
                userId={auth.user.id}
                accessToken={auth.access_token}
                onSetupComplete={handleSetupComplete}
              />
            ) : (
              <ControlPanel
                userSettings={userSettings}
                selectedTarget={selectedTarget}
                auth={auth}
                onOperationComplete={handleOperationComplete}
              />
            )}
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            <ParticipantsList
              participants={participants}
              currentUser={auth.user}
              selectedTarget={selectedTarget}
              onTargetSelect={setSelectedTarget}
            />
            
            <ActivityFeed
              accessToken={auth.access_token}
            />
          </div>
        </div>
      </div>

      <NotificationSystem
        notifications={notifications}
        onRemove={removeNotification}
      />
    </div>
  );
}