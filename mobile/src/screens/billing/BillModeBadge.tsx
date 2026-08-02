import { StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { BillingMode } from '../../api/types';
import { colors, radius, spacing, type } from '../../theme';

/** Indigo for a tax invoice, gold for an estimate — legally different documents. */
export function BillModeBadge({ mode }: { mode: BillingMode }) {
  const { t } = useTranslation();
  const isGst = mode === 'GST';
  return (
    <View style={[styles.badge, { backgroundColor: isGst ? colors.primary : colors.accent }]}>
      <Text style={styles.text}>{t(isGst ? 'bills.badgeGst' : 'bills.badgeEstimate')}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: radius.pill,
  },
  text: { ...type.caption, color: '#FFFFFF', textTransform: 'uppercase' },
});
