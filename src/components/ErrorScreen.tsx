import React from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface ErrorScreenProps {
  error: string;
  onRetry: () => void;
}

export function ErrorScreen({ error, onRetry }: ErrorScreenProps) {
  return (
    <div className="min-h-screen bg-gradient-to-br from-red-900 via-purple-900 to-pink-900 flex items-center justify-center p-4">
      <div className="bg-black/20 backdrop-blur-sm rounded-2xl border border-red-500/20 p-8 max-w-md w-full text-center">
        <div className="w-16 h-16 bg-red-500/20 rounded-full flex items-center justify-center mx-auto mb-6">
          <AlertTriangle className="w-8 h-8 text-red-400" />
        </div>
        
        <h1 className="text-2xl font-bold text-white mb-4">
          Connection Failed
        </h1>
        
        <p className="text-gray-300 mb-6">
          {error}
        </p>
        
        <button
          onClick={onRetry}
          className="w-full bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white font-semibold py-3 px-6 rounded-lg transition-all duration-200 flex items-center justify-center space-x-2"
        >
          <RefreshCw className="w-5 h-5" />
          <span>Retry Connection</span>
        </button>
      </div>
    </div>
  );
}