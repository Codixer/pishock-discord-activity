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
import { useVersionCheck } from './hooks/useVersionCheck';
import { VersionWarning } from './components/VersionWarning';

// Global function to refresh user statuses
declare global {
  interface Window {
    refreshAllUserStatuses?: () => void;
  }
}

// Check if we're running in Discord's embedded environment
const urlParams = new URLSearchParams(window.location.search);
const isEmbedded = urlParams.has('frame_id');

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