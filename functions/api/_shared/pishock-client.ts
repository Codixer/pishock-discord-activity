const PISHOCK_API_BASE_URL = 'https://api.pishock.com';

export interface PiShockCredentials {
  apiKey: string;
  username: string;
  piShockUserId?: string;
  shockerId?: string;
}

export interface PiShockApiResult<T> {
  ok: boolean;
  status: number;
  data?: T;
  error?: string;
  rawBody?: string;
}

export interface PiShockAccount {
  UserId?: number;
  Username?: string;
}

export interface PiShockShocker {
  ShockerId?: number;
  Name?: string;
  CanBeep?: boolean;
  CanVibrate?: boolean;
  CanShock?: boolean;
  MaxDuration?: number;
  MaxIntensity?: number;
}

interface PiShockLink {
  Code?: string;
  ShockerId?: number;
}

interface OperatePayload {
  operation: number;
  intensity: number;
  durationSeconds: number;
  agentName: string;
}

function createHeaders(credentials: PiShockCredentials): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
    'User-Agent': 'PiShock-Discord-Activity/2.0',
    'X-PiShock-Api-Key': credentials.apiKey,
    'X-PiShock-Username': credentials.username,
    // Token is retained for compatibility while migrating from legacy hosts.
    'X-PiShock-Token': credentials.apiKey,
  };

  if (credentials.piShockUserId) {
    headers['X-PiShock-UserId'] = String(credentials.piShockUserId);
  }

  return headers;
}

function mapStatusError(status: number): string {
  switch (status) {
    case 204:
      return 'Operation sent successfully.';
    case 401:
      return 'Unauthorized. Please check your PiShock credentials.';
    case 403:
      return 'Forbidden by PiShock API.';
    case 404:
      return 'Could not find the requested PiShock resource.';
    case 405:
      return 'This operation is not allowed for the selected shocker or link.';
    case 406:
      return 'Target device is not compatible with this operation.';
    case 410:
      return 'PiShock share/link is locked.';
    case 412:
      return 'Intensity is out of allowed bounds.';
    case 416:
      return 'Duration is out of allowed bounds.';
    case 503:
      return 'Shocker or share is paused/unavailable.';
    default:
      return `PiShock API request failed with status ${status}.`;
  }
}

async function request<T>(
  path: string,
  credentials: PiShockCredentials,
  init: RequestInit = {}
): Promise<PiShockApiResult<T>> {
  try {
    const response = await fetch(`${PISHOCK_API_BASE_URL}${path}`, {
      ...init,
      headers: {
        ...createHeaders(credentials),
        ...(init.headers || {}),
      },
    });

    if (response.status === 204) {
      return { ok: true, status: response.status };
    }

    const text = await response.text();

    if (!response.ok) {
      const bodyMessage = text.trim();
      const mapped = mapStatusError(response.status);
      return {
        ok: false,
        status: response.status,
        error: bodyMessage ? `${mapped} ${bodyMessage}` : mapped,
        rawBody: text,
      };
    }

    if (!text) {
      return { ok: true, status: response.status } as PiShockApiResult<T>;
    }

    try {
      return {
        ok: true,
        status: response.status,
        data: JSON.parse(text) as T,
      };
    } catch {
      return {
        ok: false,
        status: response.status,
        error: 'PiShock API returned invalid JSON.',
        rawBody: text,
      };
    }
  } catch (error) {
    return {
      ok: false,
      status: 0,
      error: `Network error: ${error instanceof Error ? error.message : 'Unknown error'}`,
    };
  }
}

export async function getPiShockAccount(credentials: PiShockCredentials): Promise<PiShockApiResult<PiShockAccount>> {
  return request<PiShockAccount>('/Account', credentials, { method: 'GET' });
}

export async function listPiShockShockers(credentials: PiShockCredentials): Promise<PiShockApiResult<PiShockShocker[]>> {
  return request<PiShockShocker[]>('/Shockers', credentials, { method: 'GET' });
}

export async function listPiShockLinks(credentials: PiShockCredentials): Promise<PiShockApiResult<PiShockLink[]>> {
  return request<PiShockLink[]>('/Links', credentials, { method: 'GET' });
}

export async function resolvePiShockShockerId(
  credentials: PiShockCredentials,
  sharecode?: string
): Promise<PiShockApiResult<string>> {
  if (credentials.shockerId) {
    return {
      ok: true,
      status: 200,
      data: String(credentials.shockerId),
    };
  }

  const linksResult = await listPiShockLinks(credentials);
  if (linksResult.ok && Array.isArray(linksResult.data) && sharecode) {
    const matchedLink = linksResult.data.find((link) => {
      if (!link?.Code) return false;
      return link.Code.toLowerCase() === sharecode.toLowerCase();
    });

    if (matchedLink?.ShockerId !== undefined && matchedLink?.ShockerId !== null) {
      return { ok: true, status: 200, data: String(matchedLink.ShockerId) };
    }
  }

  const shockersResult = await listPiShockShockers(credentials);
  if (!shockersResult.ok || !Array.isArray(shockersResult.data)) {
    return {
      ok: false,
      status: shockersResult.status,
      error: shockersResult.error || 'Unable to retrieve shockers.',
    };
  }

  if (shockersResult.data.length === 0) {
    return {
      ok: false,
      status: 404,
      error: 'No shockers available for these credentials.',
    };
  }

  if (sharecode) {
    const byId = shockersResult.data.find((shocker) => String(shocker.ShockerId) === sharecode);
    if (byId?.ShockerId !== undefined && byId?.ShockerId !== null) {
      return { ok: true, status: 200, data: String(byId.ShockerId) };
    }

    const byName = shockersResult.data.find(
      (shocker) => shocker.Name && shocker.Name.toLowerCase() === sharecode.toLowerCase()
    );
    if (byName?.ShockerId !== undefined && byName?.ShockerId !== null) {
      return { ok: true, status: 200, data: String(byName.ShockerId) };
    }
  }

  const defaultShockerId = shockersResult.data[0]?.ShockerId;
  if (defaultShockerId === undefined || defaultShockerId === null) {
    return {
      ok: false,
      status: 404,
      error: 'Unable to resolve a valid shocker id.',
    };
  }

  return {
    ok: true,
    status: 200,
    data: String(defaultShockerId),
  };
}

function clampDurationMs(durationSeconds: number): number {
  const ms = Math.round(durationSeconds * 1000);
  return Math.min(15000, Math.max(16, ms));
}

export async function operatePiShockShocker(
  credentials: PiShockCredentials,
  shockerId: string,
  payload: OperatePayload
): Promise<PiShockApiResult<null>> {
  return request<null>(`/Shockers/${encodeURIComponent(shockerId)}`, credentials, {
    method: 'POST',
    body: JSON.stringify({
      AgentName: payload.agentName,
      Operation: payload.operation,
      Intensity: payload.intensity,
      Duration: clampDurationMs(payload.durationSeconds),
      IntensityAsPercentage: true,
    }),
  });
}
