import { MD3LightTheme, configureFonts, type MD3Theme } from 'react-native-paper';
import { colors, fonts, neutral } from './tokens';

/**
 * React Native Paper, repainted in the Sattadhar palette.
 * The point of this file is that no Material purple ever reaches the screen.
 *
 * Display and headline sizes carry the same negative tracking as the `type`
 * scale in tokens.ts, so a Paper-rendered heading and one of ours are
 * indistinguishable side by side.
 */

const fontConfig = {
  displayLarge: { fontFamily: fonts.brand, fontWeight: '700' as const, letterSpacing: -1.5, lineHeight: 64, fontSize: 57 },
  displayMedium: { fontFamily: fonts.brand, fontWeight: '700' as const, letterSpacing: -1.2, lineHeight: 52, fontSize: 45 },
  displaySmall: { fontFamily: fonts.brand, fontWeight: '700' as const, letterSpacing: -1, lineHeight: 44, fontSize: 36 },
  headlineLarge: { fontFamily: fonts.headingBold, fontWeight: '700' as const, letterSpacing: -0.8, lineHeight: 40, fontSize: 32 },
  headlineMedium: { fontFamily: fonts.headingBold, fontWeight: '700' as const, letterSpacing: -0.6, lineHeight: 36, fontSize: 28 },
  headlineSmall: { fontFamily: fonts.heading, fontWeight: '600' as const, letterSpacing: -0.5, lineHeight: 32, fontSize: 24 },
  titleLarge: { fontFamily: fonts.heading, fontWeight: '600' as const, letterSpacing: -0.3, lineHeight: 28, fontSize: 22 },
  titleMedium: { fontFamily: fonts.bodySemi, fontWeight: '600' as const, letterSpacing: 0.1, lineHeight: 24, fontSize: 16 },
  titleSmall: { fontFamily: fonts.bodySemi, fontWeight: '600' as const, letterSpacing: 0.1, lineHeight: 20, fontSize: 14 },
  bodyLarge: { fontFamily: fonts.body, fontWeight: '400' as const, letterSpacing: 0.15, lineHeight: 24, fontSize: 16 },
  bodyMedium: { fontFamily: fonts.body, fontWeight: '400' as const, letterSpacing: 0.25, lineHeight: 20, fontSize: 14 },
  bodySmall: { fontFamily: fonts.body, fontWeight: '400' as const, letterSpacing: 0.4, lineHeight: 16, fontSize: 12 },
  labelLarge: { fontFamily: fonts.bodyMedium, fontWeight: '500' as const, letterSpacing: 0.1, lineHeight: 20, fontSize: 14 },
  labelMedium: { fontFamily: fonts.bodyMedium, fontWeight: '500' as const, letterSpacing: 0.5, lineHeight: 16, fontSize: 12 },
  labelSmall: { fontFamily: fonts.bodyMedium, fontWeight: '500' as const, letterSpacing: 0.5, lineHeight: 16, fontSize: 11 },
  default: { fontFamily: fonts.body, fontWeight: '400' as const, letterSpacing: 0.15 },
};

export const paperTheme: MD3Theme = {
  ...MD3LightTheme,
  roundness: 3,
  fonts: configureFonts({ config: fontConfig }),
  colors: {
    ...MD3LightTheme.colors,
    primary: colors.primary,
    onPrimary: colors.onPrimary,
    primaryContainer: colors.primarySoft,
    onPrimaryContainer: colors.primaryInk,

    secondary: colors.accent,
    onSecondary: colors.onAccent,
    secondaryContainer: colors.accentSoft,
    onSecondaryContainer: colors.accentInk,

    tertiary: colors.info,
    onTertiary: colors.onAccent,
    tertiaryContainer: colors.infoSoft,
    onTertiaryContainer: colors.infoInk,

    error: colors.danger,
    onError: colors.onAccent,
    errorContainer: colors.dangerSoft,
    onErrorContainer: colors.dangerInk,

    background: colors.background,
    onBackground: colors.text,
    surface: colors.surface,
    onSurface: colors.text,
    surfaceVariant: colors.surfaceSunken,
    onSurfaceVariant: colors.muted,
    surfaceDisabled: neutral[100],
    onSurfaceDisabled: colors.faint,

    outline: colors.border,
    outlineVariant: colors.borderStrong,
    inverseSurface: colors.primaryDark,
    inverseOnSurface: colors.onPrimary,
    inversePrimary: colors.accent,
    backdrop: colors.overlay,

    elevation: {
      level0: 'transparent',
      level1: colors.surface,
      level2: colors.surface,
      level3: colors.surface,
      level4: colors.surface,
      level5: colors.surface,
    },
  },
};
