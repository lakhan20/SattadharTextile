import { useCallback, useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { PaperProvider } from 'react-native-paper';
import * as SplashScreen from 'expo-splash-screen';
import { useFonts } from 'expo-font';
// Imported per weight, not from the package root: the root re-exports every
// weight and Metro would bundle every .ttf into the APK (~3 MB of fonts the
// app never renders).
import { SpaceGrotesk_500Medium } from '@expo-google-fonts/space-grotesk/500Medium';
import { SpaceGrotesk_600SemiBold } from '@expo-google-fonts/space-grotesk/600SemiBold';
import { SpaceGrotesk_700Bold } from '@expo-google-fonts/space-grotesk/700Bold';
import { PlusJakartaSans_400Regular } from '@expo-google-fonts/plus-jakarta-sans/400Regular';
import { PlusJakartaSans_500Medium } from '@expo-google-fonts/plus-jakarta-sans/500Medium';
import { PlusJakartaSans_600SemiBold } from '@expo-google-fonts/plus-jakarta-sans/600SemiBold';
import { PlusJakartaSans_700Bold } from '@expo-google-fonts/plus-jakarta-sans/700Bold';

import './src/i18n';
import { RootNavigator } from './src/navigation/RootNavigator';
import { useAuthStore } from './src/store/authStore';
import { useSettingsStore } from './src/store/settingsStore';
import { colors, paperTheme } from './src/theme';

void SplashScreen.preventAutoHideAsync();

export default function App() {
  const [fontsLoaded, fontError] = useFonts({
    SpaceGrotesk_500Medium,
    SpaceGrotesk_600SemiBold,
    SpaceGrotesk_700Bold,
    PlusJakartaSans_400Regular,
    PlusJakartaSans_500Medium,
    PlusJakartaSans_600SemiBold,
    PlusJakartaSans_700Bold,
  });

  const settingsHydrated = useSettingsStore((s) => s.hydrated);
  const bootstrap = useAuthStore((s) => s.bootstrap);
  const [sessionChecked, setSessionChecked] = useState(false);

  // The saved server address must be in place before /auth/me is attempted,
  // otherwise the very first request goes to the wrong host.
  useEffect(() => {
    if (!settingsHydrated || sessionChecked) return;
    setSessionChecked(true);
    void bootstrap();
  }, [settingsHydrated, sessionChecked, bootstrap]);

  // If device storage never answers, carry on with defaults rather than leave
  // the counter staring at a blank screen.
  useEffect(() => {
    if (settingsHydrated) return;
    const timer = setTimeout(() => useSettingsStore.setState({ hydrated: true }), 4000);
    return () => clearTimeout(timer);
  }, [settingsHydrated]);

  const ready = (fontsLoaded || fontError !== null) && settingsHydrated;

  const onLayout = useCallback(() => {
    if (ready) void SplashScreen.hideAsync();
  }, [ready]);

  if (!ready) return null;

  return (
    <GestureHandlerRootView style={styles.root} onLayout={onLayout}>
      <SafeAreaProvider>
        <PaperProvider theme={paperTheme}>
          <View style={styles.root}>
            <StatusBar style="dark" />
            <RootNavigator />
          </View>
        </PaperProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
});
