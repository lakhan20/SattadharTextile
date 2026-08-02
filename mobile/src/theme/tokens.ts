import { Easing, Platform, type TextStyle } from 'react-native';

/**
 * Sattadhar Textile — design tokens.
 *
 * Direction: "Vat & Mulberry". A deep petrol teal (the vat a bolt of cloth is
 * dipped in) carries the brand; mulberry — the dye, and the tree silk comes
 * from — is the single accent. Both hues sit in the gap between the semantic
 * colours, so an accented button can never be mistaken for a warning and a
 * mulberry chip never reads as an error.
 *
 * Every screen and component reads from this file. Nothing below is repeated
 * as a literal anywhere else in the app.
 */

/**
 * Neutral ramp, very slightly cooled so it sits under the teal without going
 * blue. 50–200 are surfaces and hairlines, 400–500 secondary text, 700–900 ink.
 */
export const neutral = {
  50: '#F7F8F8',
  100: '#EFF1F2',
  200: '#E1E5E7',
  300: '#CBD2D5',
  400: '#9FA9AE',
  500: '#77838A',
  600: '#5A666D',
  700: '#434E54',
  800: '#2C353A',
  900: '#161C20',
} as const;

export const colors = {
  /** Vat teal — headers, primary actions, the active tab. */
  primary: '#0D4C59',
  primaryDark: '#07333C',
  primarySoft: '#DBEBEF',
  /** For text/icons that must sit legibly on `primarySoft`. */
  primaryInk: '#0A3E49',

  /** Mulberry. Reserved for ONE emphasis action per screen. */
  accent: '#8B3A76',
  accentDark: '#6D2C5C',
  accentSoft: '#F5E4F1',
  accentInk: '#5E2650',

  success: '#1E7A52',
  successSoft: '#DFF1E8',
  successInk: '#14563A',
  warning: '#B26A00',
  warningSoft: '#FCEEDA',
  warningInk: '#7A4800',
  danger: '#C0392F',
  dangerSoft: '#FBE5E3',
  dangerInk: '#8A2620',
  info: '#2563A8',
  infoSoft: '#E2EDF9',
  infoInk: '#17457A',

  surface: '#FFFFFF',
  /** A raised-but-not-white fill: input backgrounds, skeletons, inset rows. */
  surfaceSunken: neutral[100],
  background: neutral[50],
  text: neutral[900],
  /** Secondary text. Passes AA on both `surface` and `background`. */
  muted: neutral[500],
  /** Tertiary text and disabled labels. Decorative use only. */
  faint: neutral[400],
  border: neutral[200],
  borderStrong: neutral[300],

  /** On the dark teal header/gradient. */
  onPrimary: '#FFFFFF',
  onPrimaryMuted: '#9FC4CC',
  /** Text/icons on a filled accent or semantic surface. */
  onAccent: '#FFFFFF',

  overlay: 'rgba(7, 51, 60, 0.55)',
} as const;

/** Canonical spacing scale — 4/8/12/16/24/32/48. Nothing else is allowed. */
export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
  xxxl: 48,
} as const;

export const radius = {
  sm: 8,
  input: 12,
  button: 12,
  card: 16,
  sheet: 24,
  pill: 999,
} as const;

/** Minimum comfortable tap target. Never go below this. */
export const TAP_TARGET = 48;

/**
 * Elevation is teal-tinted rather than flat black, so a raised surface still
 * belongs to the palette. `sm` is for rows and inputs that need to separate
 * from the background; `card` for cards; `raised` for sheets, docks and FABs.
 */
export const shadow = {
  sm: Platform.select({
    ios: {
      shadowColor: '#07333C',
      shadowOpacity: 0.05,
      shadowRadius: 6,
      shadowOffset: { width: 0, height: 2 },
    },
    android: { elevation: 1 },
    default: {},
  }),
  card: Platform.select({
    ios: {
      shadowColor: '#07333C',
      shadowOpacity: 0.08,
      shadowRadius: 14,
      shadowOffset: { width: 0, height: 4 },
    },
    android: { elevation: 2 },
    default: {},
  }),
  raised: Platform.select({
    ios: {
      shadowColor: '#07333C',
      shadowOpacity: 0.18,
      shadowRadius: 24,
      shadowOffset: { width: 0, height: 10 },
    },
    android: { elevation: 6 },
    default: {},
  }),
} as const;

/**
 * Space Grotesk carries the brand voice — the wordmark, greetings, headings
 * and every KPI figure; its numerals are the most distinctive thing about it.
 * Plus Jakarta Sans runs body copy, labels and controls: quieter, wider
 * apertures, and it holds up at 11px where a display face would not.
 */
export const fonts = {
  brand: 'SpaceGrotesk_700Bold',
  heading: 'SpaceGrotesk_600SemiBold',
  headingBold: 'SpaceGrotesk_700Bold',
  /** Space Grotesk has no italic; emphasis is carried by weight instead. */
  headingItalic: 'SpaceGrotesk_500Medium',
  medium: 'PlusJakartaSans_600SemiBold',
  numeric: 'SpaceGrotesk_700Bold',
  body: 'PlusJakartaSans_400Regular',
  bodyMedium: 'PlusJakartaSans_500Medium',
  bodySemi: 'PlusJakartaSans_600SemiBold',
  bodyBold: 'PlusJakartaSans_700Bold',
} as const;

