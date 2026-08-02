import { useCallback, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Card, SectionHeader } from '../../components/Card';
import { DataTable, type DataColumn } from '../../components/DataTable';
import { reportsApi } from '../../api/reports';
import type { ProfitRow } from '../../api/types';
import { useReportData } from '../../hooks/useReportData';
import { colors, spacing, tabularNumbers, type } from '../../theme';
import { formatMoney, formatQty, formatRupees } from '../../utils/money';
import { rangeForPreset, type DateRange } from '../../utils/reportRange';
import type { ReportsStackParamList } from '../../navigation/types';
import { ReportScaffold, type SummaryFigure } from './ReportScaffold';

type Props = NativeStackScreenProps<ReportsStackParamList, 'ProfitMarginReport'>;

/**
 * ADMIN ONLY. Every number on this screen derives from cost price, and the
 * endpoint behind it returns 403 for a staff token — this screen is not
 * reachable from staff navigation and could not render if it were.
 */
export function ProfitMarginReportScreen({ navigation }: Props) {
  const { t } = useTranslation();
  const [range, setRange] = useState<DateRange>(() => rangeForPreset('THIS_MONTH'));

  const fetcher = useCallback(() => reportsApi.profitMargin({ from: range.from, to: range.to }), [range.from, range.to]);
  const { data, loading, refreshing, failure, reload } = useReportData(fetcher);

  const summary: SummaryFigure[] = data
    ? [
        { key: 'revenue', label: t('reports.revenue'), value: formatRupees(data.overall.revenue) },
        { key: 'cost', label: t('reports.cogs'), value: formatRupees(data.overall.cost) },
        {
          key: 'profit',
          label: t('reports.grossProfit'),
          value: formatRupees(data.overall.profit),
          tone: data.overall.profit >= 0 ? 'success' : 'danger',
        },
        {
          key: 'margin',
          label: t('reports.margin'),
          value: `${data.overall.marginPercent.toFixed(2)}%`,
          tone: data.overall.profit >= 0 ? 'success' : 'danger',
        },
      ]
    : [];

  const columns: DataColumn<ProfitRow>[] = [
    { key: 'name', header: t('products.name'), width: 150, render: (row) => row.name },
    { key: 'sku', header: t('products.sku'), width: 126, render: (row) => row.sku },
    {
      key: 'qty',
      header: t('reports.quantity'),
      width: 92,
      numeric: true,
      render: (row) => `${formatQty(row.qty)} ${row.unit === 'METER' ? t('stock.unitShortMeter') : t('stock.unitShortPiece')}`,
    },
    { key: 'revenue', header: t('reports.revenue'), width: 108, numeric: true, render: (row) => formatMoney(row.revenue) },
    { key: 'cost', header: t('reports.cost'), width: 104, numeric: true, render: (row) => formatMoney(row.cost) },
    {
      key: 'profit',
      header: t('reports.profit'),
      width: 108,
      numeric: true,
      render: (row) => formatMoney(row.profit),
      tone: (row) => (row.profit > 0 ? 'success' : row.profit < 0 ? 'danger' : 'default'),
    },
    {
      key: 'marginPercent',
      header: t('reports.margin'),
      width: 88,
      numeric: true,
      render: (row) => `${row.marginPercent.toFixed(1)}%`,
      tone: (row) => (row.profit > 0 ? 'success' : row.profit < 0 ? 'danger' : 'default'),
    },
  ];

  return (
    <ReportScaffold
      title={t('reports.profitMargin')}
      onBack={() => navigation.goBack()}
      reportPath="profit-margin"
      range={range}
      onRangeChange={setRange}
      loading={loading}
      failure={failure}
      onRefresh={reload}
      refreshing={refreshing}
      summary={summary}
      note={t('reports.profitNote')}
    >
      {data ? (
        <>
          {/* The headline the owner is actually here for, stated once, large. */}
          <Card style={styles.heroCard}>
            <Text style={styles.heroLabel}>{t('reports.grossProfit')}</Text>
            <Text style={styles.heroValue}>{formatRupees(data.overall.profit)}</Text>
            <Text style={styles.heroCaption}>
              {t('reports.profitCaption', {
                revenue: formatRupees(data.overall.revenue),
                cost: formatRupees(data.overall.cost),
                bills: data.overall.billCount,
              })}
            </Text>
          </Card>

          {data.lossMakers.length > 0 ? (
            <View>
              <SectionHeader title={t('reports.soldAtLoss')} />
              <DataTable
                columns={columns.filter((column) => column.key !== 'marginPercent')}
                rows={data.lossMakers}
                keyExtractor={(row) => row.productId}
                emptyText={t('reports.emptySales')}
              />
            </View>
          ) : null}

          <View>
            <SectionHeader title={t('reports.byProduct')} />
            <DataTable
              columns={columns}
              rows={data.rows}
              keyExtractor={(row) => row.productId}
              emptyText={t('reports.emptySales')}
              totals={{
                name: t('reports.total'),
                revenue: formatMoney(data.overall.revenue),
                cost: formatMoney(data.overall.cost),
                profit: formatMoney(data.overall.profit),
                marginPercent: `${data.overall.marginPercent.toFixed(1)}%`,
              }}
            />
          </View>
        </>
      ) : null}
    </ReportScaffold>
  );
}

const styles = StyleSheet.create({
  heroCard: { backgroundColor: colors.primary, borderColor: colors.primary },
  heroLabel: { ...type.label, color: colors.onPrimaryMuted, textTransform: 'uppercase' },
  heroValue: { ...type.kpi, color: colors.onPrimary, marginTop: spacing.xs, ...tabularNumbers },
  heroCaption: { ...type.small, color: colors.onPrimaryMuted, marginTop: spacing.xs },
});
