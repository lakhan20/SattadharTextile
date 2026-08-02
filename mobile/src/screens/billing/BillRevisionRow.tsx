import { StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { ArrowRight } from 'lucide-react-native';
import { Card } from '../../components/Card';
import type { BillRevision } from '../../api/types';
import { ICON_STROKE, colors, radius, spacing, tabularNumbers, type } from '../../theme';
import { formatMoney } from '../../utils/money';

/**
 * One entry in the edit log.
 *
 * The reason is the headline, not a footnote: an owner scanning this list is
 * looking for edits that should not have happened, and an edit explained as
 * "customer changed their mind" reads very differently from one explained as
 * "wrong qty". The amount the total moved by sits on the right in danger tones
 * when the bill got cheaper, because that is the direction worth noticing.
 */
export function BillRevisionRow({
  revision,
  showBillNumber = false,
  onPress,
}: {
  revision: BillRevision;
  showBillNumber?: boolean;
  onPress?: () => void;
}) {
  const { t } = useTranslation();
  const delta = revision.amountDelta;
  const when = new Date(revision.createdAt);

  return (
    <Card onPress={onPress} style={styles.card}>
      <View style={styles.topRow}>
        <View style={styles.topText}>
          <Text style={styles.reason}>{revision.reason}</Text>
          <Text style={styles.meta}>
            {showBillNumber ? `${revision.billNumber} · ` : ''}
            {t('bills.revisionNumber', { n: revision.revision })} ·{' '}
            {when.toLocaleDateString('en-IN')} {when.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
          </Text>
          <Text style={styles.by}>{t('bills.revisionBy', { name: revision.changedByName })}</Text>
        </View>
        {Math.abs(delta) >= 0.005 ? (
          <View style={[styles.deltaChip, delta < 0 ? styles.deltaDown : styles.deltaUp]}>
            <Text style={[styles.deltaText, delta < 0 ? styles.deltaTextDown : styles.deltaTextUp]}>
              {delta < 0 ? '−' : '+'}₹{formatMoney(Math.abs(delta))}
            </Text>
          </View>
        ) : null}
      </View>

      {revision.changes.length > 0 ? (
        <View style={styles.changes}>
          {revision.changes.map((change, index) => (
            <View key={`${change.field}-${index}`} style={styles.changeRow}>
              <Text style={styles.changeField} numberOfLines={1}>
                {change.field}
              </Text>
              <View style={styles.changeValues}>
                <Text style={styles.changeBefore} numberOfLines={1}>
                  {change.before}
                </Text>
                <ArrowRight size={12} color={colors.faint} strokeWidth={ICON_STROKE} />
                <Text style={styles.changeAfter} numberOfLines={1}>
                  {change.after}
                </Text>
              </View>
            </View>
          ))}
        </View>
      ) : (
        <Text style={styles.noChanges}>{t('bills.revisionNoFieldChanges')}</Text>
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { gap: spacing.sm },
  topRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
  topText: { flex: 1, gap: 2 },
  reason: { ...type.bodyStrong, color: colors.text },
  meta: { ...type.caption, color: colors.muted, ...tabularNumbers },
  by: { ...type.caption, color: colors.faint },

  deltaChip: { paddingHorizontal: spacing.sm, paddingVertical: 3, borderRadius: radius.pill },
  deltaUp: { backgroundColor: colors.successSoft },
  deltaDown: { backgroundColor: colors.dangerSoft },
  deltaText: { ...type.caption, ...tabularNumbers },
  deltaTextUp: { color: colors.success },
  deltaTextDown: { color: colors.danger },

  changes: {
    gap: spacing.xs,
    paddingTop: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  changeRow: { gap: 1 },
  changeField: { ...type.caption, color: colors.muted },
  changeValues: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  changeBefore: { ...type.small, color: colors.faint, textDecorationLine: 'line-through', ...tabularNumbers },
  changeAfter: { ...type.small, color: colors.text, ...tabularNumbers },
  noChanges: { ...type.caption, color: colors.faint },
});
