import { useCallback, useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { ArrowDownToLine } from 'lucide-react-native';
import { AppHeader } from '../../components/AppHeader';
import { Banner } from '../../components/Banner';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { Chip } from '../../components/Chip';
import { Screen } from '../../components/Screen';
import { TextField } from '../../components/TextField';
import { Toast } from '../../components/Toast';
import { productsApi } from '../../api/products';
import { stockApi } from '../../api/stock';
import type { Product } from '../../api/types';
import { useApiError, type ReadableError } from '../../hooks/useApiError';
import { useAuthStore } from '../../store/authStore';
import { ICON_STROKE, colors, spacing, type } from '../../theme';
import type { StockStackParamList } from '../../navigation/types';
import { QtyInput } from './QtyInput';
import { SelectedProductCard } from './SelectedProductCard';
import { StockProductPicker } from './StockProductPicker';
import { useStockFormat } from './stockFormat';

type Props = NativeStackScreenProps<StockStackParamList, 'StockIn'>;

/** Quick-picks cover the everyday cases; the field stays editable for the rest. */
const REASON_KEYS = ['stock.reasonPurchase', 'stock.reasonSupplier', 'stock.reasonTransfer', 'stock.reasonCorrection'];

export function StockInScreen({ navigation, route }: Props) {
  const { t } = useTranslation();
  const readError = useApiError();
  const { formatStock } = useStockFormat();
  const isAdmin = useAuthStore((s) => s.user?.role === 'ADMIN');

  const [product, setProduct] = useState<Product | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [qty, setQty] = useState('');
  const [reason, setReason] = useState('');
  const [supplierRef, setSupplierRef] = useState('');
  const [rate, setRate] = useState('');

  const [submitting, setSubmitting] = useState(false);
  const [failure, setFailure] = useState<ReadableError | null>(null);
  const [fieldError, setFieldError] = useState<{ qty?: string; reason?: string }>({});
  const [result, setResult] = useState<{ name: string; balance: string; added: string } | null>(null);
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

  // Changing product changes what a valid quantity even looks like.
  function handleSelect(next: Product) {
    setProduct(next);
    setQty('');
    setFieldError({});
  }

  const dismissToast = useCallback(() => setToast(null), []);

  async function submit() {
    setFailure(null);
    setResult(null);

    const parsedQty = Number(qty);
    const errors: { qty?: string; reason?: string } = {};
    if (!product) errors.qty = t('stock.errorNoProduct');
    if (!qty.trim() || Number.isNaN(parsedQty) || parsedQty <= 0) errors.qty = t('stock.errorQtyPositive');
    if (!reason.trim()) errors.reason = t('stock.errorReasonRequired');
    setFieldError(errors);
    if (!product || Object.keys(errors).length > 0) return;

    setSubmitting(true);
    try {
      const entry = await stockApi.in({
        productId: product.id,
        qty: parsedQty,
        reason: reason.trim(),
        ...(supplierRef.trim() ? { supplierRef: supplierRef.trim() } : {}),
        // Landed cost is ADMIN-only; the server drops it for anyone else, so
        // the field is not even offered to STAFF.
        ...(isAdmin && rate.trim() && !Number.isNaN(Number(rate)) ? { rate: Number(rate) } : {}),
      });

      setResult({
        name: entry.productName,
        balance: formatStock(entry.balanceAfter, entry.unit),
        added: formatStock(entry.qty, entry.unit),
      });
      setToast(t('stock.stockInDone', { qty: formatStock(entry.qty, entry.unit) }));

      // Keep the product selected — a delivery is often entered as several
      // lines for the same bolt — but clear what must not be repeated by accident.
      setProduct({ ...product, currentStock: entry.balanceAfter });
      setQty('');
      setReason('');
      setSupplierRef('');
      setRate('');
    } catch (error) {
      setFailure(readError(error));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <View style={styles.root}>
      <AppHeader title={t('stock.stockInTitle')} onBack={() => navigation.goBack()} />

      <Screen>
        {result ? (
          <Banner
            tone="success"
            title={t('stock.newBalanceTitle', { name: result.name })}
            body={t('stock.newBalanceBody', { added: result.added, balance: result.balance })}
          />
        ) : null}

        {failure ? (
          <Banner tone={failure.isOffline ? 'offline' : 'error'} title={failure.title} body={failure.body} />
        ) : null}

        <SelectedProductCard product={product} onPick={() => setPickerOpen(true)} />

        {product ? (
          <Card>
            <QtyInput
              label={t('stock.qtyIn')}
              unit={product.unit}
              value={qty}
              onChange={(next) => {
                setQty(next);
                setFieldError((prev) => ({ ...prev, qty: undefined }));
              }}
              error={fieldError.qty}
              hint={product.unit === 'METER' ? t('stock.qtyHintMeter') : t('stock.qtyHintPiece')}
            />

            <View style={styles.spacer} />

            <Text style={styles.fieldLabel}>{t('stock.reason')}</Text>
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
              placeholder={t('stock.reasonPlaceholder')}
              error={fieldError.reason}
              maxLength={200}
              containerStyle={styles.reasonField}
            />

            <View style={styles.spacer} />

            <TextField
              label={t('stock.supplierRef')}
              value={supplierRef}
              onChangeText={setSupplierRef}
              placeholder={t('stock.supplierRefPlaceholder')}
              maxLength={100}
              autoCapitalize="characters"
            />

            {/* Purchase rate is cost data — offered to the owner only. */}
            {isAdmin ? (
              <>
                <View style={styles.spacer} />
                <TextField
                  label={t('stock.purchaseRate')}
                  value={rate}
                  onChangeText={(next) => setRate(next.replace(/[^0-9.]/g, ''))}
                  placeholder={t('stock.purchaseRatePlaceholder')}
                  keyboardType="decimal-pad"
                  hint={t('stock.purchaseRateHint')}
                />
              </>
            ) : null}
          </Card>
        ) : null}

        <Button
          label={t('stock.recordStockIn')}
          onPress={() => void submit()}
          variant="accent"
          loading={submitting}
          disabled={!product}
          icon={<ArrowDownToLine size={18} color={colors.onAccent} strokeWidth={ICON_STROKE} />}
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
