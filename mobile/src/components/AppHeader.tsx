import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ChevronLeft, Languages } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { ICON_STROKE, TAP_TARGET, colors, radius, spacing, type } from '../theme';
import { LANGUAGE_SHORT, type AppLanguage } from '../i18n';
import { useSettingsStore } from '../store/settingsStore';
import { BrandLockup } from './Brand';

interface AppHeaderProps {
  title?: string;
  subtitle?: string;
  /** Shows the brand lockup instead of a title — used on the dashboard. */
  brand?: boolean;
  onBack?: () => void;
  right?: React.ReactNode;
  /** The language toggle lives in the header on every main screen. */
  showLanguageToggle?: boolean;
}

export function LanguageToggle() {
  const { t } = useTranslation();
  const language = useSettingsStore((s) => s.language);
  const toggleLanguage = useSettingsStore((s) => s.toggleLanguage);
  const next: AppLanguage = language === 'en' ? 'gu' : 'en';

  return (
    <Pressable
      onPress={toggleLanguage}
      hitSlop={8}
      accessibilityRole="button"
      accessibilityLabel={t('a11y.languageToggle')}
      accessibilityHint={LANGUAGE_SHORT[next]}
      style={({ pressed }) => [styles.langChip, pressed && styles.pressed]}
    >
      <Languages size={15} color={colors.primary} strokeWidth={ICON_STROKE} />
      <Text style={styles.langText}>{LANGUAGE_SHORT[language]}</Text>
    </Pressable>
  );
}

export function AppHeader({
  title,
  subtitle,
  brand = false,
  onBack,
  right,
  showLanguageToggle = true,
}: AppHeaderProps) {
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();

  return (
    <View style={[styles.header, { paddingTop: insets.top + spacing.sm }]}>
      <View style={styles.left}>
        {onBack ? (
          <Pressable
            onPress={onBack}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel={t('a11y.backButton')}
            style={styles.backButton}
          >
            <ChevronLeft size={24} color={colors.text} strokeWidth={ICON_STROKE} />
          </Pressable>
        ) : null}

        {brand ? (
          <BrandLockup />
        ) : (
          <View style={styles.titleBlock}>
            <Text style={styles.title} numberOfLines={1}>
              {title}
            </Text>
            {subtitle ? (
              <Text style={styles.subtitle} numberOfLines={1}>
                {subtitle}
              </Text>
            ) : null}
          </View>
        )}
      </View>

      <View style={styles.right}>
        {right}
        {showLanguageToggle ? <LanguageToggle /> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
    backgroundColor: colors.background,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
    gap: spacing.md,
  },
  left: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    flexShrink: 1,
  },
  backButton: {
    width: TAP_TARGET - 12,
    height: TAP_TARGET - 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: -spacing.md,
  },
  titleBlock: { flexShrink: 1 },
  title: { ...type.h2, color: colors.text },
  subtitle: { ...type.small, color: colors.muted },
  right: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  langChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: spacing.md,
    height: 36,
    borderRadius: radius.pill,
    backgroundColor: colors.primarySoft,
  },
  langText: {
    ...type.smallStrong,
    color: colors.primary,
  },
  pressed: { opacity: 0.7 },
});
