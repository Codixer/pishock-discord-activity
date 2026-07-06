import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { decryptJson, encryptJson } from '../lib/encryption.js';
import { instanceExpiresAt } from '../lib/http.js';

export interface UserDataRecord {
  credentials?: string;
  lastTested?: string;
  configuredBy?: string;
  maxIntensity?: number;
  maxDuration?: number;
  hasOwnDevice?: boolean;
  piShockUserId?: string | null;
  shockerId?: string | null;
  deviceCount?: number;
  lastUpdated?: string;
  bannedExecutors?: string[];
  commandsPaused?: boolean;
}

export interface TokenMetadata {
  access_token: string;
  refresh_token: string;
  expires_at: number;
  expires_in: number;
  token_type: string;
  user_id: string;
  created_at: number;
}

export class DataStore {
  constructor(private encryptionKey: string) {}

  async getUserData(userId: string): Promise<UserDataRecord | null> {
    const row = await prisma.piShockSettings.findUnique({ where: { discordUserId: userId } });
    if (!row) return null;
    return {
      credentials: row.encryptedCreds,
      lastTested: row.lastTested?.toISOString(),
      configuredBy: row.configuredBy ?? undefined,
      maxIntensity: row.maxIntensity,
      maxDuration: row.maxDuration,
      hasOwnDevice: row.hasOwnDevice,
      piShockUserId: row.piShockUserId,
      shockerId: row.shockerId,
      deviceCount: row.deviceCount,
      lastUpdated: row.lastUpdated.toISOString(),
      bannedExecutors: (row.bannedExecutors as string[]) || [],
      commandsPaused: row.commandsPaused,
    };
  }

  async putUserData(userId: string, data: UserDataRecord): Promise<void> {
    await prisma.discordUser.upsert({
      where: { id: userId },
      create: { id: userId },
      update: {},
    });
    await prisma.piShockSettings.upsert({
      where: { discordUserId: userId },
      create: {
        discordUserId: userId,
        encryptedCreds: data.credentials || '',
        maxIntensity: data.maxIntensity ?? 100,
        maxDuration: data.maxDuration ?? 15,
        bannedExecutors: data.bannedExecutors ?? [],
        commandsPaused: data.commandsPaused ?? false,
        hasOwnDevice: data.hasOwnDevice ?? false,
        piShockUserId: data.piShockUserId ?? null,
        shockerId: data.shockerId ?? null,
        deviceCount: data.deviceCount ?? 0,
        lastTested: data.lastTested ? new Date(data.lastTested) : null,
        configuredBy: data.configuredBy ?? null,
      },
      update: {
        encryptedCreds: data.credentials ?? undefined,
        maxIntensity: data.maxIntensity,
        maxDuration: data.maxDuration,
        bannedExecutors: data.bannedExecutors,
        commandsPaused: data.commandsPaused,
        hasOwnDevice: data.hasOwnDevice,
        piShockUserId: data.piShockUserId,
        shockerId: data.shockerId,
        deviceCount: data.deviceCount,
        lastTested: data.lastTested ? new Date(data.lastTested) : undefined,
        configuredBy: data.configuredBy,
      },
    });
  }

  async deleteUserData(userId: string): Promise<void> {
    await prisma.piShockSettings.deleteMany({ where: { discordUserId: userId } });
  }

  decryptCredentials(encrypted: string): Record<string, unknown> {
    return decryptJson<Record<string, unknown>>(encrypted, this.encryptionKey);
  }

  encryptCredentials(creds: Record<string, unknown>): string {
    return encryptJson(creds, this.encryptionKey);
  }

  async getDiscordUser(userId: string): Promise<Record<string, unknown> | null> {
    const row = await prisma.discordUser.findUnique({ where: { id: userId } });
    if (!row?.profileJson) return null;
    return row.profileJson as Record<string, unknown>;
  }

