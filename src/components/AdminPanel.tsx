import React, { useState } from 'react';
import { Skull, AlertTriangle, X, Shield, Loader } from 'lucide-react';

interface AdminPanelProps {
  auth: any;
  currentUser: any;
  instanceId: string;
  addNotification: (type: 'success' | 'error' | 'warning' | 'info', title: string, message: string) => void;
}

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

const ADMIN_USER_ID = '173839105615069184';

export function AdminPanel({ auth, currentUser, instanceId, addNotification }: AdminPanelProps) {
  const [showKillDialog, setShowKillDialog] = useState(false);
  const [killReason, setKillReason] = useState('');
  const [killing, setKilling] = useState(false);

  // Only show for admin user
  if (!currentUser || currentUser.id !== ADMIN_USER_ID) {
    return null;
  }

  const handleKillInstance = async () => {
    if (!killReason.trim()) {
      addNotification('warning', 'Reason Required', 'Please provide a reason for killing this instance');
      return;
    }

    setKilling(true);
    try {
      const response = await fetch(`${getApiBaseUrl()}/admin/kill-instance`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${auth.access_token}`,
        },
        body: JSON.stringify({
          instanceId,
          reason: killReason.trim(),
        }),
      });

      if (response.ok) {
        const result = await response.json();
        if (result.success) {
          addNotification('success', 'Instance Killed', `Instance ${instanceId} has been forcibly terminated. Reason: ${killReason}`);
          setShowKillDialog(false);
          setKillReason('');
          
          // Refresh the page after a short delay to show the session ended screen
          setTimeout(() => {
            window.location.reload();
          }, 2000);
        } else {
          throw new Error(result.error || 'Failed to kill instance');
        }
      } else {
        const errorText = await response.text();
        throw new Error(`HTTP ${response.status}: ${errorText}`);
      }
    } catch (error) {
      console.error('Failed to kill instance:', error);
      addNotification('error', 'Kill Failed', error instanceof Error ? error.message : 'Failed to kill instance');
    } finally {
      setKilling(false);
    }
  };

  return (
    <>
      {/* Admin Kill Button */}
      <button
        onClick={() => setShowKillDialog(true)}
        className="flex items-center space-x-2 px-3 py-1 bg-red-600 hover:bg-red-700 rounded-md text-xs transition-colors border border-red-500"
        title="Admin: Force kill this instance"
      >
        <Shield className="h-3 w-3" />
        <Skull className="h-3 w-3" />
        <span className="hidden sm:inline">Kill Instance</span>
      </button>

      {/* Kill Confirmation Dialog */}
      {showKillDialog && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-gradient-to-br from-gray-900 to-black border border-red-500/50 rounded-2xl p-6 max-w-md w-full shadow-2xl">
            <div className="text-center mb-6">
              <div className="mx-auto w-16 h-16 bg-red-500/20 rounded-full flex items-center justify-center mb-4">
                <Skull className="h-8 w-8 text-red-400" />
              </div>
              <h1 className="text-2xl font-bold text-white mb-2">Kill Instance</h1>
              <p className="text-gray-300 text-sm">
                This will forcibly terminate the Discord Activity instance{' '}
                <code className="bg-gray-800 px-1 rounded text-xs">{instanceId}</code>.
                All participants will be disconnected.
              </p>
            </div>

            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Reason for termination <span className="text-red-400">*</span>
              </label>
              <textarea
                value={killReason}
                onChange={(e) => setKillReason(e.target.value)}
                placeholder="Enter reason for killing this instance..."
                className="w-full px-3 py-2 bg-gray-800 border border-gray-600 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent transition-all text-sm resize-none"
                rows={3}
              />
            </div>

            <div className="bg-red-900/20 border border-red-500/30 rounded-lg p-3 mb-6">
              <div className="flex items-start space-x-3">
                <AlertTriangle className="h-4 w-4 text-red-400 flex-shrink-0 mt-0.5" />
                <div className="text-xs text-red-200">
                  <p className="font-semibold mb-1">Warning:</p>
                  <p>
                    This action cannot be undone. All participants will be immediately 
                    disconnected and the instance will be marked as terminated.
                  </p>
                </div>
              </div>
            </div>

            <div className="flex space-x-3">
              <button
                onClick={() => {
                  setShowKillDialog(false);
                  setKillReason('');
                }}
                disabled={killing}
                className="flex-1 py-3 px-4 bg-gray-700 hover:bg-gray-600 disabled:bg-gray-800 rounded-lg font-medium text-gray-300 transition-all"
              >
                Cancel
              </button>
              <button
                onClick={handleKillInstance}
                disabled={killing || !killReason.trim()}
                className="flex-1 py-3 px-4 bg-gradient-to-r from-red-600 to-red-700 hover:from-red-700 hover:to-red-800 disabled:from-gray-600 disabled:to-gray-700 disabled:cursor-not-allowed rounded-lg font-semibold text-white flex items-center justify-center space-x-2 transition-all"
              >
                {killing ? (
                  <Loader className="h-4 w-4 animate-spin" />
                ) : (
                  <Skull className="h-4 w-4" />
                )}
                <span>{killing ? 'Killing...' : 'Kill Instance'}</span>
              </button>
            </div>

            <div className="mt-4 text-center">
              <p className="text-xs text-gray-400">
                Admin Action • User ID: {currentUser.id}
              </p>
            </div>
          </div>
        </div>
      )}
    </>
  );
}