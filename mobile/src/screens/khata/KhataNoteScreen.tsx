import { useCallback, useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { FilePlus2, IndianRupee, ShieldAlert } from 'lucide-react-native';
import { AppHeader } from '../../components/AppHeader';
import { Banner } from '../../components/Banner';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { EmptyState } from '../../components/EmptyState';
import { Screen } from '../../components/Screen';
import { SegmentedControl } from '../../components/SegmentedControl';
import { TextField } from '../../components/TextField';
import { Toast } from '../../components/Toast';
import { ledgerApi } from '../../api/ledger';
import type { KhataStatement, NoteType, RecordNoteResult } from '../../api/types';
import { useApiError, type ReadableError } from '../../hooks/useApiError';
import { useAuthStore } from '../../store/authStore';
import { ICON_STROKE, colors, spacing, type } from '../../theme';
import type { CustomersStackParamList } from '../../navigation/types';
import { formatRupees, useBalanceCopy } from './khataFormat';

type Props = NativeStackScreenProps<CustomersStackParamList, 'KhataNote'>;

/**
 * Raising a debit or credit note — ADMIN only.
 *
 * This is the one entry that moves a balance with no bill and no receipt
 * behind it, which is exactly why the reason is mandatory and why the screen
 * spells out, in rupees, which way the balance is about to move before the
 * button is pressed. An owner should never have to work out the direction from
 * the words "debit" and "credit".
 */
export function KhataNoteScreen({ navigation, route }: Props) {
  const { t } = useTranslation();
  const readError = useApiError();
  const balanceCopy = useBalanceCopy();
  const isAdmin = useAuthStore((s) => s.user?.role === 'ADMIN');

  const { customerId, customerName } = route.params;

  const [statement, setStatement] = useState<KhataStatement | null>(null);
  const [noteType, setNoteType] = useState<NoteType>('CREDIT');
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');

  const [submitting, setSubmitting] = useState(false);
  const [failure, setFailure] = useState<ReadableError | null>(null);
  const [errors, setErrors] = useState<{ amount?: string; reason?: string }>({});
  const [result, setResult] = useState<RecordNoteResult | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    if (!isAdmin) return undefined;
    let cancelled = false;
    (async () => {
      try {
        const fetched = await ledgerApi.statement(customerId, { pageSize: 1 });
        if (!cancelled) setStatement(fetched);
      } catch {
        // Context only.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [customerId, isAdmin]);

  const dismissToast = useCallback(() => setToast(null), []);

  // A staff session's navigator has no route here at all, so this is the
  // belt to the navigator's braces — and the server refuses regardless.
  if (!isAdmin) {
    return (
      <View style={styles.root}>
        <AppHeader title={t('khata.noteTitle')} onBack={() => navigation.goBack()} />
        <Screen scroll={false} contentStyle={styles.center}>
          <EmptyState
            icon={<ShieldAlert size={28} color={colors.warning} strokeWidth={ICON_STROKE} />}
            tone="warning"
            title={t('khata.ownerOnlyTitle')}
            body={t('khata.ownerOnlyNote')}
          />
        </Screen>
      </View>
    );
  }

  const parsedAmount = Number(amount);
  const previewAmount = !Number.isNaN(parsedAmount) && parsedAmount > 0 ? parsedAmount : 0;
  const name = statement?.customer.name ?? customerName ?? '';

  async function submit() {
    setFailure(null);

    const nextErrors: { amount?: string; reason?: string } = {};
    if (!amount.trim() || Number.isNaN(parsedAmount) || parsedAmount <= 0) {
      nextErrors.amount = t('khata.errorAmountPositive');
    }
    if (reason.trim().length < 3) nextErrors.reason = t('khata.reasonRequired');
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    setSubmitting(true);
    try {
      const recorded = await ledgerApi.recordNote({
        customerId,
        type: noteType,
        amount: parsedAmount,
        reason: reason.trim(),
      });
      setResult(recorded);
      setToast(t('khata.noteDone', { number: recorded.noteNumber }));
    } catch (error) {
      setFailure(readError(error));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <View style={styles.root}>
      <AppHeader
        title={t('khata.noteTitle')}
        subtitle={name || undefined}
        onBack={() => navigation.goBack()}
      />

      <Screen>
        {failure ? (
          <Banner tone={failure.isOffline ? 'offline' : 'error'} title={failure.title} body={failure.body} />
        ) : null}

        {result ? (
          <>
            <Banner
              tone="success"
              title={t('khata.noteDone', { number: result.noteNumber })}
              body={result.reason}
            />
            <Card tone={result.balanceAfter > 0 ? 'danger' : 'success'}>
              <Text style={styles.resultLabel}>{t('khata.outstandingLabel')}</Text>
              <Text style={styles.resultValue}>{balanceCopy(result.balanceAfter)}</Text>
            </Card>
            <Button label={t('common.close')} onPress={() => navigation.goBack()} variant="outline" />
          </>
        ) : (
          <>
            <Card>
              <SegmentedControl<NoteType>
                label={t('khata.noteTypeLabel')}
                value={noteType}
                onChange={setNoteType}
                options={[
                  { value: 'CREDIT', label: t('khata.noteTypeCREDIT') },
                  { value: 'DEBIT', label: t('khata.noteTypeDEBIT') },
                ]}
              />

              {/* Says which way the balance moves, in rupees, before anyone
                  commits — "debit" and "credit" are the wrong words to make
                  someone reason from at speed. */}
              <Text style={styles.directionHint}>
                {noteType === 'DEBIT'
                  ? t('khata.noteTypeDebitHint', { amount: formatRupees(previewAmount) })
                  : t('khata.noteTypeCreditHint', { amount: formatRupees(previewAmount) })}
              </Text>

              <View style={styles.spacer} />

              <TextField
                label={t('khata.amountLabel')}
                value={amount}
                onChangeText={(next) => {
                  setAmount(next.replace(/[^0-9.]/g, ''));
                  setErrors((prev) => ({ ...prev, amount: undefined }));
                }}
                placeholder={t('khata.amountPlaceholder')}
                keyboardType="decimal-pad"
                error={errors.amount}
                leftIcon={<IndianRupee size={18} color={colors.muted} strokeWidth={ICON_STROKE} />}
              />

              <View style={styles.spacer} />

              <TextField
                label={t('khata.reasonLabel')}
                value={reason}
                onChangeText={(next) => {
                  setReason(next);
                  setErrors((prev) => ({ ...prev, reason: undefined }));
                }}
                placeholder={t('khata.reasonPlaceholder')}
                error={errors.reason}
                maxLength={300}
                multiline
              />
            </Card>

            <Button
              label={t('khata.submitNote')}
              onPress={() => void submit()}
              variant="accent"
              loading={submitting}
              icon={<FilePlus2 size={18} color={colors.onAccent} strokeWidth={ICON_STROKE} />}
            />
          </>
        )}
      </Screen>

      <Toast message={toast} onHide={dismissToast} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  center: { flex: 1, justifyContent: 'center' },
  spacer: { height: spacing.lg },
  directionHint: { ...type.small, color: colors.muted, marginTop: spacing.md },
  resultLabel: { ...type.label, color: colors.muted, textTransform: 'uppercase' },
  resultValue: { ...type.kpi, color: colors.text, marginTop: spacing.xs },
});