  async putDiscordUser(userId: string, profile: Record<string, unknown>): Promise<void> {
    await prisma.discordUser.upsert({
      where: { id: userId },
      create: {
        id: userId,
        username: typeof profile.username === 'string' ? profile.username : null,
        globalName: typeof profile.global_name === 'string' ? profile.global_name : null,
        discriminator: typeof profile.discriminator === 'string' ? profile.discriminator : null,
        avatar: typeof profile.avatar === 'string' ? profile.avatar : null,
        profileJson: profile as Prisma.InputJsonValue,
      },
      update: {
        username: typeof profile.username === 'string' ? profile.username : null,
        globalName: typeof profile.global_name === 'string' ? profile.global_name : null,
        discriminator: typeof profile.discriminator === 'string' ? profile.discriminator : null,
        avatar: typeof profile.avatar === 'string' ? profile.avatar : null,
        profileJson: profile as Prisma.InputJsonValue,
      },
    });
  }

  async getTokenMetadata(userId: string): Promise<TokenMetadata | null> {
    const row = await prisma.discordToken.findUnique({ where: { discordUserId: userId } });
    if (!row) return null;
    return {
      access_token: row.accessToken,
      refresh_token: row.refreshToken || '',
      expires_at: row.expiresAt,
      expires_in: row.expiresIn,
      token_type: row.tokenType,
      user_id: row.discordUserId,
      created_at: row.createdAt,
    };
  }

  async putTokenMetadata(userId: string, metadata: TokenMetadata): Promise<void> {
    await prisma.discordUser.upsert({ where: { id: userId }, create: { id: userId }, update: {} });
    await prisma.discordToken.upsert({
      where: { discordUserId: userId },
      create: {
        discordUserId: userId,
        accessToken: metadata.access_token,
        refreshToken: metadata.refresh_token,
        expiresAt: metadata.expires_at,
        expiresIn: metadata.expires_in,
        tokenType: metadata.token_type,
        createdAt: metadata.created_at,
      },
      update: {
        accessToken: metadata.access_token,
        refreshToken: metadata.refresh_token,
        expiresAt: metadata.expires_at,
        expiresIn: metadata.expires_in,
        tokenType: metadata.token_type,
        createdAt: metadata.created_at,
      },
    });
  }

  async getTokenValidation(token: string): Promise<Record<string, unknown> | null> {
    const suffix = token.slice(-8);
    const row = await prisma.tokenValidationCache.findUnique({ where: { tokenSuffix: suffix } });
    if (!row || row.expiresAt < new Date()) return null;
    return row.payloadJson as Record<string, unknown>;
  }

  async putTokenValidation(token: string, userId: string, payload: Record<string, unknown>, ttlSeconds: number): Promise<void> {
    const suffix = token.slice(-8);
    const expiresAt = new Date(Date.now() + Math.max(60, ttlSeconds) * 1000);
    await prisma.tokenValidationCache.upsert({
      where: { tokenSuffix: suffix },
      create: { tokenSuffix: suffix, discordUserId: userId, payloadJson: payload as Prisma.InputJsonValue, expiresAt },
      update: { discordUserId: userId, payloadJson: payload as Prisma.InputJsonValue, expiresAt },
    });
  }

  async getUserStatusCache(userId: string): Promise<{ status: unknown; timestamp: string } | null> {
    const row = await prisma.statusCache.findUnique({ where: { discordUserId: userId } });
    if (!row || row.expiresAt < new Date()) return null;
    const payload = row.payloadJson as { status?: unknown; timestamp?: string };
    if (!payload?.status) return null;
    return { status: payload.status, timestamp: payload.timestamp || row.updatedAt.toISOString() };
  }

  async setUserStatusCache(userId: string, status: unknown): Promise<void> {
    await prisma.discordUser.upsert({ where: { id: userId }, create: { id: userId }, update: {} });
    await prisma.statusCache.upsert({
      where: { discordUserId: userId },
      create: {
        discordUserId: userId,
        cacheKey: `cache:user_status:${userId}`,
        payloadJson: { status, timestamp: new Date().toISOString() } as Prisma.InputJsonValue,
        expiresAt: new Date(Date.now() + 120_000),
      },
      update: {
        payloadJson: { status, timestamp: new Date().toISOString() } as Prisma.InputJsonValue,
        expiresAt: new Date(Date.now() + 120_000),
      },
    });
  }

