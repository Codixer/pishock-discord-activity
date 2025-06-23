import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { DiscordSDK, Events } from '@discord/embedded-app-sdk';
import { MainApp } from './components/MainApp';
import { LoadingScreen } from './components/LoadingScreen';
import { ErrorScreen } from './components/ErrorScreen';

// Initialize Discord SDK
const discordSdk = new DiscordSDK(import.meta.env.VITE_DISCORD_CLIENT_ID);

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

export default function App() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [auth, setAuth] = useState<any>(null);
  const [instanceId, setInstanceId] = useState<string>('');

  useEffect(() => {
    initializeDiscord();
  }, []);

  const initializeDiscord = async () => {
    try {
      // Initialize Discord SDK
      await discordSdk.ready();
      
      // Get instance ID
      const currentInstanceId = discordSdk.instanceId;
      setInstanceId(currentInstanceId);

      // Authenticate with Discord
      const { code } = await discordSdk.commands.authorize({
        client_id: import.meta.env.VITE_DISCORD_CLIENT_ID,
        response_type: 'code',
        state: '',
        prompt: 'none',
        scope: ['identify', 'guilds', 'guilds.members.read'],
      });

      // Exchange code for token via our backend
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

      if (!response.ok) {
        throw new Error('Failed to authenticate with Discord');
      }

      const authData = await response.json();

      // Authenticate with Discord SDK
      const authResult = await discordSdk.commands.authenticate({
        access_token: authData.access_token,
      });

      setAuth({
        ...authResult,
        user: authData.user,
        access_token: authData.access_token,
      });

      setLoading(false);
    } catch (error) {
      console.error('Discord initialization error:', error);
      setError(error instanceof Error ? error.message : 'Failed to initialize Discord');
      setLoading(false);
    }
  };

  if (loading) {
    return <LoadingScreen />;
  }

  if (error) {
    return <ErrorScreen error={error} onRetry={initializeDiscord} />;
  }

  return (
    <Router>
      <Routes>
        <Route 
          path="/*" 
          element={
            <MainApp 
              discordSdk={discordSdk}
              auth={auth}
              instanceId={instanceId}
            />
          } 
        />
      </Routes>
    </Router>
  );
}