import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { API_PREFIX } from '../api/config';
import type { Bill } from '../api/types';
import { currentBaseUrl } from '../store/settingsStore';
import { tokenStorage } from '../store/tokenStorage';

function pdfFileName(bill: Bill): string {
  return `${bill.billNumber.replace(/\//g, '-')}.pdf`;
}

/**
 * The PDF endpoint sits behind `requireAuth` — a bare `Linking`/`WebView`
 * request would miss the Bearer token and hit the login wall, so the
 * download itself carries the header.
 */
export async function downloadBillPdf(bill: Bill): Promise<File> {
  const token = tokenStorage.getAccess();
  const url = `${currentBaseUrl()}${API_PREFIX}/bills/${bill.id}/pdf`;
  const destination = new File(Paths.cache, pdfFileName(bill));

  return File.downloadFileAsync(url, destination, {
    idempotent: true,
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  });
}

export async function shareBillPdf(bill: Bill): Promise<void> {
  const file = await downloadBillPdf(bill);
  const available = await Sharing.isAvailableAsync();
  if (!available) throw new Error('Sharing is not available on this device.');
  await Sharing.shareAsync(file.uri, { mimeType: 'application/pdf', dialogTitle: bill.billNumber });
}
