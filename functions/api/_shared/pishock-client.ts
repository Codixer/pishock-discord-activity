const PISHOCK_API_BASE_URL = 'https://api.pishock.com';
const LEGACY_PISHOCK_API_BASE_URL = 'https://ps.pishock.com';

const DBG = '[PiShock:allowedShockers]';

function previewIds(ids: Iterable<string>, max = 12): string[] {
  const out: string[] = [];
  for (const id of ids) {
    out.push(id);
    if (out.length >= max) break;
  }
  return out;
}

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

export interface PiShockShockerOption {
  id: string;
  name: string;
  label: string;
  canShock: boolean;
  canVibrate: boolean;
  canBeep: boolean;
  maxIntensity: number;
  maxDurationMs: number;
}

export type PiShockGeneratedShareCodeMap = Record<string, string>;

/** Shockers the controller may use: active on GetUserDevices for the Account userId, and present on GET /Shockers. */
export interface AllowedShockersForControllerResult {
  allowedShockers: PiShockShocker[];
  /** Shockers returned by GET /Shockers but not on the active owned-devices list (hidden from picker). */
  shockerIdsHiddenNotOnDevices: number;
}

interface LegacyReducedShockerModel {
  shockerId?: number;
  name?: string;
  isPaused?: boolean;
  shockerType?: number;
}

interface LegacyReducedClientModel {
  clientId?: number;
  name?: string;
  userId?: number;
  username?: string;
  shockers?: LegacyReducedShockerModel[];
}

export interface LegacyOwnedShocker {
  shockerId: string;
  shockerName: string;
  clientId?: number;
  clientName?: string;
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

interface LegacyShareCodeFailureDetail {
  shockerId: string;
  status: number;
  error: string;
  rawBody?: string;
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

async function requestLegacy<T>(
  path: string,
  init: RequestInit = {}
): Promise<PiShockApiResult<T>> {
  try {
    const response = await fetch(`${LEGACY_PISHOCK_API_BASE_URL}${path}`, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        ...(init.headers || {}),
      },
    });

    if (response.status === 204) {
      return { ok: true, status: response.status };
    }

    const text = await response.text();
    if (!response.ok) {
      return {
        ok: false,
        status: response.status,
        error: text.trim() || `Legacy PiShock API request failed with status ${response.status}.`,
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
        error: 'Legacy PiShock API returned invalid JSON.',
        rawBody: text,
      };
    }
  } catch (error) {
    return {
      ok: false,
      status: 0,
      error: `Legacy PiShock network error: ${error instanceof Error ? error.message : 'Unknown error'}`,
    };
  }
}

export async function getPiShockAccount(credentials: PiShockCredentials): Promise<PiShockApiResult<PiShockAccount>> {
  return request<PiShockAccount>('/Account', credentials, { method: 'GET' });
}

export async function listPiShockShockers(credentials: PiShockCredentials): Promise<PiShockApiResult<PiShockShocker[]>> {
  return request<PiShockShocker[]>('/Shockers', credentials, { method: 'GET' });
}

/**
 * Shockers allowed in this app: must appear on GET /Shockers and on GetUserDevices as an active
 * (not paused) shocker under a client owned by the Account UserId.
 */
