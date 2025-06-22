import { useState, useEffect, useCallback } from 'react';
import { DiscordSDK, Events, Common } from '@discord/embedded-app-sdk';

export type Orientation = 'PORTRAIT' | 'LANDSCAPE' | 'UNKNOWN';

export function useOrientation(discordSdk: DiscordSDK, isEmbedded: boolean) {
  const [orientation, setOrientation] = useState<Orientation>('UNKNOWN');
  const [isLandscape, setIsLandscape] = useState(false);
  const [isPortrait, setIsPortrait] = useState(false);

  const handleOrientationUpdate = useCallback((update: { screen_orientation: number }) => {
    console.log('Orientation update:', update);
    
    let newOrientation: Orientation = 'UNKNOWN';
    
    switch (update.screen_orientation) {
      case Common.OrientationTypeObject.PORTRAIT:
        newOrientation = 'PORTRAIT';
        setIsPortrait(true);
        setIsLandscape(false);
        break;
      case Common.OrientationTypeObject.LANDSCAPE:
        newOrientation = 'LANDSCAPE';
        setIsPortrait(false);
        setIsLandscape(true);
        break;
      default:
        newOrientation = 'UNKNOWN';
        setIsPortrait(false);
        setIsLandscape(false);
        console.warn('Unknown orientation:', update.screen_orientation);
    }
    
    console.log(`Orientation changed: ${newOrientation}`);
    setOrientation(newOrientation);
  }, []);

  useEffect(() => {
    if (!isEmbedded || !discordSdk) return;

    try {
      console.log('Subscribing to orientation updates');
      
      if (discordSdk.subscribe) {
        discordSdk.subscribe(Events.ORIENTATION_UPDATE, handleOrientationUpdate);
        
        return () => {
          if (discordSdk.unsubscribe) {
            discordSdk.unsubscribe(Events.ORIENTATION_UPDATE, handleOrientationUpdate);
          }
        };
      }
    } catch (error) {
      console.warn('Failed to subscribe to orientation updates:', error);
    }
  }, [isEmbedded, discordSdk, handleOrientationUpdate]);

  // Fallback to CSS media queries if Discord SDK orientation is not available
  useEffect(() => {
    const mediaQuery = window.matchMedia('(orientation: landscape)');
    
    const handleMediaChange = (e: MediaQueryListEvent) => {
      if (orientation === 'UNKNOWN') {
        // Only use fallback if Discord SDK hasn't provided orientation
        const newOrientation = e.matches ? 'LANDSCAPE' : 'PORTRAIT';
        setOrientation(newOrientation);
        setIsLandscape(e.matches);
        setIsPortrait(!e.matches);
        console.log(`Fallback orientation detected: ${newOrientation}`);
      }
    };
    
    // Set initial state
    if (orientation === 'UNKNOWN') {
      const initialLandscape = mediaQuery.matches;
      setOrientation(initialLandscape ? 'LANDSCAPE' : 'PORTRAIT');
      setIsLandscape(initialLandscape);
      setIsPortrait(!initialLandscape);
    }
    
    mediaQuery.addEventListener('change', handleMediaChange);
    
    return () => {
      mediaQuery.removeEventListener('change', handleMediaChange);
    };
  }, [orientation]);

  return {
    orientation,
    isLandscape,
    isPortrait,
  };
}