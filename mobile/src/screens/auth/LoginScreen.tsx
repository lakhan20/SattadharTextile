import { useEffect, useRef, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type TextInput,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { Lock, Server, User } from 'lucide-react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { BrandMark, Wordmark } from '../../components/Brand';
import { Banner } from '../../components/Banner';
import { Button } from '../../components/Button';
import { LanguageToggle } from '../../components/AppHeader';
import { TextField } from '../../components/TextField';
import { ApiError } from '../../api/client';
import { useApiError, type ReadableError } from '../../hooks/useApiError';
import { useAuthStore } from '../../store/authStore';
import { useSettingsStore } from '../../store/settingsStore';
import { ICON_STROKE, colors, radius, shadow, spacing, type } from '../../theme';
import type { AuthStackParamList } from '../../navigation/types';

type Props = NativeStackScreenProps<AuthStackParamList, 'Login'>;

export function LoginScreen({ navigation }: Props) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const readError = useApiError();

  const signIn = useAuthStore((s) => s.signIn);
  const endedReason = useAuthStore((s) => s.endedReason);
  const clearEndedReason = useAuthStore((s) => s.clearEndedReason);
  const baseUrl = useSettingsStore((s) => s.baseUrl);

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [failure, setFailure] = useState<ReadableError | null>(null);
  const [touched, setTouched] = useState(false);
  const [showForgot, setShowForgot] = useState(false);

  const passwordRef = useRef<TextInput>(null);

  // A session that ended by itself (revoked, deactivated, offline at launch)
  // explains itself here rather than dumping the user at a blank form.
  useEffect(() => {
    if (!endedReason) return;
    setFailure(readError(new ApiError(endedReason, '')));
    clearEndedReason();
  }, [endedReason, readError, clearEndedReason]);

  const usernameError = touched && !username.trim() ? t('errors.fieldRequired') : undefined;
  const passwordError = touched && !password ? t('errors.fieldRequired') : undefined;

  async function handleSignIn() {
    setTouched(true);
    setShowForgot(false);
    if (!username.trim() || !password) return;

    setSubmitting(true);
    setFailure(null);
    try {
      await signIn(username, password);
      // On success the root navigator swaps to the tab stack; nothing to do here.
    } catch (error) {
      const readable = readError(error);
      setFailure(readable);
      if (readable.code === 'INVALID_CREDENTIALS' || readable.code === 'ACCOUNT_LOCKED') {
        setShowForgot(true);
        setPassword('');
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <View style={styles.root}>
      {/* Light icons while the teal gradient owns the top of the screen. */}
      <StatusBar style="light" />
      <LinearGradient
        colors={[colors.primaryDark, colors.primary]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[styles.gradient, { paddingTop: insets.top }]}
      >
        <View style={styles.gradientTop}>
          <View />
          <LanguageToggleOnDark />
        </View>

        <View style={styles.brandBlock}>
          <BrandMark size={62} />
          <View style={styles.wordmarkSpacing}>
            <Wordmark size="large" onDark />
          </View>
          <Text style={styles.tagline}>{t('brand.tagline')}</Text>
        </View>
      </LinearGradient>

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.formWrap}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 24}
      >
        <ScrollView
          contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + spacing.xxl }]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* The floating card overlaps the gradient. */}
          <View style={styles.card}>
            <Text style={styles.welcome}>{t('auth.welcome')}</Text>
            <Text style={styles.subtitle}>{t('auth.subtitle')}</Text>

            {failure ? (
              <View style={styles.bannerSlot}>
                <Banner
                  tone={failure.isOffline ? 'offline' : 'error'}
                  title={failure.title}
                  body={failure.body}
                />
              </View>
            ) : null}

            <View style={styles.fields}>
              <TextField
                label={t('auth.username')}
                placeholder={t('auth.usernamePlaceholder')}
                value={username}
                onChangeText={setUsername}
                error={usernameError}
                autoCapitalize="none"
                autoCorrect={false}
                autoComplete="username"
                textContentType="username"
                returnKeyType="next"
                editable={!submitting}
                onSubmitEditing={() => passwordRef.current?.focus()}
                leftIcon={<User size={19} color={colors.muted} strokeWidth={ICON_STROKE} />}
              />

              <TextField
                ref={passwordRef}
                label={t('auth.password')}
                placeholder={t('auth.passwordPlaceholder')}
                value={password}
                onChangeText={setPassword}
                error={passwordError}
                secure
                showPasswordLabel={t('auth.showPassword')}
                hidePasswordLabel={t('auth.hidePassword')}
                autoCapitalize="none"
                autoComplete="current-password"
                textContentType="password"
                returnKeyType="go"
                editable={!submitting}
                onSubmitEditing={() => void handleSignIn()}
                leftIcon={<Lock size={19} color={colors.muted} strokeWidth={ICON_STROKE} />}
              />
            </View>

            {/* The one accented action on this screen. */}
            <Button
              label={submitting ? t('auth.signingIn') : t('auth.signIn')}
              onPress={() => void handleSignIn()}
              variant="accent"
              loading={submitting}
              style={styles.submit}
            />

            {showForgot ? (
              <Pressable onPress={() => setShowForgot(false)} style={styles.forgotBlock}>
                <Text style={styles.forgotTitle}>{t('auth.forgotPassword')}</Text>
                <Text style={styles.forgotBody}>{t('auth.forgotPasswordBody')}</Text>
              </Pressable>
            ) : null}
          </View>

          <Pressable
            onPress={() => navigation.navigate('ServerSettings', { fromLogin: true })}
            style={({ pressed }) => [styles.serverLink, pressed && styles.pressed]}
            accessibilityRole="button"
          >
            <Server size={15} color={colors.muted} strokeWidth={ICON_STROKE} />
            <Text style={styles.serverLinkText}>{t('auth.serverLink')}</Text>
            <Text style={styles.serverUrl} numberOfLines={1}>
              {baseUrl.replace(/^https?:\/\//, '')}
            </Text>
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

/** The header toggle, restyled for the indigo gradient. */
function LanguageToggleOnDark() {
  return (
    <View style={styles.langOnDark}>
      <LanguageToggle />
    </View>
  );
}

const CARD_OVERLAP = 34;

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },

  gradient: {
    paddingHorizontal: spacing.xl,
    paddingBottom: CARD_OVERLAP + spacing.xxl,
  },
  gradientTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: spacing.sm,
  },
  langOnDark: {
    backgroundColor: colors.surface,
    borderRadius: 999,
  },
  brandBlock: {
    alignItems: 'center',
    marginTop: spacing.xl,
  },
  wordmarkSpacing: { marginTop: spacing.lg },
  tagline: {
    ...type.small,
    color: colors.onPrimaryMuted,
    marginTop: spacing.md,
  },

  formWrap: { flex: 1, marginTop: -CARD_OVERLAP },
  scroll: {
    paddingHorizontal: spacing.lg,
    gap: spacing.lg,
  },

  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.card,
    padding: spacing.xl,
    ...shadow.raised,
  },
  welcome: { ...type.h1, color: colors.text },
  subtitle: { ...type.body, color: colors.muted, marginTop: spacing.xs },
  bannerSlot: { marginTop: spacing.lg },
  fields: { marginTop: spacing.xl, gap: spacing.lg },
  submit: { marginTop: spacing.xl },

  forgotBlock: {
    marginTop: spacing.lg,
    padding: spacing.md,
    borderRadius: radius.input,
    backgroundColor: colors.surfaceSunken,
  },
  forgotTitle: { ...type.smallStrong, color: colors.text },
  forgotBody: { ...type.small, color: colors.muted, marginTop: spacing.xs },

  serverLink: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.md,
  },
  serverLinkText: { ...type.smallStrong, color: colors.muted },
  serverUrl: { ...type.small, color: colors.faint, flexShrink: 1 },
  pressed: { opacity: 0.6 },
});