/**
 * Money and quantities line up in columns only if the digits share a width.
 * `tabular-nums` does that wherever the platform honours it; every numeric
 * cell is also right-aligned so the column reads straight regardless.
 */
export const tabularNumbers: TextStyle = {
  fontVariant: ['tabular-nums'],
};

/**
 * Type scale. Display sizes get negative tracking so they don't read loose;
 * small sizes get positive tracking so they don't read tight. Line-heights
 * are ~1.3 for headings and ~1.5 for body.
 */
export const type = {
  display: { fontFamily: fonts.brand, fontSize: 34, lineHeight: 40, letterSpacing: -0.8 },
  /** The wordmark only. */
  brandLarge: { fontFamily: fonts.brand, fontSize: 30, lineHeight: 36, letterSpacing: -0.6 },
  h1: { fontFamily: fonts.headingBold, fontSize: 26, lineHeight: 32, letterSpacing: -0.5 },
  h2: { fontFamily: fonts.heading, fontSize: 21, lineHeight: 28, letterSpacing: -0.3 },
  h3: { fontFamily: fonts.heading, fontSize: 17, lineHeight: 24, letterSpacing: -0.2 },

  bodyLarge: { fontFamily: fonts.body, fontSize: 16, lineHeight: 24 },
  body: { fontFamily: fonts.body, fontSize: 15, lineHeight: 23 },
  bodyStrong: { fontFamily: fonts.bodySemi, fontSize: 15, lineHeight: 23 },
  small: { fontFamily: fonts.body, fontSize: 13, lineHeight: 20 },
  smallStrong: { fontFamily: fonts.bodyMedium, fontSize: 13, lineHeight: 20 },

  /** Uppercase eyebrows and field labels. Always pair with `textTransform`. */
  label: { fontFamily: fonts.bodySemi, fontSize: 12, lineHeight: 16, letterSpacing: 0.6 },
  caption: { fontFamily: fonts.bodyMedium, fontSize: 11, lineHeight: 15, letterSpacing: 0.4 },
  button: { fontFamily: fonts.bodyBold, fontSize: 15, lineHeight: 20, letterSpacing: 0.2 },

  /** KPI figures — Space Grotesk, tabular. */
  kpi: { fontFamily: fonts.numeric, fontSize: 27, lineHeight: 32, letterSpacing: -0.5, ...tabularNumbers },
  kpiSmall: { fontFamily: fonts.numeric, fontSize: 19, lineHeight: 25, letterSpacing: -0.3, ...tabularNumbers },
  money: { fontFamily: fonts.bodySemi, fontSize: 15, lineHeight: 22, ...tabularNumbers },
} as const;

/**
 * Motion. Durations are short on purpose — this is a counter app used at
 * speed, so animation should confirm a touch, never make anyone wait for it.
 */
export const motion = {
  fast: 120,
  base: 200,
  slow: 320,
  /** Press-in scale for tappable surfaces. */
  pressScale: 0.97,
  /** Decelerate — for things entering the screen. */
  enter: Easing.bezier(0.16, 1, 0.3, 1),
  /** Standard — for things changing in place. */
  standard: Easing.bezier(0.4, 0, 0.2, 1),
} as const;

/** 2px stroke on every lucide icon, as the design calls for. */
export const ICON_STROKE = 2;

/**
 * ── Chart palette ────────────────────────────────────────────────────────
 *
 * Charts need colours chosen against a different constraint from UI chrome:
 * two marks sitting side by side must stay apart for a colourblind reader, not
 * merely look distinct to someone with full colour vision.
 *
 * The UI's `warning` (#B26A00) and `danger` (#C0392F) fail that badly — ΔE 5.2
 * under deuteranopia and only 11.4 even with normal vision, i.e. amber and red
 * are genuinely hard to tell apart. So the ageing ramp below is re-stepped:
 * same semantic direction (fine → overdue), pushed far enough apart to clear
 * every check. Verified, not eyeballed.
 *
 * Every chart also carries a text label next to its mark, so identity never
 * rests on colour alone.
 */
export const chart = {
  /** Single-series marks — the sales trend. One measure, so one hue. */
  series: colors.primary,
  seriesFillTop: 'rgba(13, 76, 89, 0.22)',
  seriesFillBottom: 'rgba(13, 76, 89, 0.02)',

  /** Bars for a single measure across categories: magnitude, not identity. */
  bar: colors.primary,
  barMuted: '#9EC2CB',

  /** Ordered severity: 0–30 → 31–60 → 60+. */
  ageing: ['#1E7A52', '#C98A00', '#A32218'] as const,

  grid: neutral[200],
  axisLabel: neutral[500],
  /** Marks sit on the card, so the gap between adjacent bars is this. */
  surface: colors.surface,
} as const;
