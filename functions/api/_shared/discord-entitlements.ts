export const CONTROLLER_PLUS_SKU_ID = '1387037988558606457';
export const OVERLIMIT_CONSUMABLE_SKU_ID = '1418562984946569267';

interface DiscordSku {
  id: string;
  type: number;
  application_id: string;
  name: string;
  slug: string;
  flags: number;
}

interface DiscordEntitlement {
  id: string;
  sku_id: string;
  application_id: string;
  user_id?: string;
  guild_id?: string;
  type: number;
  deleted: boolean;
  starts_at?: string | null;
  ends_at?: string | null;
  consumed?: boolean;
}

export interface DiscordCommerceEnv {
  DISCORD_CLIENT_ID?: string;
  DISCORD_BOT_TOKEN?: string;
}

export interface ControllerPlusState {
  hasControllerPlus: boolean;
  hasOverlimitConsumable: boolean;
  overlimitEntitlementId?: string;
  entitlements: DiscordEntitlement[];
}

function getDiscordApiBase(): string {
  return 'https://discord.com/api/v10';
}

function isEntitlementActive(entitlement: DiscordEntitlement): boolean {
  if (entitlement.deleted) return false;
  if (entitlement.ends_at) {
    return new Date(entitlement.ends_at).getTime() > Date.now();
  }
  return true;
}

function getAuthHeaders(env: DiscordCommerceEnv): Record<string, string> {
  if (!env.DISCORD_BOT_TOKEN) {
    throw new Error('Missing DISCORD_BOT_TOKEN');
  }
  return {
    'Authorization': `Bot ${env.DISCORD_BOT_TOKEN}`,
    'Content-Type': 'application/json',
  };
}

async function discordRequest<T>(env: DiscordCommerceEnv, path: string, init: RequestInit = {}): Promise<T> {
  if (!env.DISCORD_CLIENT_ID) {
    throw new Error('Missing DISCORD_CLIENT_ID');
  }

  const response = await fetch(`${getDiscordApiBase()}${path}`, {
    ...init,
    headers: {
      ...getAuthHeaders(env),
      ...(init.headers || {}),
    },
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Discord API request failed (${response.status}): ${text}`);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return response.json() as Promise<T>;
}

export async function listDiscordSkus(env: DiscordCommerceEnv): Promise<DiscordSku[]> {
  return discordRequest<DiscordSku[]>(env, `/applications/${env.DISCORD_CLIENT_ID}/skus`);
}

export async function listUserEntitlements(
  env: DiscordCommerceEnv,
  userId: string
): Promise<DiscordEntitlement[]> {
  const params = new URLSearchParams({
    user_id: userId,
    exclude_ended: 'true',
    exclude_deleted: 'true',
    limit: '100',
  });
  return discordRequest<DiscordEntitlement[]>(
    env,
    `/applications/${env.DISCORD_CLIENT_ID}/entitlements?${params.toString()}`
  );
}

export async function getControllerPlusState(
  env: DiscordCommerceEnv,
  userId: string
): Promise<ControllerPlusState> {
  const entitlements = await listUserEntitlements(env, userId);
  const active = entitlements.filter(isEntitlementActive);

  const hasControllerPlus = active.some((entitlement) => entitlement.sku_id === CONTROLLER_PLUS_SKU_ID);
  const overlimitEntitlement = active.find(
    (entitlement) =>
      entitlement.sku_id === OVERLIMIT_CONSUMABLE_SKU_ID &&
      entitlement.consumed !== true
  );

  return {
    hasControllerPlus,
    hasOverlimitConsumable: Boolean(overlimitEntitlement),
    overlimitEntitlementId: overlimitEntitlement?.id,
    entitlements: active,
  };
}

export async function consumeOverlimitEntitlement(
  env: DiscordCommerceEnv,
  entitlementId: string
): Promise<void> {
  await discordRequest<void>(
    env,
    `/applications/${env.DISCORD_CLIENT_ID}/entitlements/${entitlementId}/consume`,
    { method: 'POST' }
  );
}
