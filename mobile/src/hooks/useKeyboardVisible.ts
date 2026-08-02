import { useEffect, useState } from 'react';
import { Keyboard, Platform } from 'react-native';

/**
 * Whether the on-screen keyboard is up.
 *
 * Used to stand pinned chrome down while someone is typing. On a phone the
 * billing screen pins a mode bar, an add button and the total dock — together
 * most of the height the keyboard leaves — so anything that is not needed
 * mid-typing has to get out of the way or the field being typed into has
 * nowhere to be.
 *
 * iOS gets the `Will` events so the chrome moves with the keyboard animation
 * rather than a frame behind it. Android only fires `Did`.
 */
export function useKeyboardVisible(): boolean {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const isIos = Platform.OS === 'ios';
    const show = Keyboard.addListener(isIos ? 'keyboardWillShow' : 'keyboardDidShow', () =>
      setVisible(true),
    );
    const hide = Keyboard.addListener(isIos ? 'keyboardWillHide' : 'keyboardDidHide', () =>
      setVisible(false),
    );

    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

  return visible;
}
