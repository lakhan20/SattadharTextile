import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { CheckCircle2, ChevronRight } from 'lucide-react-native';
import { AppHeader } from '../../components/AppHeader';
import { Banner } from '../../components/Banner';
import { Card, SectionHeader } from '../../components/Card';
import { EmptyState } from '../../components/EmptyState';
import { Screen } from '../../components/Screen';
import { Touchable } from '../../components/Touchable';
import { ledgerApi } from '../../api/ledger';
import type { AgeingCustomer, AgeingReport } from '../../api/types';
import { useApiError, type ReadableError } from '../../hooks/useApiError';
import { ICON_STROKE, chart, colors, radius, spacing, tabularNumbers, type } from '../../theme';
import type { CustomersStackParamList } from '../../navigation/types';
import { formatRupees } from './khataFormat';

type Props = NativeStackScreenProps<CustomersStackParamList, 'Ageing'>;

/**
 * How long the money has been owed — ADMIN only, and absent from a staff
 * navigator entirely.
 *
 * The bucket colours come from `chart.ageing`, not from the UI's semantic
 * warning/danger pair: those two are only ΔE 5.2 apart under deuteranopia, so
 * "31–60" and "60+" would be genuinely hard to tell apart for a colourblind
 * reader. Every bucket also carries its label in text, so the reading never
 * rests on colour alone.
 */
const BUCKETS = [
  { key: 'bucket0to30', labelKey: 'khata.bucket0to30', colour: chart.ageing[0] },
  { key: 'bucket31to60', labelKey: 'khata.bucket31to60', colour: chart.ageing[1] },
  { key: 'bucket60Plus', labelKey: 'khata.bucket60Plus', colour: chart.ageing[2] },
] as const;

type BucketKey = (typeof BUCKETS)[number]['key'];

