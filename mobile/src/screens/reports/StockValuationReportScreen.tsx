import { useCallback } from 'react';
import { View } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { SectionHeader } from '../../components/Card';
import { DataTable, type DataColumn } from '../../components/DataTable';
import { reportsApi } from '../../api/reports';
import type { StockValuationByUnit } from '../../api/types';
import { useReportData } from '../../hooks/useReportData';
import { formatMoney, formatQty, formatRupees } from '../../utils/money';
import type { ReportsStackParamList } from '../../navigation/types';
import { ReportScaffold, type SummaryFigure } from './ReportScaffold';

type Props = NativeStackScreenProps<ReportsStackParamList, 'StockValuationReport'>;

/**
 * ADMIN-only: every figure here is cost price times quantity. No date range —
 * stock is worth what it is worth right now.
 */
export function StockValuationReportScreen({ navigation }: Props) {
  const { t } = useTranslation();

  const fetcher = useCallback(() => reportsApi.stockValuation(), []);
  const { data, loading, refreshing, failure, reload } = useReportData(fetcher);

  const summary: SummaryFigure[] = data
    ? [
        { key: 'cost', label: t('reports.valueAtCost'), value: formatRupees(data.costValue) },
        { key: 'retail', label: t('reports.valueAtRetail'), value: formatRupees(data.retailValue) },
        { key: 'margin', label: t('reports.potentialMargin'), value: formatRupees(data.potentialMargin), tone: 'success' },
        {
          key: 'low',
          label: t('dashboard.lowStock'),
          value: String(data.lowStockCount),
          tone: data.lowStockCount > 0 ? 'warning' : 'default',
        },
      ]
    : [];

  const columns: DataColumn<StockValuationByUnit>[] = [
    {
      key: 'unit',
      header: t('products.unit'),
      width: 92,
      render: (row) => (row.unit === 'METER' ? t('products.unitMeter') : t('products.unitPiece')),
    },
    { key: 'productCount', header: t('reports.products'), width: 84, numeric: true, render: (row) => String(row.productCount) },
    { key: 'totalQty', header: t('reports.onHand'), width: 104, numeric: true, render: (row) => formatQty(row.totalQty) },
    { key: 'costValue', header: t('reports.atCost'), width: 116, numeric: true, render: (row) => formatMoney(row.costValue) },
    { key: 'retailValue', header: t('reports.atRetail'), width: 120, numeric: true, render: (row) => formatMoney(row.retailValue) },
  ];

  return (
    <ReportScaffold
      title={t('reports.stockValuation')}
      onBack={() => navigation.goBack()}
      reportPath="stock-valuation"
      loading={loading}
      failure={failure}
      onRefresh={reload}
      refreshing={refreshing}
      summary={summary}
      note={t('reports.valuationNote')}
    >
      {data ? (
        <View>
          <SectionHeader title={t('reports.byUnit')} />
          <DataTable
            columns={columns}
            rows={data.byUnit}
            keyExtractor={(row) => row.unit}
            emptyText={t('stock.emptyTitle')}
            totals={{
              unit: t('reports.total'),
              productCount: String(data.productCount),
              costValue: formatMoney(data.costValue),
              retailValue: formatMoney(data.retailValue),
            }}
          />
        </View>
      ) : null}
    </ReportScaffold>
  );
}
