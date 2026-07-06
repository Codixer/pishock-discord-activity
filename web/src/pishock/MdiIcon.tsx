/** MDI-style icons matching pishock.com control page */
import type { SVGProps } from 'react';

type IconProps = SVGProps<SVGSVGElement> & { size?: number };

function Icon({ size = 20, children, ...props }: IconProps & { children: React.ReactNode }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} className="q-icon" aria-hidden {...props}>
      {children}
    </svg>
  );
}

export const MdiFlash = (p: IconProps) => (
  <Icon {...p}><path fill="currentColor" d="M7,2V13H10V22L17,10H13L17,2H7Z" /></Icon>
);
export const MdiVibrate = (p: IconProps) => (
  <Icon {...p}><path fill="currentColor" d="M3,9V15H5L8,22H10V2H8L5,9H3M16,9A3,3 0 0,0 13,12A3,3 0 0,0 16,15A3,3 0 0,0 19,12A3,3 0 0,0 16,9M16,17A5,5 0 0,1 11,12A5,5 0 0,1 16,7A5,5 0 0,1 21,12A5,5 0 0,1 16,17Z" /></Icon>
);
export const MdiClock = (p: IconProps) => (
  <Icon {...p}><path fill="currentColor" d="M12,2A10,10 0 0,0 2,12A10,10 0 0,0 12,22A10,10 0 0,0 22,12A10,10 0 0,0 12,2M16.2,16.2L11,13V7H12.5V12.2L17,14.9L16.2,16.2Z" /></Icon>
);
export const MdiSpeedometer = (p: IconProps) => (
  <Icon {...p} size={p.size ?? 24}><path fill="currentColor" d="M12,2A10,10 0 0,0 2,12A10,10 0 0,0 12,22A10,10 0 0,0 22,12A10,10 0 0,0 12,2M12,4A8,8 0 0,1 20,12A8,8 0 0,1 12,20A8,8 0 0,1 4,12A8,8 0 0,1 12,4M12.5,7V12.25L17,14.92L16.25,16.15L11,13V7H12.5Z" /></Icon>
);
export const MdiAlertOctagon = (p: IconProps) => (
  <Icon {...p}><path fill="currentColor" d="M8.27,3L3,8.27V15.73L8.27,21H15.73L21,15.73V8.27L15.73,3M12,17.3A1.3,1.3 0 0,1 10.7,16A1.3,1.3 0 0,1 12,14.7A1.3,1.3 0 0,1 13.3,16A1.3,1.3 0 0,1 12,17.3M12,7C13.1,7 14,7.9 14,9V13C14,14.1 13.1,15 12,15C10.9,15 10,14.1 10,13V9C10,7.9 10.9,7 12,7Z" /></Icon>
);
export const MdiBellAlert = (p: IconProps) => (
  <Icon {...p}><path fill="currentColor" d="M10,21H14A2,2 0 0,1 12,23A2,2 0 0,1 10,21M21,19V20H3V19L5,17V11C5,7.9 7.03,5.17 10,4.29C10,4.19 10,4.1 10,4A2,2 0 0,1 12,2A2,2 0 0,1 14,4C14,4.1 14,4.19 14,4.29C16.97,5.17 19,7.9 19,11V17L21,19M19,11C19,8.53 17.39,6.44 15,5.68V7A2,2 0 0,1 13,9H11A2,2 0 0,1 9,7V5.68C6.61,6.44 5,8.53 5,11V17.14L4,18.14V18H20V18.14L19,17.14V11Z" /></Icon>
);
export const MdiCogs = (p: IconProps) => (
  <Icon {...p}><path fill="currentColor" d="M15.9,13.43C15.54,13.43 15.22,13.5 14.93,13.62L13.5,12.19C13.78,11.5 13.78,10.72 13.5,10.03L14.93,8.6C15.22,8.72 15.54,8.79 15.9,8.79C17.04,8.79 18,7.83 18,6.69C18,5.55 17.04,4.59 15.9,4.59C14.76,4.59 13.8,5.55 13.8,6.69C13.8,7.05 13.87,7.37 13.99,7.66L12.56,9.09C11.87,8.81 11.09,8.81 10.4,9.09L8.97,7.66C9.09,7.37 9.16,7.05 9.16,6.69C9.16,5.55 8.2,4.59 7.06,4.59C5.92,4.59 4.96,5.55 4.96,6.69C4.96,7.83 5.92,8.79 7.06,8.79C7.42,8.79 7.74,8.72 8.03,8.6L9.46,10.03C9.18,10.72 9.18,11.5 9.46,12.19L8.03,13.62C7.74,13.5 7.42,13.43 7.06,13.43C5.92,13.43 4.96,14.39 4.96,15.53C4.96,16.67 5.92,17.63 7.06,17.63C8.2,17.63 9.16,16.67 9.16,15.53C9.16,15.17 9.09,14.85 8.97,14.56L10.4,13.13C11.09,13.41 11.87,13.41 12.56,13.13L13.99,14.56C13.87,14.85 13.8,15.17 13.8,15.53C13.8,16.67 14.76,17.63 15.9,17.63C17.04,17.63 18,16.67 18,15.53C18,14.39 17.04,13.43 15.9,13.43Z" /></Icon>
);
export const MdiCursorPointer = (p: IconProps) => (
  <Icon {...p}><path fill="currentColor" d="M13.64,21.97C13.14,22.21 12.54,22 12.17,21.59L8.82,17.76L6.8,18.26L5.12,12.81L10.75,11.75L15.75,16.75L13.64,21.97M14.34,7.34L11.5,4.5L5.41,10.59L7.05,16.05L11.5,11.59L14.34,14.43L19.59,9.17L14.34,7.34Z" /></Icon>
);
export const MdiShareVariant = (p: IconProps) => (
  <Icon {...p}><path fill="currentColor" d="M18,16.08C17.24,16.08 16.56,16.38 16.04,16.85L8.91,12.7C8.96,12.47 9,12.24 9,12C9,11.76 8.96,11.53 8.91,11.3L15.96,7.19C16.5,7.69 17.21,8 18,8A3,3 0 0,0 21,5A3,3 0 0,0 18,2A3,3 0 0,0 15,5C15,5.24 15.04,5.47 15.09,5.7L8.04,9.81C7.5,9.31 6.79,9 6,9A3,3 0 0,0 3,12A3,3 0 0,0 6,15C6.79,15 7.5,14.69 8.04,14.19L15.16,18.34C15.11,18.55 15.08,18.77 15.08,19C15.08,20.61 16.39,21.91 18,21.91C19.61,21.91 20.92,20.61 20.92,19C20.92,17.39 19.61,16.08 18,16.08Z" /></Icon>
);
export const MdiDotsVertical = (p: IconProps) => (
  <Icon {...p}><path fill="currentColor" d="M12,16A2,2 0 0,1 14,18A2,2 0 0,1 12,20A2,2 0 0,1 10,18A2,2 0 0,1 12,16M12,10A2,2 0 0,1 14,12A2,2 0 0,1 12,14A2,2 0 0,1 10,12A2,2 0 0,1 12,10M12,4A2,2 0 0,1 14,6A2,2 0 0,1 12,8A2,2 0 0,1 10,6A2,2 0 0,1 12,4Z" /></Icon>
);
export const MdiExclamation = (p: IconProps) => (
  <Icon {...p} size={p.size ?? 14}><path fill="currentColor" d="M12,2L1,21H23M12,6L19.53,19H4.47M11,10V14H13V10M11,16V18H13V16" /></Icon>
);
export const MdiHumanGreetingProximity = (p: IconProps) => (
  <Icon {...p}><path fill="currentColor" d="M12,4A4,4 0 0,1 16,8A4,4 0 0,1 12,12A4,4 0 0,1 8,8A4,4 0 0,1 12,4M12,14C16.42,14 20,15.79 20,18V20H4V18C4,15.79 7.58,14 12,14M12,2A6,6 0 0,0 6,8A6,6 0 0,0 12,14A6,6 0 0,0 18,8A6,6 0 0,0 12,2Z" /></Icon>
);
export const MdiCarBrakeAlert = (p: IconProps) => (
  <Icon {...p}><path fill="currentColor" d="M12,2C6.48,2 2,6.48 2,12C2,17.52 6.48,22 12,22C17.52,22 22,17.52 22,12C22,6.48 17.52,2 12,2M13,17H11V15H13V17M13,13H11V7H13V13Z" /></Icon>
);
export const MdiChevronDoubleUp = (p: IconProps) => (
  <Icon {...p} size={p.size ?? 14}><path fill="currentColor" d="M7.41,15.41L12,10.83L16.59,15.41L18,14L12,8L6,14L7.41,15.41M7.41,10.41L12,5.83L16.59,10.41L18,9L12,3L6,9L7.41,10.41Z" /></Icon>
);
export const MdiChevronDoubleDown = (p: IconProps) => (
  <Icon {...p} size={p.size ?? 14}><path fill="currentColor" d="M7.41,8.59L12,13.17L16.59,8.59L18,10L12,16L6,10L7.41,8.59M7.41,13.59L12,18.17L16.59,13.59L18,15L12,21L6,15L7.41,13.59Z" /></Icon>
);
export const MdiDice3 = (p: IconProps) => (
  <Icon {...p} size={p.size ?? 14}><path fill="currentColor" d="M19,3H5C3.89,3 3,3.89 3,5V19A2,2 0 0,0 5,21H19A2,2 0 0,0 21,19V5C21,3.89 20.1,3 19,3M10,10A1,1 0 0,1 11,11A1,1 0 0,1 10,12A1,1 0 0,1 9,11A1,1 0 0,1 10,10M14,14A1,1 0 0,1 15,15A1,1 0 0,1 14,16A1,1 0 0,1 13,15A1,1 0 0,1 14,14M14,10A1,1 0 0,1 15,11A1,1 0 0,1 14,12A1,1 0 0,1 13,11A1,1 0 0,1 14,10M10,14A1,1 0 0,1 11,15A1,1 0 0,1 10,16A1,1 0 0,1 9,15A1,1 0 0,1 10,14Z" /></Icon>
);
export const MdiMenu = (p: IconProps) => (
  <Icon {...p}><path fill="currentColor" d="M3,6H21V8H3V6M3,11H21V13H3V11M3,16H21V18H3V16Z" /></Icon>
);
export const MdiClose = (p: IconProps) => (
  <Icon {...p}><path fill="currentColor" d="M19,6.41L17.59,5L12,10.59L6.41,5L5,6.41L10.59,12L5,17.59L6.41,19L12,13.41L17.59,19L19,17.59L13.41,12L19,6.41Z" /></Icon>
);
export const MdiPlus = (p: IconProps) => (
  <Icon {...p}><path fill="currentColor" d="M19,13H13V19H11V13H5V11H11V5H13V11H19V13Z" /></Icon>
);
export const MdiCart = (p: IconProps) => (
  <Icon {...p}><path fill="currentColor" d="M17,18C15.89,18 15,18.89 15,20A2,2 0 0,0 17,22A2,2 0 0,0 19,20C19,18.89 18.1,18 17,18M1,2V4H3L6.6,11.59L5.24,14.04C5.09,14.32 5,14.65 5,15A2,2 0 0,0 7,17H19V15H7.42A0.25,0.25 0 0,1 7.17,14.75C7.17,14.7 7.18,14.66 7.2,14.63L8.1,13H15.55C16.3,13 16.96,12.58 17.3,11.97L20.88,5.5C20.95,5.34 21,5.17 21,5A1,1 0 0,0 20,4H5.21L4.27,2M7,18C5.89,18 5,18.89 5,20A2,2 0 0,0 7,22A2,2 0 0,0 9,20C9,18.89 8.1,18 7,18Z" /></Icon>
);
export const MdiHistory = (p: IconProps) => (
  <Icon {...p}><path fill="currentColor" d="M13.5,8H12V13L16.28,15.54L17,14.33L13.5,12.25V8M13,3A9,9 0 0,0 4,12H1L4.96,16.03L9,12H6A7,7 0 0,1 13,5A7,7 0 0,1 20,12A7,7 0 0,1 13,19C11.07,19 9.32,18.21 8.06,16.94L6.64,18.36C8.27,20 10.5,21 13,21A9,9 0 0,0 22,12A9,9 0 0,0 13,3" /></Icon>
);
export const MdiShieldAccount = (p: IconProps) => (
  <Icon {...p}><path fill="currentColor" d="M12,1L3,5V11C3,16.55 6.84,21.74 12,23C17.16,21.74 21,16.55 21,11V5L12,1M12,5A3,3 0 0,1 15,8A3,3 0 0,1 12,11A3,3 0 0,1 9,8A3,3 0 0,1 12,5M17.13,17C15.92,18.85 14.11,20.24 12,20.92C9.89,20.24 8.08,18.85 6.87,17C6.53,16.5 6.24,16 6,15.47C6,13.82 8.71,12.47 12,12.47C15.29,12.47 18,13.79 18,15.47C17.76,16 17.47,16.5 17.13,17Z" /></Icon>
);
export const MdiFileDocument = (p: IconProps) => (
  <Icon {...p}><path fill="currentColor" d="M13,9V3.5L18.5,9M6,2C4.89,2 4,2.89 4,4V20A2,2 0 0,0 6,22H18A2,2 0 0,0 20,20V8L14,2H6Z" /></Icon>
);
export const MdiShieldLock = (p: IconProps) => (
  <Icon {...p}><path fill="currentColor" d="M12,1L3,5V11C3,16.55 6.84,21.74 12,23C17.16,21.74 21,16.55 21,11V5L12,1M12,7C13.4,7 14.8,8.1 14.8,9.5V11C15.4,11 16,11.6 16,12.3V15.8C16,16.4 15.4,17 14.7,17H9.2C8.6,17 8,16.4 8,15.7V12.2C8,11.6 8.6,11 9.2,11V9.5C9.2,8.1 10.6,7 12,7M12,8.2C11.2,8.2 10.5,8.7 10.5,9.5V11H13.5V9.5C13.5,8.7 12.8,8.2 12,8.2Z" /></Icon>
);