export function AgeingScreen({ navigation }: Props) {
  const { t } = useTranslation();
  const readError = useApiError();

  const [data, setData] = useState<AgeingReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [failure, setFailure] = useState<ReadableError | null>(null);

  const load = useCallback(
    async (opts: { silent?: boolean } = {}) => {
      if (!opts.silent) setLoading(true);
      setFailure(null);
      try {
        setData(await ledgerApi.ageing());
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

  const isEmpty = !!data && data.buckets.total === 0 && data.customers.length === 0;

  return (
    <View style={styles.root}>
      <AppHeader
        title={t('khata.ageingTitle')}
        subtitle={t('khata.ageingCaption')}
        onBack={() => navigation.goBack()}
      />

      <Screen
        onRefresh={() => {
          setRefreshing(true);
          void load({ silent: true });
        }}
        refreshing={refreshing}
      >
        {failure ? (
          <Banner tone={failure.isOffline ? 'offline' : 'error'} title={failure.title} body={failure.body} />
        ) : null}

        {loading && !data ? <ActivityIndicator style={styles.spinner} color={colors.primary} /> : null}

        {isEmpty ? (
          <EmptyState
            icon={<CheckCircle2 size={28} color={colors.success} strokeWidth={ICON_STROKE} />}
            title={t('khata.ageingEmptyTitle')}
            body={t('khata.ageingEmptyBody')}
          />
        ) : null}

        {data && !isEmpty ? (
          <>
            <Card>
              <Text style={styles.totalLabel}>{t('khata.bucketTotal')}</Text>
              <Text style={styles.totalValue}>{formatRupees(data.buckets.total)}</Text>

              <View style={styles.bucketList}>
                {BUCKETS.map((bucket) => {
                  const value = data.buckets[bucket.key];
                  const share = data.buckets.total > 0 ? value / data.buckets.total : 0;
                  const count = data.customers.filter((c) => c[bucket.key] > 0).length;

                  return (
                    <View key={bucket.key} style={styles.bucketRow}>
                      <View style={styles.bucketHead}>
                        <View style={styles.bucketLabelRow}>
                          <View style={[styles.swatch, { backgroundColor: bucket.colour }]} />
                          <Text style={styles.bucketLabel}>{t(bucket.labelKey)}</Text>
                        </View>
                        <Text style={styles.bucketValue}>{formatRupees(value)}</Text>
                      </View>

                      <View style={styles.track}>
                        <View
                          style={[
                            styles.fill,
                            { width: `${Math.max(share * 100, value > 0 ? 2 : 0)}%`, backgroundColor: bucket.colour },
                          ]}
                        />
                      </View>

                      <Text style={styles.bucketCount}>{t('khata.inBucket', { count })}</Text>
                    </View>
                  );
                })}
              </View>

              {/* Opening balances and bill-less notes carry no date to age
                  from. Reported on their own line rather than quietly folded
                  into 60+, which would overstate how bad the book looks. */}
              {data.unbucketed !== 0 ? (
                <View style={styles.unbucketed}>
                  <Text style={styles.unbucketedLabel}>{t('khata.unbucketed')}</Text>
                  <Text style={styles.unbucketedValue}>{formatRupees(data.unbucketed)}</Text>
                  <Text style={styles.unbucketedHint}>{t('khata.unbucketedHint')}</Text>
                </View>
              ) : null}
            </Card>

            {BUCKETS.map((bucket) => {
              const customers = data.customers
                .filter((c) => c[bucket.key] > 0)
                .sort((a, b) => b[bucket.key] - a[bucket.key]);
              if (customers.length === 0) return null;

              return (
                <View key={bucket.key}>
                  <SectionHeader title={t(bucket.labelKey)} />
                  <Card padded={false}>
                    {customers.map((customer, index) => (
                      <CustomerRow
                        key={customer.customerId}
                        customer={customer}
                        bucketKey={bucket.key}
                        colour={bucket.colour}
                        last={index === customers.length - 1}
                        onPress={() =>
                          navigation.navigate('CustomerKhata', {
                            customerId: customer.customerId,
                            customerName: customer.name,
                          })
                        }
                      />
                    ))}
                  </Card>
                </View>
              );
            })}
          </>
        ) : null}
      </Screen>
    </View>
  );
}

function CustomerRow({
  customer,
  bucketKey,
  colour,
  last,
  onPress,
}: {
  customer: AgeingCustomer;
  bucketKey: BucketKey;
  colour: string;
  last: boolean;
  onPress: () => void;
}) {
  const { t } = useTranslation();

  return (
    <Touchable
      onPress={onPress}
      accessibilityRole="button"
      feedback="subtle"
      style={[styles.customerRow, !last && styles.customerRowBorder]}
    >
      <View style={styles.customerText}>
        <Text style={styles.customerName} numberOfLines={1}>
          {customer.name}
        </Text>
        <Text style={styles.customerSub}>{t('khata.oldestDays', { days: customer.oldestBillDays })}</Text>
      </View>
      <Text style={[styles.customerAmount, { color: colour }]}>{formatRupees(customer[bucketKey])}</Text>
      <ChevronRight size={16} color={colors.muted} strokeWidth={ICON_STROKE} />
    </Touchable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  spinner: { marginTop: spacing.xxxl },

  totalLabel: { ...type.label, color: colors.muted, textTransform: 'uppercase' },
  totalValue: { ...type.kpi, color: colors.text, marginTop: spacing.xs },

  bucketList: { marginTop: spacing.lg, gap: spacing.lg },
  bucketRow: { gap: 6 },
  bucketHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md },
  bucketLabelRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  swatch: { width: 10, height: 10, borderRadius: 3 },
  bucketLabel: { ...type.smallStrong, color: colors.text },
  bucketValue: { ...type.money, color: colors.text },
  track: { height: 8, borderRadius: 4, backgroundColor: colors.surfaceSunken, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: 4 },
  bucketCount: { ...type.caption, color: colors.muted },

  unbucketed: {
    marginTop: spacing.lg,
    paddingTop: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  unbucketedLabel: { ...type.smallStrong, color: colors.text },
  unbucketedValue: { ...type.money, color: colors.text, marginTop: 2 },
  unbucketedHint: { ...type.caption, color: colors.muted, marginTop: 2 },

  customerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    minHeight: 56,
    borderRadius: radius.card,
  },
  customerRowBorder: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
    borderRadius: 0,
  },
  customerText: { flex: 1 },
  customerName: { ...type.body, color: colors.text },
  customerSub: { ...type.caption, color: colors.muted, marginTop: 1 },
  customerAmount: { ...type.money, ...tabularNumbers },
});
