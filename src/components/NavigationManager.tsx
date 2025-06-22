import React, { useEffect, useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useDeepLinking } from '../hooks/useDeepLinking';
import { globalState } from '../hooks/usePersistentState';

interface NavigationManagerProps {
  children: React.ReactNode;
}

export function NavigationManager({ children }: NavigationManagerProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const { updateUrl, parseDeepLinkParams } = useDeepLinking();

  // Handle browser back/forward navigation
  useEffect(() => {
    const handlePopState = (event: PopStateEvent) => {
      console.log('Navigation: Browser back/forward detected');
      
      // Parse new state from URL
      const newState = parseDeepLinkParams();
      globalState.set('deepLinkState', newState);
      
      // Trigger any navigation listeners
      globalState.set('navigationEvent', {
        type: 'popstate',
        location: location.pathname,
        state: newState,
        timestamp: Date.now()
      });
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [location, parseDeepLinkParams]);

  // Handle programmatic navigation
  useEffect(() => {
    console.log('Navigation: Route changed to', location.pathname);
    
    // Store navigation history
    const history = globalState.get('navigationHistory', []);
    const newEntry = {
      path: location.pathname,
      search: location.search,
      hash: location.hash,
      timestamp: Date.now()
    };
    
    // Keep last 50 entries
    history.push(newEntry);
    if (history.length > 50) {
      history.shift();
    }
    
    globalState.set('navigationHistory', history);
    
    // Update page title based on route
    updatePageTitle(location.pathname);
    
  }, [location]);

  const updatePageTitle = useCallback((pathname: string) => {
    const titles: Record<string, string> = {
      '/': 'PiShock Discord Activity',
      '/control': 'Shock Collar Control System',
      '/privacy': 'Privacy Policy - PiShock Activity',
      '/terms': 'Terms of Service - PiShock Activity'
    };
    
    document.title = titles[pathname] || 'PiShock Discord Activity';
  }, []);

  // Prevent navigation during critical operations
  useEffect(() => {
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      const criticalOperation = globalState.get('criticalOperation', false);
      
      if (criticalOperation) {
        event.preventDefault();
        event.returnValue = 'A critical operation is in progress. Are you sure you want to leave?';
        return event.returnValue;
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, []);

  return <>{children}</>;
}

// Hook for components to control navigation
export function useNavigationControl() {
  const navigate = useNavigate();
  const { updateUrl } = useDeepLinking();

  const navigateWithState = useCallback((
    path: string, 
    state?: any, 
    options?: { replace?: boolean; preserveQuery?: boolean }
  ) => {
    const { replace = false, preserveQuery = false } = options || {};
    
    // Store navigation state
    if (state) {
      globalState.set('navigationState', state);
    }
    
    // Handle query preservation
    let finalPath = path;
    if (preserveQuery && window.location.search) {
      finalPath += window.location.search;
    }
    
    navigate(finalPath, { replace });
  }, [navigate]);

  const setCriticalOperation = useCallback((isCritical: boolean) => {
    globalState.set('criticalOperation', isCritical);
  }, []);

  const goBack = useCallback(() => {
    const history = globalState.get('navigationHistory', []);
    if (history.length > 1) {
      window.history.back();
    } else {
      navigate('/');
    }
  }, [navigate]);

  return {
    navigateWithState,
    setCriticalOperation,
    goBack,
    updateUrl
  };
}