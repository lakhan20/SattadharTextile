import { useMemo, useRef, type ReactNode } from 'react';
import {
  Animated,
  Pressable,
  type PressableProps,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
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
 */
export function Touchable({
  children,
  style,
  feedback = 'default',
  disabled,
  ...rest
}: TouchableProps) {
  const scale = useRef(new Animated.Value(1)).current;
  const target = feedback === 'subtle' ? 0.985 : motion.pressScale;

  const opacity = useMemo(
    () => scale.interpolate({ inputRange: [target, 1], outputRange: [0.9, 1] }),
    [scale, target],
  );

  function animate(to: number, duration: number) {
    if (feedback === 'none') return;
    Animated.timing(scale, {
      toValue: to,
      duration,
      easing: motion.standard,
      useNativeDriver: true,
    }).start();
  }

  return (
    <Pressable
      disabled={disabled}
      onPressIn={() => animate(target, motion.fast)}
      onPressOut={() => animate(1, motion.base)}
      {...rest}
    >
      <Animated.View
        style={[
          style,
          feedback === 'none' ? null : { transform: [{ scale }], opacity },
          disabled ? { opacity: 0.45 } : null,
        ]}
      >
        {children}
      </Animated.View>
    </Pressable>
  );
}
