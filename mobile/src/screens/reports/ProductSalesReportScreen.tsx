import { useCallback, useState } from 'react';
import { View } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Card, SectionHeader } from '../../components/Card';
import { DataTable, type DataColumn } from '../../components/DataTable';
import { BarList } from '../../components/charts/BarList';
import { reportsApi } from '../../api/reports';
import type { ProductSalesRow } from '../../api/types';
import { useReportData } from '../../hooks/useReportData';
import { formatMoney, formatQty, formatRupees } from '../../utils/money';
import { rangeForPreset, type DateRange } from '../../utils/reportRange';
import type { ReportsStackParamList } from '../../navigation/types';
import { ReportScaffold, type SummaryFigure } from './ReportScaffold';

type Props = NativeStackScreenProps<ReportsStackParamList, 'ProductSalesReport'>;

/** The chart shows the head of the list; the table carries the whole tail. */
const CHART_ROWS = 8;

export function ProductSalesReportScreen({ navigation }: Props) {
  const { t } = useTranslation();
  const [range, setRange] = useState<DateRange>(() => rangeForPreset('THIS_MONTH'));

  const fetcher = useCallback(() => reportsApi.productSales({ from: range.from, to: range.to }), [range.from, range.to]);
  const { data, loading, refreshing, failure, reload } = useReportData(fetcher);

  const summary: SummaryFigure[] = data
    ? [
        { key: 'products', label: t('reports.productsSold'), value: String(data.totals.productCount) },
        { key: 'value', label: t('reports.salesValue'), value: formatRupees(data.totals.value) },
        { key: 'discount', label: t('reports.discountGiven'), value: formatRupees(data.totals.discountGiven) },
      ]
    : [];

  const columns: DataColumn<ProductSalesRow>[] = [
    { key: 'name', header: t('products.name'), width: 150, render: (row) => row.name },
    { key: 'sku', header: t('products.sku'), width: 126, render: (row) => row.sku },
    { key: 'categoryName', header: t('products.category'), width: 110, render: (row) => row.categoryName },
    {
      key: 'qty',
      header: t('reports.quantity'),
      width: 92,
      numeric: true,
      render: (row) => `${formatQty(row.qty)} ${row.unit === 'METER' ? t('stock.unitShortMeter') : t('stock.unitShortPiece')}`,
    },
    { key: 'billCount', header: t('reports.bills'), width: 56, numeric: true, render: (row) => String(row.billCount) },
    { key: 'averageRate', header: t('reports.avgRate'), width: 96, numeric: true, render: (row) => formatMoney(row.averageRate) },
    { key: 'discountGiven', header: t('billing.discount'), width: 96, numeric: true, render: (row) => formatMoney(row.discountGiven) },
    { key: 'value', header: t('reports.salesValue'), width: 110, numeric: true, render: (row) => formatMoney(row.value) },
  ];

  return (
    <ReportScaffold
      title={t('reports.productSales')}
      onBack={() => navigation.goBack()}
      reportPath="product-sales"
      range={range}
      onRangeChange={setRange}
      loading={loading}
      failure={failure}
      onRefresh={reload}
      refreshing={refreshing}
      summary={summary}
    >
      {data ? (
        <>
          <View>
            <SectionHeader title={t('reports.topByValue', { count: Math.min(CHART_ROWS, data.rows.length) })} />
            <Card>
              <BarList
                emptyText={t('reports.emptySales')}
                data={data.rows.slice(0, CHART_ROWS).map((row) => ({
                  key: row.productId,
                  label: row.name,
                  value: row.value,
                  caption: `${formatQty(row.qty)} ${
                    row.unit === 'METER' ? t('stock.unitShortMeter') : t('stock.unitShortPiece')
                  } · ${t('reports.acrossBills', { count: row.billCount })}`,
                }))}
              />
            </Card>
          </View>

          <View>
            <SectionHeader title={t('reports.everyProduct')} />
            <DataTable
              columns={columns}
              rows={data.rows}
              keyExtractor={(row) => row.productId}
              emptyText={t('reports.emptySales')}
              totals={{
                name: t('reports.total'),
                discountGiven: formatMoney(data.totals.discountGiven),
                value: formatMoney(data.totals.value),
              }}
            />
          </View>
        </>
      ) : null}
    </ReportScaffold>
  );
}
