import { useEffect, useRef, useState } from 'react';
import { AlertTriangle, Bug, Trash2, X } from 'lucide-react';

interface AdminDevMenuProps {
  isOpen: boolean;
  onClose: () => void;
  auth: any;
  addNotification: (type: 'success' | 'error' | 'warning' | 'info', title: string, message: string) => void;
}

function getApiBaseUrl(): string {
  const urlParams = new URLSearchParams(window.location.search);
  const isEmbedded = urlParams.has('frame_id');
  return isEmbedded ? '/.proxy/api' : '/api';
}

export function AdminDevMenu({ isOpen, onClose, auth, addNotification }: AdminDevMenuProps) {
  const [debugUserId, setDebugUserId] = useState('');
  const [debugPayload, setDebugPayload] = useState<any>(null);
  const [debugLoading, setDebugLoading] = useState(false);
  const [purgeReason, setPurgeReason] = useState('');
  const [confirmUserIdInput, setConfirmUserIdInput] = useState('');
  const [purging, setPurging] = useState(false);
  const lastFetchedDebugUserId = useRef('');

  useEffect(() => {
    setDebugPayload(null);
    setConfirmUserIdInput('');
    setPurgeReason('');
    lastFetchedDebugUserId.current = '';
  }, [debugUserId]);

  if (!isOpen) return null;

  const authHeaders = {
    Authorization: `Bearer ${auth?.access_token || ''}`,
    'Content-Type': 'application/json',
  };

  const loadUserDebug = async () => {
    if (!debugUserId.trim()) {
      addNotification('warning', 'Missing User ID', 'Enter a user ID to inspect.');
      return;
    }

    setDebugLoading(true);
    try {
      const response = await fetch(`${getApiBaseUrl()}/admin/users/${encodeURIComponent(debugUserId.trim())}`, {
        headers: { Authorization: authHeaders.Authorization },
      });
      const data = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Failed to load user debug data');
      }
      setDebugPayload(data.data);
      lastFetchedDebugUserId.current = debugUserId.trim();
      addNotification('success', 'User Data Loaded', `Fetched debug payload for ${debugUserId.trim()}.`);
    } catch (error) {
      addNotification(
        'error',
        'User Debug',
        error instanceof Error ? error.message : 'Failed to load user debug data'
      );
    } finally {
      setDebugLoading(false);
    }
  };

  const purgeUserData = async () => {
    const trimmedUserId = debugUserId.trim();
    if (!trimmedUserId) {
      addNotification('warning', 'Missing User ID', 'Enter a user ID first.');
      return;
    }
    if (confirmUserIdInput.trim() !== trimmedUserId) {
      addNotification('warning', 'Confirmation Required', 'Type the exact user ID to confirm deletion.');
      return;
    }
    if (!purgeReason.trim()) {
      addNotification('warning', 'Reason Required', 'Provide a reason before purging.');
      return;
    }
    if (lastFetchedDebugUserId.current !== trimmedUserId) {
      addNotification(
        'warning',
        'Stale debug data',
        'Fetch user data again for this user ID before purging.'
      );
      return;
    }

    setPurging(true);
    try {
      const response = await fetch(`${getApiBaseUrl()}/admin/users/${encodeURIComponent(trimmedUserId)}`, {
        method: 'DELETE',
        headers: authHeaders,
        body: JSON.stringify({
          confirmUserId: trimmedUserId,
          reason: purgeReason.trim(),
        }),
      });
      const data = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Failed to purge user data');
      }
      setDebugPayload(data);
      addNotification('success', 'User Purged', 'User data deleted and matching activity logs anonymized.');
    } catch (error) {
      addNotification('error', 'Purge Failed', error instanceof Error ? error.message : 'Failed to purge user data');
    } finally {
      setPurging(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-start justify-center p-4 overflow-y-auto">
      <div className="w-full max-w-5xl bg-slate-900 border border-white/10 rounded-xl shadow-2xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/10">
          <div className="flex items-center gap-2">
            <Bug className="h-5 w-5 text-amber-300" />
            <h2 className="text-lg font-semibold text-white">Admin / Dev Menu</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-md hover:bg-white/10 transition-colors"
            aria-label="Close admin menu"
          >
            <X className="h-5 w-5 text-gray-300" />
          </button>
        </div>

        <div className="p-5 space-y-6">
          <section className="bg-black/20 border border-white/10 rounded-lg p-4">
            <h3 className="text-sm font-semibold text-emerald-200 mb-3">User Debug Data</h3>
            <div className="flex flex-col md:flex-row gap-3">
              <input
                value={debugUserId}
                onChange={(event) => setDebugUserId(event.target.value)}
                placeholder="Discord User ID"
                className="px-3 py-2 rounded-md bg-gray-900 border border-gray-700 text-sm flex-1"
              />
              <button
                onClick={loadUserDebug}
                disabled={debugLoading}
                className="px-3 py-2 rounded-md bg-emerald-700 hover:bg-emerald-600 text-xs disabled:opacity-50"
              >
                {debugLoading ? 'Loading...' : 'Fetch User Data'}
              </button>
            </div>
            <div className="mt-3 bg-gray-950 border border-gray-800 rounded p-3 max-h-64 overflow-auto">
              <pre className="text-[11px] text-gray-200 whitespace-pre-wrap">
                {debugPayload ? JSON.stringify(debugPayload, null, 2) : 'No debug data loaded.'}
              </pre>
            </div>
          </section>

          <section className="bg-red-950/30 border border-red-700/50 rounded-lg p-4">
            <div className="flex items-center gap-2 mb-2">
              <AlertTriangle className="h-4 w-4 text-red-300" />
              <h3 className="text-sm font-semibold text-red-200">Danger Zone: Purge User Data</h3>
            </div>
            <p className="text-xs text-red-100/80 mb-3">
              Deletes known user tokens/data keys and anonymizes matching activity log actors/targets to "Deleted User".
            </p>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <input
                value={confirmUserIdInput}
                onChange={(event) => setConfirmUserIdInput(event.target.value)}
                placeholder="Type target user ID to confirm"
                className="px-3 py-2 rounded-md bg-gray-900 border border-red-700/50 text-sm"
              />
              <input
                value={purgeReason}
                onChange={(event) => setPurgeReason(event.target.value)}
                placeholder="Reason (required)"
                className="px-3 py-2 rounded-md bg-gray-900 border border-red-700/50 text-sm"
              />
              <button
                onClick={purgeUserData}
                disabled={purging}
                className="px-3 py-2 rounded-md bg-red-700 hover:bg-red-600 text-xs disabled:opacity-50 inline-flex items-center justify-center gap-2"
              >
                <Trash2 className="h-3 w-3" />
                {purging ? 'Purging...' : 'Delete All User Data'}
              </button>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
