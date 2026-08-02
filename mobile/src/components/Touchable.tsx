import { useMemo, useRef, type ReactNode } from 'react';
import {
  Animated,
  Pressable,
  type PressableProps,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { motion } from '../theme';

interface TouchableProps extends Omit<PressableProps, 'style' | 'children'> {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  /**
   * How far the surface dips on press. `subtle` for large cards, where a big
   * scale looks like the layout is collapsing; `none` for rows that already
   * signal press some other way.
   */
  feedback?: 'default' | 'subtle' | 'none';
}

/**
 * A Pressable that dips and dims under the finger.
 *
 * Both animated properties are transform/opacity only, so the whole thing runs
 * on the native driver and never blocks the JS thread — which matters on the
 * billing screen, where a press often lands while a rate is being recalculated.
 *
 * Press-in is near-instant and release is slower: a touch should feel caught
 * immediately, but springing back too fast reads as a rejected tap.
 *
 * Under reduce-motion the dip is dropped but the dim is kept. Losing the
 * travel is the point of the setting; losing the acknowledgement too would
 * leave a tap with no feedback at all, which is worse than the motion was.
 */
export function Touchable({
  children,
  style,
  feedback = 'default',
  disabled,
  ...rest
}: TouchableProps) {
  const press = useRef(new Animated.Value(0)).current;
  const reduceMotion = useReducedMotion();
  const target = feedback === 'subtle' ? 0.985 : motion.pressScale;

  // Driven off one 0→1 value so scale and opacity can never desynchronise,
  // and so the scale can be dropped independently when motion is reduced.
  const scale = useMemo(
    () => press.interpolate({ inputRange: [0, 1], outputRange: [1, target] }),
    [press, target],
  );
  const opacity = useMemo(
    () => press.interpolate({ inputRange: [0, 1], outputRange: [1, 0.9] }),
    [press],
  );

  function animate(to: number, duration: number) {
    if (feedback === 'none') return;
    Animated.timing(press, {
      toValue: to,
      duration,
      easing: motion.standard,
      useNativeDriver: true,
    }).start();
  }

  return (
    <Pressable
      disabled={disabled}
      onPressIn={() => animate(1, motion.fast)}
      onPressOut={() => animate(0, motion.base)}
      {...rest}
    >
      <Animated.View
        style={[
          style,
          feedback === 'none'
            ? null
            : { opacity, ...(reduceMotion ? null : { transform: [{ scale }] }) },
          disabled ? { opacity: 0.45 } : null,
        ]}
      >
        {children}
      </Animated.View>
    </Pressable>
  );
}
