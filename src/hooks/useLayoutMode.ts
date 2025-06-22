import { useState, useEffect, useCallback } from 'react';
import { DiscordSDK, Events, Common } from '@discord/embedded-app-sdk';

export type LayoutMode = 'FOCUSED' | 'PICTURE_IN_PICTURE' | 'GRID' | 'UNKNOWN';

export function useLayoutMode(discordSdk: DiscordSDK, isEmbedded: boolean) {
  const [layoutMode, setLayoutMode] = useState<LayoutMode>('FOCUSED');
  const [isCompactMode, setIsCompactMode] = useState(false);

  const handleLayoutModeUpdate = useCallback((update: { layout_mode: number }) => {
    console.log('Layout mode update:', update);
    
    let newLayoutMode: LayoutMode = 'UNKNOWN';
    let compact = false;
    
    switch (update.layout_mode) {
      case Common.LayoutModeTypeObject.FOCUSED:
        newLayoutMode = 'FOCUSED';
        compact = false;
        break;
      case Common.LayoutModeTypeObject.PICTURE_IN_PICTURE:
        newLayoutMode = 'PICTURE_IN_PICTURE';
        compact = true;
        break;
      case Common.LayoutModeTypeObject.GRID:
        newLayoutMode = 'GRID';
        compact = true;
        break;
      default:
        newLayoutMode = 'UNKNOWN';
        compact = false;
        console.warn('Unknown layout mode:', update.layout_mode);
    }
    
    console.log(`Layout mode changed: ${newLayoutMode} (compact: ${compact})`);
    setLayoutMode(newLayoutMode);
    setIsCompactMode(compact);
  }, []);

  // Fallback handler for older Discord clients that only support PIP mode updates
  const handlePipModeUpdate = useCallback((update: { pip_mode: boolean }) => {
    console.log('PIP mode update (legacy):', update);
    
    if (update.pip_mode) {
      setLayoutMode('PICTURE_IN_PICTURE');
      setIsCompactMode(true);
    } else {
      setLayoutMode('FOCUSED');
      setIsCompactMode(false);
    }
  }, []);

  useEffect(() => {
    if (!isEmbedded || !discordSdk) return;

    try {
      // Use the compatibility method that handles both old and new Discord clients
      if (discordSdk.subscribeToLayoutModeUpdatesCompat) {
        console.log('Subscribing to layout mode updates (compat)');
        discordSdk.subscribeToLayoutModeUpdatesCompat(handleLayoutModeUpdate);
        
        return () => {
          if (discordSdk.unsubscribeFromLayoutModeUpdatesCompat) {
            discordSdk.unsubscribeFromLayoutModeUpdatesCompat(handleLayoutModeUpdate);
          }
        };
      } else {
        // Fallback to manual subscription for both events
        console.log('Using manual layout mode subscriptions');
        
        // Subscribe to modern layout mode events
        if (discordSdk.subscribe) {
          discordSdk.subscribe(Events.ACTIVITY_LAYOUT_MODE_UPDATE, handleLayoutModeUpdate);
          
          // Also subscribe to legacy PIP mode events for backward compatibility
          discordSdk.subscribe(Events.ACTIVITY_PIP_MODE_UPDATE, handlePipModeUpdate);
        }
        
        return () => {
          if (discordSdk.unsubscribe) {
            discordSdk.unsubscribe(Events.ACTIVITY_LAYOUT_MODE_UPDATE, handleLayoutModeUpdate);
            discordSdk.unsubscribe(Events.ACTIVITY_PIP_MODE_UPDATE, handlePipModeUpdate);
          }
        };
      }
    } catch (error) {
      console.warn('Failed to subscribe to layout mode updates:', error);
    }
  }, [isEmbedded, discordSdk, handleLayoutModeUpdate, handlePipModeUpdate]);

  return {
    layoutMode,
    isCompactMode,
    isFocused: layoutMode === 'FOCUSED',
    isPictureInPicture: layoutMode === 'PICTURE_IN_PICTURE',
    isGrid: layoutMode === 'GRID',
  };
}