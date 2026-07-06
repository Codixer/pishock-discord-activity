import { useCallback, useRef, useState } from 'react';
import { v4 as uuidv4 } from 'uuid';

export interface PiShockLoginResult {
  userId: number;
  token: string;
  username?: string;
}

function getLoginRelayWsUrl(guid: string, isEmbedded: boolean): string {
  const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  if (isEmbedded) {
    return `${proto}//${window.location.host}/api/login-relay/${guid}`;
  }
  const host = window.location.hostname;
  const port = window.location.port === '3000' ? '3001' : window.location.port;
  return `${proto}//${host}:${port}/api/login-relay/${guid}`;
}

function getLoginPageUrl(guid: string): string {
  return `https://login.pishock.com/?proto=socket&channel=${encodeURIComponent(guid)}`;
}

function parseRelayMessage(data: string): PiShockLoginResult | null {
  try {
    const parsed = JSON.parse(data) as Record<string, unknown>;
    const userId = Number(parsed.UserId ?? parsed.userId ?? parsed.userid ?? 0);
    const token = String(parsed.Token ?? parsed.token ?? '');
    const username = String(parsed.Username ?? parsed.username ?? '');
    if (userId > 0 && token) {
      return { userId, token, username: username || undefined };
    }
  } catch {
    const userIdMatch = data.match(/UserId[=:]\s*"?(\d+)"?/i);
    const tokenMatch = data.match(/Token[=:]\s*"?([^",\s}]+)"?/i);
    if (userIdMatch && tokenMatch) {
      return { userId: Number(userIdMatch[1]), token: tokenMatch[1] };
    }
  }
  return null;
}

export function usePiShockLogin(options: {
  isEmbedded: boolean;
  openExternalLink: (url: string) => Promise<unknown>;
  onSuccess: (result: PiShockLoginResult) => void | Promise<void>;
  onError?: (message: string) => void;
}) {
  const { isEmbedded, openExternalLink, onSuccess, onError } = options;
  const wsRef = useRef<WebSocket | null>(null);
  const [isLoggingIn, setIsLoggingIn] = useState(false);

  const disconnect = useCallback(() => {
    wsRef.current?.close();
    wsRef.current = null;
  }, []);

  const startLogin = useCallback(async () => {
    setIsLoggingIn(true);
    disconnect();

    const guid = uuidv4();
    const wsUrl = getLoginRelayWsUrl(guid, isEmbedded);
    const loginUrl = getLoginPageUrl(guid);

    const timeout = window.setTimeout(() => {
      disconnect();
      setIsLoggingIn(false);
      onError?.('PiShock login timed out. Complete login in the browser window.');
    }, 120_000);

    try {
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = async () => {
        try {
          if (isEmbedded) {
            await openExternalLink(loginUrl);
          } else {
            window.open(loginUrl, '_blank', 'noopener,noreferrer');
          }
        } catch (err) {
          window.clearTimeout(timeout);
          disconnect();
          setIsLoggingIn(false);
          onError?.(err instanceof Error ? err.message : 'Failed to open PiShock login page');
        }
      };

      ws.onmessage = async (event) => {
        const result = parseRelayMessage(String(event.data));
        if (!result) return;
        window.clearTimeout(timeout);
        disconnect();
        setIsLoggingIn(false);
        await onSuccess(result);
      };

      ws.onerror = () => {
        window.clearTimeout(timeout);
        disconnect();
        setIsLoggingIn(false);
        onError?.('WebSocket connection to PiShock relay failed');
      };

      ws.onclose = () => {
        setIsLoggingIn(false);
      };
    } catch (err) {
      window.clearTimeout(timeout);
      setIsLoggingIn(false);
      onError?.(err instanceof Error ? err.message : 'Login failed');
    }
  }, [disconnect, isEmbedded, onError, onSuccess, openExternalLink]);

  return { startLogin, isLoggingIn, disconnect };
}
