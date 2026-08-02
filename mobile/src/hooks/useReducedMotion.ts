import { useEffect, useState } from 'react';
import { AccessibilityInfo } from 'react-native';

/**
 * Whether the OS "reduce motion" setting is on.
 *
 * Read once on mount and then kept live, because the setting can be toggled
 * from the system shade without the app restarting — and a staff member who
 * turns it on mid-shift because the motion is making them queasy should not
 * have to force-quit to be believed.
 *
 * Everything that animates in this app reads this and falls back to the same
 * final state, instantly. Nothing is hidden or disabled when motion is off —
 * it simply arrives already there.
 */
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    let active = true;

    void AccessibilityInfo.isReduceMotionEnabled().then((enabled) => {
      if (active) setReduced(enabled);
    });

    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduced);

    return () => {
      active = false;
      subscription.remove();
    };
  }, []);

  return reduced;
}
