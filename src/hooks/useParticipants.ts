import { useState, useCallback, useEffect } from 'react';
import { DiscordSDK } from '@discord/embedded-app-sdk';

export interface Participant {
  id: string;
  username: string;
  discriminator: string;
  avatar?: string;
  global_name?: string;
  guild_avatar?: string;
  guild_nickname?: string;
}

// Helper function to get the correct API base URL
function getApiBaseUrl(): string {
  const urlParams = new URLSearchParams(window.location.search);
  const isEmbedded = urlParams.has('frame_id');
  
  if (isEmbedded) {
    // Use Discord's proxy for embedded environment
    return '/.proxy/api';
  } else {
    // Use direct API calls for development
    return '/api';
  }
}

export function useParticipants(discordSdk: DiscordSDK, isEmbedded: boolean) {
  const [participants, setParticipants] = useState<Participant[]>([]);

  const updateParticipants = useCallback((newParticipants: any[]) => {
    setParticipants(newParticipants.map(participant => ({
      ...participant,
      // Generate avatar URL
      avatarUrl: participant.avatar 
        ? `https://cdn.discordapp.com/avatars/${participant.id}/${participant.avatar}.png?size=256`
        : `https://cdn.discordapp.com/embed/avatars/0.png`,
      // Use global_name or fallback to username (no discriminator)
      displayName: participant.global_name || participant.username,
    })));
  }, []);

  // Fetch guild-specific avatars and nicknames for participants
  const enrichParticipantsWithGuildData = useCallback(async (auth: any) => {
    if (!isEmbedded || !auth || !discordSdk.guildId) return;

    try {
      const enrichedParticipants = await Promise.all(
        participants.map(async (participant) => {
          try {
            const response = await fetch(`${getApiBaseUrl()}/discord/guilds/${discordSdk.guildId}/members/${participant.id}`, {
              headers: {
                'Authorization': `Bearer ${auth.access_token}`,
              },
            });

            if (response.ok) {
              const guildMemberData = await response.json();
              return {
                ...participant,
                guild_avatar: guildMemberData.avatar,
                guild_nickname: guildMemberData.nick,
                guildAvatarUrl: guildMemberData.avatar
                  ? `https://cdn.discordapp.com/guilds/${discordSdk.guildId}/users/${participant.id}/avatars/${guildMemberData.avatar}.png?size=256`
                  : participant.avatarUrl,
                guildDisplayName: guildMemberData.nick || participant.displayName,
              };
            }
          } catch (error) {
            console.warn(`Failed to fetch guild data for ${participant.username}:`, error);
          }
          return participant;
        })
      );

      setParticipants(enrichedParticipants);
    } catch (error) {
      console.error('Failed to enrich participants with guild data:', error);
    }
  }, [participants, isEmbedded, discordSdk.guildId]);

  return {
    participants,
    updateParticipants,
    enrichParticipantsWithGuildData,
  };
}