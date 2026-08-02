import { useCallback, useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Card, SectionHeader } from '../../components/Card';
import { Chip } from '../../components/Chip';
import { DataTable, type DataColumn } from '../../components/DataTable';
import { TrendChart } from '../../components/charts/TrendChart';
import { reportsApi, type SalesMode } from '../../api/reports';
import type { SalesReportBill, SalesReportDay } from '../../api/types';
import { useReportData } from '../../hooks/useReportData';
import { colors, spacing, type } from '../../theme';
import { formatMoney, formatRupees } from '../../utils/money';
import { formatDateKey, rangeForPreset, type DateRange } from '../../utils/reportRange';
import type { ReportsStackParamList } from '../../navigation/types';
import { ReportScaffold, type SummaryFigure } from './ReportScaffold';

type Props = NativeStackScreenProps<ReportsStackParamList, 'SalesReport'>;

const MODES: { value: SalesMode; labelKey: string }[] = [
  { value: 'ALL', labelKey: 'reports.modeAll' },
  { value: 'GST', labelKey: 'reports.modeGst' },
  { value: 'NON_GST', labelKey: 'reports.modeEstimate' },
];

export function SalesReportScreen({ navigation }: Props) {
  const { t } = useTranslation();
  const [range, setRange] = useState<DateRange>(() => rangeForPreset('THIS_MONTH'));
  const [mode, setMode] = useState<SalesMode>('ALL');

  const fetcher = useCallback(
    () => reportsApi.sales({ from: range.from, to: range.to, mode }),
    [range.from, range.to, mode],
  );
  const { data, loading, refreshing, failure, reload } = useReportData(fetcher);

  const summary: SummaryFigure[] = data
    ? [
        { key: 'total', label: t('reports.totalSales'), value: formatRupees(data.totals.grandTotal) },
        { key: 'bills', label: t('reports.bills'), value: String(data.totals.billCount) },
        { key: 'gst', label: t('reports.gstCollected'), value: formatRupees(data.totals.gstCollected) },
        {
          key: 'due',
          label: t('reports.onKhata'),
          value: formatRupees(data.totals.dueAmount),
          tone: data.totals.dueAmount > 0 ? 'danger' : 'default',
        },
      ]
    : [];

  // Days with no trade stay in the chart — a flat stretch is information, and
  // dropping them would join Saturday to Monday as if Sunday never happened.
  const trendPoints = useMemo(
    () => (data?.byDay ?? []).map((day) => ({ date: day.date, total: day.total })),
    [data],
  );

  const dayColumns: DataColumn<SalesReportDay>[] = [
    { key: 'date', header: t('reports.date'), width: 92, render: (row) => formatDateKey(row.date) },
    { key: 'billCount', header: t('reports.bills'), width: 56, numeric: true, render: (row) => String(row.billCount) },
    { key: 'gstTotal', header: t('reports.taxInvoices'), width: 100, numeric: true, render: (row) => formatMoney(row.gstTotal) },
    { key: 'estimateTotal', header: t('reports.estimates'), width: 96, numeric: true, render: (row) => formatMoney(row.estimateTotal) },
    { key: 'total', header: t('reports.total'), width: 104, numeric: true, render: (row) => formatMoney(row.total) },
  ];

  const billColumns: DataColumn<SalesReportBill>[] = [
    { key: 'billNumber', header: t('reports.billNo'), width: 116, render: (row) => row.billNumber },
    {
      key: 'billDate',
      header: t('reports.date'),
      width: 88,
      render: (row) => formatDateKey(row.billDate.slice(0, 10)),
    },
    {
      key: 'customerName',
      header: t('reports.customer'),
      width: 130,
      render: (row) => row.customerName ?? t('billing.walkIn'),
    },
    { key: 'staffName', header: t('reports.billedBy'), width: 110, render: (row) => row.staffName },
    { key: 'taxableValue', header: t('reports.taxable'), width: 96, numeric: true, render: (row) => formatMoney(row.taxableValue) },
    { key: 'gstAmount', header: t('billing.total') + ' GST', width: 84, numeric: true, render: (row) => formatMoney(row.gstAmount) },
    { key: 'grandTotal', header: t('reports.total'), width: 104, numeric: true, render: (row) => formatMoney(row.grandTotal) },
    {
      key: 'dueAmount',
      header: t('reports.due'),
      width: 92,
      numeric: true,
      render: (row) => formatMoney(row.dueAmount),
      tone: (row) => (row.dueAmount > 0 ? 'danger' : 'default'),
    },
  ];

  // Only the days that saw trade are tabulated — a table of zeroes is noise,
  // while the chart above still shows the gaps.
  const tradingDays = (data?.byDay ?? []).filter((day) => day.billCount > 0);

  return (
    <ReportScaffold
      title={t('reports.sales')}
      onBack={() => navigation.goBack()}
      reportPath="sales"
      range={range}
      onRangeChange={setRange}
      exportParams={{ mode }}
      loading={loading}
      failure={failure}
      onRefresh={reload}
      refreshing={refreshing}
      summary={summary}
      note={data?.truncated ? t('reports.truncatedNote', { count: data.bills.length }) : undefined}
    >
      <View style={styles.modeRow}>
        {MODES.map((option) => (
          <Chip
            key={option.value}
            label={t(option.labelKey)}
            active={mode === option.value}
            onPress={() => setMode(option.value)}
          />
        ))}
      </View>

      {data ? (
        <>
          <View>
            <SectionHeader title={t('reports.trend')} />
            <Card>
              <TrendChart
                points={trendPoints}
                emptyText={t('reports.emptySales')}
                summaryLabel={t('reports.totalSales')}
                accessibilityLabel={t('reports.trendA11y')}
              />
            </Card>
          </View>

          <View>
            <SectionHeader title={t('reports.byType')} />
            <View style={styles.modeSplit}>
              {data.byMode.length === 0 ? (
                <Text style={styles.empty}>{t('reports.emptySales')}</Text>
              ) : (
                data.byMode.map((row) => (
                  <Card key={row.mode} style={styles.modeCard}>
                    <Text style={styles.modeLabel}>
                      {row.mode === 'GST' ? t('reports.taxInvoices') : t('reports.estimates')}
                    </Text>
                    <Text style={styles.modeValue}>{formatRupees(row.grandTotal)}</Text>
                    <Text style={styles.modeCaption}>
                      {t('reports.billsWithGst', { count: row.billCount, gst: formatMoney(row.gstCollected) })}
                    </Text>
                  </Card>
                ))
              )}
            </View>
          </View>

          <View>
            <SectionHeader title={t('reports.dayByDay')} />
            <DataTable
              columns={dayColumns}
              rows={tradingDays}
              keyExtractor={(row) => row.date}
              emptyText={t('reports.emptySales')}
              totals={{
                date: t('reports.total'),
                billCount: String(data.totals.billCount),
                total: formatMoney(data.totals.grandTotal),
              }}
            />
          </View>

          <View>
            <SectionHeader title={t('reports.everyBill')} />
            <DataTable
              columns={billColumns}
              rows={data.bills}
              keyExtractor={(row) => row.id}
              emptyText={t('reports.emptySales')}
              totals={{
                billNumber: t('reports.total'),
                grandTotal: formatMoney(data.totals.grandTotal),
                dueAmount: formatMoney(data.totals.dueAmount),
              }}
            />
          </View>
        </>
      ) : null}
    </ReportScaffold>
  );
}

const styles = StyleSheet.create({
  modeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  modeSplit: { flexDirection: 'row', gap: spacing.md },
  modeCard: { flexGrow: 1, flexBasis: 0 },
  modeLabel: { ...type.caption, color: colors.muted, textTransform: 'uppercase' },
  modeValue: { ...type.kpiSmall, color: colors.text, marginTop: spacing.xs },
  modeCaption: { ...type.caption, color: colors.muted, marginTop: 2 },
  empty: { ...type.small, color: colors.muted },
});
