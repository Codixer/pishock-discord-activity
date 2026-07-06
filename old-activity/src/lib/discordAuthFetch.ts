export type DiscordAuthRetryDeps = {
  getAccessToken: () => string | null | undefined;
  refreshAccessToken: () => Promise<string | null>;
};

/**
 * Fetch with a single 401 retry after refreshing the Discord access token.
 * First request uses `init` as-is (including Authorization if set).
 */
export async function fetchWithDiscordAuthRetry(
  input: RequestInfo | URL,
  init: RequestInit | undefined,
  deps: DiscordAuthRetryDeps
): Promise<Response> {
  const response = await fetch(input, init);
  if (response.status !== 401) {
    return response;
  }

  const newToken = await deps.refreshAccessToken();
  if (!newToken) {
    return response;
  }

  const headers = new Headers(init?.headers);
  headers.set('Authorization', `Bearer ${newToken}`);
  return fetch(input, { ...init, headers });
}
