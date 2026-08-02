import { useCallback, useState } from 'react';
import { View } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Card, SectionHeader } from '../../components/Card';
import { DataTable, type DataColumn } from '../../components/DataTable';
import { BarList } from '../../components/charts/BarList';
import { reportsApi } from '../../api/reports';
import type { CategorySalesRow } from '../../api/types';
import { useReportData } from '../../hooks/useReportData';
import { formatMoney, formatQty, formatRupees } from '../../utils/money';
import { rangeForPreset, type DateRange } from '../../utils/reportRange';
import type { ReportsStackParamList } from '../../navigation/types';
import { ReportScaffold, type SummaryFigure } from './ReportScaffold';

type Props = NativeStackScreenProps<ReportsStackParamList, 'CategorySalesReport'>;

export function CategorySalesReportScreen({ navigation }: Props) {
  const { t } = useTranslation();
  const [range, setRange] = useState<DateRange>(() => rangeForPreset('THIS_MONTH'));

  const fetcher = useCallback(
    () => reportsApi.categorySales({ from: range.from, to: range.to }),
    [range.from, range.to],
  );
  const { data, loading, refreshing, failure, reload } = useReportData(fetcher);

  const summary: SummaryFigure[] = data
    ? [
        { key: 'value', label: t('reports.salesValue'), value: formatRupees(data.totalValue) },
        { key: 'categories', label: t('reports.categoriesSold'), value: String(data.rows.length) },
      ]
    : [];

  const columns: DataColumn<CategorySalesRow>[] = [
    { key: 'name', header: t('products.category'), width: 150, render: (row) => row.name },
    { key: 'code', header: t('categories.code'), width: 88, render: (row) => row.code },
    {
      key: 'productCount',
      header: t('reports.products'),
      width: 84,
      numeric: true,
      render: (row) => String(row.productCount),
    },
    { key: 'qty', header: t('reports.quantity'), width: 96, numeric: true, render: (row) => formatQty(row.qty) },
    { key: 'value', header: t('reports.salesValue'), width: 116, numeric: true, render: (row) => formatMoney(row.value) },
    { key: 'sharePercent', header: t('reports.share'), width: 80, numeric: true, render: (row) => `${row.sharePercent}%` },
  ];

  return (
    <ReportScaffold
      title={t('reports.categorySales')}
      onBack={() => navigation.goBack()}
      reportPath="category-sales"
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
            <SectionHeader title={t('reports.shareOfSales')} />
            <Card>
              {/* Bars are drawn against the period total, not the biggest
                  category — so the widest bar reads as "this much of
                  everything", which is the question a share chart answers. */}
              <BarList
                emptyText={t('reports.emptySales')}
                max={data.totalValue}
                data={data.rows.map((row) => ({
                  key: row.categoryId,
                  label: row.name,
                  value: row.value,
                  caption: t('reports.shareCaption', { percent: row.sharePercent, qty: formatQty(row.qty) }),
                }))}
              />
            </Card>
          </View>

          <View>
            <SectionHeader title={t('reports.everyCategory')} />
            <DataTable
              columns={columns}
              rows={data.rows}
              keyExtractor={(row) => row.categoryId}
              emptyText={t('reports.emptySales')}
              totals={{
                name: t('reports.total'),
                value: formatMoney(data.totalValue),
                sharePercent: data.totalValue > 0 ? '100%' : '—',
              }}
            />
          </View>
        </>
      ) : null}
    </ReportScaffold>
  );
}
