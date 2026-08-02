import { useCallback } from 'react';
import { View } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { SectionHeader } from '../../components/Card';
import { DataTable, type DataColumn } from '../../components/DataTable';
import { reportsApi } from '../../api/reports';
import type { OutstandingCustomer } from '../../api/types';
import { useReportData } from '../../hooks/useReportData';
import { formatMoney, formatRupees } from '../../utils/money';
import { formatDateKey } from '../../utils/reportRange';
import type { ReportsStackParamList } from '../../navigation/types';
import { ReportScaffold, type SummaryFigure } from './ReportScaffold';

type Props = NativeStackScreenProps<ReportsStackParamList, 'OutstandingReport'>;

/** Who owes the shop money right now. A snapshot, so no date range. */
export function OutstandingReportScreen({ navigation }: Props) {
  const { t } = useTranslation();

  const fetcher = useCallback(() => reportsApi.outstanding(), []);
  const { data, loading, refreshing, failure, reload } = useReportData(fetcher);

  const summary: SummaryFigure[] = data
    ? [
        {
          key: 'total',
          label: t('reports.totalOutstanding'),
          value: formatRupees(data.totalOutstanding),
          tone: data.totalOutstanding > 0 ? 'danger' : 'success',
        },
        { key: 'customers', label: t('reports.customersOwing'), value: String(data.customerCount) },
        {
          key: 'overLimit',
          label: t('reports.overLimit'),
          value: String(data.overLimitCount),
          tone: data.overLimitCount > 0 ? 'warning' : 'default',
        },
      ]
    : [];

  const columns: DataColumn<OutstandingCustomer>[] = [
    { key: 'name', header: t('reports.customer'), width: 150, render: (row) => row.name },
    { key: 'phone', header: t('billing.walkInPhone'), width: 118, render: (row) => row.phone },
    {
      key: 'unpaidBillCount',
      header: t('reports.unpaidBills'),
      width: 84,
      numeric: true,
      render: (row) => String(row.unpaidBillCount),
    },
    {
      key: 'lastBillDate',
      header: t('reports.lastBill'),
      width: 96,
      render: (row) => (row.lastBillDate ? formatDateKey(row.lastBillDate.slice(0, 10)) : '—'),
    },
    { key: 'creditLimit', header: t('reports.creditLimit'), width: 104, numeric: true, render: (row) => formatMoney(row.creditLimit) },
    {
      key: 'outstanding',
      header: t('dashboard.outstanding'),
      width: 112,
      numeric: true,
      render: (row) => formatMoney(row.outstanding),
      tone: () => 'danger',
    },
    {
      key: 'overLimitBy',
      header: t('reports.overLimitBy'),
      width: 104,
      numeric: true,
      render: (row) => (row.overLimitBy > 0 ? formatMoney(row.overLimitBy) : '—'),
      tone: (row) => (row.overLimitBy > 0 ? 'warning' : 'default'),
    },
  ];

  return (
    <ReportScaffold
      title={t('reports.outstanding')}
      onBack={() => navigation.goBack()}
      reportPath="outstanding"
      loading={loading}
      failure={failure}
      onRefresh={reload}
      refreshing={refreshing}
      summary={summary}
    >
      {data ? (
        <View>
          <SectionHeader title={t('reports.highestFirst')} />
          <DataTable
            columns={columns}
            rows={data.customers}
            keyExtractor={(row) => row.customerId}
            emptyText={t('reports.emptyOutstanding')}
            totals={{ name: t('reports.total'), outstanding: formatMoney(data.totalOutstanding) }}
          />
        </View>
      ) : null}
    </ReportScaffold>
  );
}