export async function getAllowedShockersForController(
  credentials: PiShockCredentials
): Promise<PiShockApiResult<AllowedShockersForControllerResult>> {
  const usernameLog = String(credentials.username || '').trim() || '(no username)';
  console.log(`${DBG} start username=${usernameLog} storedPiShockUserId=${credentials.piShockUserId ?? '(none)'}`);

  const accountResult = await getPiShockAccount(credentials);
  if (!accountResult.ok) {
    console.log(`${DBG} GET /Account failed status=${accountResult.status} error=${accountResult.error?.slice(0, 200)}`);
    return {
      ok: false,
      status: accountResult.status,
      error: accountResult.error || 'Unable to load PiShock account.',
      rawBody: accountResult.rawBody,
    };
  }

  const rawUserId = accountResult.data?.UserId;
  if (rawUserId === undefined || rawUserId === null || !Number.isFinite(Number(rawUserId)) || Number(rawUserId) <= 0) {
    console.log(`${DBG} Account response missing UserId data=${JSON.stringify(accountResult.data)}`);
    return {
      ok: false,
      status: 400,
      error: 'No UserId found in PiShock Account response.',
      rawBody: accountResult.rawBody,
    };
  }

  const accountUserId = Math.floor(Number(rawUserId));
  console.log(`${DBG} Account UserId=${accountUserId}`);
  const credsWithUser: PiShockCredentials = {
    ...credentials,
    piShockUserId: String(accountUserId),
  };

  const query = new URLSearchParams({
    userId: String(accountUserId),
    token: credentials.apiKey,
    api: 'true',
  });
  const [shockersResult, devicesResult] = await Promise.all([
    listPiShockShockers(credsWithUser),
    requestLegacy<LegacyReducedClientModel[]>(`/PiShock/GetUserDevices?${query.toString()}`, { method: 'GET' }),
  ]);

  if (!shockersResult.ok || !Array.isArray(shockersResult.data)) {
    console.log(
      `${DBG} GET /Shockers failed status=${shockersResult.status} ok=${shockersResult.ok} isArray=${Array.isArray(shockersResult.data)} error=${shockersResult.error?.slice(0, 200)}`
    );
    return {
      ok: false,
      status: shockersResult.status,
      error: shockersResult.error || 'Unable to retrieve shockers.',
      rawBody: shockersResult.rawBody,
    };
  }

  const apiShockerIds = shockersResult.data
    .filter((s) => s.ShockerId !== undefined && s.ShockerId !== null)
    .map((s) => String(s.ShockerId));
  console.log(`${DBG} GET /Shockers ok count=${shockersResult.data.length} idsPreview=${JSON.stringify(previewIds(apiShockerIds))}`);

  if (!devicesResult.ok || !Array.isArray(devicesResult.data)) {
    console.log(
      `${DBG} GetUserDevices failed status=${devicesResult.status} ok=${devicesResult.ok} isArray=${Array.isArray(devicesResult.data)} error=${devicesResult.error?.slice(0, 200)}`
    );
    return {
      ok: false,
      status: devicesResult.status,
      error: devicesResult.error || 'Failed to fetch PiShock devices for ownership check.',
      rawBody: devicesResult.rawBody,
    };
  }

  const clients = devicesResult.data;
  let clientsMatchingAccount = 0;
  let clientsForeignUser = 0;
  let shockersSkippedWrongUser = 0;
  let shockersSkippedPaused = 0;
  let shockersSkippedNoId = 0;
  const foreignClientSamples: Array<{ clientUserId: number | undefined; clientId: number | undefined }> = [];

  const activeOwnedIds = new Set<string>();
  for (const client of clients) {
    if (!client) {
      continue;
    }
    if (Number(client.userId) !== accountUserId) {
      clientsForeignUser += 1;
      shockersSkippedWrongUser += Array.isArray(client.shockers) ? client.shockers.length : 0;
      if (foreignClientSamples.length < 5) {
        foreignClientSamples.push({ clientUserId: client.userId, clientId: client.clientId });
      }
      continue;
    }
    clientsMatchingAccount += 1;
    const clientShockers = Array.isArray(client.shockers) ? client.shockers : [];
    for (const shocker of clientShockers) {
      if (shocker?.shockerId === undefined || shocker?.shockerId === null) {
        shockersSkippedNoId += 1;
        continue;
      }
      if (shocker.isPaused === true) {
        shockersSkippedPaused += 1;
        continue;
      }
      activeOwnedIds.add(String(shocker.shockerId));
    }
  }

  console.log(
    `${DBG} GetUserDevices clientsTotal=${clients.length} clientsMatchingAccountUserId=${clientsMatchingAccount} ` +
      `clientsWithOtherUserId=${clientsForeignUser} activeOwnedShockerCount=${activeOwnedIds.size} ` +
      `activeOwnedIdsPreview=${JSON.stringify(previewIds(activeOwnedIds))} ` +
      `foreignClientUserIdSamples=${foreignClientSamples.length ? JSON.stringify(foreignClientSamples) : 'none'} ` +
      `shockersUnderForeignClients=${shockersSkippedWrongUser} skippedPaused=${shockersSkippedPaused} skippedNoId=${shockersSkippedNoId}`
  );

  const allowedShockers = shockersResult.data.filter(
    (shocker) =>
      shocker.ShockerId !== undefined &&
      shocker.ShockerId !== null &&
      activeOwnedIds.has(String(shocker.ShockerId))
  );

  const shockerIdsHiddenNotOnDevices = shockersResult.data.filter(
    (shocker) =>
      shocker.ShockerId !== undefined &&
      shocker.ShockerId !== null &&
      !activeOwnedIds.has(String(shocker.ShockerId))
  ).length;

  const apiOnly = apiShockerIds.filter((id) => !activeOwnedIds.has(id));
  const deviceOnly = Array.from(activeOwnedIds).filter((id) => !apiShockerIds.includes(id));
  console.log(
    `${DBG} intersection allowedCount=${allowedShockers.length} hiddenFromApiNotOnDevices=${shockerIdsHiddenNotOnDevices} ` +
      `inApiNotOnDeviceListPreview=${JSON.stringify(previewIds(apiOnly))} onDeviceListNotInApiPreview=${JSON.stringify(previewIds(deviceOnly))}`
  );

  if (allowedShockers.length === 0) {
    console.log(
      `${DBG} EMPTY allowed list — typical causes: GetUserDevices [] or wrong userId on clients; all shockers paused; ` +
        `or /Shockers ids do not overlap GetUserDevices active ids. clientsRawLength=${clients.length}`
    );
  }

  return {
    ok: true,
    status: 200,
    data: {
      allowedShockers,
      shockerIdsHiddenNotOnDevices,
    },
  };
}

