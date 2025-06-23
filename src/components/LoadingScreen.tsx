import React from 'react';
import { Zap, Loader } from '../icons';

export function LoadingScreen() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-900 via-purple-900 to-pink-900 flex items-center justify-center">
      <div className="text-center">
        <div className="relative mb-8">
          <div className="w-20 h-20 bg-gradient-to-r from-blue-500 to-purple-600 rounded-full flex items-center justify-center mx-auto shadow-2xl">
            <Zap className="w-10 h-10 text-white" />
          </div>
          <div className="absolute inset-0 bg-gradient-to-r from-blue-500 to-purple-600 rounded-full animate-ping opacity-20"></div>
        </div>
        
        <h1 className="text-4xl font-bold text-white mb-4">
          PiShock Controller
        </h1>
        
        <p className="text-gray-300 text-lg mb-8">
          Connecting to Discord...
        </p>
        
        <div className="flex items-center justify-center space-x-2 text-blue-400">
          <Loader className="w-5 h-5 animate-spin" />
          <span className="text-sm">Initializing Discord Activity</span>
        </div>
      </div>
    </div>
  );
}