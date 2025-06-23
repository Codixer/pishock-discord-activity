import React from 'react';
import { Users, Crown, Radio } from '../icons';

interface ParticipantsListProps {
  participants: any[];
  currentUser: any;
  selectedTarget: any;
  onTargetSelect: (target: any) => void;
}

export function ParticipantsList({ 
  participants, 
  currentUser, 
  selectedTarget, 
  onTargetSelect 
}: ParticipantsListProps) {
  const otherParticipants = participants.filter(p => p.id !== currentUser.id);

  return (
    <div className="bg-black/20 backdrop-blur-md rounded-2xl border border-white/10 p-6">
      <div className="flex items-center space-x-3 mb-4">
        <div className="w-8 h-8 bg-gradient-to-r from-blue-500 to-cyan-600 rounded-lg flex items-center justify-center">
          <Users className="w-5 h-5 text-white" />
        </div>
        <div>
          <h3 className="text-lg font-semibold">Participants</h3>
          <p className="text-sm text-gray-400">{participants.length} connected</p>
        </div>
      </div>

      <div className="space-y-3">
        {/* Current User */}
        <div className="bg-purple-500/10 border border-purple-500/20 rounded-lg p-3">
          <div className="flex items-center space-x-3">
            <div className="relative">
              <img
                src={currentUser.avatar || `https://cdn.discordapp.com/embed/avatars/0.png`}
                alt={currentUser.displayName}
                className="w-10 h-10 rounded-full border-2 border-purple-500/50"
              />
              <Crown className="w-4 h-4 text-yellow-400 absolute -top-1 -right-1" />
            </div>
            <div className="flex-1">
              <p className="font-medium text-purple-300">{currentUser.displayName}</p>
              <p className="text-xs text-purple-400">You</p>
            </div>
          </div>
        </div>

        {/* Other Participants */}
        {otherParticipants.length > 0 ? (
          <>
            <div className="text-sm text-gray-400 font-medium">Available Targets</div>
            {otherParticipants.map((participant) => (
              <button
                key={participant.id}
                onClick={() => onTargetSelect(participant)}
                className={`w-full text-left p-3 rounded-lg border transition-all ${
                  selectedTarget?.id === participant.id
                    ? 'bg-green-500/20 border-green-500/50'
                    : 'bg-white/5 border-white/10 hover:bg-white/10 hover:border-white/20'
                }`}
              >
                <div className="flex items-center space-x-3">
                  <div className="relative">
                    <img
                      src={participant.avatar || `https://cdn.discordapp.com/embed/avatars/0.png`}
                      alt={participant.displayName}
                      className="w-10 h-10 rounded-full"
                    />
                    <div className="w-3 h-3 bg-green-500 rounded-full absolute -bottom-0.5 -right-0.5 border-2 border-gray-900"></div>
                  </div>
                  <div className="flex-1">
                    <p className="font-medium">{participant.displayName}</p>
                    <p className="text-xs text-gray-400">@{participant.username}</p>
                  </div>
                  {selectedTarget?.id === participant.id && (
                    <Radio className="w-4 h-4 text-green-400" />
                  )}
                </div>
              </button>
            ))}
          </>
        ) : (
          <div className="text-center py-6 text-gray-400">
            <Users className="w-8 h-8 mx-auto mb-2 opacity-50" />
            <p className="text-sm">No other participants</p>
            <p className="text-xs">Invite others to join!</p>
          </div>
        )}
      </div>
    </div>
  );
}