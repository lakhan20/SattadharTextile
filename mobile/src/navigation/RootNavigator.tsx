import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { NavigationContainer, type Theme } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useTranslation } from 'react-i18next';
import { BrandMark, Wordmark } from '../components/Brand';
import { LoginScreen } from '../screens/auth/LoginScreen';
import { ServerScreen } from '../screens/settings/ServerScreen';
import { useAuthStore } from '../store/authStore';
import { colors, fonts, spacing, type } from '../theme';
import { ReportsStackNavigator } from './ReportsStackNavigator';
import { StockStackNavigator } from './StockStackNavigator';
import { TabNavigator } from './TabNavigator';
import type { AppStackParamList, AuthStackParamList } from './types';

const AuthStack = createNativeStackNavigator<AuthStackParamList>();
const AppStack = createNativeStackNavigator<AppStackParamList>();

const navigationTheme: Theme = {
  dark: false,
  colors: {
    primary: colors.primary,
    background: colors.background,
    card: colors.surface,
    text: colors.text,
    border: colors.border,
    notification: colors.danger,
  },
  fonts: {
    regular: { fontFamily: fonts.body, fontWeight: '400' },
    medium: { fontFamily: fonts.bodyMedium, fontWeight: '500' },
    bold: { fontFamily: fonts.bodySemi, fontWeight: '600' },
    heavy: { fontFamily: fonts.bodyBold, fontWeight: '700' },
  },
};

/** Shown while the keystore is read and /auth/me is verified. */
function RestoringSession() {
  const { t } = useTranslation();
  return (
    <View style={styles.splash}>
      <BrandMark size={62} />
      <View style={styles.splashWordmark}>
        <Wordmark size="medium" />
      </View>
      <ActivityIndicator color={colors.primary} style={styles.splashSpinner} />
      <Text style={styles.splashText}>{t('auth.restoring')}</Text>
    </View>
  );
}

function AuthFlow() {
  return (
    <AuthStack.Navigator screenOptions={{ headerShown: false, animation: 'slide_from_right' }}>
      <AuthStack.Screen name="Login" component={LoginScreen} />
      <AuthStack.Screen name="ServerSettings">
        {({ navigation }) => <ServerScreen onBack={() => navigation.goBack()} />}
      </AuthStack.Screen>
    </AuthStack.Navigator>
  );
}

function AppFlow({ isAdmin }: { isAdmin: boolean }) {
  return (
    <AppStack.Navigator screenOptions={{ headerShown: false, animation: 'slide_from_right' }}>
      <AppStack.Screen name="Tabs">
        {({ navigation }) => <TabNavigator onOpenServer={() => navigation.navigate('ServerSettings')} />}
      </AppStack.Screen>
      {/* Pushed over the tabs from More, so the stock screens get the full
          height of the app rather than sharing it with the tab bar. */}
      <AppStack.Screen name="Stock" component={StockStackNavigator} />

      {/* Registered only for the shop owner. A staff session's navigator has
          no Reports route at all — not a hidden one, not a disabled one — so
          there is nothing to reach by deep link or stale back-stack entry.
          The server's 403 is still the real boundary; this is defence in
          depth on top of it. */}
      {isAdmin ? <AppStack.Screen name="Reports" component={ReportsStackNavigator} /> : null}

      <AppStack.Screen name="ServerSettings">
        {({ navigation }) => <ServerScreen onBack={() => navigation.goBack()} />}
      </AppStack.Screen>
    </AppStack.Navigator>
  );
}

export function RootNavigator() {
  const status = useAuthStore((s) => s.status);
  // `requireAuth` re-reads the role from the database on every request and
  // `bootstrap` re-reads the user at launch, so this reflects the account's
  // current role — not whatever it was when the token was signed.
  const isAdmin = useAuthStore((s) => s.user?.role === 'ADMIN');

  if (status === 'restoring') return <RestoringSession />;

  return (
    <NavigationContainer theme={navigationTheme}>
      {status === 'signedIn' ? <AppFlow isAdmin={isAdmin} /> : <AuthFlow />}
    </NavigationContainer>
  );
}

const styles = StyleSheet.create({
  splash: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.background,
  },
  splashWordmark: { marginTop: spacing.xl },
  splashSpinner: { marginTop: spacing.xxxl },
  splashText: { ...type.small, color: colors.muted, marginTop: spacing.md },
});
