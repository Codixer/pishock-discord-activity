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

export interface DiscordEntitlement {
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

interface ListEntitlementsOptions {
  excludeEnded?: boolean;
  excludeDeleted?: boolean;
  limit?: number;
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
  if (entitlement.starts_at) {
    const startMs = new Date(entitlement.starts_at).getTime();
    if (!Number.isFinite(startMs) || startMs > Date.now()) return false;
  }
  if (entitlement.ends_at) {
    const endMs = new Date(entitlement.ends_at).getTime();
    if (!Number.isFinite(endMs) || endMs <= Date.now()) return false;
  }
  return true;
}

export class DiscordApiRequestError extends Error {
  readonly status: number;
  readonly body: string;

  constructor(status: number, body: string) {
    super(`Discord API request failed (${status}): ${body}`);
    this.name = 'DiscordApiRequestError';
    this.status = status;
    this.body = body;
  }
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
    throw new DiscordApiRequestError(response.status, text);
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
  return listDiscordEntitlementsForUser(env, userId, {
    excludeEnded: true,
    excludeDeleted: true,
    limit: 100,
  });
}

export async function listDiscordEntitlementsForUser(
  env: DiscordCommerceEnv,
  userId: string,
  options: ListEntitlementsOptions = {}
): Promise<DiscordEntitlement[]> {
  const {
    excludeEnded = false,
    excludeDeleted = false,
    limit = 100,
  } = options;
  const params = new URLSearchParams({
    user_id: userId,
    exclude_ended: excludeEnded ? 'true' : 'false',
    exclude_deleted: excludeDeleted ? 'true' : 'false',
    limit: String(Math.min(Math.max(limit, 1), 100)),
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

export async function createDiscordTestEntitlement(
  env: DiscordCommerceEnv,
  skuId: string,
  ownerId: string,
  ownerType: 1 | 2
): Promise<DiscordEntitlement> {
  console.log(
    '[discord-entitlements] createDiscordTestEntitlement request',
    JSON.stringify({
      discordApplicationId: env.DISCORD_CLIENT_ID ?? null,
      path: `/applications/${env.DISCORD_CLIENT_ID ?? '?'}/entitlements`,
      body: { sku_id: skuId, owner_id: ownerId, owner_type: ownerType },
    })
  );

  return discordRequest<DiscordEntitlement>(
    env,
    `/applications/${env.DISCORD_CLIENT_ID}/entitlements`,
    {
      method: 'POST',
      body: JSON.stringify({
        sku_id: skuId,
        owner_id: ownerId,
        owner_type: ownerType,
      }),
    }
  );
}

export async function deleteDiscordTestEntitlement(
  env: DiscordCommerceEnv,
  entitlementId: string
): Promise<void> {
  await discordRequest<void>(
    env,
    `/applications/${env.DISCORD_CLIENT_ID}/entitlements/${entitlementId}`,
    { method: 'DELETE' }
  );
}
