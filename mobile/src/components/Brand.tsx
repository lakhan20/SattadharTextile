import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Defs, LinearGradient, Path, Stop } from 'react-native-svg';
import { colors, fonts } from '../theme';

/**
 * The "Warp & Weft" mark: two threads each way, interlaced over-and-under in a
 * true plain weave — the simplest structure in the trade, and the one every
 * bolt in the shop is built on. It reads as a woven square at 16px and holds
 * its detail at 96px.
 *
 * The over/under is real, not implied: the horizontals are painted across the
 * verticals, then the two crossings where warp should sit on top are painted
 * again. The gradient is `userSpaceOnUse`, so those repainted segments inherit
 * exactly the colour the full stroke had at that point and the join is
 * invisible.
 */
export function ThreadMark({ size = 32, onDark = false }: { size?: number; onDark?: boolean }) {
  const from = onDark ? colors.onPrimary : colors.primary;
  const to = onDark ? colors.accentSoft : colors.accent;
  const gradId = `weave-${onDark ? 'dark' : 'light'}`;
  const stroke = `url(#${gradId})`;

  return (
    <Svg width={size} height={size} viewBox="0 0 100 100" fill="none">
      <Defs>
        <LinearGradient id={gradId} x1="18" y1="18" x2="82" y2="82" gradientUnits="userSpaceOnUse">
          <Stop offset="0" stopColor={from} />
          <Stop offset="1" stopColor={to} />
        </LinearGradient>
      </Defs>

      {/* Warp — the threads held on the loom. */}
      <Path d="M35,18 L35,82" stroke={stroke} strokeWidth={13} strokeLinecap="round" />
      <Path d="M65,18 L65,82" stroke={stroke} strokeWidth={13} strokeLinecap="round" />

      {/*
        Weft — the thread carried across, passing over both warps.
        Held at 55% so the interlace reads as depth rather than a flat grid:
        with all six strokes at one value the mark collapses into a "#" at
        header size, where the over/under is far too small to see.
      */}
      <Path d="M18,35 L82,35" stroke={stroke} strokeWidth={13} strokeLinecap="round" opacity={0.55} />
      <Path d="M18,65 L82,65" stroke={stroke} strokeWidth={13} strokeLinecap="round" opacity={0.55} />

      {/* The two crossings where the warp returns to the surface. */}
      <Path d="M35,27 L35,43" stroke={stroke} strokeWidth={13} strokeLinecap="butt" />
      <Path d="M65,57 L65,73" stroke={stroke} strokeWidth={13} strokeLinecap="butt" />
    </Svg>
  );
}

/** The logo mark: a rounded teal tile holding the weave. */
export function BrandMark({ size = 56, style }: { size?: number; style?: StyleProp<ViewStyle> }) {
  return (
    <View
      style={[
        styles.mark,
        {
          width: size,
          height: size,
          borderRadius: size * 0.28,
        },
        style,
      ]}
    >
      <ThreadMark size={size * 0.6} onDark />
    </View>
  );
}

/**
 * "Sattadhar" in Space Grotesk over a letter-spaced mulberry "TEXTILE".
 * `onDark` flips the wordmark for the teal gradient on the login screen.
 */
export function Wordmark({
  size = 'medium',
  onDark = false,
  align = 'center',
}: {
  size?: 'small' | 'medium' | 'large';
  onDark?: boolean;
  align?: 'center' | 'left';
}) {
  const scale = size === 'large' ? 1 : size === 'medium' ? 0.78 : 0.6;
  return (
    <View style={{ alignItems: align === 'center' ? 'center' : 'flex-start' }}>
      <Text
        style={{
          fontFamily: fonts.brand,
          fontSize: 30 * scale,
          lineHeight: 36 * scale,
          letterSpacing: -0.6 * scale,
          color: onDark ? colors.onPrimary : colors.primary,
        }}
      >
        Sattadhar
      </Text>
      <Text
        style={{
          fontFamily: fonts.bodyBold,
          fontSize: 11 * scale,
          lineHeight: 16 * scale,
          letterSpacing: 6.5 * scale,
          color: onDark ? colors.accentSoft : colors.accent,
          // Letter-spacing pads the right edge; pull it back so the two
          // words stay optically centred on each other.
          marginLeft: 6 * scale,
        }}
      >
        TEXTILE
      </Text>
    </View>
  );
}

/** Mark + wordmark side by side, for headers. */
export function BrandLockup({ onDark = false }: { onDark?: boolean }) {
  return (
    <View style={styles.lockup}>
      <BrandMark size={38} />
      <Wordmark size="small" align="left" onDark={onDark} />
    </View>
  );
}

const styles = StyleSheet.create({
  mark: {
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  lockup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
});