export async function listOwnedPiShockShockerIds(credentials: PiShockCredentials): Promise<PiShockApiResult<string[]>> {
  const shockersResult = await listPiShockShockers(credentials);
  if (!shockersResult.ok || !Array.isArray(shockersResult.data)) {
    return {
      ok: false,
      status: shockersResult.status,
      error: shockersResult.error || 'Unable to retrieve owned shockers.',
    };
  }

  const ids = shockersResult.data
    .filter((shocker) => shocker.ShockerId !== undefined && shocker.ShockerId !== null)
    .map((shocker) => String(shocker.ShockerId));

  return {
    ok: true,
    status: shockersResult.status,
    data: ids,
  };
}

export function mapShockersToOptions(shockers: PiShockShocker[] = []): PiShockShockerOption[] {
  return shockers
    .filter((shocker) => shocker.ShockerId !== undefined && shocker.ShockerId !== null)
    .map((shocker) => {
      const id = String(shocker.ShockerId);
      const name = shocker.Name || `Shocker ${id}`;
      const capabilities: string[] = [];
      if (shocker.CanShock) capabilities.push('Shock');
      if (shocker.CanVibrate) capabilities.push('Vibrate');
      if (shocker.CanBeep) capabilities.push('Beep');
      const capabilityLabel = capabilities.length > 0 ? capabilities.join('/') : 'No actions';
      const maxIntensity = typeof shocker.MaxIntensity === 'number' ? shocker.MaxIntensity : 100;
      const maxDurationMs = typeof shocker.MaxDuration === 'number' ? shocker.MaxDuration : 15000;
      const maxDurationSeconds = Math.max(1, Math.floor(maxDurationMs / 1000));

      return {
        id,
        name,
        label: `${name} (ID ${id}) - ${capabilityLabel} - Max ${maxIntensity}%/${maxDurationSeconds}s`,
        canShock: Boolean(shocker.CanShock),
        canVibrate: Boolean(shocker.CanVibrate),
        canBeep: Boolean(shocker.CanBeep),
        maxIntensity,
        maxDurationMs,
      };
    });
}

export async function listPiShockLinks(credentials: PiShockCredentials): Promise<PiShockApiResult<PiShockLink[]>> {
  return request<PiShockLink[]>('/Links', credentials, { method: 'GET' });
}

/** Active (not paused) shockers under clients owned by GET /Account UserId, from GetUserDevices. */
export async function listLegacyOwnedShockers(
  credentials: PiShockCredentials
): Promise<PiShockApiResult<LegacyOwnedShocker[]>> {
  const accountResult = await getPiShockAccount(credentials);
  if (!accountResult.ok) {
    return {
      ok: false,
      status: accountResult.status,
      error: accountResult.error || 'Unable to load PiShock account for device lookup.',
      rawBody: accountResult.rawBody,
    };
  }

  const rawUserId = accountResult.data?.UserId;
  if (rawUserId === undefined || rawUserId === null || !Number.isFinite(Number(rawUserId)) || Number(rawUserId) <= 0) {
    return {
      ok: false,
      status: 400,
      error: 'Device ownership lookup requires a valid PiShock Account UserId.',
    };
  }

  const accountUserId = Math.floor(Number(rawUserId));
  const query = new URLSearchParams({
    userId: String(accountUserId),
    token: credentials.apiKey,
    api: 'true',
  });
  const devicesResult = await requestLegacy<LegacyReducedClientModel[]>(
    `/PiShock/GetUserDevices?${query.toString()}`,
    { method: 'GET' }
  );

  if (!devicesResult.ok || !Array.isArray(devicesResult.data)) {
    return {
      ok: false,
      status: devicesResult.status,
      error: devicesResult.error || 'Failed to fetch PiShock devices.',
      rawBody: devicesResult.rawBody,
    };
  }

  const ownedShockers: LegacyOwnedShocker[] = [];
  for (const client of devicesResult.data) {
    if (!client || Number(client.userId) !== accountUserId) {
      continue;
    }
    const clientShockers = Array.isArray(client.shockers) ? client.shockers : [];
    for (const shocker of clientShockers) {
      if (shocker?.shockerId === undefined || shocker?.shockerId === null) {
        continue;
      }
      if (shocker.isPaused === true) {
        continue;
      }
      ownedShockers.push({
        shockerId: String(shocker.shockerId),
        shockerName: shocker.name || `Shocker ${String(shocker.shockerId)}`,
        clientId: client.clientId,
        clientName: client.name,
      });
    }
  }

  const dedupedByShockerId = new Map<string, LegacyOwnedShocker>();
  for (const shocker of ownedShockers) {
    if (!dedupedByShockerId.has(shocker.shockerId)) {
      dedupedByShockerId.set(shocker.shockerId, shocker);
    }
  }

  return {
    ok: true,
    status: devicesResult.status,
    data: Array.from(dedupedByShockerId.values()),
  };
}

