import { useEffect, useRef } from 'react';
import { Animated, type StyleProp, type TextStyle } from 'react-native';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { motion } from '../theme';

interface AnimatedMoneyProps {
  /** Already formatted — this component never does arithmetic. */
  value: string;
  style?: StyleProp<TextStyle>;
  accessibilityLabel?: string;
  numberOfLines?: number;
  /** Needs `numberOfLines` to do anything, as on any RN Text. */
  adjustsFontSizeToFit?: boolean;
}

/**
 * A money figure that settles into place when it changes.
 *
 * Deliberately *not* a counting tween. A tween walks through numbers that were
 * never the total, and this figure is read aloud to a customer at the counter —
 * showing ₹4,180 on the way to ₹6,240 is a real way to misquote a bill. So the
 * value swaps in one frame and only the *arrival* is animated: a short rise and
 * fade, enough to catch the eye of someone who just changed a quantity and is
 * looking at the line row rather than the dock.
 *
 * The animation runs forward from a dipped state on every change, so the new
 * figure is legible from the first frame and never blanks out mid-transition.
 */
export function AnimatedMoney({
  value,
  style,
  accessibilityLabel,
  numberOfLines,
  adjustsFontSizeToFit,
}: AnimatedMoneyProps) {
  const progress = useRef(new Animated.Value(1)).current;
  const reduceMotion = useReducedMotion();
  const isFirstRender = useRef(true);

  useEffect(() => {
    // The opening total shouldn't animate in — the dock is arriving with the
    // screen, and `Reveal` already owns that entrance.
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }

    if (reduceMotion) {
      progress.setValue(1);
      return;
    }

    progress.setValue(0);
    const animation = Animated.timing(progress, {
      toValue: 1,
      duration: motion.base,
      easing: motion.enter,
      useNativeDriver: true,
    });
    animation.start();
    return () => animation.stop();
  }, [value, progress, reduceMotion]);

  const translateY = progress.interpolate({ inputRange: [0, 1], outputRange: [6, 0] });
  const opacity = progress.interpolate({ inputRange: [0, 1], outputRange: [0.35, 1] });

  return (
    <Animated.Text
      style={[style, { opacity, transform: [{ translateY }] }]}
      // The figure is the screen's focal point; announce the change, don't
      // interrupt whatever the user is doing to hear it.
      accessibilityLiveRegion="polite"
      {...(numberOfLines !== undefined ? { numberOfLines } : null)}
      {...(adjustsFontSizeToFit ? { adjustsFontSizeToFit } : null)}
      {...(accessibilityLabel ? { accessibilityLabel } : null)}
    >
      {value}
    </Animated.Text>
  );
}
