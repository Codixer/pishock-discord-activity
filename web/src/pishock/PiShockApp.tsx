import { useState, useCallback } from 'react';
import type { DiscordSDK } from '@discord/embedded-app-sdk';
import { PiShockSettingsModal } from '../components/PiShockSettingsModal';
import { ActivityLog } from '../components/ActivityLog';
import { usePiShockControl, type NotifyFn } from '../hooks/usePiShockControl';
import {
  MdiFlash, MdiVibrate, MdiClock, MdiSpeedometer, MdiAlertOctagon, MdiBellAlert, MdiCogs,
  MdiCursorPointer, MdiShareVariant, MdiDotsVertical, MdiExclamation, MdiHumanGreetingProximity,
  MdiCarBrakeAlert, MdiChevronDoubleUp, MdiChevronDoubleDown, MdiDice3, MdiMenu, MdiClose,
  MdiPlus, MdiCart, MdiHistory, MdiShieldAccount, MdiFileDocument, MdiShieldLock,
} from './MdiIcon';

const VIBRATE_DURATIONS = [0.3, 0.5, 1, 1.5, 2, 3, 5, 10, 15];

function VerticalSlider({
  value,
  max,
  onChange,
  disabled,
  ariaLabel,
}: {
  value: number;
  max: number;
  onChange: (v: number) => void;
  disabled?: boolean;
  ariaLabel: string;
}) {
  const [interacting, setInteracting] = useState(false);
  const pct = max > 0 ? (value / max) * 100 : 0;

  return (
    <div className="q-slider q-slider--v q-slider--dark q-slider--dense q-slider--dense--v">
      <div className="q-slider__track-container q-slider__track-container--v">
        <input
          type="range"
          className="q-slider__input"
          min={0}
          max={max}
          step={1}
          value={value}
          disabled={disabled}
          aria-label={ariaLabel}
          onChange={(e) => onChange(Number(e.target.value))}
          onPointerDown={() => setInteracting(true)}
          onPointerUp={() => setInteracting(false)}
          onBlur={() => setInteracting(false)}
        />
        <div className="q-slider__track relative-position no-outline">
          <div className="q-slider__inner absolute" style={{ bottom: 0, height: '100%' }} />
          <div className="q-slider__selection absolute text-secondary" style={{ bottom: 0, height: `${pct}%` }} />
          <div className="q-slider__thumb q-slider__thumb--v absolute text-secondary" style={{ bottom: `${pct}%` }}>
            <svg viewBox="0 0 20 20" aria-hidden="true" className="q-slider__thumb-shape absolute-full">
              <path d="M 4, 10 a 6,6 0 1,0 12,0 a 6,6 0 1,0 -12,0" fill="currentColor" />
            </svg>
            <div className={`q-slider__label ${interacting ? 'q-slider__label--visible' : ''}`}>
              <span>{value}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function OperateColumn({
  icon,
  value,
  label,
  onOperate,
  onDuration,
  durationLabel,
  disabled,
  variant = 'shock',
}: {
  icon: React.ReactNode;
  value: number;
  label: string;
  onOperate: () => void;
  onDuration: () => void;
  durationLabel: string;
  disabled?: boolean;
  variant?: 'shock' | 'vibrate';
}) {
  const stdBtn = variant === 'shock' ? 'q-btn--standard bg-secondary text-dark' : 'q-btn--standard bg-secondary text-dark';
  return (
    <div className="column justify-between items-center q-ml-xs q-mr-xs">
      <div className="flex column q-gutter-sm">
        <div className="flex column" style={{ borderRadius: 3 }}>
          <button type="button" className={`q-btn q-btn--rectangle ${stdBtn}`} style={{ borderBottomLeftRadius: 0, borderBottomRightRadius: 0 }} disabled={disabled} onClick={onOperate}>
            <span className="q-btn__wrapper"><span className="q-btn__content column">{icon}<span className="block">{value}</span></span></span>
          </button>
          <div className="q-chip bg-dark text-secondary border-color-secondary q-chip--dense q-chip--square">
            <div className="q-chip__content"><div className="full-width text-center text-caption"><span>{label}</span></div></div>
          </div>
        </div>
        <div className="flex column">
          <button type="button" className="q-btn q-btn--outline q-btn--rectangle text-secondary" style={{ borderBottomLeftRadius: 0, borderBottomRightRadius: 0 }} disabled={disabled} onClick={onDuration}>
            <span className="q-btn__wrapper"><span className="q-btn__content column"><MdiClock /><span className="block">{durationLabel}</span></span></span>
          </button>
          <div className="q-chip bg-secondary text-dark border-color-secondary q-chip--dense q-chip--square">
            <div className="q-chip__content"><div className="full-width text-center text-caption"><span>Duration</span></div></div>
          </div>
        </div>
      </div>
    </div>
  );
}

export interface PiShockAppProps {
  selectedUser: any;
  onSelectUser: (user: any) => void;
  participants: any[];
  userPiShockStatus: Record<string, any>;
  onConnectionChange: (connected: boolean) => void;
  isConnected: boolean;
  addNotification: NotifyFn;
  instanceId: string;
  auth: any;
  currentUser: any;
  discordSdk: DiscordSDK;
  isEmbedded: boolean;
  multishockMode: boolean;
  onMultishockModeChange: (enabled: boolean) => void;
  hasControllerPlus: boolean;
  hasOverlimitConsumable: boolean;
  overlimitConsumableCount: number;
  onOpenShop: () => void;
  onRefreshEntitlements: () => void;
  multishockSelections: Record<string, string[]>;
  onUpdateMultishockSelection: (targetUserId: string, shockerIds: string[]) => void;
  authFetch?: typeof fetch;
  showActivityLog: boolean;
  onToggleActivityLog: () => void;
  isAdminUser: boolean;
  onOpenAdmin: () => void;
  onNavigateTerms: () => void;
  onNavigatePrivacy: () => void;
  togglingEmergencyStop: boolean;
  ownCommandsPaused: boolean;
  toggleEmergencyStop: () => void;
}

export function PiShockApp(props: PiShockAppProps) {
  const {
    selectedUser, onSelectUser, participants, userPiShockStatus,
    onConnectionChange, isConnected, addNotification, instanceId, auth, currentUser,
    discordSdk, isEmbedded, multishockMode, onMultishockModeChange,
    hasControllerPlus, hasOverlimitConsumable, overlimitConsumableCount,
    onOpenShop, onRefreshEntitlements, multishockSelections, onUpdateMultishockSelection,
    authFetch, showActivityLog, onToggleActivityLog, isAdminUser, onOpenAdmin,
    onNavigateTerms, onNavigatePrivacy, togglingEmergencyStop, ownCommandsPaused, toggleEmergencyStop,
  } = props;

  const [menuOpen, setMenuOpen] = useState(false);
  const [fabOpen, setFabOpen] = useState(false);
  const [pishocksExpanded, setPishocksExpanded] = useState(true);

  const ctrl = usePiShockControl({
    selectedUser, onConnectionChange, isConnected, addNotification, instanceId, auth, currentUser,
    isEmbedded, multishockMode, hasControllerPlus, hasOverlimitConsumable,
    multishockSelections, onUpdateMultishockSelection, onRefreshEntitlements, authFetch,
  });

  const accountName = selectedUser
    ? ctrl.getDisplayName(selectedUser)
    : currentUser
      ? ctrl.getDisplayName(currentUser)
      : 'PiShock';

  const shockerName =
    ctrl.selectedUserStatus?.selectedShockerName ||
    ctrl.selectedUserStatus?.selectedShockerId ||
    'Shocker';

  const pingWaiting = selectedUser ? !ctrl.targetConnected : false;
  const statusText = ctrl.selectedUserCommandsPaused
    ? 'Commands paused'
    : pingWaiting
      ? 'Waiting on ping...'
      : null;

  const cycleVibrateDuration = useCallback(() => {
    const idx = VIBRATE_DURATIONS.findIndex((d) => Math.abs(d - ctrl.vibrateDuration) < 0.05);
    const next = VIBRATE_DURATIONS[(idx + 1) % VIBRATE_DURATIONS.length];
    ctrl.setVibrateDuration(Math.min(next, ctrl.sliderMaxDuration));
  }, [ctrl]);

  const bump = (setter: (v: number) => void, current: number, delta: number, max: number) => {
    setter(Math.max(0, Math.min(max, current + delta)));
  };

  const randomIntensity = (setter: (v: number) => void, max: number) => {
    setter(Math.floor(Math.random() * (max + 1)));
  };

  const getParticipantDisplayName = (p: any) =>
    p?.guildDisplayName || p?.displayName || p?.global_name || p?.username || 'User';

  const selectableParticipants = participants.filter((p) => p.id !== currentUser?.id);

  return (
    <div className="bg-dark q-layout q-layout--standard" style={{ minHeight: '100vh', '--q-color-secondary': '#79C6DB' } as React.CSSProperties}>
      {/* Bypass modal */}
      {ctrl.embeddedBypassModalOpen && (
        <div className="q-menu-overlay" style={{ justifyContent: 'center', alignItems: 'center', padding: 16 }}>
          <div className="q-menu-panel" style={{ maxWidth: 400 }}>
            <p className="text-secondary text-h6 q-ma-md" style={{ margin: '0 0 12px' }}>Bypass warning</p>
            <p className="text-grey-3 text-caption" style={{ margin: '0 0 16px' }}>
              Target may disable bypass; delivery is not guaranteed; consumable purchases go to the developer.
            </p>
            <div className="row justify-end q-gutter-sm">
              <button type="button" className="q-btn q-btn--outline text-secondary q-btn--rectangle" onClick={() => void ctrl.resolveBypassModal(false)}>Cancel</button>
              <button type="button" className="q-btn q-btn--standard bg-secondary text-dark q-btn--rectangle" onClick={() => void ctrl.resolveBypassModal(true)}>I understand</button>
            </div>
          </div>
        </div>
      )}

      <PiShockSettingsModal
        isOpen={ctrl.showSettings}
        onClose={() => ctrl.setShowSettings(false)}
        currentUser={currentUser}
        auth={auth}
        discordSdk={discordSdk}
        isEmbedded={isEmbedded}
        onSettingsSaved={ctrl.handleSettingsSaved}
        participants={participants}
        authFetch={authFetch}
      />

      {/* Header */}
      <header className="q-header custom-header fixed-top">
        <div role="toolbar" className="q-toolbar bg-secondary row justify-between">
          <div className="text-dark text-h3 q-toolbar__title">
            <span className="text-grey-3 pishock-brand-title">PiShock</span>
          </div>
          <button
            type="button"
            className="q-btn q-btn--outline q-btn--rectangle text-dark q-mx-sm"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((open) => !open)}
          >
            <span className="q-btn__wrapper"><span className="q-btn__content"><span className="block">Menu</span></span></span>
          </button>
        </div>
      </header>

      {menuOpen && (
        <>
          <div className="q-menu-backdrop" onClick={() => setMenuOpen(false)} aria-hidden />
          <div className="q-menu-dropdown" role="menu">
            <button type="button" className="q-menu-dropdown__item" onClick={() => { onOpenShop(); setMenuOpen(false); }}>
              <MdiCart size={16} />
              <span>Shop ({overlimitConsumableCount})</span>
            </button>
            <button type="button" className="q-menu-dropdown__item" onClick={() => { onMultishockModeChange(!multishockMode); setMenuOpen(false); }}>
              <MdiFlash size={16} />
              <span>Multishock {multishockMode && hasControllerPlus ? 'ON' : 'OFF'}</span>
            </button>
            <button type="button" className="q-menu-dropdown__item" onClick={() => onToggleActivityLog()}>
              <MdiHistory size={16} />
              <span>Activity Log {showActivityLog ? 'ON' : 'OFF'}</span>
            </button>
            {auth?.user?.id && (
              <button
                type="button"
                className="q-menu-dropdown__item"
                disabled={togglingEmergencyStop}
                onClick={toggleEmergencyStop}
              >
                <MdiAlertOctagon size={16} />
                <span>{togglingEmergencyStop ? '…' : ownCommandsPaused ? 'E-Stop ON' : 'E-Stop OFF'}</span>
              </button>
            )}
            {isAdminUser && (
              <button type="button" className="q-menu-dropdown__item" onClick={() => { onOpenAdmin(); setMenuOpen(false); }}>
                <MdiShieldAccount size={16} />
                <span>Admin</span>
              </button>
            )}
            <button type="button" className="q-menu-dropdown__item q-menu-dropdown__item--muted" onClick={() => { onNavigateTerms(); setMenuOpen(false); }}>
              <MdiFileDocument size={16} />
              <span>Terms</span>
            </button>
            <button type="button" className="q-menu-dropdown__item q-menu-dropdown__item--muted" onClick={() => { onNavigatePrivacy(); setMenuOpen(false); }}>
              <MdiShieldLock size={16} />
              <span>Privacy</span>
            </button>
            {showActivityLog && (
              <div className="q-menu-dropdown__log">
                <ActivityLog instanceId={instanceId} auth={auth} addNotification={addNotification} authFetch={authFetch} />
              </div>
            )}
          </div>
        </>
      )}

      <div className="q-page-container">
        <main className="q-page flex column items-center justify-start">
          <div className="full-width bg-dark">
            <div className="text-h4 flex q-pa-sm full-width">
              <div className="full-width">
                {/* Account row */}
                <div className="column">
                  <div className="row justify-between">
                    <div className="column">
                      <span className="text-secondary">{accountName}</span>
                      <div className="flex row q-gutter-xs items-center">
                        {pingWaiting && (
                          <>
                            <button type="button" className="q-btn q-btn--outline q-btn--rectangle text-secondary q-btn--dense" style={{ fontSize: 8 }}>
                              <span className="q-btn__wrapper"><span className="q-btn__content"><MdiExclamation size={12} /></span></span>
                            </button>
                            <span className="text-negative text-overline">{statusText}</span>
                          </>
                        )}
                        {!pingWaiting && statusText && (
                          <span className="text-negative text-overline">{statusText}</span>
                        )}
                        {ctrl.canArmBypassMode && (
                          <button
                            type="button"
                            className={`q-btn q-btn--dense q-btn--rectangle ${ctrl.bypassModeEnabled ? 'q-btn--standard bg-secondary text-dark' : 'q-btn--outline text-secondary'}`}
                            style={{ fontSize: 9, marginLeft: 8 }}
                            onClick={() => ctrl.setBypassModeEnabled(!ctrl.bypassModeEnabled)}
                          >
                            <span className="q-btn__wrapper"><span className="q-btn__content">Bypass {ctrl.bypassModeEnabled ? 'ON' : 'OFF'}</span></span>
                          </button>
                        )}
                      </div>
                    </div>
                    <div>
                      <button type="button" className="q-btn q-btn--flat q-btn--rectangle text-secondary q-btn--dense q-btn--placeholder" disabled title="PiShock account feature — not available in this activity">
                        <span className="q-btn__wrapper"><span className="q-btn__content"><MdiShareVariant className="on-left" /><span className="block">Share</span></span></span>
                      </button>
                      <button type="button" className="q-btn q-btn--flat q-btn--rectangle text-secondary q-btn--placeholder" disabled title="PiShock account feature — not available in this activity">
                        <span className="q-btn__wrapper"><span className="q-btn__content"><MdiDotsVertical /></span></span>
                      </button>
                    </div>
                  </div>
                </div>

                {/* Shocker card + controller */}
                <div className="q-my-sm q-gutter-sm full-width">
                  <div className="full-width flex column controller-scale q-ma-xl">
                    {/* Shocker name card */}
                    <div className="full-width flex row justify-center q-px-md">
                      <div className="q-my-sm q-card q-card--dark q-card--flat no-shadow col-sm-9 col-xs-12 full-width">
                        <div className="full-width no-padding q-card__section q-card__section--vert">
                          <div className="flex row justify-between items-center no-wrap">
                            <span className="text-h6 q-ml-sm">{shockerName}</span>
                            <div className="flex row justify-center items-center">
                              <button type="button" className="q-btn q-btn--flat q-btn--rectangle text-secondary q-btn--dense q-btn--placeholder" disabled title="PiShock account feature — not available in this activity">
                                <span className="q-btn__wrapper"><span className="q-btn__content"><MdiShareVariant className="on-left" /><span className="block">Share</span></span></span>
                              </button>
                              <button type="button" className="q-btn q-btn--flat q-btn--rectangle text-secondary q-btn--dense q-btn--placeholder" disabled title="PiShock account feature — not available in this activity">
                                <span className="q-btn__wrapper"><span className="q-btn__content"><MdiHumanGreetingProximity className="on-left" /><span className="block">Pair</span></span></span>
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* SHOCK | center | VIBRATE */}
                    <div className="controller-row">
                      {/* SHOCK */}
                      <div className="col-shock justify-end">
                        <div className="border-color-secondary q-card q-card--dark q-card--bordered">
                          <div className="q-item__label text-center bg-dark text-secondary border-color-secondary q-item__label--overline">SHOCK</div>
                          <div className="q-card__section q-card__section--horiz row no-wrap">
                            <div className="column justify-between items-center q-ml-xs">
                              <OperateColumn
                                icon={<MdiFlash />}
                                value={ctrl.intensity}
                                label="Operate"
                                durationLabel={String(ctrl.duration)}
                                disabled={ctrl.controlsDisabled || !ctrl.capabilities.canShock || ctrl.isExecuting}
                                onOperate={() => void ctrl.executeCommand(0)}
                                onDuration={ctrl.cycleShockDuration}
                              />
                              <div className="q-mt-sm q-mb-xs flex column items-center">
                                <button type="button" className="q-btn q-btn--push q-btn--round text-accent q-btn--placeholder" disabled title="PiShock account feature — not available in this activity">
                                  <span className="q-btn__wrapper"><span className="q-btn__content column"><MdiCarBrakeAlert /><span className="block">None</span></span></span>
                                </button>
                                <div className="q-chip bg-secondary text-dark q-chip--dense q-chip--square">
                                  <div className="q-chip__content"><div className="full-width text-center text-caption"><span>Warning</span></div></div>
                                </div>
                              </div>
                            </div>
                            <div className="q-card__section q-card__section--vert" style={{ padding: '0 5px', marginLeft: 5, position: 'relative' }}>
                              <div className="flex column items-center q-gutter-sm justify-between">
                                <VerticalSlider
                                  value={ctrl.intensity}
                                  max={ctrl.sliderMaxIntensity}
                                  disabled={ctrl.controlsDisabled || !ctrl.capabilities.canShock}
                                  onChange={ctrl.setIntensity}
                                  ariaLabel="Shock intensity"
                                />
                                <MdiSpeedometer />
                                <div className="slider-side-btns left">
                                  <button type="button" className="q-btn q-btn--outline q-btn--rectangle text-secondary q-btn--dense bg-dark" style={{ fontSize: 8 }} disabled={ctrl.controlsDisabled} onClick={() => bump(ctrl.setIntensity, ctrl.intensity, 10, ctrl.sliderMaxIntensity)}>
                                    <span className="q-btn__wrapper"><span className="q-btn__content"><MdiChevronDoubleUp /></span></span>
                                  </button>
                                  <button type="button" className="q-btn q-btn--outline q-btn--rectangle text-secondary q-btn--dense bg-dark" style={{ fontSize: 8 }} disabled={ctrl.controlsDisabled} onClick={() => randomIntensity(ctrl.setIntensity, ctrl.sliderMaxIntensity)}>
                                    <span className="q-btn__wrapper"><span className="q-btn__content"><MdiDice3 /></span></span>
                                  </button>
                                  <button type="button" className="q-btn q-btn--outline q-btn--rectangle text-secondary q-btn--dense bg-dark" style={{ fontSize: 8 }} disabled={ctrl.controlsDisabled} onClick={() => bump(ctrl.setIntensity, ctrl.intensity, -10, ctrl.sliderMaxIntensity)}>
                                    <span className="q-btn__wrapper"><span className="q-btn__content"><MdiChevronDoubleDown /></span></span>
                                  </button>
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Center column */}
                      <div className="col-center">
                        <div className="flex column">
                          <button type="button" className="q-btn q-btn--outline q-btn--rectangle text-secondary q-btn--dense q-btn--placeholder" style={{ borderBottomLeftRadius: 0, borderBottomRightRadius: 0 }} disabled title="PiShock account feature — not available in this activity">
                            <span className="q-btn__wrapper"><span className="q-btn__content column"><MdiCursorPointer /><div className="text-caption" style={{ fontSize: 9 }}>Tap</div></span></span>
                          </button>
                          <div className="q-chip bg-secondary text-dark border-color-secondary q-chip--dense q-chip--square">
                            <div className="q-chip__content"><div className="full-width text-center text-caption"><span>Use Mode</span></div></div>
                          </div>
                        </div>
                        <div className="flex column">
                          <button
                            type="button"
                            className={`q-btn q-btn--standard q-btn--rectangle ${ownCommandsPaused ? 'bg-negative text-dark estop-active' : 'bg-secondary text-negative'}`}
                            style={{ borderBottomLeftRadius: 0, borderBottomRightRadius: 0 }}
                            disabled={togglingEmergencyStop}
                            title="Emergency stop: pauses all incoming commands to YOUR device"
                            onClick={toggleEmergencyStop}
                          >
                            <span className="q-btn__wrapper" style={{ padding: 16 }}><span className="q-btn__content"><MdiAlertOctagon /></span></span>
                          </button>
                          <div className={`q-chip q-chip--dense q-chip--square ${ownCommandsPaused ? 'bg-negative text-dark border-color-negative' : 'bg-dark text-secondary border-color-secondary'}`}>
                            <div className="q-chip__content"><div className="full-width text-center text-caption"><span>{ownCommandsPaused ? 'E-STOP ON' : 'STOP'}</span></div></div>
                          </div>
                        </div>
                        <div className="flex column">
                          <button type="button" className="q-btn q-btn--standard q-btn--rectangle bg-secondary text-dark" style={{ borderBottomLeftRadius: 0, borderBottomRightRadius: 0 }} disabled={ctrl.controlsDisabled || !ctrl.capabilities.canBeep || ctrl.isExecuting} onClick={() => void ctrl.executeCommand(2)}>
                            <span className="q-btn__wrapper" style={{ padding: 8 }}><span className="q-btn__content"><MdiBellAlert /></span></span>
                          </button>
                          <div className="q-chip bg-dark text-secondary border-color-secondary q-chip--dense q-chip--square">
                            <div className="q-chip__content"><div className="full-width text-center text-caption"><span>Beep</span></div></div>
                          </div>
                        </div>
                        <div className="flex column">
                          <button type="button" className="q-btn q-btn--flat q-btn--rectangle text-secondary" style={{ fontSize: 10 }} onClick={() => ctrl.setShowSettings(true)}>
                            <span className="q-btn__wrapper" style={{ padding: 8 }}><span className="q-btn__content column"><MdiCogs /></span></span>
                          </button>
                          <div className="q-chip bg-dark text-secondary border-color-secondary q-chip--dense" style={{ fontSize: 10, border: '1px solid' }}>
                            <div className="q-chip__content"><div className="full-width text-center text-caption"><span>SO</span></div></div>
                          </div>
                        </div>
                      </div>

                      {/* VIBRATE */}
                      <div className="col-vibrate justify-start">
                        <div className="border-color-secondary q-card q-card--dark q-card--bordered">
                          <div className="q-item__label text-center bg-dark text-secondary q-item__label--overline">VIBRATE</div>
                          <div className="q-card__section q-card__section--horiz row no-wrap">
                            <div className="q-card__section q-card__section--vert" style={{ padding: '0 5px', marginRight: 5, position: 'relative' }}>
                              <div className="flex column items-center q-gutter-sm justify-between">
                                <VerticalSlider
                                  value={ctrl.vibrateIntensity}
                                  max={ctrl.sliderMaxIntensity}
                                  disabled={ctrl.controlsDisabled || !ctrl.capabilities.canVibrate}
                                  onChange={ctrl.setVibrateIntensity}
                                  ariaLabel="Vibrate intensity"
                                />
                                <MdiSpeedometer />
                                <div className="slider-side-btns right">
                                  <button type="button" className="q-btn q-btn--outline q-btn--rectangle text-secondary q-btn--dense bg-dark" style={{ fontSize: 8 }} disabled={ctrl.controlsDisabled} onClick={() => bump(ctrl.setVibrateIntensity, ctrl.vibrateIntensity, 10, ctrl.sliderMaxIntensity)}>
                                    <span className="q-btn__wrapper"><span className="q-btn__content"><MdiChevronDoubleUp /></span></span>
                                  </button>
                                  <button type="button" className="q-btn q-btn--outline q-btn--rectangle text-secondary q-btn--dense bg-dark" style={{ fontSize: 8 }} disabled={ctrl.controlsDisabled} onClick={() => bump(ctrl.setVibrateIntensity, ctrl.vibrateIntensity, -10, ctrl.sliderMaxIntensity)}>
                                    <span className="q-btn__wrapper"><span className="q-btn__content"><MdiChevronDoubleDown /></span></span>
                                  </button>
                                </div>
                              </div>
                            </div>
                            <OperateColumn
                              icon={<MdiVibrate />}
                              value={ctrl.vibrateIntensity}
                              label="Operate"
                              durationLabel={String(ctrl.vibrateDuration)}
                              variant="vibrate"
                              disabled={ctrl.controlsDisabled || !ctrl.capabilities.canVibrate || ctrl.isExecuting}
                              onOperate={() => void ctrl.executeCommand(1)}
                              onDuration={cycleVibrateDuration}
                            />
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
          <div style={{ minHeight: 90 }} />
        </main>
      </div>

      {/* FAB — PISHOCKS list (Discord participants) */}
      <div className="q-page-sticky fixed-bottom-left">
        <div className={`q-fab q-fab--form-rounded ${fabOpen ? 'q-fab--opened' : ''}`}>
          <button
            type="button"
            className="q-btn q-btn--outline q-btn--rounded text-secondary q-btn--fab"
            aria-expanded={fabOpen}
            onClick={() => setFabOpen(!fabOpen)}
          >
            <span className="q-btn__wrapper">
              <span className="q-btn__content">
                {fabOpen ? <MdiClose size={24} /> : <MdiMenu size={24} />}
              </span>
            </span>
          </button>
          {fabOpen && (
            <div className="q-fab__actions q-fab__actions--up q-fab__actions--opened">
              <div className="flex column q-ma-sm" style={{ minWidth: 160 }}>
                <button type="button" className="q-fab-action-btn q-btn q-btn--outline q-btn--rounded text-secondary bg-dark q-btn--placeholder" disabled title="PiShock account feature — not available in this activity">
                  <span className="q-btn__wrapper"><span className="q-btn__content row justify-between full-width"><MdiPlus /><div>Claim</div></span></span>
                </button>
                <button type="button" className="q-fab-action-btn q-btn q-btn--outline q-btn--rounded text-grey-3 bg-dark q-btn--placeholder" disabled title="PiShock account feature — not available in this activity">
                  <span className="q-btn__wrapper"><span className="q-btn__content row justify-between full-width"><MdiShareVariant /><div>Friends</div></span></span>
                </button>
                <div className="q-expansion-item">
                  <button type="button" className="q-item" onClick={() => setPishocksExpanded(!pishocksExpanded)}>
                    <span className="text-secondary" style={{ marginRight: 8 }}>{pishocksExpanded ? '▾' : '▸'}</span>
                    <span className="q-item__label">PISHOCKS</span>
                  </button>
                  {pishocksExpanded && (
                    <div className="q-expansion-content">
                      {selectableParticipants.length === 0 ? (
                        <p className="text-grey-3 text-caption" style={{ padding: '4px 8px' }}>No other participants</p>
                      ) : (
                        selectableParticipants.map((p) => {
                          const status = userPiShockStatus[p.id];
                          const connected = status?.isConnected;
                          const isSelected = selectedUser?.id === p.id;
                          const avatarUrl =
                            p.avatarUrl ||
                            (p.avatar
                              ? `https://cdn.discordapp.com/avatars/${p.id}/${p.avatar}.png?size=64`
                              : 'https://cdn.discordapp.com/embed/avatars/0.png');
                          return (
                            <button
                              key={p.id}
                              type="button"
                              className={`pishock-list-btn q-btn q-btn--outline q-btn--rounded bg-dark ${isSelected ? 'active text-secondary' : connected ? 'text-secondary' : 'text-grey-3'}`}
                              onClick={() => { onSelectUser(p); setFabOpen(false); }}
                            >
                              <span className="q-btn__wrapper">
                                <span className="q-btn__content pishock-list-btn__row">
                                  <img src={avatarUrl} alt="" className="pishock-list-btn__avatar" />
                                  <span className="pishock-list-btn__name">{getParticipantDisplayName(p)}</span>
                                  <span
                                    className={`pishock-status-dot ${connected ? 'pishock-status-dot--connected' : 'pishock-status-dot--disconnected'}`}
                                    aria-label={connected ? 'Connected' : 'Not connected'}
                                  />
                                </span>
                              </span>
                            </button>
                          );
                        })
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
