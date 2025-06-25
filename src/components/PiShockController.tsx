Here's the fixed version with all missing closing brackets added:

```javascript
import React, { useState, useEffect } from 'react';
import { Zap, Settings, Play, Square, AlertTriangle, Wifi, Save, Loader, User, Shield, Lock, ExternalLink } from 'lucide-react';
import { DiscordSDK, Common } from '@discord/embedded-app-sdk';

interface PiShockControllerProps {
  selectedUser: any;
  onConnectionChange: (connected: boolean) => void;
  isConnected: boolean;
  addNotification: (type: 'success' | 'error' | 'warning' | 'info', title: string, message: string) => void;
  instanceId: string;
  auth: any;
  currentUser: any;
  discordSdk: DiscordSDK;
  isEmbedded: boolean;
  layoutMode?: number;
}

// Helper function to get the correct API base URL
function getApiBaseUrl(): string {
  const urlParams = new URLSearchParams(window.location.search);
  const isEmbedded = urlParams.has('frame_id');
  
  if (isEmbedded) {
    // Use Discord's proxy for embedded environment
    return '/.proxy/api';
  }
  return '/api';
}

export function PiShockController({ 
  selectedUser, 
  onConnectionChange, 
  isConnected, 
  addNotification, 
  instanceId, 
  auth,
  currentUser,
  discordSdk,
  isEmbedded,
  layoutMode = Common.LayoutModeTypeObject.FOCUSED,
  participants = []
}: PiShockControllerProps) {
  // ... [rest of the component code remains unchanged until the return statement]

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Settings Panel */}
      {!isPipMode && (
        <div className={\`bg-black/20 backdrop-blur-sm rounded-xl border border-white/10 p-4 flex-shrink-0 ${
          showSettings ? 'max-h-96 overflow-y-auto' : ''
        }`}>
        </div>
      )}

      <div className={\`bg-black/20 backdrop-blur-sm rounded-xl border border-white/10 flex-1 flex flex-col min-h-0 overflow-hidden ${isPipMode ? 'p-2' : 'p-6'} ${
        showSettings ? 'mt-4' : ''
      }`}>
        {/* ... [control panel content] ... */}
      </div>
    </div>
  );
}
```