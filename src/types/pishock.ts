// PiShock API Types based on OpenAPI spec

export interface PiShockAuthResponse {
  UserId: number;
  Username: string;
  Email?: string;
}

export interface PiShockDevice {
  clientId: number;
  name: string;
  userId: number;
  username: string;
  shockers: PiShockShocker[];
}

export interface PiShockShocker {
  name: string;
  shockerId: number;
  isPaused: boolean;
  shockerType?: number;
}

export interface ShareCodesByOwner {
  [username: string]: number[];
}

export interface SharedShocker {
  shareId: number;
  clientId: number;
  shockerId: number;
  shockerName: string;
  isPaused: boolean;
  maxIntensity: number;
  canContinuous: boolean;
  canShock: boolean;
  canVibrate: boolean;
  canBeep: boolean;
  canLog: boolean;
  shareCode: string;
}

export interface SharedShockersByOwner {
  [username: string]: SharedShocker[];
}

export interface OperateRequest {
  code: string;
  duration: number;
  intensity: number;
  op: number; // 0=shock, 1=vibrate, 2=beep
  apikey: string;
  username: string;
  name: string;
  random: boolean;
  scale: boolean;
}

export interface UserCredentials {
  apiKey: string;
  username: string;
  userId?: number;
}

export interface UserSettings {
  credentials: UserCredentials;
  devices: PiShockDevice[];
  sharedShockers: SharedShockersByOwner;
  maxIntensity: number;
  maxDuration: number;
  lastUpdated: string;
}

export interface ActivityLogEntry {
  id: string;
  timestamp: string;
  executorId: string;
  executorName: string;
  targetDevice: string;
  targetShocker: string;
  action: 'shock' | 'vibrate' | 'beep';
  intensity: number;
  duration: number;
  shareCode: string;
}