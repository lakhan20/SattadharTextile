import { useEffect, useRef, type ReactNode } from 'react';
import { Animated, type StyleProp, type ViewStyle } from 'react-native';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { motion } from '../theme';

interface RevealProps {
  children: ReactNode;
  /**
   * Row position in a list. Used to stagger the entrance, and capped at
   * `MAX_STAGGER_STEPS` — without a cap, row 40 of a long bill list would sit
   * invisible for two seconds before appearing.
   */
  index?: number;
  /** Distance travelled on entry. Set 0 for a plain fade. */
  offset?: number;
  style?: StyleProp<ViewStyle>;
}

const STAGGER_MS = 35;
const MAX_STAGGER_STEPS = 8;

/**
 * Fades and lifts its child in once, on mount.
 *
 * Only opacity and translateY are animated, so this stays on the native
 * driver. Recycled FlatList rows re-run the entrance when they remount, which
 * is the behaviour we want — a row scrolling back into view should arrive the
 * same way it first did.
 */
export function Reveal({ children, index = 0, offset = 10, style }: RevealProps) {
  const progress = useRef(new Animated.Value(0)).current;
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    // With reduce-motion on, the row is simply already there. Note it still
    // goes through `progress` rather than skipping the wrapper — the child
    // must never end up mounted at opacity 0 because the setting flipped
    // between mount and this effect.
    if (reduceMotion) {
      progress.setValue(1);
      return;
    }

    const animation = Animated.timing(progress, {
      toValue: 1,
      duration: motion.slow,
      delay: Math.min(index, MAX_STAGGER_STEPS) * STAGGER_MS,
      easing: motion.enter,
      useNativeDriver: true,
    });
    animation.start();
    return () => animation.stop();
  }, [progress, index, reduceMotion]);

  const translateY = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [offset, 0],
  });

  return (
    <Animated.View style={[style, { opacity: progress, transform: [{ translateY }] }]}>
      {children}
    </Animated.View>
  );
}