  async clearUserStatusCache(userId: string): Promise<void> {
    await prisma.statusCache.deleteMany({ where: { discordUserId: userId } });
  }

  async getInstanceStatus(instanceId: string): Promise<Record<string, unknown> | null> {
    const row = await prisma.activityInstance.findUnique({ where: { instanceId } });
    if (!row || row.expiresAt < new Date()) return null;
    return {
      status: row.status,
      last_activity: row.lastActivity.toISOString(),
      participant_count: row.participantCount,
      created_at: row.createdAt.toISOString(),
      last_verified: row.lastVerified?.toISOString(),
      last_authenticated_user: row.lastAuthenticatedUser,
      discord_verified: row.discordVerified,
      location: row.locationJson,
    };
  }

  async putInstanceStatus(instanceId: string, status: Record<string, unknown>): Promise<void> {
    await prisma.activityInstance.upsert({
      where: { instanceId },
      create: {
        instanceId,
        status: String(status.status || 'active'),
        participantCount: Number(status.participant_count || 0),
        lastActivity: new Date(String(status.last_activity || new Date().toISOString())),
        lastVerified: status.last_verified ? new Date(String(status.last_verified)) : null,
        lastAuthenticatedUser: status.last_authenticated_user ? String(status.last_authenticated_user) : null,
        discordVerified: Boolean(status.discord_verified),
        locationJson: (status.location as object) ?? null,
        expiresAt: instanceExpiresAt(),
      },
      update: {
        status: String(status.status || 'active'),
        participantCount: Number(status.participant_count || 0),
        lastActivity: new Date(String(status.last_activity || new Date().toISOString())),
        lastVerified: status.last_verified ? new Date(String(status.last_verified)) : null,
        lastAuthenticatedUser: status.last_authenticated_user ? String(status.last_authenticated_user) : null,
        discordVerified: Boolean(status.discord_verified),
        locationJson: (status.location as object) ?? undefined,
        expiresAt: instanceExpiresAt(),
      },
    });
  }

  async deleteInstance(instanceId: string): Promise<void> {
    await prisma.instanceData.deleteMany({ where: { instanceId } });
    await prisma.activityInstance.deleteMany({ where: { instanceId } });
  }

  async getInstanceData(instanceId: string): Promise<Record<string, unknown>> {
    const row = await prisma.instanceData.findUnique({ where: { instanceId } });
    if (!row || row.expiresAt < new Date()) return {};
    return {
      ...(row.payloadJson as Record<string, unknown>),
      selectedUserId: row.selectedUserId,
      multishockMap: row.multishockMap,
      participantIds: row.participantIds,
      lastUpdated: row.lastUpdated.toISOString(),
      updatedBy: row.updatedBy,
    };
  }

  async putInstanceData(instanceId: string, data: Record<string, unknown>, updatedBy: string): Promise<void> {
    await prisma.activityInstance.upsert({
      where: { instanceId },
      create: { instanceId, status: 'active', lastActivity: new Date(), expiresAt: instanceExpiresAt() },
      update: { lastActivity: new Date(), expiresAt: instanceExpiresAt() },
    });
    const existing = await this.getInstanceData(instanceId);
    const merged = { ...existing, ...data, lastUpdated: new Date().toISOString(), updatedBy } as Record<string, unknown>;
    await prisma.instanceData.upsert({
      where: { instanceId },
      create: {
        instanceId,
        selectedUserId: typeof merged.selectedUserId === 'string' ? merged.selectedUserId : null,
        multishockMap: (merged.multishockMap as object) ?? null,
        participantIds: (merged.participantIds as object) ?? null,
        payloadJson: merged as Prisma.InputJsonValue,
        updatedBy,
        expiresAt: instanceExpiresAt(),
      },
      update: {
        selectedUserId: typeof merged.selectedUserId === 'string' ? merged.selectedUserId : null,
        multishockMap: (merged.multishockMap as object) ?? undefined,
        participantIds: (merged.participantIds as object) ?? undefined,
        payloadJson: merged as Prisma.InputJsonValue,
        updatedBy,
        expiresAt: instanceExpiresAt(),
      },
    });
  }

