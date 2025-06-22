import React, { useState, useEffect, useCallback } from 'react';
import { 
  Zap, 
  Settings, 
  Shield, 
  AlertTriangle, 
  Clock, 
  StopCircle, 
  CheckCircle, 
  Activity,
  RefreshCw,
  Lock,
  Unlock,
  Timer,
  Target
} from 'lucide-react';

interface Device {
  clientId: number;
  name: string;
  userId: number;
  username: string;
  shockers: Shocker[];
}

interface Shocker {
  name: string;
  shockerId: number;
  isPaused: boolean;
  shockerType: number;
}

interface SafetyConfig {
  maxIntensity: number;
  maxDuration: number;
  maxShocksPerHour: number;
  minDelayBetweenShocks: number;
}

interface SafetyStatus {
  shocksInLastHour: number;
  lastShockTime: number;
  isInCooldown: boolean;
  cooldownRemaining: number;
  shocksRemaining: number;
}

interface ShockCollarControlProps {
  onBack?: () => void;
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

export function ShockCollarControl({ onBack }: ShockCollarControlProps) {
  // Authentication state
  const [apiKey, setApiKey] = useState('');
  const [username, setUsername] = useState('');
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [authLoading, setAuthLoading] = useState(false);

  // Device state
  const [devices, setDevices] = useState<Device[]>([]);
  const [selectedDevice, setSelectedDevice] = useState<Device | null>(null);
  const [selectedShocker, setSelectedShocker] = useState<Shocker | null>(null);
  const [devicesLoading, setDevicesLoading] = useState(false);

  // Control parameters
  const [intensity, setIntensity] = useState(1);
  const [duration, setDuration] = useState(1);

  // Safety configuration
  const [safetyConfig, setSafetyConfig] = useState<SafetyConfig>({
    maxIntensity: 30,
    maxDuration: 5,
    maxShocksPerHour: 10,
    minDelayBetweenShocks: 30
  });

  // Safety status
  const [safetyStatus, setSafetyStatus] = useState<SafetyStatus>({
    shocksInLastHour: 0,
    lastShockTime: 0,
    isInCooldown: false,
    cooldownRemaining: 0,
    shocksRemaining: 0
  });

  // UI state
  const [isExecuting, setIsExecuting] = useState(false);
  const [emergencyStop, setEmergencyStop] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error' | 'warning' | 'info'; message: string } | null>(null);

  // Update safety status every second
  useEffect(() => {
    const interval = setInterval(updateSafetyStatus, 1000);
    return () => clearInterval(interval);
  }, [safetyConfig, safetyStatus.lastShockTime]);

  const updateSafetyStatus = useCallback(() => {
    const now = Date.now();
    const hourAgo = now - (60 * 60 * 1000);
    
    // Calculate cooldown remaining
    const timeSinceLastShock = now - safetyStatus.lastShockTime;
    const cooldownTime = safetyConfig.minDelayBetweenShocks * 1000;
    const cooldownRemaining = Math.max(0, cooldownTime - timeSinceLastShock);
    
    // Calculate shocks remaining in current hour
    const shocksRemaining = Math.max(0, safetyConfig.maxShocksPerHour - safetyStatus.shocksInLastHour);
    
    setSafetyStatus(prev => ({
      ...prev,
      isInCooldown: cooldownRemaining > 0,
      cooldownRemaining: Math.ceil(cooldownRemaining / 1000),
      shocksRemaining
    }));
  }, [safetyConfig, safetyStatus.lastShockTime, safetyStatus.shocksInLastHour]);

  const authenticateUser = async () => {
    if (!apiKey.trim() || !username.trim()) {
      setFeedback({ type: 'error', message: 'Please provide both API key and username' });
      return;
    }

    setAuthLoading(true);
    setFeedback(null);

    try {
      // Validate credentials by attempting to get user devices
      const response = await fetch(`https://ps.pishock.com/PiShock/GetUserDevices?userId=0&token=${encodeURIComponent(apiKey)}&api=true`, {
        method: 'GET',
        headers: {
          'User-Agent': 'PiShock-Control-System/1.0',
          'Accept': 'application/json'
        }
      });

      if (!response.ok) {
        throw new Error(`Authentication failed: HTTP ${response.status}`);
      }

      const responseText = await response.text();
      let devicesData;
      
      try {
        devicesData = JSON.parse(responseText);
      } catch (parseError) {
        throw new Error('Invalid response from PiShock API. Please check your credentials.');
      }

      if (!Array.isArray(devicesData)) {
        throw new Error('Invalid credentials or no devices found');
      }

      setDevices(devicesData);
      setIsAuthenticated(true);
      setFeedback({ type: 'success', message: `Successfully authenticated. Found ${devicesData.length} device(s).` });
      
      // Clear sensitive data from memory
      setApiKey('');
      
    } catch (error) {
      console.error('Authentication error:', error);
      setFeedback({ 
        type: 'error', 
        message: error instanceof Error ? error.message : 'Authentication failed. Please check your credentials.' 
      });
    } finally {
      setAuthLoading(false);
    }
  };

  const selectDevice = (device: Device) => {
    setSelectedDevice(device);
    setSelectedShocker(null);
    setFeedback({ type: 'info', message: `Selected device: ${device.name}. Choose a shocker to continue.` });
  };

  const selectShocker = (shocker: Shocker) => {
    if (shocker.isPaused) {
      setFeedback({ type: 'warning', message: 'This shocker is paused and cannot be used.' });
      return;
    }
    
    setSelectedShocker(shocker);
    setFeedback({ type: 'success', message: `Selected shocker: ${shocker.name}. System ready for operation.` });
  };

  const executeShock = async () => {
    if (!selectedDevice || !selectedShocker || emergencyStop) return;

    // Safety checks
    if (safetyStatus.isInCooldown) {
      setFeedback({ type: 'error', message: `Cooldown active. Wait ${safetyStatus.cooldownRemaining} seconds before next shock.` });
      return;
    }

    if (safetyStatus.shocksRemaining <= 0) {
      setFeedback({ type: 'error', message: 'Hourly shock limit reached. Wait for the hour to reset.' });
      return;
    }

    if (intensity > safetyConfig.maxIntensity) {
      setFeedback({ type: 'error', message: `Intensity ${intensity}% exceeds safety limit of ${safetyConfig.maxIntensity}%` });
      return;
    }

    if (duration > safetyConfig.maxDuration) {
      setFeedback({ type: 'error', message: `Duration ${duration}s exceeds safety limit of ${safetyConfig.maxDuration}s` });
      return;
    }

    setIsExecuting(true);
    setFeedback({ type: 'info', message: 'Executing shock command...' });

    try {
      const payload = {
        code: selectedShocker.shockerId.toString(),
        duration: duration,
        intensity: intensity,
        op: 0, // 0 = shock
        apikey: apiKey,
        username: username,
        name: 'ShockCollarControl-System',
        random: false,
        scale: false
      };

      const response = await fetch('https://ps.pishock.com/PiShock/Operate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'PiShock-Control-System/1.0'
        },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        throw new Error(`Shock execution failed: HTTP ${response.status}`);
      }

      // Update safety tracking
      const now = Date.now();
      setSafetyStatus(prev => ({
        ...prev,
        shocksInLastHour: prev.shocksInLastHour + 1,
        lastShockTime: now
      }));

      setFeedback({ 
        type: 'success', 
        message: `Shock delivered successfully: ${intensity}% intensity for ${duration}s. Remaining shocks this hour: ${safetyStatus.shocksRemaining - 1}` 
      });

    } catch (error) {
      console.error('Shock execution error:', error);
      setFeedback({ 
        type: 'error', 
        message: error instanceof Error ? error.message : 'Shock execution failed. Please try again.' 
      });
    } finally {
      setIsExecuting(false);
    }
  };

