import React from 'react';
import { Users, User, Crown, Zap, ZapOff, Smartphone, Lock, AlertTriangle, RefreshCw } from 'lucide-react';
import { InstanceData } from '../hooks/useInstanceData';

interface UserSelectorProps {
  members: any[];
  selectedUser: any;
  onUserSelect: (user: any) => void;
  currentUser: any;
  instanceData: InstanceData;
  userPiShockStatus: Record<string, any>;
  refreshParticipants?: () => void;
  isEmbedded?: boolean;
}

export function UserSelector({ 
  members, 
  selectedUser, 
  onUserSelect, 
  currentUser, 
  instanceData, 
  userPiShockStatus,
  refreshParticipants,
  isEmbedded = false
}: UserSelectorProps) {
  const getDefaultAvatarIndex = (userId: string) => {
    try {
      if (/^\d+$/.test(userId)) {
        return (BigInt(userId) >> 22n) % 6n;
      } else {
        let hash = 0;
        for (let i = 0; i < userId.length; i++) {
          hash = ((hash << 5) - hash + userId.charCodeAt(i)) & 0xffffffff;
        }
        return Math.abs(hash) % 6;
      }
    } catch (error) {
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
      <div className="flex items-center justify-between mb-4 flex-shrink-0">
        <div className="flex items-center space-x-2 min-w-0 flex-1">
        <Users className="h-5 w-5 text-blue-400" />
          <div className="min-w-0 flex-1">
          <h2 className="text-base sm:text-lg font-semibold truncate">Activity Participants</h2>
          </div>
          <span className="text-xs sm:text-sm text-gray-400 flex-shrink-0">({members.length})</span>
        </div>
        
        {isEmbedded && refreshParticipants && (
          <button
            onClick={refreshParticipants}
            className="flex items-center space-x-1 px-2 py-1 bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors text-xs font-medium ml-2"
            title="Refresh participant list"
          >
            <RefreshCw className="h-3 w-3" />
            <span className="hidden sm:inline">Refresh</span>
          </button>
        )}
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
                      
                      const currentUserStatus = userPiShockStatus[currentUser?.id];
                      const currentUserBannedExecutors = currentUserStatus?.bannedExecutors || [];
                      const isBannedByCurrentUser = currentUserBannedExecutors.includes(member.id);
                      
                      return (
                        <button
                          key={member.id}
                          onClick={() => !isDisabled && onUserSelect(member)}
                          disabled={isDisabled}
                          className={`w-full p-3 rounded-lg border transition-all text-left ${
                            isDisabled
                              ? 'bg-gray-800/30 border-gray-600/30 opacity-60 cursor-not-allowed'
                              : selectedUser?.id === member.id
                              ? 'bg-purple-600/20 border-purple-500/50 ring-2 ring-purple-500/20'
                              : 'bg-gray-800/50 border-gray-600/50 hover:bg-gray-700/50 hover:border-gray-500/50'
                          }`}
                          title={isDisabled ? `${getDisplayName(member)} needs to configure their PiShock device before receiving commands` : ''}
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
                                      {(userStatus?.maxIntensity < 100 || userStatus?.maxDuration < 15) && (
                                        <Lock className="h-2 w-2 text-yellow-400" title="Has device limits" />
                                      )}
                                      {userStatus?.enableShockBypass && (
                                        <span className="text-purple-400" title="Bypass enabled">🛡️</span>
                                      )}
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
                                    <span>🚫</span>
                                    <ZapOff className="h-3 w-3" />
                                    <span className="hidden sm:inline">Setup Required</span>
                                    <span className="sm:hidden">Setup Needed</span>
                                  </div>
                                )}
                                </div>
                              {isBannedByCurrentUser && (
                                <div className="text-xs text-red-400 flex items-center space-x-1">
                                  <span>🚫</span>
                                  <span>You blocked this user</span>
                                </div>
                              )}
                                {!isConnected && !hasCredentials && (
                                  <div className="text-xs text-red-300 mt-1">
                                    <span className="hidden sm:inline">Needs to configure PiShock credentials</span>
                                    <span className="sm:hidden">Setup needed</span>
                                  </div>
                                )}
                                {userStatus?.maxIntensity < 100 || userStatus?.maxDuration < 15 ? (
                                  <div className="text-xs text-yellow-400">
                                    Limits: {userStatus.maxIntensity}%/{userStatus.maxDuration}s
                                  </div>
                                ) : null}
                                {userStatus?.piShockUserId && (
                                  <div className="text-xs text-gray-400">
                                    ID: {userStatus.piShockUserId}
                                  </div>
                                )}
                                {!userStatus && (
                                  <div className="text-xs text-gray-400">
                                    Status loading...
                                  </div>
                                )}
                              </div>
                            </div>
                            {selectedUser?.id === member.id && !isDisabled && (
                              <div className="w-2 h-2 bg-purple-400 rounded-full flex-shrink-0"></div>
                            )}
                            {isDisabled && (
                              <div className="flex items-center space-x-1 text-red-400">
                                <ZapOff className="h-3 w-3" />
                              </div>
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
              
              {otherParticipants.length > 0 && otherParticipants.every(member => !userPiShockStatus[member.id]?.isConnected) && (
                <div className="mt-4 p-3 bg-yellow-900/20 border border-yellow-500/30 rounded-lg">
                  <div className="flex items-start space-x-2">
                    <AlertTriangle className="h-4 w-4 text-yellow-400 flex-shrink-0 mt-0.5" />
                    <div className="text-xs text-yellow-200">
                      <p className="font-semibold mb-1">No PiShock Devices Available</p>
                      <p>Participants need to configure their PiShock credentials in the settings panel (gear icon) before they can receive commands.</p>
                    </div>
                  </div>
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