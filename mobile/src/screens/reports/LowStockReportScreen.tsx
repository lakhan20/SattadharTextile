import { useCallback } from 'react';
import { View } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { SectionHeader } from '../../components/Card';
import { DataTable, type DataColumn } from '../../components/DataTable';
import { reportsApi } from '../../api/reports';
import type { LowStockItem } from '../../api/types';
import { useReportData } from '../../hooks/useReportData';
import { formatQty } from '../../utils/money';
import type { ReportsStackParamList } from '../../navigation/types';
import { ReportScaffold, type SummaryFigure } from './ReportScaffold';

type Props = NativeStackScreenProps<ReportsStackParamList, 'LowStockReport'>;

const PAGE_SIZE = 100;

/**
 * The one report the server also serves to STAFF. It is reached from here
 * only because the Reports hub is admin-only navigation — the day-to-day
 * staff route to the same information is the Stock screen's "Low stock"
 * filter, which is the same underlying query.
 *
 * There is no cost column, for either role: the query selects none.
 */
export function LowStockReportScreen({ navigation }: Props) {
  const { t } = useTranslation();

  const fetcher = useCallback(() => reportsApi.lowStock({ pageSize: PAGE_SIZE }), []);
  const { data, loading, refreshing, failure, reload } = useReportData(fetcher);

  const summary: SummaryFigure[] = data
    ? [
        {
          key: 'count',
          label: t('reports.runningLow'),
          value: String(data.pagination.total),
          tone: data.pagination.total > 0 ? 'warning' : 'success',
        },
        {
          key: 'out',
          label: t('stock.outOfStock'),
          value: String(data.items.filter((item) => item.outOfStock).length),
          tone: data.items.some((item) => item.outOfStock) ? 'danger' : 'default',
        },
      ]
    : [];

  const columns: DataColumn<LowStockItem>[] = [
    { key: 'name', header: t('products.name'), width: 150, render: (row) => row.name },
    { key: 'sku', header: t('products.sku'), width: 130, render: (row) => row.sku },
    {
      key: 'unit',
      header: t('products.unit'),
      width: 64,
      render: (row) => (row.unit === 'METER' ? t('stock.unitShortMeter') : t('stock.unitShortPiece')),
    },
    {
      key: 'currentStock',
      header: t('stock.currentBalance'),
      width: 88,
      numeric: true,
      render: (row) => formatQty(row.currentStock),
      tone: (row) => (row.outOfStock ? 'danger' : 'warning'),
    },
    { key: 'reorderLevel', header: t('reports.reorderAt'), width: 96, numeric: true, render: (row) => formatQty(row.reorderLevel) },
    { key: 'shortBy', header: t('reports.shortBy'), width: 88, numeric: true, render: (row) => formatQty(row.shortBy) },
  ];

  return (
    <ReportScaffold
      title={t('reports.lowStock')}
      onBack={() => navigation.goBack()}
      reportPath="low-stock"
      loading={loading}
      failure={failure}
      onRefresh={reload}
      refreshing={refreshing}
      summary={summary}
      note={
        data && data.pagination.total > PAGE_SIZE
          ? t('reports.lowStockCapped', { shown: PAGE_SIZE, total: data.pagination.total })
          : undefined
      }
    >
      {data ? (
        <View>
          <SectionHeader title={t('reports.worstFirst')} />
          <DataTable
            columns={columns}
            rows={data.items}
            keyExtractor={(row) => row.id}
            emptyText={t('stock.emptyLowBody')}
          />
        </View>
      ) : null}
    </ReportScaffold>
  );
}
