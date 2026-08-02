import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { CheckCircle2, ChevronRight, Hourglass, MessageCircle } from 'lucide-react-native';
import { AppHeader } from '../../components/AppHeader';
import { Banner } from '../../components/Banner';
import { Card } from '../../components/Card';
import { EmptyState } from '../../components/EmptyState';
import { Toast } from '../../components/Toast';
import { ledgerApi } from '../../api/ledger';
import type { OutstandingCustomer, OutstandingReport } from '../../api/types';
import { useApiError, type ReadableError } from '../../hooks/useApiError';
import { ICON_STROKE, TAP_TARGET, colors, radius, spacing, tabularNumbers, type } from '../../theme';
import type { CustomersStackParamList } from '../../navigation/types';
import { formatDay, formatRupees } from './khataFormat';

type Props = NativeStackScreenProps<CustomersStackParamList, 'Outstanding'>;

/**
 * The shop's debtor book — ADMIN only, and registered only in the owner's
 * navigator, so a staff session has no route to reach it by.
 *
 * It is the working version of the outstanding *report*: same figures, same
 * endpoint behind it, but every row leads somewhere — into the customer's
 * khata, or into a WhatsApp reminder. The report under Reports stays the
 * read-and-export view.
 */
export function OutstandingScreen({ navigation }: Props) {
  const { t } = useTranslation();
  const readError = useApiError();

  const [data, setData] = useState<OutstandingReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [failure, setFailure] = useState<ReadableError | null>(null);
  const [remindingId, setRemindingId] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const load = useCallback(
    async (opts: { silent?: boolean } = {}) => {
      if (!opts.silent) setLoading(true);
      setFailure(null);
      try {
        setData(await ledgerApi.outstanding());
      } catch (error) {
        setFailure(readError(error));
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [readError],
  );

  useEffect(() => {
    void load();
  }, [load]);

  const dismissToast = useCallback(() => setToast(null), []);

  async function sendReminder(customer: OutstandingCustomer) {
    setRemindingId(customer.customerId);
    try {
      const reminder = await ledgerApi.reminder(customer.customerId);
      const opened = await Linking.canOpenURL(reminder.whatsappUrl);
      if (!opened) {
        setToast(t('khata.reminderFailed'));
        return;
      }
      await Linking.openURL(reminder.whatsappUrl);
    } catch (error) {
      const failed = readError(error);
      setToast(failed.title);
    } finally {
      setRemindingId(null);
    }
  }

  return (
    <View style={styles.root}>
      <AppHeader title={t('khata.outstandingTitle')} onBack={() => navigation.goBack()} />

      <FlatList
        data={data?.customers ?? []}
        keyExtractor={(item) => item.customerId}
        contentContainerStyle={styles.list}
        refreshing={refreshing}
        onRefresh={() => {
          setRefreshing(true);
          void load({ silent: true });
        }}
        ListHeaderComponent={
          <View style={styles.headerBlock}>
            {data ? (
              <Card tone={data.totalOutstanding > 0 ? 'danger' : 'success'}>
                <Text style={styles.totalLabel}>{t('khata.shopWideTotal')}</Text>
                <Text
                  style={[
                    styles.totalValue,
                    data.totalOutstanding > 0 ? styles.totalOwed : styles.totalSettled,
                  ]}
                >
                  {formatRupees(data.totalOutstanding)}
                </Text>
                <Text style={styles.totalCaption}>
                  {t('khata.customersOwing', { count: data.customerCount })}
                  {data.overLimitCount > 0
                    ? ` · ${t('khata.overLimitCount', { count: data.overLimitCount })}`
                    : ''}
                </Text>
              </Card>
            ) : null}

            {failure ? (
              <Banner tone={failure.isOffline ? 'offline' : 'error'} title={failure.title} body={failure.body} />
            ) : null}

            {(data?.customers.length ?? 0) > 0 ? (
              <Text style={styles.sectionLabel}>{t('khata.highestFirst')}</Text>
            ) : null}
          </View>
        }
        ListEmptyComponent={
          loading ? (
            <ActivityIndicator style={styles.spinner} color={colors.primary} />
          ) : failure ? null : (
            <EmptyState
              icon={<CheckCircle2 size={28} color={colors.success} strokeWidth={ICON_STROKE} />}
              title={t('khata.outstandingEmptyTitle')}
              body={t('khata.outstandingEmptyBody')}
            />
          )
        }
        renderItem={({ item }) => (
          <Card
            style={styles.row}
            tone={item.overLimitBy > 0 ? 'warning' : 'default'}
            onPress={() =>
              navigation.navigate('CustomerKhata', { customerId: item.customerId, customerName: item.name })
            }
          >
            <View style={styles.rowTop}>
              <View style={styles.rowText}>
                <Text style={styles.name} numberOfLines={1}>
                  {item.name}
                </Text>
                <Text style={styles.sub} numberOfLines={1}>
                  {item.unpaidBillCount > 0
                    ? t('khata.unpaidBills', { count: item.unpaidBillCount })
                    : t('khata.noBillsYet')}
                  {item.lastBillDate ? ` · ${t('khata.lastBill', { date: formatDay(item.lastBillDate) })}` : ''}
                </Text>
              </View>

              <View style={styles.amountBlock}>
                <Text style={styles.amount}>{formatRupees(item.outstanding)}</Text>
                {item.overLimitBy > 0 ? (
                  <Text style={styles.overLimit}>
                    {t('customers.overLimitBy', { amount: formatRupees(item.overLimitBy) })}
                  </Text>
                ) : null}
              </View>

              <ChevronRight size={18} color={colors.muted} strokeWidth={ICON_STROKE} />
            </View>

            <Pressable
              onPress={() => void sendReminder(item)}
              disabled={remindingId === item.customerId}
              accessibilityRole="button"
              accessibilityLabel={t('khata.sendReminder')}
              style={({ pressed }) => [styles.reminder, pressed && styles.pressed]}
            >
              {remindingId === item.customerId ? (
                <ActivityIndicator size="small" color={colors.primary} />
              ) : (
                <>
                  <MessageCircle size={15} color={colors.primary} strokeWidth={ICON_STROKE} />
                  <Text style={styles.reminderText}>{t('khata.sendReminder')}</Text>
                </>
              )}
            </Pressable>
          </Card>
        )}
        ListFooterComponent={
          (data?.customers.length ?? 0) > 0 ? (
            <Pressable
              onPress={() => navigation.navigate('Ageing')}
              accessibilityRole="button"
              style={({ pressed }) => [styles.ageingLink, pressed && styles.pressed]}
            >
              <Hourglass size={16} color={colors.primary} strokeWidth={ICON_STROKE} />
              <Text style={styles.ageingLinkText}>{t('khata.ageingTitle')}</Text>
              <ChevronRight size={16} color={colors.primary} strokeWidth={ICON_STROKE} />
            </Pressable>
          ) : null
        }
      />

      <Toast message={toast} tone="error" onHide={dismissToast} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  list: { padding: spacing.lg, paddingBottom: spacing.xxxl, gap: spacing.md, flexGrow: 1 },
  headerBlock: { marginBottom: spacing.md, gap: spacing.md },

  totalLabel: { ...type.label, color: colors.muted, textTransform: 'uppercase' },
  totalValue: { ...type.kpi, marginTop: spacing.xs },
  totalOwed: { color: colors.danger },
  totalSettled: { color: colors.success },
  totalCaption: { ...type.small, color: colors.muted, marginTop: 2 },

  sectionLabel: { ...type.label, color: colors.muted, textTransform: 'uppercase' },
  spinner: { marginTop: spacing.xxxl },

  row: { marginBottom: spacing.sm, gap: spacing.sm },
  rowTop: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  rowText: { flex: 1 },
  name: { ...type.bodyStrong, color: colors.text },
  sub: { ...type.caption, color: colors.muted, marginTop: 2 },
  amountBlock: { alignItems: 'flex-end' },
  amount: { ...type.kpiSmall, color: colors.danger, ...tabularNumbers },
  overLimit: { ...type.caption, color: colors.warning, ...tabularNumbers },

  reminder: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    minHeight: TAP_TARGET - 12,
    borderRadius: radius.pill,
    backgroundColor: colors.primarySoft,
  },
  reminderText: { ...type.smallStrong, color: colors.primary },
  pressed: { opacity: 0.7 },

  ageingLink: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    minHeight: TAP_TARGET,
    marginTop: spacing.md,
    borderRadius: radius.button,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  ageingLinkText: { ...type.button, color: colors.primary },
});
