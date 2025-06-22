import React from 'react';
import { Users, User, Crown, Zap, ZapOff, Smartphone } from 'lucide-react';
import { InstanceData } from '../hooks/useInstanceData';

interface UserSelectorProps {
  members: any[];
  selectedUser: any;
  onUserSelect: (user: any) => void;
  currentUser: any;
  instanceData: InstanceData;
  userPiShockStatus: Record<string, any>;
}

export function UserSelector({ 
  members, 
  selectedUser, 
  onUserSelect, 
  currentUser, 
  instanceData, 
  userPiShockStatus 
}: UserSelectorProps) {
  // Safe BigInt conversion with fallback for development mock IDs
  const getDefaultAvatarIndex = (userId: string) => {
    try {
      // Check if the ID is a valid number string
      if (/^\d+$/.test(userId)) {
        return (BigInt(userId) >> 22n) % 6n;
      } else {
        // For non-numeric IDs (like dev_user_123), use a simple hash
        let hash = 0;
        for (let i = 0; i < userId.length; i++) {
          hash = ((hash << 5) - hash + userId.charCodeAt(i)) & 0xffffffff;
        }
        return Math.abs(hash) % 6;
      }
    } catch (error) {
      // Fallback to index 0 if any error occurs
      return 0;
    }
  };

  const getAvatarUrl = (member: any) => {
    return member.guildAvatarUrl || member.avatarUrl || `https://cdn.discordapp.com/embed/avatars/${getDefaultAvatarIndex(member.id)}.png`;
  };

  const getDisplayName = (member: any) => {
    return member.guildDisplayName || member.displayName || member.global_name || member.username || 'Unknown User';
  };

  const isCurrentUserSelected = selectedUser?.id === currentUser?.id;
  const otherParticipants = members.filter(member => member.id !== currentUser?.id);

  return (
    <div className="h-full bg-black/20 backdrop-blur-sm rounded-xl border border-white/10 p-4 flex flex-col">
      <div className="flex items-center space-x-2 mb-4 flex-shrink-0">
        <Users className="h-5 w-5 text-blue-400" />
        <div className="min-w-0 flex-1">
          <h2 className="text-base sm:text-lg font-semibold truncate">Activity Participants</h2>
        </div>
        <span className="text-xs sm:text-sm text-gray-400 flex-shrink-0">({members.length})</span>
      </div>

      <div className="flex-1 overflow-y-auto min-h-0">
        <div className="space-y-3">
          {members.length === 0 ? (
            <div className="text-center py-8 text-gray-400">
              <Users className="h-12 w-12 mx-auto mb-3 opacity-50" />
              <p>No participants found</p>
              <p className="text-sm mt-1">Waiting for users to join...</p>
            </div>
          ) : (
            <>
              {/* Current User */}
              {currentUser && (
                <div className="mb-4">
                  <h3 className="text-xs sm:text-sm font-medium text-gray-400 mb-2 flex items-center space-x-1">
                    <Crown className="h-3 w-3" />
                    <span>You</span>
                  </h3>
                  <div className="p-2 sm:p-3 rounded-lg border bg-blue-900/20 border-blue-500/30">
                    <div className="flex items-center space-x-3">
                      <img
                        src={getAvatarUrl(currentUser)}
                        alt="Your avatar"
                        className="w-6 h-6 sm:w-8 sm:h-8 rounded-full flex-shrink-0"
                        onError={(e) => {
                          const target = e.target as HTMLImageElement;
                          target.src = `https://cdn.discordapp.com/embed/avatars/${getDefaultAvatarIndex(currentUser.id)}.png`;
                        }}
                      />
                      <div className="min-w-0 flex-1">
                        <p className="font-medium text-blue-300 text-xs sm:text-sm truncate">
                          {getDisplayName(currentUser)}
                        </p>
                        <div className="flex flex-col space-y-1 mt-1">
                          <div className="flex items-center space-x-1">
                          {userPiShockStatus[currentUser.id]?.isConnected ? (
                            userPiShockStatus[currentUser.id]?.hasDevice ? (
                              <div className="flex items-center space-x-1 text-xs text-green-400">
                                <span>⚡</span>
                                <Zap className="h-3 w-3" />
                                <span className="hidden sm:inline">PiShock Device</span>
                                <span className="sm:hidden">Device</span>
                              </div>
                            ) : (
                              <div className="flex items-center space-x-1 text-xs text-blue-400">
                                <span>👤</span>
                                <Smartphone className="h-3 w-3" />
                                <span className="hidden sm:inline">PiShock Account</span>
                                <span className="sm:hidden">Account</span>
                              </div>
                            )
                          ) : userPiShockStatus[currentUser.id]?.hasCredentials ? (
                            <div className="flex items-center space-x-1 text-xs text-yellow-400">
                              <span>⚠️</span>
                              <Zap className="h-3 w-3" />
                              <span className="hidden sm:inline">Connection Issue</span>
                              <span className="sm:hidden">Issue</span>
                            </div>
                          ) : (
                            <div className="flex items-center space-x-1 text-xs text-gray-400">
                              <span>❌</span>
                              <ZapOff className="h-3 w-3" />
                              <span className="hidden sm:inline">No PiShock</span>
                              <span className="sm:hidden">None</span>
                            </div>
                          )}
                          </div>
                          {userPiShockStatus[currentUser.id]?.piShockUserId && (
                            <div className="text-xs text-gray-400">
                              ID: {userPiShockStatus[currentUser.id].piShockUserId}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Other Participants */}
              {otherParticipants.length > 0 && (
                <div>
                  <h3 className="text-xs sm:text-sm font-medium text-gray-400 mb-2">Select Target</h3>
                  <div className="space-y-2">
                    {otherParticipants.map((member) => {
                      const userStatus = userPiShockStatus[member.id];
                      const isConnected = userStatus?.isConnected;
                      const hasDevice = userStatus?.hasDevice;
                      const hasCredentials = userStatus?.hasCredentials;
                      const isDisabled = !isConnected;
                      
                      return (
                        <button
                          key={member.id}
                          onClick={() => !isDisabled && onUserSelect(member)}
                          disabled={isDisabled}
                          className={`w-full p-3 rounded-lg border transition-all text-left ${
                            isDisabled
                              ? 'bg-gray-800/30 border-gray-600/30 opacity-50 cursor-not-allowed'
                              : selectedUser?.id === member.id
                              ? 'bg-purple-600/20 border-purple-500/50 ring-2 ring-purple-500/20'
                              : 'bg-gray-800/50 border-gray-600/50 hover:bg-gray-700/50 hover:border-gray-500/50'
                          }`}
                        >
                          <div className="flex items-center space-x-2 sm:space-x-3">
                            <img
                              src={getAvatarUrl(member)}
                              alt={`${getDisplayName(member)}'s avatar`}
                              className="w-6 h-6 sm:w-8 sm:h-8 rounded-full flex-shrink-0"
                              onError={(e) => {
                                const target = e.target as HTMLImageElement;
                                target.src = `https://cdn.discordapp.com/embed/avatars/${getDefaultAvatarIndex(member.id)}.png`;
                              }}
                            />
                            <div className="min-w-0 flex-1">
                              <p className="font-medium text-white text-xs sm:text-sm truncate">
                                {getDisplayName(member)}
                              </p>
                              <div className="flex flex-col space-y-1 mt-1">
                                <div className="flex items-center space-x-1">
                                {isConnected ? (
                                  hasDevice ? (
                                    <div className="flex items-center space-x-1 text-xs text-green-400">
                                      <span>⚡</span>
                                      <Zap className="h-3 w-3" />
                                      <span className="hidden sm:inline">PiShock Device</span>
                                      <span className="sm:hidden">Device</span>
                                    </div>
                                  ) : (
                                    <div className="flex items-center space-x-1 text-xs text-blue-400">
                                      <span>👤</span>
                                      <Smartphone className="h-3 w-3" />
                                      <span className="hidden sm:inline">PiShock Account</span>
                                      <span className="sm:hidden">Account</span>
                                    </div>
                                  )
                                ) : hasCredentials ? (
                                  <div className="flex items-center space-x-1 text-xs text-yellow-400">
                                    <span>⚠️</span>
                                    <Zap className="h-3 w-3" />
                                    <span className="hidden sm:inline">Connection Issue</span>
                                    <span className="sm:hidden">Issue</span>
                                  </div>
                                ) : (
                                  <div className="flex items-center space-x-1 text-xs text-gray-400">
                                    <span>❌</span>
                                    <ZapOff className="h-3 w-3" />
                                    <span className="hidden sm:inline">No PiShock</span>
                                    <span className="sm:hidden">None</span>
                                  </div>
                                )}
                                </div>
                                {userStatus?.piShockUserId && (
                                  <div className="text-xs text-gray-400">
                                    ID: {userStatus.piShockUserId}
                                  </div>
                                )}
                              </div>
                            </div>
                            {selectedUser?.id === member.id && !isDisabled && (
                              <div className="w-2 h-2 bg-purple-400 rounded-full flex-shrink-0"></div>
                            )}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {otherParticipants.length === 0 && (
                <div className="text-center py-6 text-gray-400">
                  <Users className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  <p className="text-xs sm:text-sm">You're the only participant</p>
                  <p className="text-xs mt-1">Invite others to join the activity!</p>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {selectedUser && (
        <div className="mt-4 p-2 sm:p-3 bg-green-900/20 border border-green-500/30 rounded-lg flex-shrink-0">
          <div className="flex items-center space-x-3">
            <img
              src={getAvatarUrl(selectedUser)}
              alt={`${getDisplayName(selectedUser)}'s avatar`}
              className="w-5 h-5 sm:w-6 sm:h-6 rounded-full flex-shrink-0"
              onError={(e) => {
                const target = e.target as HTMLImageElement;
                target.src = `https://cdn.discordapp.com/embed/avatars/${getDefaultAvatarIndex(selectedUser.id)}.png`;
              }}
            />
            <div className="min-w-0 flex-1">
              <p className="text-green-300 text-xs sm:text-sm">
                <span className="font-semibold">Target:</span> {getDisplayName(selectedUser)}
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}