  async addActivityLogEntry(entry: {
    id: string;
    timestamp: string;
    instanceId: string;
    executorUserId: string;
    executorUsername: string;
    executorAvatar?: string;
    targetUserId: string;
    targetUsername: string;
    targetAvatar?: string;
    action: string;
    intensity: number;
    duration: number;
    guildId?: string;
    guildName?: string;
  }): Promise<void> {
    await prisma.activityLogEntry.create({
      data: {
        id: entry.id,
        timestamp: new Date(entry.timestamp),
        instanceId: entry.instanceId,
        executorUserId: entry.executorUserId,
        executorUsername: entry.executorUsername,
        executorAvatar: entry.executorAvatar,
        targetUserId: entry.targetUserId,
        targetUsername: entry.targetUsername,
        targetAvatar: entry.targetAvatar,
        action: entry.action,
        intensity: entry.intensity,
        duration: entry.duration,
        guildId: entry.guildId,
        guildName: entry.guildName,
      },
    });
  }

  async listActivityLogEntries(options: { limit: number; offset: number; since?: string }) {
    const where = options.since ? { timestamp: { gt: new Date(options.since) } } : {};
    const [entries, total] = await Promise.all([
      prisma.activityLogEntry.findMany({
        where,
        orderBy: { timestamp: 'desc' },
        skip: options.offset,
        take: options.limit,
      }),
      prisma.activityLogEntry.count({ where }),
    ]);
    return {
      entries: entries.map((e: (typeof entries)[number]) => ({
        id: e.id,
        timestamp: e.timestamp.toISOString(),
        instanceId: e.instanceId,
        executorUserId: e.executorUserId,
        executorUsername: e.executorUsername,
        executorAvatar: e.executorAvatar ?? undefined,
        targetUserId: e.targetUserId,
        targetUsername: e.targetUsername,
        targetAvatar: e.targetAvatar ?? undefined,
        action: e.action,
        intensity: e.intensity,
        duration: e.duration,
        guildId: e.guildId ?? undefined,
        guildName: e.guildName ?? undefined,
      })),
      total,
    };
  }

  async getWarningAcks(userId: string) {
    const row = await prisma.monetizationAck.findUnique({ where: { discordUserId: userId } });
    return {
      hasSeenFirstBypassWarning: row?.hasSeenFirstBypassWarning ?? false,
      hasSeenFirstOverlimitPurchaseWarning: row?.hasSeenFirstOverlimitPurchaseWarning ?? false,
      updatedAt: row?.updatedAt.toISOString(),
    };
  }

  async putWarningAcks(userId: string, data: { hasSeenFirstBypassWarning: boolean; hasSeenFirstOverlimitPurchaseWarning: boolean }) {
    await prisma.discordUser.upsert({ where: { id: userId }, create: { id: userId }, update: {} });
    await prisma.monetizationAck.upsert({
      where: { discordUserId: userId },
      create: {
        discordUserId: userId,
        hasSeenFirstBypassWarning: data.hasSeenFirstBypassWarning,
        hasSeenFirstOverlimitPurchaseWarning: data.hasSeenFirstOverlimitPurchaseWarning,
      },
      update: {
        hasSeenFirstBypassWarning: data.hasSeenFirstBypassWarning,
        hasSeenFirstOverlimitPurchaseWarning: data.hasSeenFirstOverlimitPurchaseWarning,
      },
    });
  }

  async anonymizeUserInActivityLogs(userId: string): Promise<{ batchesUpdated: number; entriesAnonymized: number }> {
    const result = await prisma.activityLogEntry.updateMany({
      where: {
        OR: [{ executorUserId: userId }, { targetUserId: userId }],
      },
      data: {
        executorUsername: 'Deleted User',
        targetUsername: 'Deleted User',
        executorAvatar: null,
        targetAvatar: null,
      },
    });
    return { batchesUpdated: 1, entriesAnonymized: result.count };
  }
}
