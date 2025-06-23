import { useState, useCallback } from 'react';

export interface Participant {
  id: string;
  username: string;
  displayName: string;
  avatar: string | null;
}

export function useParticipants() {
  const [participants, setParticipants] = useState<Participant[]>([]);

  const updateParticipants = useCallback((newParticipants: any[]) => {
    const formattedParticipants = newParticipants.map(participant => ({
      id: participant.id,
      username: participant.username,
      displayName: participant.global_name || participant.username,
      avatar: participant.avatar 
        ? `https://cdn.discordapp.com/avatars/${participant.id}/${participant.avatar}.png?size=256`
        : null,
    }));
    
    setParticipants(formattedParticipants);
  }, []);

  return {
    participants,
    updateParticipants,
  };
}