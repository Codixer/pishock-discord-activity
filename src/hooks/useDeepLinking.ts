import { useEffect, useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { globalState } from './usePersistentState';

interface DeepLinkState {
  selectedUserId?: string;
  instanceId?: string;
  showActivityLog?: boolean;
  compactMode?: boolean;
  [key: string]: any;
}

export function useDeepLinking() {
  const location = useLocation();
  const navigate = useNavigate();

  // Parse URL parameters and hash fragments for deep linking
  const parseDeepLinkParams = useCallback((): DeepLinkState => {
    const params = new URLSearchParams(location.search);
    const hash = location.hash.slice(1); // Remove #
    
    const state: DeepLinkState = {};
    
    // Parse URL parameters
    if (params.has('user')) state.selectedUserId = params.get('user')!;
    if (params.has('instance')) state.instanceId = params.get('instance')!;
    if (params.has('log')) state.showActivityLog = params.get('log') === 'true';
    if (params.has('compact')) state.compactMode = params.get('compact') === 'true';
    
    // Parse hash fragments for additional state
    if (hash) {
      try {
        const hashParams = new URLSearchParams(hash);
        hashParams.forEach((value, key) => {
          state[key] = value;
        });
      } catch (error) {
        console.warn('Failed to parse hash parameters:', error);
      }
    }
    
    return state;
  }, [location.search, location.hash]);

  // Generate URL with current state for sharing
  const generateShareableUrl = useCallback((state: DeepLinkState) => {
    const params = new URLSearchParams();
    
    if (state.selectedUserId) params.set('user', state.selectedUserId);
    if (state.instanceId) params.set('instance', state.instanceId);
    if (state.showActivityLog !== undefined) params.set('log', state.showActivityLog.toString());
    if (state.compactMode !== undefined) params.set('compact', state.compactMode.toString());
    
    const hashParams = new URLSearchParams();
    Object.entries(state).forEach(([key, value]) => {
      if (!['selectedUserId', 'instanceId', 'showActivityLog', 'compactMode'].includes(key) && value !== undefined) {
        hashParams.set(key, String(value));
      }
    });
    
    let url = location.pathname;
    if (params.toString()) url += `?${params.toString()}`;
    if (hashParams.toString()) url += `#${hashParams.toString()}`;
    
    return url;
  }, [location.pathname]);

  // Update URL without navigation
  const updateUrl = useCallback((state: DeepLinkState, replace = true) => {
    const url = generateShareableUrl(state);
    if (replace) {
      window.history.replaceState(null, '', url);
    } else {
      window.history.pushState(null, '', url);
    }
  }, [generateShareableUrl]);

  // Restore state from URL on mount
  useEffect(() => {
    const deepLinkState = parseDeepLinkParams();
    
    // Store deep link state in global state for components to access
    if (Object.keys(deepLinkState).length > 0) {
      globalState.set('deepLinkState', deepLinkState);
    }
  }, [parseDeepLinkParams]);

  return {
    parseDeepLinkParams,
    generateShareableUrl,
    updateUrl,
    currentParams: parseDeepLinkParams()
  };
}

// Hook for components to use deep link state
export function useDeepLinkState<T = any>(key: string, defaultValue?: T): T {
  const deepLinkState = globalState.get('deepLinkState', {});
  return deepLinkState[key] ?? defaultValue;
}