import { useState, useEffect, useCallback } from 'react';

interface PersistentStateOptions {
  storage?: 'localStorage' | 'sessionStorage';
  serializer?: {
    serialize: (value: any) => string;
    deserialize: (value: string) => any;
  };
}

const defaultSerializer = {
  serialize: JSON.stringify,
  deserialize: JSON.parse
};

export function usePersistentState<T>(
  key: string,
  defaultValue: T,
  options: PersistentStateOptions = {}
): [T, (value: T | ((prev: T) => T)) => void, () => void] {
  const {
    storage = 'localStorage',
    serializer = defaultSerializer
  } = options;

  const [state, setState] = useState<T>(() => {
    try {
      const stored = window[storage].getItem(key);
      if (stored !== null) {
        return serializer.deserialize(stored);
      }
    } catch (error) {
      console.warn(`Failed to read ${key} from ${storage}:`, error);
    }
    return defaultValue;
  });

  const setValue = useCallback((value: T | ((prev: T) => T)) => {
    try {
      const valueToStore = value instanceof Function ? value(state) : value;
      setState(valueToStore);
      window[storage].setItem(key, serializer.serialize(valueToStore));
    } catch (error) {
      console.warn(`Failed to save ${key} to ${storage}:`, error);
    }
  }, [key, state, storage, serializer]);

  const removeValue = useCallback(() => {
    try {
      window[storage].removeItem(key);
      setState(defaultValue);
    } catch (error) {
      console.warn(`Failed to remove ${key} from ${storage}:`, error);
    }
  }, [key, defaultValue, storage]);

  return [state, setValue, removeValue];
}

// Global state manager using persistent storage
class GlobalStateManager {
  private listeners = new Map<string, Set<(value: any) => void>>();
  private storage: Storage;

  constructor(storage: Storage = localStorage) {
    this.storage = storage;
  }

  subscribe<T>(key: string, callback: (value: T) => void): () => void {
    if (!this.listeners.has(key)) {
      this.listeners.set(key, new Set());
    }
    this.listeners.get(key)!.add(callback);

    // Return unsubscribe function
    return () => {
      const callbacks = this.listeners.get(key);
      if (callbacks) {
        callbacks.delete(callback);
        if (callbacks.size === 0) {
          this.listeners.delete(key);
        }
      }
    };
  }

  get<T>(key: string, defaultValue?: T): T | undefined {
    try {
      const item = this.storage.getItem(key);
      return item ? JSON.parse(item) : defaultValue;
    } catch (error) {
      console.warn(`Failed to get ${key} from storage:`, error);
      return defaultValue;
    }
  }

  set<T>(key: string, value: T): void {
    try {
      this.storage.setItem(key, JSON.stringify(value));
      
      // Notify all subscribers
      const callbacks = this.listeners.get(key);
      if (callbacks) {
        callbacks.forEach(callback => callback(value));
      }
    } catch (error) {
      console.warn(`Failed to set ${key} in storage:`, error);
    }
  }

  remove(key: string): void {
    try {
      this.storage.removeItem(key);
      
      // Notify all subscribers
      const callbacks = this.listeners.get(key);
      if (callbacks) {
        callbacks.forEach(callback => callback(undefined));
      }
    } catch (error) {
      console.warn(`Failed to remove ${key} from storage:`, error);
    }
  }
}

export const globalState = new GlobalStateManager();

// Hook for global state management
export function useGlobalState<T>(
  key: string,
  defaultValue: T
): [T, (value: T) => void, () => void] {
  const [state, setState] = useState<T>(() => 
    globalState.get(key, defaultValue)
  );

  useEffect(() => {
    const unsubscribe = globalState.subscribe<T>(key, (value) => {
      setState(value ?? defaultValue);
    });

    return unsubscribe;
  }, [key, defaultValue]);

  const setValue = useCallback((value: T) => {
    globalState.set(key, value);
  }, [key]);

  const removeValue = useCallback(() => {
    globalState.remove(key);
  }, [key]);

  return [state, setValue, removeValue];
}