import React from 'react';
import { AlertTriangle, Clock, RefreshCw, X } from 'lucide-react';

interface VersionWarningProps {
  timeRemaining: number;
  onForceShutdown: () => void;
  onRefresh: () => void;
}

export function VersionWarning({ timeRemaining, onForceShutdown, onRefresh }: VersionWarningProps) {
  const minutes = Math.floor(timeRemaining / 60);
  const seconds = timeRemaining % 60;
  
  const getUrgencyColor = () => {
    if (timeRemaining <= 10) return 'from-red-600 to-red-700';
    if (timeRemaining <= 30) return 'from-orange-600 to-orange-700';
    return 'from-yellow-600 to-yellow-700';
  };

  const getProgressWidth = () => {
    return ((300 - timeRemaining) / 300) * 100;
  };

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-gradient-to-br from-gray-900 to-black border border-yellow-500/50 rounded-2xl p-6 max-w-md w-full shadow-2xl">
        <div className="text-center mb-6">
          <div className="mx-auto w-16 h-16 bg-yellow-500/20 rounded-full flex items-center justify-center mb-4">
            <AlertTriangle className="h-8 w-8 text-yellow-400 animate-pulse" />
          </div>
          <h1 className="text-2xl font-bold text-white mb-2">Application Updated</h1>
          <p className="text-gray-300 text-sm">
            A new version has been deployed. This session will automatically close in 5 minutes to ensure all participants use the same version.
          </p>
        </div>

        {/* Countdown Display */}
        <div className="mb-6">
          <div className="flex items-center justify-center space-x-2 mb-3">
            <Clock className="h-5 w-5 text-yellow-400" />
            <span className="text-2xl font-bold text-white">
              {minutes > 0 ? `${minutes}:${seconds.toString().padStart(2, '0')}` : `${seconds}s`}
            </span>
          </div>
          
          {/* Progress Bar */}
          <div className="w-full bg-gray-700 rounded-full h-3 overflow-hidden">
            <div 
              className={`h-full bg-gradient-to-r ${getUrgencyColor()} transition-all duration-1000 ease-linear`}
              style={{ width: `${getProgressWidth()}%` }}
            />
          </div>
          
          <p className="text-center text-gray-400 text-xs mt-2">
            Time remaining until automatic session closure
          </p>
        </div>

        {/* Action Buttons */}
        <div className="space-y-3">
          <button
            onClick={onRefresh}
            className="w-full py-3 px-4 bg-gradient-to-r from-green-600 to-green-700 hover:from-green-700 hover:to-green-800 rounded-lg font-semibold text-white flex items-center justify-center space-x-2 transition-all"
          >
            <RefreshCw className="h-5 w-5" />
            <span>Refresh to New Version</span>
          </button>
          
          <button
            onClick={onForceShutdown}
            className="w-full py-2 px-4 bg-gray-700 hover:bg-gray-600 rounded-lg font-medium text-gray-300 flex items-center justify-center space-x-2 transition-all"
          >
            <X className="h-4 w-4" />
            <span>Close Now</span>
          </button>
        </div>

        {/* Additional Info */}
        <div className="mt-4 p-3 bg-blue-900/20 border border-blue-500/30 rounded-lg">
          <p className="text-blue-200 text-xs text-center">
            <strong>Why is this necessary?</strong><br />
            All participants must use the same version to prevent compatibility issues and ensure proper functionality. 
            This ensures everyone has access to the latest features and security updates.
          </p>
        </div>
      </div>
    </div>
  );
}