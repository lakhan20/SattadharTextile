import { useCallback } from 'react';
import { View } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Card, SectionHeader } from '../../components/Card';
import { DataTable, type DataColumn } from '../../components/DataTable';
import { SegmentedBar } from '../../components/charts/BarList';
import { reportsApi } from '../../api/reports';
import type { AgeingCustomer } from '../../api/types';
import { useReportData } from '../../hooks/useReportData';
import { chart } from '../../theme';
import { formatMoney, formatRupees } from '../../utils/money';
import type { ReportsStackParamList } from '../../navigation/types';
import { ReportScaffold, type SummaryFigure } from './ReportScaffold';

type Props = NativeStackScreenProps<ReportsStackParamList, 'AgeingReport'>;

/**
 * How long the money has been owed.
 *
 * The three buckets use the verified `chart.ageing` ramp rather than the UI's
 * warning/danger tones, which sit too close together for a colourblind reader
 * — see the note in `theme/tokens.ts`. Every segment is named and its figure
 * repeated in the legend, so the chart never depends on colour alone.
 */
export function AgeingReportScreen({ navigation }: Props) {
  const { t } = useTranslation();

  const fetcher = useCallback(() => reportsApi.ageing(), []);
  const { data, loading, refreshing, failure, reload } = useReportData(fetcher);

  const summary: SummaryFigure[] = data
    ? [
        { key: 'b0', label: t('reports.bucket0'), value: formatRupees(data.buckets.bucket0to30) },
        { key: 'b31', label: t('reports.bucket31'), value: formatRupees(data.buckets.bucket31to60), tone: 'warning' },
        { key: 'b60', label: t('reports.bucket60'), value: formatRupees(data.buckets.bucket60Plus), tone: 'danger' },
        { key: 'total', label: t('reports.totalAged'), value: formatRupees(data.buckets.total) },
      ]
    : [];

  const columns: DataColumn<AgeingCustomer>[] = [
    { key: 'name', header: t('reports.customer'), width: 150, render: (row) => row.name },
    { key: 'phone', header: t('billing.walkInPhone'), width: 118, render: (row) => row.phone },
    { key: 'bucket0to30', header: t('reports.bucket0'), width: 104, numeric: true, render: (row) => formatMoney(row.bucket0to30) },
    {
      key: 'bucket31to60',
      header: t('reports.bucket31'),
      width: 104,
      numeric: true,
      render: (row) => formatMoney(row.bucket31to60),
      tone: (row) => (row.bucket31to60 > 0 ? 'warning' : 'default'),
    },
    {
      key: 'bucket60Plus',
      header: t('reports.bucket60'),
      width: 100,
      numeric: true,
      render: (row) => formatMoney(row.bucket60Plus),
      tone: (row) => (row.bucket60Plus > 0 ? 'danger' : 'default'),
    },
    { key: 'billDue', header: t('reports.totalDue'), width: 108, numeric: true, render: (row) => formatMoney(row.billDue) },
    {
      key: 'oldestBillDays',
      header: t('reports.oldestDays'),
      width: 92,
      numeric: true,
      render: (row) => String(row.oldestBillDays),
    },
  ];

  return (
    <ReportScaffold
      title={t('reports.ageing')}
      onBack={() => navigation.goBack()}
      reportPath="ageing"
      loading={loading}
      failure={failure}
      onRefresh={reload}
      refreshing={refreshing}
      summary={summary}
      note={
        data && data.unbucketed !== 0
          ? t('reports.unbucketedNote', {
              value: formatRupees(Math.abs(data.unbucketed)),
              total: formatRupees(data.totalOutstanding),
            })
          : undefined
      }
    >
      {data ? (
        <>
          <View>
            <SectionHeader title={t('reports.howOld')} />
            <Card>
              <SegmentedBar
                emptyText={t('reports.emptyAgeing')}
                segments={[
                  { key: 'b0', label: t('reports.bucket0'), value: data.buckets.bucket0to30, colour: chart.ageing[0] },
                  { key: 'b31', label: t('reports.bucket31'), value: data.buckets.bucket31to60, colour: chart.ageing[1] },
                  { key: 'b60', label: t('reports.bucket60'), value: data.buckets.bucket60Plus, colour: chart.ageing[2] },
                ]}
              />
            </Card>
          </View>

          <View>
            <SectionHeader title={t('reports.byCustomer')} />
            <DataTable
              columns={columns}
              rows={data.customers}
              keyExtractor={(row) => row.customerId}
              emptyText={t('reports.emptyAgeing')}
              totals={{
                name: t('reports.total'),
                bucket0to30: formatMoney(data.buckets.bucket0to30),
                bucket31to60: formatMoney(data.buckets.bucket31to60),
                bucket60Plus: formatMoney(data.buckets.bucket60Plus),
                billDue: formatMoney(data.buckets.total),
              }}
            />
          </View>
        </>
      ) : null}
    </ReportScaffold>
  );
}
