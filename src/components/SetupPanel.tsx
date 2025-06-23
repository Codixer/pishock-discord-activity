import React, { useState } from 'react';
import { Settings, Save, Loader, Zap, Shield, AlertTriangle } from 'lucide-react';

interface SetupPanelProps {
  userId: string;
  accessToken: string;
  onSetupComplete: (settings: any) => void;
}

export function SetupPanel({ userId, accessToken, onSetupComplete }: SetupPanelProps) {
  const [apiKey, setApiKey] = useState('');
  const [username, setUsername] = useState('');
  const [maxIntensity, setMaxIntensity] = useState(50);
  const [maxDuration, setMaxDuration] = useState(5);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const response = await fetch(`/api/users/${userId}/pishock/setup`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          apiKey,
          username,
          maxIntensity,
          maxDuration,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Setup failed');
      }

      onSetupComplete(data);
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Setup failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-black/20 backdrop-blur-md rounded-2xl border border-white/10 p-8">
      <div className="flex items-center space-x-3 mb-6">
        <div className="w-10 h-10 bg-gradient-to-r from-orange-500 to-red-600 rounded-lg flex items-center justify-center">
          <Settings className="w-6 h-6 text-white" />
        </div>
        <div>
          <h2 className="text-2xl font-bold">PiShock Setup</h2>
          <p className="text-gray-300">Configure your PiShock account to participate</p>
        </div>
      </div>

      <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-lg p-4 mb-6">
        <div className="flex items-start space-x-3">
          <Shield className="w-5 h-5 text-yellow-400 flex-shrink-0 mt-0.5" />
          <div className="text-sm">
            <p className="font-medium text-yellow-300 mb-1">Security Notice</p>
            <p className="text-yellow-200">
              Your API credentials are encrypted and stored securely. You maintain full control 
              over your devices and can set safety limits below.
            </p>
          </div>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-2">
            PiShock API Key
          </label>
          <input
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder="Enter your PiShock API key"
            className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all"
            required
          />
          <p className="text-xs text-gray-400 mt-1">
            Get your API key from{' '}
            <a 
              href="https://ps.pishock.com" 
              target="_blank" 
              rel="noopener noreferrer"
              className="text-purple-400 hover:text-purple-300"
            >
              ps.pishock.com
            </a>
          </p>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-300 mb-2">
            PiShock Username
          </label>
          <input
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="Your PiShock username"
            className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all"
            required
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Max Intensity ({maxIntensity}%)
            </label>
            <input
              type="range"
              min="1"
              max="100"
              value={maxIntensity}
              onChange={(e) => setMaxIntensity(parseInt(e.target.value))}
              className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer slider"
            />
            <div className="flex justify-between text-xs text-gray-400 mt-1">
              <span>1%</span>
              <span>100%</span>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Max Duration ({maxDuration}s)
            </label>
            <input
              type="range"
              min="1"
              max="30"
              value={maxDuration}
              onChange={(e) => setMaxDuration(parseInt(e.target.value))}
              className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer slider"
            />
            <div className="flex justify-between text-xs text-gray-400 mt-1">
              <span>1s</span>
              <span>30s</span>
            </div>
          </div>
        </div>

        {error && (
          <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-4">
            <div className="flex items-center space-x-2">
              <AlertTriangle className="w-5 h-5 text-red-400" />
              <p className="text-red-300">{error}</p>
            </div>
          </div>
        )}

        <button
          type="submit"
          disabled={loading || !apiKey || !username}
          className="w-full bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 disabled:from-gray-600 disabled:to-gray-700 disabled:cursor-not-allowed text-white font-semibold py-4 px-6 rounded-lg transition-all duration-200 flex items-center justify-center space-x-2"
        >
          {loading ? (
            <Loader className="w-5 h-5 animate-spin" />
          ) : (
            <Save className="w-5 h-5" />
          )}
          <span>
            {loading ? 'Configuring...' : 'Save Configuration'}
          </span>
        </button>
      </form>
    </div>
  );
}