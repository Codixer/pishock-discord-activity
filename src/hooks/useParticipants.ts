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

export function useParticipants(
  discordSdk: DiscordSDK,
  isEmbedded: boolean,
  authenticatedFetch: typeof fetch = fetch
) {
  const [participants, setParticipants] = useState<Participant[]>([]);

  const updateParticipants = useCallback((newParticipants: any[]) => {
    setParticipants(newParticipants.map(participant => ({
      ...participant,
      avatarUrl: participant.avatar 
        ? `https://cdn.discordapp.com/avatars/${participant.id}/${participant.avatar}.png?size=256`
        : `https://cdn.discordapp.com/embed/avatars/0.png`,
      displayName: participant.global_name || participant.username,
    })));
  }, []);

  const enrichParticipantsWithGuildData = useCallback(async (auth: any) => {
    if (!isEmbedded || !auth || !discordSdk.guildId) return;

    try {
      const enrichedParticipants = await Promise.all(
        participants.map(async (participant) => {
          try {
            const response = await authenticatedFetch(`${getApiBaseUrl()}/discord/guilds/${discordSdk.guildId}/members/${participant.id}`, {
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
            // Silently handle guild data fetch errors
          }
          return participant;
        })
      );

      setParticipants(enrichedParticipants);
    } catch (error) {
      // Silently handle enrichment errors
    }
  }, [participants, isEmbedded, discordSdk.guildId, authenticatedFetch]);

  return {
    participants,
    updateParticipants,
    enrichParticipantsWithGuildData,
  };
}