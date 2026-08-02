import { useCallback, useState } from 'react';
import { View } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Card, SectionHeader } from '../../components/Card';
import { DataTable, type DataColumn } from '../../components/DataTable';
import { BarList } from '../../components/charts/BarList';
import { reportsApi } from '../../api/reports';
import type { CollectionRow, PaymentMode } from '../../api/types';
import { useReportData } from '../../hooks/useReportData';
import { formatMoney, formatRupees } from '../../utils/money';
import { rangeForPreset, type DateRange } from '../../utils/reportRange';
import type { ReportsStackParamList } from '../../navigation/types';
import { ReportScaffold, type SummaryFigure } from './ReportScaffold';

type Props = NativeStackScreenProps<ReportsStackParamList, 'PaymentCollectionReport'>;

const MODE_KEY: Record<PaymentMode, string> = {
  CASH: 'billing.paymentCash',
  UPI: 'billing.paymentUpi',
  BANK: 'billing.paymentBank',
  CHEQUE: 'billing.paymentCheque',
  CARD: 'billing.paymentCard',
  CREDIT: 'billing.paymentCredit',
};

/**
 * What actually came in, split by how it was paid.
 *
 * Two sections rather than one total: money taken on the bill at the counter,
 * and standalone khata receipts against earlier bills. The second is empty
 * until the payments module is built, which the screen says plainly rather
 * than showing a bare zero that reads like "nobody paid".
 */
export function PaymentCollectionReportScreen({ navigation }: Props) {
  const { t } = useTranslation();
  const [range, setRange] = useState<DateRange>(() => rangeForPreset('THIS_MONTH'));

  const fetcher = useCallback(
    () => reportsApi.paymentCollection({ from: range.from, to: range.to }),
    [range.from, range.to],
  );
  const { data, loading, refreshing, failure, reload } = useReportData(fetcher);

  const summary: SummaryFigure[] = data
    ? [
        { key: 'counter', label: t('reports.collectedAtCounter'), value: formatRupees(data.billCollectionTotal) },
        { key: 'receipts', label: t('reports.khataReceipts'), value: formatRupees(data.receiptsTotal) },
        { key: 'total', label: t('reports.totalCollected'), value: formatRupees(data.grandTotal), tone: 'success' },
        {
          key: 'credit',
          label: t('reports.givenOnCredit'),
          value: formatRupees(data.creditGiven),
          tone: data.creditGiven > 0 ? 'warning' : 'default',
        },
      ]
    : [];

  const columns = (countHeader: string): DataColumn<CollectionRow>[] => [
    { key: 'mode', header: t('billing.paymentMode'), width: 150, render: (row) => t(MODE_KEY[row.mode] ?? row.mode) },
    { key: 'count', header: countHeader, width: 92, numeric: true, render: (row) => String(row.count) },
    { key: 'amount', header: t('reports.amount'), width: 130, numeric: true, render: (row) => formatMoney(row.amount) },
  ];

  return (
    <ReportScaffold
      title={t('reports.paymentCollection')}
      onBack={() => navigation.goBack()}
      reportPath="payment-collection"
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
            <SectionHeader title={t('reports.byMode')} />
            <Card>
              <BarList
                emptyText={t('reports.emptyCollection')}
                data={data.billCollection.map((row) => ({
                  key: row.mode,
                  label: t(MODE_KEY[row.mode] ?? row.mode),
                  value: row.amount,
                  caption: t('reports.acrossBills', { count: row.count }),
                }))}
              />
            </Card>
          </View>

          <View>
            <SectionHeader title={t('reports.collectedAtCounter')} />
            <DataTable
              columns={columns(t('reports.bills'))}
              rows={data.billCollection}
              keyExtractor={(row) => row.mode}
              emptyText={t('reports.emptyCollection')}
              totals={{ mode: t('reports.total'), amount: formatMoney(data.billCollectionTotal) }}
            />
          </View>

          <View>
            <SectionHeader title={t('reports.khataReceipts')} />
            <DataTable
              columns={columns(t('reports.receipts'))}
              rows={data.receipts}
              keyExtractor={(row) => row.mode}
              emptyText={t('reports.receiptsPending')}
              totals={
                data.receipts.length > 0
                  ? { mode: t('reports.total'), amount: formatMoney(data.receiptsTotal) }
                  : undefined
              }
            />
          </View>
        </>
      ) : null}
    </ReportScaffold>
  );
}