function normalizeShareCodeFromApiResponse(data: unknown, rawBody: string | undefined): string {
  if (typeof data === 'string') {
    const t = data.trim();
    if (t) return t.replace(/^["']|["']$/g, '').trim();
  }
  if (typeof data === 'object' && data !== null) {
    const code = (data as Record<string, unknown>).Code ?? (data as Record<string, unknown>).code;
    if (typeof code === 'string' && code.trim()) {
      return code.trim();
    }
  }
  const raw = String(rawBody || '').trim();
  return raw ? raw.replace(/^["']|["']$/g, '').trim() : '';
}

/** POST /Share — create a share code for a shocker (api.pishock.com). */
export async function createPiShockShareCodeForShocker(
  credentials: PiShockCredentials,
  shockerId: string
): Promise<PiShockApiResult<string>> {
  const shockerIdNumber = Number(shockerId);
  if (!Number.isFinite(shockerIdNumber) || shockerIdNumber <= 0) {
    return {
      ok: false,
      status: 400,
      error: 'Share code creation requires a valid shocker id.',
    };
  }

  const createResult = await request<unknown>('/Share', credentials, {
    method: 'POST',
    body: JSON.stringify({ ShockerId: Math.floor(shockerIdNumber) }),
  });

  const normalizedShareCode = normalizeShareCodeFromApiResponse(createResult.data, createResult.rawBody);

  if (createResult.ok && normalizedShareCode) {
    return {
      ok: true,
      status: createResult.status,
      data: normalizedShareCode,
    };
  }

  if (!createResult.ok && normalizedShareCode && createResult.status >= 200 && createResult.status < 300) {
    return {
      ok: true,
      status: createResult.status,
      data: normalizedShareCode,
    };
  }

  return {
    ok: false,
    status: createResult.status,
    error: createResult.error || `Failed to create share code for shocker ${shockerId}.`,
    rawBody: createResult.rawBody,
  };
}

/** PUT /Share — claim share codes into the authenticated PiShock account. */
export async function claimPiShockShareCodes(
  credentials: PiShockCredentials,
  codes: string[]
): Promise<PiShockApiResult<null>> {
  const trimmed = (Array.isArray(codes) ? codes : [])
    .map((c) => String(c || '').trim())
    .filter((c) => c.length > 0)
    .slice(0, 20);
  if (trimmed.length === 0) {
    return {
      ok: false,
      status: 412,
      error: 'At least one share code is required to claim.',
    };
  }

  return request<null>('/Share', credentials, {
    method: 'PUT',
    body: JSON.stringify({ Shares: trimmed }),
  });
}

export async function generateLegacyShareCodesForOwnedShockers(
  credentials: PiShockCredentials,
  allowedOwnedShockerIds: string[]
): Promise<PiShockApiResult<PiShockGeneratedShareCodeMap>> {
  const allowedResult = await getAllowedShockersForController(credentials);
  if (!allowedResult.ok || !allowedResult.data) {
    return {
      ok: false,
      status: allowedResult.status,
      error: allowedResult.error || 'Unable to resolve allowed shockers for share code generation.',
      rawBody: allowedResult.rawBody,
    };
  }

  const allowedIdSet = new Set(
    allowedResult.data.allowedShockers
      .filter((s) => s.ShockerId !== undefined && s.ShockerId !== null)
      .map((s) => String(s.ShockerId))
  );

  const normalizedAllowed = new Set((Array.isArray(allowedOwnedShockerIds) ? allowedOwnedShockerIds : [])
    .map((id) => String(id))
    .filter((id) => id.length > 0));
  const candidateIds = Array.from(normalizedAllowed).filter((id) => allowedIdSet.has(id));

  if (candidateIds.length === 0) {
    return {
      ok: false,
      status: 404,
      error: 'No allowed shockers were available for share code generation.',
    };
  }

  const accountResult = await getPiShockAccount(credentials);
  const resolvedUserId =
    accountResult.ok && accountResult.data?.UserId !== undefined && accountResult.data?.UserId !== null
      ? String(Math.floor(Number(accountResult.data.UserId)))
      : credentials.piShockUserId;
  const credsForShare: PiShockCredentials = resolvedUserId
    ? { ...credentials, piShockUserId: resolvedUserId }
    : credentials;

  const mapping: PiShockGeneratedShareCodeMap = {};
  const errors: string[] = [];
  const failureDetails: LegacyShareCodeFailureDetail[] = [];
  for (const shockerId of candidateIds) {
    const shareResult = await createPiShockShareCodeForShocker(credsForShare, shockerId);
    if (!shareResult.ok || !shareResult.data) {
      const message = shareResult.error || `Failed to create share code for shocker ${shockerId}.`;
      const diagnostic = [
        `shockerId=${shockerId}`,
        `status=${shareResult.status}`,
        `error=${message}`,
        shareResult.rawBody ? `rawBody=${shareResult.rawBody.slice(0, 300)}` : '',
      ].filter(Boolean).join(' | ');
      errors.push(diagnostic);
      failureDetails.push({
        shockerId,
        status: shareResult.status,
        error: message,
        rawBody: shareResult.rawBody,
      });
      continue;
    }

    const claimResult = await claimPiShockShareCodes(credsForShare, [shareResult.data]);
    if (!claimResult.ok) {
      const message = claimResult.error || `Failed to claim share code for shocker ${shockerId}.`;
      const diagnostic = [
        `shockerId=${shockerId}`,
        `status=${claimResult.status}`,
        `error=${message}`,
        claimResult.rawBody ? `rawBody=${claimResult.rawBody.slice(0, 300)}` : '',
      ].filter(Boolean).join(' | ');
      errors.push(diagnostic);
      failureDetails.push({
        shockerId,
        status: claimResult.status,
        error: message,
        rawBody: claimResult.rawBody,
      });
      continue;
    }

    mapping[shockerId] = shareResult.data;
  }

  if (errors.length > 0) {
    const errorPrefix = `Failed generating ${errors.length} of ${candidateIds.length} sharecodes.`;
    const hasPartial = Object.keys(mapping).length > 0;
    return {
      ok: false,
      status: 502,
      ...(hasPartial ? { data: mapping } : {}),
      error: `${errorPrefix} ${errors.join(' ')}`.trim(),
      rawBody: JSON.stringify(failureDetails),
    };
  }

  return {
    ok: true,
    status: 200,
    data: mapping,
  };
}

export function normalizeGeneratedShareCodes(input: unknown): PiShockGeneratedShareCodeMap {
  if (!input || typeof input !== 'object') {
    return {};
  }
  const normalized: PiShockGeneratedShareCodeMap = {};
  for (const [rawShockerId, rawShareCode] of Object.entries(input as Record<string, unknown>)) {
    const shockerId = String(rawShockerId || '').trim();
    const shareCode = String(rawShareCode || '').trim();
    if (!shockerId || !shareCode) {
      continue;
    }
    normalized[shockerId] = shareCode;
  }
  return normalized;
}

export function getGeneratedShareCodeForShocker(
  generatedShareCodes: unknown,
  shockerId?: string | null
): string | null {
  if (!shockerId) {
    return null;
  }
  const normalized = normalizeGeneratedShareCodes(generatedShareCodes);
  return normalized[String(shockerId)] || null;
}

export async function resolvePiShockShockerId(
  credentials: PiShockCredentials,
  sharecode?: string,
  options: { allowDefaultFallback?: boolean } = {}
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

  // Deprecated fallback path for legacy records that do not have explicit shocker selection.
  if (options.allowDefaultFallback) {
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

  return {
    ok: false,
    status: 404,
    error: 'Unable to resolve shocker from legacy share code. Please reconfigure and select a shocker.',
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

export async function operatePiShockShareCode(
  credentials: PiShockCredentials,
  shareCode: string,
  payload: OperatePayload
): Promise<PiShockApiResult<null>> {
  const normalizedShareCode = String(shareCode || '').trim();
  if (!normalizedShareCode) {
    return {
      ok: false,
      status: 400,
      error: 'Sharecode is required for sharecode-based operation.',
    };
  }

  return request<null>(`/Shares/${encodeURIComponent(normalizedShareCode)}`, credentials, {
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
