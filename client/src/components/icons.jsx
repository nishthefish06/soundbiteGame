const stroke = { fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round' };

export function MicIcon(props) {
  return (
    <svg viewBox="0 0 24 24" width="1em" height="1em" {...props}>
      <rect x="8" y="2" width="8" height="12" rx="4" fill="currentColor" />
      <path d="M6 11a6 6 0 0 0 12 0" {...stroke} />
      <line x1="12" y1="19" x2="12" y2="22" {...stroke} />
      <line x1="8" y1="22" x2="16" y2="22" {...stroke} />
    </svg>
  );
}

export function SoundEffectIcon(props) {
  return (
    <svg viewBox="0 0 24 24" width="1em" height="1em" {...props}>
      <path d="M3 9h4l5-4v14l-5-4H3z" fill="currentColor" />
      <path d="M15.5 9a4 4 0 0 1 0 6" {...stroke} />
      <path d="M18.5 6.5a8 8 0 0 1 0 11" {...stroke} />
    </svg>
  );
}

export function CharacterIcon(props) {
  return (
    <svg viewBox="0 0 24 24" width="1em" height="1em" {...props}>
      <path d="M12 3c-4.5 0-7 3-7 7.5S7.5 20 12 20s7-5 7-9.5S16.5 3 12 3z" {...stroke} />
      <circle cx="9" cy="11" r="1.1" fill="currentColor" />
      <circle cx="15" cy="11" r="1.1" fill="currentColor" />
      <path d="M9 15c1 1 5 1 6 0" {...stroke} />
    </svg>
  );
}

export function NoEffectIcon(props) {
  return (
    <svg viewBox="0 0 24 24" width="1em" height="1em" {...props}>
      <path d="M9 3c-3 0-5 3-5 7s2 8 6 8c2 0 3-1 3-1" {...stroke} />
      <circle cx="8" cy="9" r="1" fill="currentColor" />
      <path d="M14 8a3 3 0 0 1 0 4" {...stroke} />
      <path d="M17 6.5a6 6 0 0 1 0 7" {...stroke} />
    </svg>
  );
}

export function RobotIcon(props) {
  return (
    <svg viewBox="0 0 24 24" width="1em" height="1em" {...props}>
      <line x1="12" y1="2" x2="12" y2="5" {...stroke} />
      <circle cx="12" cy="2" r="1" fill="currentColor" />
      <rect x="5" y="5" width="14" height="12" rx="3" {...stroke} />
      <rect x="8.5" y="9" width="2" height="2.5" rx="0.5" fill="currentColor" />
      <rect x="13.5" y="9" width="2" height="2.5" rx="0.5" fill="currentColor" />
      <path d="M9 14h6" {...stroke} />
      <path d="M5 10H3M21 10h-2" {...stroke} />
    </svg>
  );
}

export function DemonIcon(props) {
  return (
    <svg viewBox="0 0 24 24" width="1em" height="1em" {...props}>
      <path d="M5 6l3 2M19 6l-3 2" {...stroke} />
      <circle cx="12" cy="12" r="7" {...stroke} />
      <path d="M8.5 10l2 1M15.5 10l-2 1" {...stroke} />
      <circle cx="9.3" cy="12.5" r="1" fill="currentColor" />
      <circle cx="14.7" cy="12.5" r="1" fill="currentColor" />
      <path d="M9 16c1.5 1.5 4.5 1.5 6 0" {...stroke} />
    </svg>
  );
}

export function HighPitchIcon(props) {
  return (
    <svg viewBox="0 0 24 24" width="1em" height="1em" {...props}>
      <ellipse cx="12" cy="9" rx="6" ry="7" fill="currentColor" />
      <path d="M12 16l-1.5 3h3z" fill="currentColor" />
      <path d="M12 19c1 1 1 2 0 3" {...stroke} />
    </svg>
  );
}

export function ChipmunkIcon(props) {
  return (
    <svg viewBox="0 0 24 24" width="1em" height="1em" {...props}>
      <circle cx="7" cy="6" r="2" {...stroke} />
      <circle cx="17" cy="6" r="2" {...stroke} />
      <circle cx="12" cy="13" r="7" {...stroke} />
      <circle cx="9.5" cy="12" r="1" fill="currentColor" />
      <circle cx="14.5" cy="12" r="1" fill="currentColor" />
      <rect x="10" y="15" width="1.8" height="3" rx="0.4" fill="currentColor" />
      <rect x="12.2" y="15" width="1.8" height="3" rx="0.4" fill="currentColor" />
    </svg>
  );
}

export function EchoIcon(props) {
  return (
    <svg viewBox="0 0 24 24" width="1em" height="1em" {...props}>
      <circle cx="6" cy="12" r="2" fill="currentColor" />
      <path d="M11 7a7 7 0 0 1 0 10" {...stroke} />
      <path d="M14.5 4a12 12 0 0 1 0 16" {...stroke} />
      <path d="M18 2a15.5 15.5 0 0 1 0 20" {...stroke} />
    </svg>
  );
}

export const MODE_ICONS = {
  SOUND_EFFECT: SoundEffectIcon,
  CHARACTER: CharacterIcon,
};

export const MODIFIER_ICONS = {
  NONE: NoEffectIcon,
  ROBOT: RobotIcon,
  DEMON: DemonIcon,
  HIGH_PITCH: HighPitchIcon,
  CHIPMUNK: ChipmunkIcon,
  ECHO: EchoIcon,
};
