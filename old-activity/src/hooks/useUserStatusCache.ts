import { useState, useCallback, useRef, useMemo } from 'react';

interface UserStatus {
  isConnected: boolean;
  hasDevice: boolean;
  hasCredentials: boolean;
  deviceCount: number;
  piShockUserId?: string;
  isRelay: boolean;
  maxIntensity: number;
  maxDuration: number;
  maxIntensityOverriddenByApi?: boolean;
  maxDurationOverriddenByApi?: boolean;
  canShock?: boolean;
  canVibrate?: boolean;
  canBeep?: boolean;
  canPause?: boolean;
  commandsPaused?: boolean;
  bannedExecutors: string[];
  lastChecked: number;
}

interface CacheEntry {
  data: UserStatus;
  timestamp: number;
  expiresAt: number;
}

// Client-side cache for user status to reduce API calls
// Event-driven architecture: status is checked on events, not polling
export function useUserStatusCache() {
  const cache = useRef<Map<string, CacheEntry>>(new Map());
  const [lastCacheUpdate, setLastCacheUpdate] = useState(0);
  
  const CACHE_DURATION = 300000; // 5 minutes cache on client side (reduced from 1 min)

  const getCachedStatus = useCallback((userId: string): UserStatus | null => {
    const entry = cache.current.get(userId);
    if (!entry) return null;
    
    const now = Date.now();
    if (now > entry.expiresAt) {
      cache.current.delete(userId);
      return null;
    }
    
    return entry.data;
  }, []);

  const setCachedStatus = useCallback((userId: string, status: UserStatus) => {
    const now = Date.now();
    const entry: CacheEntry = {
      data: { ...status, lastChecked: now },
      timestamp: now,
      expiresAt: now + CACHE_DURATION
    };
    
    // Check if data has changed before updating cache
    const existing = cache.current.get(userId);
    if (existing) {
      const hasChanges = existing.data.isConnected !== status.isConnected ||
                        existing.data.hasCredentials !== status.hasCredentials ||
                        existing.data.maxIntensity !== status.maxIntensity ||
                        existing.data.maxDuration !== status.maxDuration ||
                        existing.data.commandsPaused !== status.commandsPaused ||
                        existing.data.canShock !== status.canShock ||
                        existing.data.canVibrate !== status.canVibrate ||
                        existing.data.canBeep !== status.canBeep ||
                        existing.data.canPause !== status.canPause ||
                        existing.data.maxIntensityOverriddenByApi !== status.maxIntensityOverriddenByApi ||
                        existing.data.maxDurationOverriddenByApi !== status.maxDurationOverriddenByApi;
      
      if (!hasChanges) {
        return false; // No changes, don't update cache
      }
    }
    
    cache.current.set(userId, entry);
    setLastCacheUpdate(now);
    return true; // Cache was updated
  }, []);

  const invalidateUser = useCallback((userId: string) => {
    cache.current.delete(userId);
    setLastCacheUpdate(Date.now());
  }, []);

  const clearCache = useCallback(() => {
    cache.current.clear();
    setLastCacheUpdate(Date.now());
  }, []);

  const getCacheStats = useCallback(() => {
    const now = Date.now();
    const entries = Array.from(cache.current.entries());
    const validEntries = entries.filter(([_, entry]) => now <= entry.expiresAt);
    
    return {
      totalEntries: cache.current.size,
      validEntries: validEntries.length,
      expiredEntries: cache.current.size - validEntries.length,
      lastUpdate: lastCacheUpdate
    };
  }, [lastCacheUpdate]);

  // Clean up expired entries periodically
  const cleanupExpired = useCallback(() => {
    const now = Date.now();
    let cleaned = 0;
    
    for (const [userId, entry] of cache.current.entries()) {
      if (now > entry.expiresAt) {
        cache.current.delete(userId);
        cleaned++;
      }
    }
    
    if (cleaned > 0) {
      setLastCacheUpdate(now);
    }
    
    return cleaned;
  }, []);

  return useMemo(() => ({
    getCachedStatus,
    setCachedStatus,
    invalidateUser,
    clearCache,
    getCacheStats,
    cleanupExpired
  }), [getCachedStatus, setCachedStatus, invalidateUser, clearCache, getCacheStats, cleanupExpired]);
}