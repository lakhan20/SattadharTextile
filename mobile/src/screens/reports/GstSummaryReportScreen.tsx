import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { View } from 'react-native';
import { SectionHeader } from '../../components/Card';
import { DataTable, type DataColumn } from '../../components/DataTable';
import { reportsApi } from '../../api/reports';
import type { GstRateRow } from '../../api/types';
import { useReportData } from '../../hooks/useReportData';
import { formatMoney, formatRupees } from '../../utils/money';
import { rangeForPreset, type DateRange } from '../../utils/reportRange';
import type { ReportsStackParamList } from '../../navigation/types';
import { ReportScaffold, type SummaryFigure } from './ReportScaffold';

type Props = NativeStackScreenProps<ReportsStackParamList, 'GstSummaryReport'>;

/**
 * The figures a GST return is filed from, grouped by rate. Estimates are
 * excluded server-side and the amount excluded is shown, so the owner can see
 * why this total is smaller than the sales report's.
 */
export function GstSummaryReportScreen({ navigation }: Props) {
  const { t } = useTranslation();
  const [range, setRange] = useState<DateRange>(() => rangeForPreset('THIS_MONTH'));

  const fetcher = useCallback(() => reportsApi.gstSummary({ from: range.from, to: range.to }), [range.from, range.to]);
  const { data, loading, refreshing, failure, reload } = useReportData(fetcher);

  const summary: SummaryFigure[] = data
    ? [
        { key: 'taxable', label: t('reports.taxableValue'), value: formatRupees(data.totals.taxableValue) },
        {
          key: 'cgstSgst',
          label: t('reports.cgstSgst'),
          value: formatRupees(data.totals.cgstAmount + data.totals.sgstAmount),
        },
        { key: 'igst', label: t('billing.igst'), value: formatRupees(data.totals.igstAmount) },
        { key: 'tax', label: t('reports.taxPayable'), value: formatRupees(data.totals.totalTax), tone: 'warning' },
      ]
    : [];

  const columns: DataColumn<GstRateRow>[] = [
    { key: 'gstPercent', header: t('reports.rate'), width: 72, render: (row) => `${row.gstPercent}%` },
    { key: 'taxableValue', header: t('reports.taxableValue'), width: 116, numeric: true, render: (row) => formatMoney(row.taxableValue) },
    { key: 'cgstAmount', header: t('billing.cgst'), width: 92, numeric: true, render: (row) => formatMoney(row.cgstAmount) },
    { key: 'sgstAmount', header: t('billing.sgst'), width: 92, numeric: true, render: (row) => formatMoney(row.sgstAmount) },
    { key: 'igstAmount', header: t('billing.igst'), width: 92, numeric: true, render: (row) => formatMoney(row.igstAmount) },
    { key: 'totalTax', header: t('reports.totalTax'), width: 104, numeric: true, render: (row) => formatMoney(row.totalTax) },
  ];

  return (
    <ReportScaffold
      title={t('reports.gstSummary')}
      onBack={() => navigation.goBack()}
      reportPath="gst-summary"
      range={range}
      onRangeChange={setRange}
      loading={loading}
      failure={failure}
      onRefresh={reload}
      refreshing={refreshing}
      summary={summary}
      note={
        data && data.estimateValueExcluded > 0
          ? t('reports.estimatesExcluded', { value: formatRupees(data.estimateValueExcluded) })
          : undefined
      }
    >
      {data ? (
        <View>
          <SectionHeader title={t('reports.byRate', { count: data.gstBillCount })} />
          <DataTable
            columns={columns}
            rows={data.byRate}
            keyExtractor={(row) => String(row.gstPercent)}
            emptyText={t('reports.emptyGst')}
            totals={{
              gstPercent: t('reports.total'),
              taxableValue: formatMoney(data.totals.taxableValue),
              cgstAmount: formatMoney(data.totals.cgstAmount),
              sgstAmount: formatMoney(data.totals.sgstAmount),
              igstAmount: formatMoney(data.totals.igstAmount),
              totalTax: formatMoney(data.totals.totalTax),
            }}
          />
        </View>
      ) : null}
    </ReportScaffold>
  );
}
