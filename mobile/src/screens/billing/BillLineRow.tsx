import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { History, Minus, Plus, Trash2 } from 'lucide-react-native';
import { Card } from '../../components/Card';
import { productsApi } from '../../api/products';
import type { DiscountType, LastPriceResponse } from '../../api/types';
import { ICON_STROKE, TAP_TARGET, colors, control, radius, spacing, tabularNumbers, type } from '../../theme';
import { previewLine, type DraftLine } from '../../utils/billCalc';
import { formatMoney, formatQty } from '../../utils/money';

export interface BillLine extends DraftLine {
  /** Stable across re-orders; the same product may appear on two lines. */
  key: string;
  /** Kept as strings so a half-typed "3." does not snap back mid-edit. */
  qtyText: string;
  rateText: string;
  discountText: string;
  /** Both rates travel with the line so a customer change can re-price it. */
  retailRate: number;
  wholesaleRate: number;
  /** Once the shopkeeper types a rate, a customer change must not overwrite it. */
  rateEdited: boolean;
}

interface BillLineRowProps {
  line: BillLine;
  customerId: string | null;
  onChange: (patch: Partial<BillLine>) => void;
  onRemove: () => void;
  disabled?: boolean;
}

type LastPriceState =
  | { status: 'hidden' }
  | { status: 'loading' }
  | { status: 'none' }
  | { status: 'noCustomer' }
  | { status: 'found'; value: LastPriceResponse };

