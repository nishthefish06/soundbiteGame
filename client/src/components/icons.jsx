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

export function TelephoneIcon(props) {
  return (
    <svg viewBox="0 0 24 24" width="1em" height="1em" {...props}>
      <path
        d="M5 4c1 0 2 .3 2 1.3 0 1-.5 1.5-.5 2.3 0 1.5 2 3.5 3.5 5s3.5 3.5 5 3.5c.8 0 1.3-.5 2.3-.5 1 0 1.3 1 1.3 2 0 1.5-1 2.4-2.5 2.4C11 20 4 13 4 6.5 4 5 4.9 4 5 4z"
        fill="currentColor"
      />
    </svg>
  );
}

export function UnderwaterIcon(props) {
  return (
    <svg viewBox="0 0 24 24" width="1em" height="1em" {...props}>
      <path d="M2 8c2 0 2-2 4-2s2 2 4 2 2-2 4-2 2 2 4 2 2-2 4-2" {...stroke} />
      <path d="M2 13c2 0 2-2 4-2s2 2 4 2 2-2 4-2 2 2 4 2 2-2 4-2" {...stroke} />
      <path d="M2 18c2 0 2-2 4-2s2 2 4 2 2-2 4-2 2 2 4 2 2-2 4-2" {...stroke} />
    </svg>
  );
}

export function DistortIcon(props) {
  return (
    <svg viewBox="0 0 24 24" width="1em" height="1em" {...props}>
      <path d="M2 12h3l1.5-7 3 15 2.5-11 1.5 3h8.5" {...stroke} />
    </svg>
  );
}

export function AlienIcon(props) {
  return (
    <svg viewBox="0 0 24 24" width="1em" height="1em" {...props}>
      <path d="M12 2.5c-4 0-6.5 4-6.5 8.5 0 5 3 10.5 6.5 10.5s6.5-5.5 6.5-10.5c0-4.5-2.5-8.5-6.5-8.5z" {...stroke} />
      <ellipse cx="9" cy="11" rx="1.4" ry="2.1" fill="currentColor" />
      <ellipse cx="15" cy="11" rx="1.4" ry="2.1" fill="currentColor" />
    </svg>
  );
}

export function WhisperIcon(props) {
  return (
    <svg viewBox="0 0 24 24" width="1em" height="1em" {...props}>
      <path d="M4 15v-4a8 8 0 0 1 16 0v4" {...stroke} />
      <path d="M4 15a2 2 0 0 0 4 0v-2a2 2 0 0 0-4 0z" {...stroke} />
      <path d="M16 15a2 2 0 0 0 4 0v-2a2 2 0 0 0-4 0z" {...stroke} />
      <path d="M9 20c1 1 5 1 6 0" strokeDasharray="1.5 2" {...stroke} />
    </svg>
  );
}

export function RadioIcon(props) {
  return (
    <svg viewBox="0 0 24 24" width="1em" height="1em" {...props}>
      <path d="M9 3.5l1.5 3" {...stroke} />
      <rect x="6" y="6.5" width="9" height="15" rx="2" {...stroke} />
      <line x1="10.5" y1="10.5" x2="10.5" y2="10.5" strokeWidth="2.4" strokeLinecap="round" stroke="currentColor" />
      <path d="M8.5 14h4M8.5 17h4" {...stroke} />
    </svg>
  );
}

export function WhoSaidItIcon(props) {
  return (
    <svg viewBox="0 0 24 24" width="1em" height="1em" {...props}>
      <circle cx="6.5" cy="9" r="3.5" {...stroke} />
      <circle cx="17.5" cy="9" r="3.5" {...stroke} />
      <path d="M9.5 10.5L14.5 10.5" {...stroke} />
      <path d="M12 19l-2-3h-1a3 3 0 0 1-3-3M12 19l2-3h1a3 3 0 0 0 3-3" {...stroke} />
    </svg>
  );
}

export function CustomIcon(props) {
  return (
    <svg viewBox="0 0 24 24" width="1em" height="1em" {...props}>
      <path d="M4 20l1-4.5L15.5 5 19 8.5 8.5 19 4 20z" {...stroke} />
      <path d="M14 6.5l3.5 3.5" {...stroke} />
    </svg>
  );
}

export function SongRecreationIcon(props) {
  return (
    <svg viewBox="0 0 24 24" width="1em" height="1em" {...props}>
      <path d="M9 17V4.5l10-2v12.5" {...stroke} />
      <circle cx="6.5" cy="17" r="2.5" {...stroke} />
      <circle cx="16.5" cy="14.5" r="2.5" {...stroke} />
    </svg>
  );
}

export function CopyIcon(props) {
  return (
    <svg viewBox="0 0 24 24" width="1em" height="1em" {...props}>
      <rect x="8" y="8" width="12" height="12" rx="2" {...stroke} />
      <path d="M5 16V6a2 2 0 0 1 2-2h10" {...stroke} />
    </svg>
  );
}

export function StarIcon(props) {
  return (
    <svg viewBox="0 0 24 24" width="1em" height="1em" {...props}>
      <path d="M12 2.5l2.9 6.4 6.9.7-5.2 4.8 1.5 6.9L12 17.8l-6.1 3.5 1.5-6.9-5.2-4.8 6.9-.7z" fill="currentColor" />
    </svg>
  );
}

export function CheckIcon(props) {
  return (
    <svg viewBox="0 0 24 24" width="1em" height="1em" {...props}>
      <path d="M5 13l4 4 10-10" {...stroke} />
    </svg>
  );
}

export const MODE_ICONS = {
  SOUND_EFFECT: SoundEffectIcon,
  CHARACTER: CharacterIcon,
  CUSTOM: CustomIcon,
  TELEPHONE: TelephoneIcon,
  PERFORMANCE: StarIcon,
  WHO_SAID_IT: WhoSaidItIcon,
  SONG_RECREATION: SongRecreationIcon,
};

export const MODIFIER_ICONS = {
  NONE: NoEffectIcon,
  ROBOT: RobotIcon,
  DEMON: DemonIcon,
  HIGH_PITCH: HighPitchIcon,
  CHIPMUNK: ChipmunkIcon,
  ECHO: EchoIcon,
  DISTORT: DistortIcon,
  UNDERWATER: UnderwaterIcon,
  ALIEN: AlienIcon,
  WHISPER: WhisperIcon,
  RADIO: RadioIcon,
};
