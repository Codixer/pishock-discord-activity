import React from 'react';
import { Zap, Users, Activity } from 'lucide-react';

interface HeaderProps {
  user: any;
  participantCount: number;
  instanceId: string;
}

export function Header({ user, participantCount, instanceId }: HeaderProps) {
  return (
    <header className="bg-black/20 backdrop-blur-md border-b border-white/10">
      <div className="container mx-auto px-4 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <div className="w-12 h-12 bg-gradient-to-r from-blue-500 to-purple-600 rounded-xl flex items-center justify-center shadow-lg">
              <Zap className="w-7 h-7 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold">PiShock Controller</h1>
              <p className="text-sm text-gray-300">Discord Activity</p>
            </div>
          </div>

          <div className="flex items-center space-x-6">
            <div className="flex items-center space-x-2 text-sm">
              <Users className="w-4 h-4 text-blue-400" />
              <span className="text-gray-300">{participantCount} participant{participantCount !== 1 ? 's' : ''}</span>
            </div>

            <div className="flex items-center space-x-2 text-sm">
              <Activity className="w-4 h-4 text-green-400" />
              <span className="text-gray-300">Instance: {instanceId.slice(-8)}</span>
            </div>

            <div className="flex items-center space-x-3">
              <img
                src={user.avatar || `https://cdn.discordapp.com/embed/avatars/0.png`}
                alt={user.displayName}
                className="w-10 h-10 rounded-full border-2 border-purple-500/30"
              />
              <div className="text-sm">
                <div className="font-medium">{user.displayName}</div>
                <div className="text-gray-400">@{user.username}</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}