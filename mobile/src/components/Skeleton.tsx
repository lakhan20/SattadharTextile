import { useEffect, useRef, useState } from 'react';
import { Animated, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { colors, motion, radius, spacing } from '../theme';

const AnimatedGradient = Animated.createAnimatedComponent(LinearGradient);

interface SkeletonProps {
  width?: number | `${number}%`;
  height?: number;
  radius?: number;
  style?: StyleProp<ViewStyle>;
}

/**
 * One shimmering placeholder block.
 *
 * A sweep rather than a pulse: a pulse reads as "something is broken and
 * blinking", a sweep reads as "this is arriving". The highlight is translated,
 * so it stays on the native driver.
 *
 * The sweep only starts once `onLayout` has reported a width — before that
 * there is nothing meaningful to travel across.
 */
export function Skeleton({ width = '100%', height = 16, radius: r = radius.sm, style }: SkeletonProps) {
  const [boxWidth, setBoxWidth] = useState(0);
  const progress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (boxWidth === 0) return;
    progress.setValue(0);
    const loop = Animated.loop(
      Animated.timing(progress, {
        toValue: 1,
        duration: 1100,
        easing: motion.standard,
        useNativeDriver: true,
      }),
    );
    loop.start();
    return () => loop.stop();
  }, [boxWidth, progress]);

  const translateX = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [-boxWidth, boxWidth],
  });

  return (
    <View
      onLayout={(e) => setBoxWidth(e.nativeEvent.layout.width)}
      style={[styles.block, { width, height, borderRadius: r }, style]}
    >
      {boxWidth > 0 ? (
        <AnimatedGradient
          colors={['transparent', colors.surface, 'transparent']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={[StyleSheet.absoluteFill, { opacity: 0.7, transform: [{ translateX }] }]}
        />
      ) : null}
    </View>
  );
}

/**
 * The list placeholder used wherever rows are loading. It mirrors the real
 * row's geometry — card height, two text lines, a right-aligned figure — so
 * nothing jumps when the data lands.
 */
export function SkeletonRows({ count = 6 }: { count?: number }) {
  return (
    <View style={styles.rows}>
      {Array.from({ length: count }).map((_, i) => (
        <View key={i} style={styles.rowCard}>
          <View style={styles.rowText}>
            <Skeleton width="45%" height={15} />
            <Skeleton width="70%" height={12} />
            <Skeleton width="30%" height={11} />
          </View>
          <Skeleton width={72} height={20} />
        </View>
      ))}
    </View>
  );
}

/** Placeholder for the dashboard KPI grid. */
export function SkeletonTiles({ count = 4, tileWidth }: { count?: number; tileWidth?: number }) {
  return (
    <View style={styles.tiles}>
      {Array.from({ length: count }).map((_, i) => (
        <View key={i} style={[styles.tile, tileWidth ? { width: tileWidth } : styles.tileFlex]}>
          <Skeleton width={28} height={28} radius={radius.sm} />
          <Skeleton width="80%" height={12} />
          <Skeleton width="55%" height={22} />
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  block: {
    backgroundColor: colors.surfaceSunken,
    overflow: 'hidden',
  },
  rows: { gap: spacing.md },
  rowCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
  },
  rowText: { flex: 1, gap: spacing.sm },
  tiles: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  tile: {
    gap: spacing.sm,
    backgroundColor: colors.surface,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
  },
  tileFlex: { flexGrow: 1, minWidth: 150 },
});
