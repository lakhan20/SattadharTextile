import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { API_PREFIX } from '../api/config';
import { toQuery, type ReportPath } from '../api/reports';
import { currentBaseUrl } from '../store/settingsStore';
import { tokenStorage } from '../store/tokenStorage';

export type ExportFormat = 'pdf' | 'excel';

const EXTENSION: Record<ExportFormat, string> = { pdf: 'pdf', excel: 'xlsx' };

const MIME: Record<ExportFormat, string> = {
  pdf: 'application/pdf',
  excel: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
};

/**
 * Matches the server's `exportFileName` so the file the shop opens is named
 * the same as the one on disk if they ever save it. Kept in step by hand —
 * a mismatch is cosmetic, not a failure.
 */
function fileName(report: ReportPath, format: ExportFormat, params: Record<string, string>): string {
  const range = params['from'] && params['to'] ? `_${params['from']}_${params['to']}` : `_${new Date().toISOString().slice(0, 10)}`;
  return `sattadhar-${report}${range}.${EXTENSION[format]}`;
}

/**
 * Downloads a report export and hands it to the share sheet.
 *
 * The export endpoints sit behind `requireAuth`, exactly like the invoice PDF,
 * so the Bearer token has to travel with the download — a plain
 * `Linking.openURL` would land on the login wall. Same approach as
 * `utils/billPdf.ts`; see the note there.
 */
export async function shareReportExport(
  report: ReportPath,
  format: ExportFormat,
  params: Record<string, string | number | undefined> = {},
): Promise<void> {
  const available = await Sharing.isAvailableAsync();
  if (!available) throw new Error('Sharing is not available on this device.');

  const token = tokenStorage.getAccess();
  const query = toQuery({ ...params, format });
  const search = new URLSearchParams(query).toString();
  const url = `${currentBaseUrl()}${API_PREFIX}/reports/${report}?${search}`;

  const destination = new File(Paths.cache, fileName(report, format, query));
  const downloaded = await File.downloadFileAsync(url, destination, {
    idempotent: true,
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  });

  await Sharing.shareAsync(downloaded.uri, {
    mimeType: MIME[format],
    dialogTitle: destination.name,
    UTI: format === 'pdf' ? 'com.adobe.pdf' : 'org.openxmlformats.spreadsheetml.sheet',
  });
}
