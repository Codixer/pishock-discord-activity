import React from 'react';
import { Users, Crown, Zap, ZapOff, Smartphone, Lock, AlertTriangle, RefreshCw } from 'lucide-react';
import { InstanceData } from '../hooks/useInstanceData';

interface UserSelectorProps {
  members: any[];
  selectedUser: any;
  onUserSelect: (user: any) => void;
  currentUser: any;
  instanceData: InstanceData;
  userPiShockStatus: Record<string, any>;
  refreshParticipants?: () => void;
  refreshUserStatuses?: () => void;
  isEmbedded?: boolean;
}

export function UserSelector({ 
  members, 
  selectedUser, 
  onUserSelect, 
  currentUser, 
  instanceData: _instanceData,
  userPiShockStatus,
  refreshParticipants,
  refreshUserStatuses,
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
    } catch {
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
    <div className="h-full ps-panel-shell rounded-md p-3 flex flex-col">
      <div className="flex items-center justify-between mb-3 flex-shrink-0">
        <div className="flex items-center space-x-2 min-w-0 flex-1">
        <Users className="h-4 w-4 text-cyan-300" />
          <div className="min-w-0 flex-1">
          <h2 className="text-xs sm:text-sm font-semibold uppercase tracking-[0.12em] truncate">Target Matrix</h2>
          </div>
          <span className="text-[10px] ps-muted-text flex-shrink-0">({members.length})</span>
        </div>
        
        {isEmbedded && (
          <div className="flex items-center space-x-1 ml-2">
            {refreshUserStatuses && (
              <button
                onClick={refreshUserStatuses}
                className="ps-btn-compact ps-btn-compact-primary flex items-center space-x-1 px-2 py-1 rounded-md transition-colors text-xs font-medium"
                title="Refresh PiShock status for all participants"
              >
                <Zap className="h-3 w-3" />
                <span className="hidden sm:inline">Status</span>
              </button>
            )}
            {refreshParticipants && (
              <button
                onClick={refreshParticipants}
                className="ps-btn-compact ps-btn-compact-primary flex items-center space-x-1 px-2 py-1 rounded-md transition-colors text-xs font-medium"
                title="Refresh participant list from Discord"
              >
                <RefreshCw className="h-3 w-3" />
                <span className="hidden sm:inline">List</span>
              </button>
            )}
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto min-h-0">
        <div className="space-y-2.5">
          {members.length === 0 ? (
            <div className="text-center py-8 text-gray-400">
              <Users className="h-12 w-12 mx-auto mb-3 opacity-50" />
              <p>No participants found</p>
              <p className="text-sm mt-1">Waiting for users to join...</p>
            </div>
          ) : (
            <>
              {currentUser && (() => {
                const currentUserStatus = userPiShockStatus[currentUser.id];
                const isConnected = currentUserStatus?.isConnected;
                const hasDevice = currentUserStatus?.hasDevice;
                const hasCredentials = currentUserStatus?.hasCredentials;
                const isDisabled = !isConnected;
                
                return (
                  <div className="mb-4">
                    <h3 className="text-[10px] font-medium ps-muted-text mb-2 flex items-center space-x-1 uppercase tracking-[0.12em]">
                      <Crown className="h-3 w-3" />
                      <span>You</span>
                    </h3>
                    <button
                      onClick={() => !isDisabled && onUserSelect(currentUser)}
                      disabled={isDisabled}
                      className={`w-full p-2 rounded border transition-all text-left ${
                        isDisabled
                          ? 'bg-slate-900/20 border-slate-700/50 opacity-60 cursor-not-allowed'
                          : isCurrentUserSelected
                          ? 'bg-cyan-500/10 border-cyan-300/60 ring-1 ring-cyan-400/30'
                          : 'bg-slate-900/45 border-cyan-500/30 hover:bg-slate-900/80 hover:border-cyan-300/45'
                      }`}
                      title={isDisabled ? 'You need to configure your PiShock device before you can target yourself' : ''}
                    >
                      <div className="flex items-center space-x-2 sm:space-x-3">
                        <img
                          src={getAvatarUrl(currentUser)}
                          alt="Your avatar"
                          className="w-6 h-6 rounded-full flex-shrink-0"
                          onError={(e) => {
                            const target = e.target as HTMLImageElement;
                            target.src = `https://cdn.discordapp.com/embed/avatars/${getDefaultAvatarIndex(currentUser.id)}.png`;
                          }}
                        />
                        <div className="min-w-0 flex-1">
                          <p className={`font-medium text-xs truncate ${
                            isCurrentUserSelected ? 'text-cyan-200' : 'text-cyan-300'
                          }`}>
                            {getDisplayName(currentUser)}
                          </p>
                          <div className="flex flex-col space-y-1 mt-1">
                            <div className="flex items-center space-x-1">
                            {isConnected ? (
                              hasDevice ? (
                                <div className="flex items-center space-x-1 text-[10px] text-green-400 uppercase tracking-[0.08em]">
                                  <span>⚡</span>
                                  <Zap className="h-3 w-3" />
                                  <span className="hidden sm:inline">PiShock Device</span>
                                  <span className="sm:hidden">Device</span>
                                  {(currentUserStatus?.maxIntensity < 100 || currentUserStatus?.maxDuration < 15) && (
                                    <Lock className="h-2 w-2 text-yellow-400" title="Has device limits" />
                                  )}
                                </div>
                              ) : (
                                <div className="flex items-center space-x-1 text-[10px] text-blue-400 uppercase tracking-[0.08em]">
                                  <span>👤</span>
                                  <Smartphone className="h-3 w-3" />
                                  <span className="hidden sm:inline">PiShock Account</span>
                                  <span className="sm:hidden">Account</span>
                                </div>
                              )
                            ) : hasCredentials ? (
                              <div className="flex items-center space-x-1 text-[10px] text-yellow-400 uppercase tracking-[0.08em]">
                                <span>⚠️</span>
                                <Zap className="h-3 w-3" />
                                <span className="hidden sm:inline">Connection Issue</span>
                                <span className="sm:hidden">Issue</span>
                              </div>
                            ) : (
                              <div className="flex items-center space-x-1 text-[10px] text-gray-400 uppercase tracking-[0.08em]">
                                <span>❌</span>
                                <ZapOff className="h-3 w-3" />
                                <span className="hidden sm:inline">No PiShock</span>
                                <span className="sm:hidden">None</span>
                              </div>
                            )}
                            </div>
                            {!isConnected && !hasCredentials && (
                              <div className="text-[10px] text-red-300 mt-1">
                                <span className="hidden sm:inline">Configure PiShock credentials to target yourself</span>
                                <span className="sm:hidden">Setup needed</span>
                              </div>
                            )}
                            {currentUserStatus?.maxIntensity < 100 || currentUserStatus?.maxDuration < 15 ? (
                              <div className="text-[10px] text-yellow-400">
                                Limits: {currentUserStatus.maxIntensity}%/{currentUserStatus.maxDuration}s
                              </div>
                            ) : null}
                            {currentUserStatus?.piShockUserId && (
                              <div className="text-[10px] text-gray-400">
                                ID: {currentUserStatus.piShockUserId}
                              </div>
                            )}
                            {!currentUserStatus && (
                              <div className="text-xs text-gray-400">
                                Status loading...
                              </div>
                            )}
                          </div>
                        </div>
                        {isCurrentUserSelected && !isDisabled && (
                          <div className="w-2 h-2 bg-cyan-300 rounded-full flex-shrink-0"></div>
                        )}
                        {isDisabled && (
                          <div className="flex items-center space-x-1 text-red-400">
                            <ZapOff className="h-3 w-3" />
                          </div>
                        )}
                      </div>
                    </button>
                  </div>
                );
              })()}

              {otherParticipants.length > 0 && (
                <div>
                  <h3 className="text-[10px] font-medium ps-muted-text mb-2 uppercase tracking-[0.12em]">Select Target</h3>
                  <div className="space-y-1.5">
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
                          className={`w-full p-2 rounded border transition-all text-left ${
                            isDisabled
                              ? 'bg-slate-900/20 border-slate-700/50 opacity-60 cursor-not-allowed'
                              : selectedUser?.id === member.id
                              ? 'bg-cyan-500/10 border-cyan-300/60 ring-1 ring-cyan-400/30'
                              : 'bg-slate-900/45 border-cyan-500/30 hover:bg-slate-900/80 hover:border-cyan-300/45'
                          }`}
                          title={isDisabled ? `${getDisplayName(member)} needs to configure their PiShock device before receiving commands` : ''}
                        >
                          <div className="flex items-center space-x-2 sm:space-x-3">
                            <img
                              src={getAvatarUrl(member)}
                              alt={`${getDisplayName(member)}'s avatar`}
                              className="w-6 h-6 rounded-full flex-shrink-0"
                              onError={(e) => {
                                const target = e.target as HTMLImageElement;
                                target.src = `https://cdn.discordapp.com/embed/avatars/${getDefaultAvatarIndex(member.id)}.png`;
                              }}
                            />
                            <div className="min-w-0 flex-1">
                              <p className="font-medium text-cyan-100 text-xs truncate">
                                {getDisplayName(member)}
                              </p>
                              <div className="flex flex-col space-y-1 mt-1">
                                <div className="flex items-center space-x-1">
                                {isConnected ? (
                                  hasDevice ? (
                                    <div className="flex items-center space-x-1 text-[10px] text-green-400 uppercase tracking-[0.08em]">
                                      <span>⚡</span>
                                      <Zap className="h-3 w-3" />
                                      <span className="hidden sm:inline">PiShock Device</span>
                                      <span className="sm:hidden">Device</span>
                                      {(userStatus?.maxIntensity < 100 || userStatus?.maxDuration < 15) && (
                                        <Lock className="h-2 w-2 text-yellow-400" title="Has device limits" />
                                      )}
                                    </div>
                                  ) : (
                                    <div className="flex items-center space-x-1 text-[10px] text-blue-400 uppercase tracking-[0.08em]">
                                      <span>👤</span>
                                      <Smartphone className="h-3 w-3" />
                                      <span className="hidden sm:inline">PiShock Account</span>
                                      <span className="sm:hidden">Account</span>
                                    </div>
                                  )
                                ) : hasCredentials ? (
                                  <div className="flex items-center space-x-1 text-[10px] text-yellow-400 uppercase tracking-[0.08em]">
                                    <span>⚠️</span>
                                    <Zap className="h-3 w-3" />
                                    <span className="hidden sm:inline">Connection Issue</span>
                                    <span className="sm:hidden">Issue</span>
                                  </div>
                                ) : (
                                  <div className="flex items-center space-x-1 text-[10px] text-gray-400 uppercase tracking-[0.08em]">
                                    <span>🚫</span>
                                    <ZapOff className="h-3 w-3" />
                                    <span className="hidden sm:inline">Setup Required</span>
                                    <span className="sm:hidden">Setup Needed</span>
                                  </div>
                                )}
                                </div>
                              {isBannedByCurrentUser && (
                                <div className="text-[10px] text-red-400 flex items-center space-x-1 uppercase tracking-[0.08em]">
                                  <span>🚫</span>
                                  <span>You blocked this user</span>
                                </div>
                              )}
                                {!isConnected && !hasCredentials && (
                                  <div className="text-[10px] text-red-300 mt-1">
                                    <span className="hidden sm:inline">Needs to configure PiShock credentials</span>
                                    <span className="sm:hidden">Setup needed</span>
                                  </div>
                                )}
                                {userStatus?.maxIntensity < 100 || userStatus?.maxDuration < 15 ? (
                                  <div className="text-[10px] text-yellow-400">
                                    Limits: {userStatus.maxIntensity}%/{userStatus.maxDuration}s
                                  </div>
                                ) : null}
                                {userStatus?.piShockUserId && (
                                  <div className="text-[10px] text-gray-400">
                                    ID: {userStatus.piShockUserId}
                                  </div>
                                )}
                                {Array.isArray(userStatus?.allowedShockerIds) && userStatus.allowedShockerIds.length > 0 && (
                                  <div className="text-[10px] text-indigo-300">
                                    Multishock allowed devices: {userStatus.allowedShockerIds.length}
                                  </div>
                                )}
                                {!userStatus && (
                                  <div className="text-[10px] text-gray-400">
                                    Status loading...
                                  </div>
                                )}
                              </div>
                            </div>
                            {selectedUser?.id === member.id && !isDisabled && (
                              <div className="w-2 h-2 bg-cyan-300 rounded-full flex-shrink-0"></div>
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
                <div className="mt-3 p-2.5 bg-yellow-950/20 border border-yellow-500/35 rounded">
                  <div className="flex items-start space-x-2">
                    <AlertTriangle className="h-4 w-4 text-yellow-400 flex-shrink-0 mt-0.5" />
                    <div className="text-[10px] text-yellow-200">
                      <p className="font-semibold mb-1 uppercase tracking-[0.08em]">No PiShock Devices Available</p>
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
        <div className="mt-3 p-2 bg-emerald-950/20 border border-emerald-500/40 rounded flex-shrink-0">
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
              <p className="text-green-300 text-xs">
                <span className="font-semibold">Target:</span> {getDisplayName(selectedUser)}
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}