import { useState, type ReactNode } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { FileSpreadsheet, FileText } from 'lucide-react-native';
import { AppHeader } from '../../components/AppHeader';
import { Banner } from '../../components/Banner';
import { Button } from '../../components/Button';
import { Screen } from '../../components/Screen';
import type { ReportPath } from '../../api/reports';
import { useApiError, type ReadableError } from '../../hooks/useApiError';
import { useResponsive } from '../../hooks/useResponsive';
import { shareReportExport, type ExportFormat } from '../../utils/reportExport';
import { ICON_STROKE, colors, radius, shadow, spacing, tabularNumbers, type } from '../../theme';
import { RangeBar } from '../../components/RangeBar';
import type { DateRange } from '../../utils/reportRange';

export interface SummaryFigure {
  key: string;
  label: string;
  value: string;
  tone?: 'default' | 'danger' | 'warning' | 'success';
}

interface ReportScaffoldProps {
  title: string;
  onBack: () => void;
  /** Which endpoint the export buttons hit. */
  reportPath: ReportPath;
  /** Omit for "as of now" reports (valuation, outstanding, ageing). */
  range?: DateRange;
  onRangeChange?: (range: DateRange) => void;
  /** Extra query params the export must repeat, e.g. the sales mode filter. */
  exportParams?: Record<string, string | number | undefined>;
  loading: boolean;
  failure: ReadableError | null;
  onRefresh: () => void;
  refreshing?: boolean;
  summary?: SummaryFigure[];
  /** Caveat shown above the content, e.g. why a section is empty. */
  note?: string;
  children: ReactNode;
}

const TONE = {
  default: colors.text,
  danger: colors.dangerInk,
  warning: colors.warningInk,
  success: colors.successInk,
} as const;

/**
 * The frame every report screen shares: header, range picker, headline
 * figures, the report's own content, and the two export actions.
 *
 * Exports live at the bottom rather than the top on purpose — they are the
 * thing you reach for *after* reading, and putting them under the content
 * keeps the first screenful about the numbers.
 */
export function ReportScaffold({
  title,
  onBack,
  reportPath,
  range,
  onRangeChange,
  exportParams,
  loading,
  failure,
  onRefresh,
  refreshing = false,
  summary,
  note,
  children,
}: ReportScaffoldProps) {
  const { t } = useTranslation();
  const readError = useApiError();
  const [exporting, setExporting] = useState<ExportFormat | null>(null);
  const [exportError, setExportError] = useState<ReadableError | null>(null);

  async function runExport(format: ExportFormat): Promise<void> {
    setExporting(format);
    setExportError(null);
    try {
      await shareReportExport(reportPath, format, { ...range, ...exportParams });
    } catch (error) {
      setExportError(readError(error));
    } finally {
      setExporting(null);
    }
  }

  return (
    <View style={styles.root}>
      <AppHeader title={title} onBack={onBack} />

      <Screen onRefresh={onRefresh} refreshing={refreshing}>
        {range && onRangeChange ? <RangeBar value={range} onChange={onRangeChange} /> : null}

        {failure ? (
          <>
            <Banner tone={failure.isOffline ? 'offline' : 'error'} title={failure.title} body={failure.body} />
            <Button label={t('common.retry')} onPress={onRefresh} variant="outline" />
          </>
        ) : null}

        {loading ? (
          <ActivityIndicator style={styles.spinner} color={colors.primary} />
        ) : failure ? null : (
          <>
            {summary && summary.length > 0 ? <SummaryStrip figures={summary} /> : null}
            {note ? <Banner tone="info" title={note} /> : null}

            {children}

            <View style={styles.exportBlock}>
              <Text style={styles.exportLabel}>{t('reports.exportTitle')}</Text>
              <View style={styles.exportRow}>
                <Button
                  label={t('reports.exportPdf')}
                  onPress={() => void runExport('pdf')}
                  variant="outline"
                  loading={exporting === 'pdf'}
                  disabled={exporting !== null}
                  fullWidth={false}
                  style={styles.exportButton}
                  icon={<FileText size={17} color={colors.primary} strokeWidth={ICON_STROKE} />}
                />
                <Button
                  label={t('reports.exportExcel')}
                  onPress={() => void runExport('excel')}
                  variant="outline"
                  loading={exporting === 'excel'}
                  disabled={exporting !== null}
                  fullWidth={false}
                  style={styles.exportButton}
                  icon={<FileSpreadsheet size={17} color={colors.primary} strokeWidth={ICON_STROKE} />}
                />
              </View>
              {exportError ? (
                <Banner tone={exportError.isOffline ? 'offline' : 'error'} title={exportError.title} body={exportError.body} />
              ) : null}
            </View>
          </>
        )}
      </Screen>
    </View>
  );
}

/**
 * The headline figures. Laid out on a computed column count rather than a
 * fixed two-up, so a tablet or a landscape phone uses the width it has —
 * the same approach the dashboard KPI grid takes.
 */
function SummaryStrip({ figures }: { figures: SummaryFigure[] }) {
  const { width } = useResponsive();
  const contentWidth = width - spacing.lg * 2;
  const gap = spacing.md;
  const fits = Math.floor((contentWidth + gap) / (150 + gap));
  const columns = Math.min(4, Math.max(2, fits));
  const tileWidth = (contentWidth - gap * (columns - 1)) / columns;

  return (
    <View style={styles.summaryGrid}>
      {figures.map((figure) => (
        <View key={figure.key} style={[styles.summaryTile, { width: tileWidth }]}>
          <Text style={styles.summaryLabel} numberOfLines={2}>
            {figure.label}
          </Text>
          <Text
            style={[styles.summaryValue, { color: TONE[figure.tone ?? 'default'] }]}
            numberOfLines={1}
            adjustsFontSizeToFit
          >
            {figure.value}
          </Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  spinner: { marginTop: spacing.xxxl },

  summaryGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  summaryTile: {
    flexGrow: 1,
    minWidth: 0,
    backgroundColor: colors.surface,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    ...shadow.card,
  },
  summaryLabel: { ...type.caption, color: colors.muted, textTransform: 'uppercase' },
  summaryValue: { ...type.kpiSmall, marginTop: spacing.xs, ...tabularNumbers },

  exportBlock: { gap: spacing.sm, marginTop: spacing.sm },
  exportLabel: { ...type.label, color: colors.muted, textTransform: 'uppercase' },
  exportRow: { flexDirection: 'row', gap: spacing.sm },
  exportButton: { flexGrow: 1, flexBasis: 0 },
});