export function BillLineRow({ line, customerId, onChange, onRemove, disabled = false }: BillLineRowProps) {
  const { t } = useTranslation();
  const [lastPrice, setLastPrice] = useState<LastPriceState>({ status: 'hidden' });

  const totals = previewLine(line);
  const isPiece = line.unit === 'PIECE';

  /**
   * Deliberately on demand: the last price is never fetched or shown until
   * the shopkeeper asks for it, and the endpoint returns only the selling
   * rate — cost price and margin are never part of this response.
   */
  async function revealLastPrice() {
    if (!customerId) {
      setLastPrice({ status: 'noCustomer' });
      return;
    }
    setLastPrice({ status: 'loading' });
    try {
      const result = await productsApi.lastPrice(line.productId, customerId);
      setLastPrice(result ? { status: 'found', value: result } : { status: 'none' });
    } catch {
      setLastPrice({ status: 'none' });
    }
  }

  function stepQty(delta: number) {
    const next = Math.max(1, Math.round(line.qty) + delta);
    onChange({ qty: next, qtyText: String(next) });
  }

  function handleQtyText(text: string) {
    const cleaned = isPiece ? text.replace(/[^0-9]/g, '') : text.replace(/[^0-9.]/g, '');
    const parsed = Number(cleaned);
    onChange({
      qtyText: cleaned,
      qty: cleaned && Number.isFinite(parsed) && parsed > 0 ? parsed : 0,
    });
  }

  function handleRateText(text: string) {
    const cleaned = text.replace(/[^0-9.]/g, '');
    const parsed = Number(cleaned);
    onChange({ rateText: cleaned, rate: cleaned && Number.isFinite(parsed) ? parsed : 0 });
  }

  function handleDiscountText(text: string) {
    const cleaned = text.replace(/[^0-9.]/g, '');
    const parsed = Number(cleaned);
    onChange({ discountText: cleaned, discountValue: cleaned && Number.isFinite(parsed) ? parsed : 0 });
  }

  function toggleDiscountType() {
    const next: DiscountType = line.discountType === 'PERCENT' ? 'FLAT' : 'PERCENT';
    onChange({ discountType: next });
  }

  return (
    <Card style={styles.card}>
      <View style={styles.headerRow}>
        <Text style={styles.name} numberOfLines={2}>
          {line.productName}
        </Text>
        <Pressable
          onPress={onRemove}
          disabled={disabled}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel={t('billing.removeLine')}
          style={styles.removeButton}
        >
          <Trash2 size={18} color={colors.danger} strokeWidth={ICON_STROKE} />
        </Pressable>
      </View>

      <View style={styles.controlsRow}>
        <View style={styles.controlBlock}>
          <Text style={styles.controlLabel}>{t('billing.rate')}</Text>
          <View style={styles.inputBox}>
            <Text style={styles.affix}>₹</Text>
            <TextInput
              value={line.rateText}
              onChangeText={handleRateText}
              editable={!disabled}
              keyboardType="decimal-pad"
              style={styles.numericInput}
              accessibilityLabel={t('billing.rate')}
            />
          </View>
        </View>

        <View style={styles.controlBlock}>
          <Text style={styles.controlLabel}>{t('billing.qty')}</Text>
          {isPiece ? (
            <View style={styles.stepper}>
              <Pressable
                onPress={() => stepQty(-1)}
                disabled={disabled || line.qty <= 1}
                style={({ pressed }) => [styles.stepperButton, pressed && styles.stepperPressed]}
                accessibilityRole="button"
                accessibilityLabel="-1"
              >
                <Minus size={16} color={line.qty <= 1 ? colors.muted : colors.primary} strokeWidth={ICON_STROKE} />
              </Pressable>
              <Text style={styles.stepperValue}>{line.qty}</Text>
              <Pressable
                onPress={() => stepQty(1)}
                disabled={disabled}
                style={({ pressed }) => [styles.stepperButton, pressed && styles.stepperPressed]}
                accessibilityRole="button"
                accessibilityLabel="+1"
              >
                <Plus size={16} color={colors.primary} strokeWidth={ICON_STROKE} />
              </Pressable>
            </View>
          ) : (
            <View style={styles.inputBox}>
              <TextInput
                value={line.qtyText}
                onChangeText={handleQtyText}
                editable={!disabled}
                keyboardType="decimal-pad"
                style={styles.numericInput}
                accessibilityLabel={t('billing.qty')}
              />
              <Text style={styles.affix}>m</Text>
            </View>
          )}
        </View>
      </View>

      <View style={styles.controlsRow}>
        <View style={styles.controlBlock}>
          <Text style={styles.controlLabel}>{t('billing.lineDiscount')}</Text>
          <View style={styles.inputBox}>
            <TextInput
              value={line.discountText}
              onChangeText={handleDiscountText}
              editable={!disabled}
              keyboardType="decimal-pad"
              placeholder="0"
              placeholderTextColor={colors.muted}
              style={styles.numericInput}
              accessibilityLabel={t('billing.lineDiscount')}
            />
            <Pressable
              onPress={toggleDiscountType}
              disabled={disabled}
              hitSlop={8}
              style={styles.discountToggle}
              accessibilityRole="button"
              accessibilityLabel={line.discountType === 'PERCENT' ? '%' : '₹'}
            >
              <Text style={styles.discountToggleText}>{line.discountType === 'PERCENT' ? '%' : '₹'}</Text>
            </Pressable>
          </View>
        </View>

        <View style={styles.controlBlock}>
          <Text style={styles.controlLabel}>{t('billing.lineTotal')}</Text>
          <Text style={styles.lineTotal}>₹{formatMoney(totals.lineTotal)}</Text>
        </View>
      </View>

      {lastPrice.status === 'hidden' ? (
        <Pressable
          onPress={() => void revealLastPrice()}
          disabled={disabled}
          style={styles.lastPriceButton}
          accessibilityRole="button"
        >
          <History size={14} color={colors.muted} strokeWidth={ICON_STROKE} />
          <Text style={styles.lastPriceButtonText}>{t('billing.showLastPrice')}</Text>
        </Pressable>
      ) : (
        <View style={styles.lastPriceBox}>
          {lastPrice.status === 'loading' ? (
            <Text style={styles.lastPriceNote}>{t('billing.lastPriceLoading')}</Text>
          ) : lastPrice.status === 'noCustomer' ? (
            <Text style={styles.lastPriceNote}>{t('billing.lastPriceNoCustomer')}</Text>
          ) : lastPrice.status === 'none' ? (
            <Text style={styles.lastPriceNote}>{t('billing.lastPriceNone')}</Text>
          ) : (
            <View style={styles.lastPriceFound}>
              <Text style={styles.lastPriceValue}>
                {t('billing.lastPriceValue', {
                  rate: formatMoney(lastPrice.value.rate),
                  date: new Date(lastPrice.value.billDate).toLocaleDateString('en-IN'),
                  billNumber: lastPrice.value.billNumber,
                })}
              </Text>
              <Pressable
                onPress={() =>
                  onChange({ rate: lastPrice.value.rate, rateText: String(lastPrice.value.rate) })
                }
                disabled={disabled}
                hitSlop={8}
                accessibilityRole="button"
              >
                <Text style={styles.useRateText}>{t('billing.useThisRate')}</Text>
              </Pressable>
            </View>
          )}
        </View>
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { gap: spacing.md },
  headerRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  // The product is what the row *is* — it outranks every number under it, and
  // at body size it was competing with its own labels.
  name: { ...type.h3, color: colors.text, flex: 1 },
  removeButton: {
    width: TAP_TARGET - 16,
    height: TAP_TARGET - 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: -spacing.sm,
    marginRight: -spacing.sm,
  },

  controlsRow: { flexDirection: 'row', gap: spacing.md },
  controlBlock: { flex: 1, gap: spacing.xs },
  controlLabel: { ...type.caption, color: colors.muted, textTransform: 'uppercase' },

  inputBox: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: control.compact,
    backgroundColor: colors.background,
    borderRadius: radius.input,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
    gap: spacing.xs,
  },
  affix: { ...type.smallStrong, color: colors.muted },
  numericInput: {
    flex: 1,
    ...type.money,
    color: colors.text,
    textAlign: 'right',
    paddingVertical: spacing.sm,
    includeFontPadding: false,
  },
  discountToggle: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primarySoft,
  },
  discountToggleText: { ...type.smallStrong, color: colors.primary },

  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: control.compact,
    backgroundColor: colors.background,
    borderRadius: radius.input,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.xs,
  },
  stepperButton: {
    width: TAP_TARGET - 14,
    height: TAP_TARGET - 14,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.input - 4,
  },
  stepperPressed: { backgroundColor: colors.primarySoft },
  stepperValue: { ...type.money, color: colors.text, minWidth: 32, textAlign: 'center' },

  lineTotal: {
    ...type.kpiSmall,
    color: colors.text,
    textAlign: 'right',
    // Matched to the input boxes beside it so the figure sits on the same
    // baseline as the numbers it is the sum of.
    minHeight: control.compact,
    textAlignVertical: 'center',
    paddingVertical: spacing.md,
  },

  lastPriceButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs + 2,
    alignSelf: 'flex-start',
    minHeight: 36,
    paddingRight: spacing.sm,
  },
  lastPriceButtonText: { ...type.small, color: colors.muted, textDecorationLine: 'underline' },
  lastPriceBox: {
    backgroundColor: colors.primarySoft,
    borderRadius: radius.input,
    padding: spacing.md,
  },
  lastPriceNote: { ...type.small, color: colors.primary },
  lastPriceFound: { gap: spacing.xs },
  lastPriceValue: { ...type.small, color: colors.primary, ...tabularNumbers },
  useRateText: { ...type.smallStrong, color: colors.primary, textDecorationLine: 'underline' },
});
