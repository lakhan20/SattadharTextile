import { useCallback, useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { SlidersHorizontal } from 'lucide-react-native';
import { AppHeader } from '../../components/AppHeader';
import { Banner } from '../../components/Banner';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { Chip } from '../../components/Chip';
import { Screen } from '../../components/Screen';
import { SegmentedControl } from '../../components/SegmentedControl';
import { TextField } from '../../components/TextField';
import { Toast } from '../../components/Toast';
import { productsApi } from '../../api/products';
import { stockApi } from '../../api/stock';
import type { Product } from '../../api/types';
import { useApiError, type ReadableError } from '../../hooks/useApiError';
import { ICON_STROKE, colors, spacing, type } from '../../theme';
import type { StockStackParamList } from '../../navigation/types';
import { QtyInput } from './QtyInput';
import { SelectedProductCard } from './SelectedProductCard';
import { StockProductPicker } from './StockProductPicker';
import { useStockFormat } from './stockFormat';

type Props = NativeStackScreenProps<StockStackParamList, 'StockAdjust'>;

type Direction = 'remove' | 'add';

/**
 * The four reasons a count actually moves in a fabric shop. They are quick
 * picks, not a fixed list — the field underneath stays free text, because the
 * reason is what makes an adjustment auditable later.
 */
const REASON_KEYS = ['stock.reasonDamage', 'stock.reasonReturn', 'stock.reasonWastage', 'stock.reasonCountFix'];

export function StockAdjustScreen({ navigation, route }: Props) {
  const { t } = useTranslation();
  const readError = useApiError();
  const { formatStock, formatSigned } = useStockFormat();

  const [product, setProduct] = useState<Product | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [direction, setDirection] = useState<Direction>('remove');
  const [qty, setQty] = useState('');
  const [reason, setReason] = useState('');

  const [submitting, setSubmitting] = useState(false);
  const [failure, setFailure] = useState<ReadableError | null>(null);
  const [fieldError, setFieldError] = useState<{ qty?: string; reason?: string }>({});
  const [result, setResult] = useState<{ name: string; balance: string; change: string } | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const preselectedId = route.params?.productId;

  useEffect(() => {
    if (!preselectedId) return;
    (async () => {
      try {
        setProduct(await productsApi.get(preselectedId));
      } catch {
        // Falling back to the picker is better than blocking the screen.
      }
    })();
  }, [preselectedId]);

  function handleSelect(next: Product) {
    setProduct(next);
    setQty('');
    setFieldError({});
  }

  const dismissToast = useCallback(() => setToast(null), []);

  async function submit() {
    setFailure(null);
    setResult(null);

    const magnitude = Number(qty);
    const errors: { qty?: string; reason?: string } = {};
    if (!qty.trim() || Number.isNaN(magnitude) || magnitude <= 0) errors.qty = t('stock.errorQtyPositive');
    if (!reason.trim()) errors.reason = t('stock.errorReasonRequired');
    setFieldError(errors);
    if (!product || Object.keys(errors).length > 0) return;

    // The direction control is what makes the value signed — the API takes one
    // signed number, so a "remove" is simply a negative adjustment.
    const signedQty = direction === 'remove' ? -magnitude : magnitude;

    setSubmitting(true);
    try {
      const entry = await stockApi.adjust({ productId: product.id, qty: signedQty, reason: reason.trim() });

      setResult({
        name: entry.productName,
        balance: formatStock(entry.balanceAfter, entry.unit),
        change: formatSigned(entry.qty, entry.unit),
      });
      setToast(t('stock.adjustDone', { qty: formatSigned(entry.qty, entry.unit) }));

      setProduct({ ...product, currentStock: entry.balanceAfter });
      setQty('');
      setReason('');
    } catch (error) {
      setFailure(readError(error));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <View style={styles.root}>
      <AppHeader title={t('stock.adjustTitle')} onBack={() => navigation.goBack()} />

      <Screen>
        {result ? (
          <Banner
            tone="success"
            title={t('stock.newBalanceTitle', { name: result.name })}
            body={t('stock.adjustedBody', { change: result.change, balance: result.balance })}
          />
        ) : null}

        {failure ? (
          <Banner tone={failure.isOffline ? 'offline' : 'error'} title={failure.title} body={failure.body} />
        ) : null}

        <SelectedProductCard product={product} onPick={() => setPickerOpen(true)} />

        {product ? (
          <Card>
            <SegmentedControl<Direction>
              label={t('stock.direction')}
              value={direction}
              options={[
                { value: 'remove', label: t('stock.directionRemove') },
                { value: 'add', label: t('stock.directionAdd') },
              ]}
              onChange={setDirection}
            />

            <View style={styles.spacer} />

            <QtyInput
              label={t('stock.qtyAdjust')}
              unit={product.unit}
              value={qty}
              onChange={(next) => {
                setQty(next);
                setFieldError((prev) => ({ ...prev, qty: undefined }));
              }}
              error={fieldError.qty}
              hint={
                direction === 'remove'
                  ? t('stock.qtyHintRemove', { balance: formatStock(product.currentStock, product.unit) })
                  : t('stock.qtyHintAdd')
              }
            />

            <View style={styles.spacer} />

            <Text style={styles.fieldLabel}>{t('stock.reasonRequired')}</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
              {REASON_KEYS.map((key) => (
                <Chip
                  key={key}
                  label={t(key)}
                  active={reason === t(key)}
                  onPress={() => {
                    setReason(t(key));
                    setFieldError((prev) => ({ ...prev, reason: undefined }));
                  }}
                />
              ))}
            </ScrollView>

            <TextField
              label=""
              value={reason}
              onChangeText={(next) => {
                setReason(next);
                setFieldError((prev) => ({ ...prev, reason: undefined }));
              }}
              placeholder={t('stock.reasonAdjustPlaceholder')}
              error={fieldError.reason}
              maxLength={200}
              containerStyle={styles.reasonField}
            />
          </Card>
        ) : null}

        <Button
          label={t('stock.recordAdjustment')}
          onPress={() => void submit()}
          variant="accent"
          loading={submitting}
          disabled={!product}
          icon={<SlidersHorizontal size={18} color={colors.onAccent} strokeWidth={ICON_STROKE} />}
        />
      </Screen>

      <StockProductPicker visible={pickerOpen} onClose={() => setPickerOpen(false)} onSelect={handleSelect} />
      <Toast message={toast} onHide={dismissToast} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  spacer: { height: spacing.lg },
  fieldLabel: { ...type.smallStrong, color: colors.text, marginBottom: spacing.xs + 2 },
  chipRow: { gap: spacing.sm, paddingBottom: spacing.sm },
  reasonField: { marginTop: spacing.xs },
});
