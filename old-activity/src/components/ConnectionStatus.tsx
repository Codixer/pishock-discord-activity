import React from 'react';
import { Wifi, WifiOff, Zap } from 'lucide-react';

interface ConnectionStatusProps {
  discordConnected: boolean;
  piShockConnected: boolean;
}

export function ConnectionStatus({ discordConnected, piShockConnected }: ConnectionStatusProps) {
  return (
    <div className="flex items-center space-x-4">
      <div className="flex items-center space-x-2">
        <div className={`w-2 h-2 rounded-full ${discordConnected ? 'bg-green-400' : 'bg-red-400'}`} />
        <span className="text-sm text-gray-300">Discord</span>
        {discordConnected ? (
          <Wifi className="h-4 w-4 text-green-400" />
        ) : (
          <WifiOff className="h-4 w-4 text-red-400" />
        )}
      </div>
      
      <div className="flex items-center space-x-2">
        <div className={`w-2 h-2 rounded-full ${piShockConnected ? 'bg-green-400' : 'bg-red-400'}`} />
        <span className="text-sm text-gray-300">PiShock</span>
        <Zap className={`h-4 w-4 ${piShockConnected ? 'text-green-400' : 'text-red-400'}`} />
      </div>
    </div>
  );
}