  const executeVibrate = async () => {
    if (!selectedDevice || !selectedShocker || emergencyStop) return;

    // Safety checks (same as shock but with vibrate operation)
    if (safetyStatus.isInCooldown) {
      setFeedback({ type: 'error', message: `Cooldown active. Wait ${safetyStatus.cooldownRemaining} seconds before next command.` });
      return;
    }

    setIsExecuting(true);
    setFeedback({ type: 'info', message: 'Executing vibrate command...' });

    try {
      const payload = {
        code: selectedShocker.shockerId.toString(),
        duration: duration,
        intensity: intensity,
        op: 1, // 1 = vibrate
        apikey: apiKey,
        username: username,
        name: 'ShockCollarControl-System',
        random: false,
        scale: false
      };

      const response = await fetch('https://ps.pishock.com/PiShock/Operate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'PiShock-Control-System/1.0'
        },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        throw new Error(`Vibrate execution failed: HTTP ${response.status}`);
      }

      setFeedback({ 
        type: 'success', 
        message: `Vibrate command delivered: ${intensity}% intensity for ${duration}s` 
      });

    } catch (error) {
      console.error('Vibrate execution error:', error);
      setFeedback({ 
        type: 'error', 
        message: error instanceof Error ? error.message : 'Vibrate execution failed. Please try again.' 
      });
    } finally {
      setIsExecuting(false);
    }
  };

  const activateEmergencyStop = () => {
    setEmergencyStop(true);
    setIsExecuting(false);
    setFeedback({ type: 'warning', message: 'EMERGENCY STOP ACTIVATED - All operations halted' });
  };

  const deactivateEmergencyStop = () => {
    setEmergencyStop(false);
    setFeedback({ type: 'info', message: 'Emergency stop deactivated - System ready for operation' });
  };

  const resetSafetyCounters = () => {
    setSafetyStatus(prev => ({
      ...prev,
      shocksInLastHour: 0,
      lastShockTime: 0,
      isInCooldown: false,
      cooldownRemaining: 0,
      shocksRemaining: safetyConfig.maxShocksPerHour
    }));
    setFeedback({ type: 'info', message: 'Safety counters reset' });
  };

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-red-900 via-red-800 to-orange-900 text-white p-4">
        <div className="max-w-md mx-auto">
          {onBack && (
            <button
              onClick={onBack}
              className="mb-4 text-red-200 hover:text-white transition-colors text-sm"
            >
              ← Back to Main App
            </button>
          )}
          
          <div className="bg-black/40 backdrop-blur-sm rounded-2xl border border-red-500/20 p-6">
            <div className="text-center mb-6">
              <div className="mx-auto w-16 h-16 bg-red-500/20 rounded-full flex items-center justify-center mb-4">
                <Shield className="h-8 w-8 text-red-400" />
              </div>
              <h1 className="text-2xl font-bold mb-2">Shock Collar Control System</h1>
              <p className="text-red-200 text-sm">
                Professional device management with advanced safety features
              </p>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  PiShock API Key
                </label>
                <input
                  type="password"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  className="w-full px-3 py-2 bg-gray-800 border border-gray-600 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent transition-all"
                  placeholder="Enter your API key"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Username
                </label>
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="w-full px-3 py-2 bg-gray-800 border border-gray-600 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent transition-all"
                  placeholder="Enter your username"
                />
              </div>

              <button
                onClick={authenticateUser}
                disabled={authLoading || !apiKey.trim() || !username.trim()}
                className="w-full py-3 px-4 bg-gradient-to-r from-red-600 to-red-700 hover:from-red-700 hover:to-red-800 disabled:from-gray-600 disabled:to-gray-700 disabled:cursor-not-allowed rounded-lg font-semibold flex items-center justify-center space-x-2 transition-all"
              >
                {authLoading ? (
                  <RefreshCw className="h-5 w-5 animate-spin" />
                ) : (
                  <CheckCircle className="h-5 w-5" />
                )}
                <span>{authLoading ? 'Authenticating...' : 'Authenticate'}</span>
              </button>

              {feedback && (
                <div className={`p-3 rounded-lg border ${
                  feedback.type === 'success' ? 'bg-green-900/20 border-green-500/30 text-green-200' :
                  feedback.type === 'error' ? 'bg-red-900/20 border-red-500/30 text-red-200' :
                  feedback.type === 'warning' ? 'bg-yellow-900/20 border-yellow-500/30 text-yellow-200' :
                  'bg-blue-900/20 border-blue-500/30 text-blue-200'
                }`}>
                  <p className="text-sm">{feedback.message}</p>
                </div>
              )}
            </div>

            <div className="mt-6 p-3 bg-red-900/20 border border-red-500/30 rounded-lg">
              <div className="flex items-start space-x-2">
                <AlertTriangle className="h-4 w-4 text-red-400 flex-shrink-0 mt-0.5" />
                <p className="text-xs text-red-200">
                  This system controls electrical shock devices. Only use with explicit consent and proper safety precautions.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-black text-white p-4">
      <div className="max-w-6xl mx-auto">
        {onBack && (
          <button
            onClick={onBack}
            className="mb-4 text-gray-400 hover:text-white transition-colors text-sm"
          >
            ← Back to Main App
          </button>
        )}

        {/* Header */}
        <div className="bg-black/40 backdrop-blur-sm rounded-xl border border-white/10 p-6 mb-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold mb-2">Shock Collar Control System</h1>
              <p className="text-gray-400">Professional device management with safety controls</p>
            </div>
            <div className="flex items-center space-x-4">
              <button
                onClick={emergencyStop ? deactivateEmergencyStop : activateEmergencyStop}
                className={`px-4 py-2 rounded-lg font-semibold flex items-center space-x-2 transition-all ${
                  emergencyStop 
                    ? 'bg-green-600 hover:bg-green-700 text-white' 
                    : 'bg-red-600 hover:bg-red-700 text-white'
                }`}
              >
                <StopCircle className="h-5 w-5" />
                <span>{emergencyStop ? 'Deactivate E-Stop' : 'Emergency Stop'}</span>
              </button>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Device Selection */}
          <div className="bg-black/40 backdrop-blur-sm rounded-xl border border-white/10 p-6">
            <h2 className="text-lg font-semibold mb-4 flex items-center space-x-2">
              <Target className="h-5 w-5 text-blue-400" />
              <span>Device Selection</span>
            </h2>

            <div className="space-y-4">
              <div>
                <h3 className="text-sm font-medium text-gray-300 mb-2">Available Devices ({devices.length})</h3>
                <div className="space-y-2">
                  {devices.map((device) => (
                    <button
                      key={device.clientId}
                      onClick={() => selectDevice(device)}
                      className={`w-full p-3 rounded-lg border text-left transition-all ${
                        selectedDevice?.clientId === device.clientId
                          ? 'bg-blue-600/20 border-blue-500/50 ring-2 ring-blue-500/20'
                          : 'bg-gray-800/50 border-gray-600/50 hover:bg-gray-700/50'
                      }`}
                    >
                      <div className="font-medium">{device.name}</div>
                      <div className="text-sm text-gray-400">{device.shockers.length} shocker(s)</div>
                    </button>
                  ))}
                </div>
              </div>

              {selectedDevice && (
                <div>
                  <h3 className="text-sm font-medium text-gray-300 mb-2">Shockers</h3>
                  <div className="space-y-2">
                    {selectedDevice.shockers.map((shocker) => (
                      <button
                        key={shocker.shockerId}
                        onClick={() => selectShocker(shocker)}
                        disabled={shocker.isPaused}
                        className={`w-full p-3 rounded-lg border text-left transition-all ${
                          shocker.isPaused
                            ? 'bg-gray-700/30 border-gray-600/30 opacity-50 cursor-not-allowed'
                            : selectedShocker?.shockerId === shocker.shockerId
                            ? 'bg-green-600/20 border-green-500/50 ring-2 ring-green-500/20'
                            : 'bg-gray-800/50 border-gray-600/50 hover:bg-gray-700/50'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-medium">{shocker.name}</span>
                          {shocker.isPaused ? (
                            <Lock className="h-4 w-4 text-red-400" />
                          ) : (
                            <Unlock className="h-4 w-4 text-green-400" />
                          )}
                        </div>
                        <div className="text-xs text-gray-400">ID: {shocker.shockerId}</div>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Control Panel */}
          <div className="bg-black/40 backdrop-blur-sm rounded-xl border border-white/10 p-6">
            <h2 className="text-lg font-semibold mb-4 flex items-center space-x-2">
              <Zap className="h-5 w-5 text-yellow-400" />
              <span>Control Panel</span>
            </h2>

            {!selectedShocker ? (
              <div className="text-center py-8 text-gray-400">
                <AlertTriangle className="h-12 w-12 mx-auto mb-3 opacity-50" />
                <p>Select a device and shocker to continue</p>
              </div>
            ) : (
              <div className="space-y-6">
                {/* Selected Device Info */}
                <div className="p-3 bg-blue-900/20 border border-blue-500/30 rounded-lg">
                  <div className="text-sm text-blue-300">
                    <strong>Selected:</strong> {selectedDevice?.name} → {selectedShocker.name}
                  </div>
                </div>

                {/* Parameter Controls */}
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">
                      Intensity: {intensity}% (Max: {safetyConfig.maxIntensity}%)
                    </label>
                    <input
                      type="range"
                      min="1"
                      max={safetyConfig.maxIntensity}
                      value={intensity}
                      onChange={(e) => setIntensity(parseInt(e.target.value))}
                      className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">
                      Duration: {duration}s (Max: {safetyConfig.maxDuration}s)
                    </label>
                    <input
                      type="range"
                      min="1"
                      max={safetyConfig.maxDuration}
                      value={duration}
                      onChange={(e) => setDuration(parseInt(e.target.value))}
                      className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer"
                    />
                  </div>
                </div>

                {/* Action Buttons */}
                <div className="grid grid-cols-2 gap-3">
                  <button
                    onClick={executeShock}
                    disabled={isExecuting || emergencyStop || safetyStatus.isInCooldown || safetyStatus.shocksRemaining <= 0}
                    className="py-3 px-4 bg-gradient-to-r from-red-600 to-red-700 hover:from-red-700 hover:to-red-800 disabled:from-gray-600 disabled:to-gray-700 disabled:cursor-not-allowed rounded-lg font-semibold flex items-center justify-center space-x-2 transition-all"
                  >
                    <Zap className="h-5 w-5" />
                    <span>Shock</span>
                  </button>

                  <button
                    onClick={executeVibrate}
                    disabled={isExecuting || emergencyStop || safetyStatus.isInCooldown}
                    className="py-3 px-4 bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 disabled:from-gray-600 disabled:to-gray-700 disabled:cursor-not-allowed rounded-lg font-semibold flex items-center justify-center space-x-2 transition-all"
                  >
                    <Activity className="h-5 w-5" />
                    <span>Vibrate</span>
                  </button>
                </div>

                {isExecuting && (
                  <div className="text-center">
                    <div className="inline-flex items-center space-x-2 text-yellow-400">
                      <RefreshCw className="h-4 w-4 animate-spin" />
                      <span className="text-sm">Executing command...</span>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Safety Panel */}
          <div className="space-y-6">
            {/* Safety Status */}
            <div className="bg-black/40 backdrop-blur-sm rounded-xl border border-white/10 p-6">
              <h2 className="text-lg font-semibold mb-4 flex items-center space-x-2">
                <Shield className="h-5 w-5 text-green-400" />
                <span>Safety Status</span>
              </h2>

              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="p-3 bg-gray-800/50 rounded-lg">
                    <div className="text-sm text-gray-400">Shocks This Hour</div>
                    <div className="text-lg font-semibold">
                      {safetyStatus.shocksInLastHour}/{safetyConfig.maxShocksPerHour}
                    </div>
                  </div>

                  <div className="p-3 bg-gray-800/50 rounded-lg">
                    <div className="text-sm text-gray-400">Remaining</div>
                    <div className="text-lg font-semibold text-green-400">
                      {safetyStatus.shocksRemaining}
                    </div>
                  </div>
                </div>

                {safetyStatus.isInCooldown && (
                  <div className="p-3 bg-yellow-900/20 border border-yellow-500/30 rounded-lg">
                    <div className="flex items-center space-x-2">
                      <Timer className="h-4 w-4 text-yellow-400" />
                      <div>
                        <div className="text-sm font-medium text-yellow-300">Cooldown Active</div>
                        <div className="text-xs text-yellow-400">
                          {safetyStatus.cooldownRemaining}s remaining
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {emergencyStop && (
                  <div className="p-3 bg-red-900/20 border border-red-500/30 rounded-lg">
                    <div className="flex items-center space-x-2">
                      <StopCircle className="h-4 w-4 text-red-400" />
                      <div className="text-sm font-medium text-red-300">Emergency Stop Active</div>
                    </div>
                  </div>
                )}

                <button
                  onClick={resetSafetyCounters}
                  className="w-full py-2 px-3 bg-gray-700 hover:bg-gray-600 rounded-lg text-sm font-medium transition-colors"
                >
                  Reset Safety Counters
                </button>
              </div>
            </div>

            {/* Safety Configuration */}
            <div className="bg-black/40 backdrop-blur-sm rounded-xl border border-white/10 p-6">
              <h2 className="text-lg font-semibold mb-4 flex items-center space-x-2">
                <Settings className="h-5 w-5 text-purple-400" />
                <span>Safety Configuration</span>
              </h2>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Max Intensity: {safetyConfig.maxIntensity}%
                  </label>
                  <input
                    type="range"
                    min="1"
                    max="100"
                    value={safetyConfig.maxIntensity}
                    onChange={(e) => setSafetyConfig(prev => ({ ...prev, maxIntensity: parseInt(e.target.value) }))}
                    className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Max Duration: {safetyConfig.maxDuration}s
                  </label>
                  <input
                    type="range"
                    min="1"
                    max="15"
                    value={safetyConfig.maxDuration}
                    onChange={(e) => setSafetyConfig(prev => ({ ...prev, maxDuration: parseInt(e.target.value) }))}
                    className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Max Shocks/Hour: {safetyConfig.maxShocksPerHour}
                  </label>
                  <input
                    type="range"
                    min="1"
                    max="20"
                    value={safetyConfig.maxShocksPerHour}
                    onChange={(e) => setSafetyConfig(prev => ({ ...prev, maxShocksPerHour: parseInt(e.target.value) }))}
                    className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Min Delay: {safetyConfig.minDelayBetweenShocks}s
                  </label>
                  <input
                    type="range"
                    min="5"
                    max="300"
                    value={safetyConfig.minDelayBetweenShocks}
                    onChange={(e) => setSafetyConfig(prev => ({ ...prev, minDelayBetweenShocks: parseInt(e.target.value) }))}
                    className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer"
                  />
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Feedback */}
        {feedback && (
          <div className={`mt-6 p-4 rounded-xl border ${
            feedback.type === 'success' ? 'bg-green-900/20 border-green-500/30' :
            feedback.type === 'error' ? 'bg-red-900/20 border-red-500/30' :
            feedback.type === 'warning' ? 'bg-yellow-900/20 border-yellow-500/30' :
            'bg-blue-900/20 border-blue-500/30'
          }`}>
            <p className={`${
              feedback.type === 'success' ? 'text-green-200' :
              feedback.type === 'error' ? 'text-red-200' :
              feedback.type === 'warning' ? 'text-yellow-200' :
              'text-blue-200'
            }`}>
              {feedback.message}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}