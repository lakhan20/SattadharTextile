import { useCallback, useMemo, useState } from 'react';
import {
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Linking,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { ChevronRight, FileText, Plus, UserRound } from 'lucide-react-native';
import { AppHeader } from '../../components/AppHeader';
import { Banner } from '../../components/Banner';
import { Button } from '../../components/Button';
import { Card, SectionHeader } from '../../components/Card';
import { TextField } from '../../components/TextField';
import { ApiError } from '../../api/client';
import { billsApi } from '../../api/bills';
import type {
  Bill,
  BillingMode,
  Customer,
  DiscountType,
  Product,
  TaxType,
} from '../../api/types';
import { useApiError, type ReadableError } from '../../hooks/useApiError';
import { useAuthStore } from '../../store/authStore';
import { ICON_STROKE, TAP_TARGET, colors, radius, spacing, tabularNumbers, type } from '../../theme';
import { previewBill } from '../../utils/billCalc';
import { formatMoney } from '../../utils/money';
import type { BillingStackParamList } from '../../navigation/types';
import { BillLineRow, type BillLine } from './BillLineRow';
import { CustomerPickerSheet } from './CustomerPickerSheet';
import { ProductPickerSheet } from './ProductPickerSheet';
import { TotalDock } from './TotalDock';

type Props = NativeStackScreenProps<BillingStackParamList, 'NewBill'>;

/** The shop is in Gujarat; a walk-in has no address, so it is treated as local. */
const SHOP_STATE = 'gujarat';

let lineCounter = 0;
const nextLineKey = (): string => `line-${++lineCounter}`;

export function BillingScreen({ navigation }: Props) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const readError = useApiError();
  const maxDiscountPercent = useAuthStore((s) => s.user?.maxDiscountPercent ?? 0);

  const [billingMode, setBillingMode] = useState<BillingMode>('GST');
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [walkInName, setWalkInName] = useState('');
  const [walkInPhone, setWalkInPhone] = useState('');
  const [lines, setLines] = useState<BillLine[]>([]);
  const [billDiscountType, setBillDiscountType] = useState<DiscountType>('PERCENT');
  const [billDiscountText, setBillDiscountText] = useState('');

  const [customerPickerOpen, setCustomerPickerOpen] = useState(false);
  const [productPickerOpen, setProductPickerOpen] = useState(false);

  const [generating, setGenerating] = useState(false);
  const [sending, setSending] = useState(false);
  const [failure, setFailure] = useState<ReadableError | null>(null);
  const [serverMessage, setServerMessage] = useState<string | null>(null);
  const [createdBill, setCreatedBill] = useState<Bill | null>(null);

  const billDiscountValue = Number(billDiscountText) || 0;

  const taxType: TaxType = useMemo(() => {
    if (billingMode === 'NON_GST') return 'NONE';
    const state = customer?.state ?? 'Gujarat';
    return state.trim().toLowerCase() === SHOP_STATE ? 'CGST_SGST' : 'IGST';
  }, [billingMode, customer]);

  const preview = useMemo(
    () => previewBill(lines, { billingMode, taxType, billDiscountType, billDiscountValue }),
    [lines, billingMode, taxType, billDiscountType, billDiscountValue],
  );

  const overDiscountCap = preview.effectiveDiscountPercent > maxDiscountPercent + 0.0001;
  const hasLines = lines.length > 0;
  const walkInReady = customer !== null || walkInName.trim().length > 0;
  const canGenerate = hasLines && walkInReady && !overDiscountCap && !createdBill;

  const isDirty = hasLines || customer !== null || walkInName.trim().length > 0;

  function resetBill() {
    setLines([]);
    setCustomer(null);
    setWalkInName('');
    setWalkInPhone('');
    setBillDiscountText('');
    setBillDiscountType('PERCENT');
    setCreatedBill(null);
    setFailure(null);
    setServerMessage(null);
  }

  function confirmDiscard(onConfirm: () => void) {
    if (!isDirty || createdBill) {
      onConfirm();
      return;
    }
    Alert.alert(t('billing.discardTitle'), t('billing.discardBody'), [
      { text: t('billing.keepEditing'), style: 'cancel' },
      { text: t('billing.discard'), style: 'destructive', onPress: onConfirm },
    ]);
  }

  function handleSelectCustomer(picked: Customer | null) {
    setCustomer(picked);
    if (picked) {
      setWalkInName('');
      setWalkInPhone('');
    }
    // Rates follow customer type, so re-price every line that the shopkeeper
    // has not manually overridden. An edited rate is theirs to keep.
    setLines((prev) =>
      prev.map((line) =>
        line.rateEdited
          ? line
          : { ...line, rate: rateFor(line, picked), rateText: String(rateFor(line, picked)) },
      ),
    );
  }

  function handleAddProduct(product: Product) {
    const rate = customer?.type === 'WHOLESALE' ? product.wholesaleRate : product.retailRate;
    setLines((prev) => [
      ...prev,
      {
        key: nextLineKey(),
        productId: product.id,
        productName: product.name,
        unit: product.unit,
        qty: 1,
        qtyText: '1',
        rate,
        rateText: String(rate),
        retailRate: product.retailRate,
        wholesaleRate: product.wholesaleRate,
        rateEdited: false,
        gstPercent: product.gstPercent,
        discountType: 'PERCENT',
        discountValue: 0,
        discountText: '',
      },
    ]);
  }

  const updateLine = useCallback((key: string, patch: Partial<BillLine>) => {
    setLines((prev) =>
      prev.map((line) =>
        line.key === key
          ? { ...line, ...patch, ...(patch.rateText !== undefined ? { rateEdited: true } : null) }
          : line,
      ),
    );
  }, []);

  const removeLine = useCallback(
    (key: string, name: string) => {
      Alert.alert(t('billing.removeLine'), t('billing.removeLineConfirm', { name }), [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('common.delete'),
          style: 'destructive',
          onPress: () => setLines((prev) => prev.filter((line) => line.key !== key)),
        },
      ]);
    },
    [t],
  );

  async function handleGenerate() {
    if (!canGenerate) return;
    setGenerating(true);
    setFailure(null);
    setServerMessage(null);
    try {
      const bill = await billsApi.create({
        billingMode,
        ...(customer
          ? { customerId: customer.id }
          : { walkInName: walkInName.trim(), ...(walkInPhone.trim() ? { walkInPhone: walkInPhone.trim() } : null) }),
        billDiscountType,
        billDiscountValue,
        items: lines.map((line) => ({
          productId: line.productId,
          qty: line.qty,
          rate: line.rate,
          discountType: line.discountType,
          discountValue: line.discountValue,
        })),
      });
      setCreatedBill(bill);
    } catch (error) {
      // The lines stay on screen so a stock or discount failure can be fixed
      // and retried without re-entering the bill.
      if (error instanceof ApiError) {
        setServerMessage(error.message);
        setFailure(readError(error));
      } else {
        setFailure(readError(error));
      }
    } finally {
      setGenerating(false);
    }
  }

  async function handleWhatsApp() {
    if (!createdBill) return;
    setSending(true);
    setServerMessage(null);
    try {
      const result = await billsApi.send(createdBill.id);
      await Linking.openURL(result.whatsappUrl);
    } catch (error) {
      if (error instanceof ApiError) setServerMessage(error.message);
      else setServerMessage(t('billing.whatsappFailed'));
    } finally {
      setSending(false);
    }
  }

  const customerSubtitle = customer
    ? [customer.state, billingMode === 'GST' ? (customer.gstin ?? t('billing.noGstin')) : null]
        .filter(Boolean)
        .join(' · ')
    : t('billing.walkIn');

  return (
    <View style={styles.root}>
      <AppHeader
        title={t('billing.title')}
        right={
          <Pressable
            onPress={() => navigation.navigate('BillsList')}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel={t('bills.title')}
            style={styles.historyButton}
          >
            <FileText size={18} color={colors.primary} strokeWidth={ICON_STROKE} />
          </Pressable>
        }
      />

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={insets.top + 56}
      >
        <FlatList
          data={lines}
          keyExtractor={(item) => item.key}
          contentContainerStyle={styles.list}
          keyboardShouldPersistTaps="handled"
          ListHeaderComponent={
            <View style={styles.headerBlock}>
              <ModeToggle
                value={billingMode}
                onChange={(mode) => {
                  setBillingMode(mode);
                  setCreatedBill(null);
                }}
                disabled={Boolean(createdBill)}
                previewNumber={createdBill?.billNumber ?? null}
              />

              <Card
                onPress={createdBill ? undefined : () => setCustomerPickerOpen(true)}
                style={styles.customerCard}
              >
                <View style={styles.customerRow}>
                  <View style={styles.customerIcon}>
                    <UserRound size={20} color={colors.primary} strokeWidth={ICON_STROKE} />
                  </View>
                  <View style={styles.customerText}>
                    <Text style={styles.customerName} numberOfLines={1}>
                      {customer?.name ?? t('billing.walkIn')}
                    </Text>
                    <Text style={styles.customerSub} numberOfLines={1}>
                      {customerSubtitle}
                    </Text>
                  </View>
                  {customer?.type === 'WHOLESALE' ? (
                    <View style={styles.typeChip}>
                      <Text style={styles.typeChipText}>{t('billing.wholesale')}</Text>
                    </View>
                  ) : null}
                  {createdBill ? null : <ChevronRight size={18} color={colors.muted} strokeWidth={ICON_STROKE} />}
                </View>
              </Card>

              {!customer && !createdBill ? (
                <View style={styles.walkInFields}>
                  <TextField
                    label={t('billing.walkInName')}
                    value={walkInName}
                    onChangeText={setWalkInName}
                    autoCapitalize="words"
                    containerStyle={styles.flex}
                  />
                  <TextField
                    label={t('billing.walkInPhone')}
                    value={walkInPhone}
                    onChangeText={setWalkInPhone}
                    keyboardType="phone-pad"
                    containerStyle={styles.flex}
                  />
                </View>
              ) : null}

              {createdBill ? (
                <Banner
                  tone="success"
                  title={t('billing.createdTitle', { number: createdBill.billNumber })}
                  body={t('billing.createdBody', { total: formatMoney(createdBill.grandTotal) })}
                />
              ) : null}

              {failure ? (
                <Banner
                  tone={failure.isOffline ? 'offline' : 'error'}
                  title={failure.title}
                  body={serverMessage ?? failure.body}
                />
              ) : null}

              {overDiscountCap ? (
                <Banner
                  tone="error"
                  title={t('billing.discountOverCap', {
                    percent: preview.effectiveDiscountPercent.toFixed(2),
                    cap: maxDiscountPercent,
                  })}
                />
              ) : null}

              <SectionHeader title={t('billing.items')} />
            </View>
          }
          ListEmptyComponent={<Text style={styles.emptyLines}>{t('billing.noItems')}</Text>}
          renderItem={({ item }) => (
            <BillLineRow
              line={item}
              customerId={customer?.id ?? null}
              onChange={(patch) => updateLine(item.key, patch)}
              onRemove={() => removeLine(item.key, item.productName)}
              disabled={Boolean(createdBill)}
            />
          )}
          ListFooterComponent={
            <View style={styles.footerBlock}>
              {hasLines && !createdBill ? (
                <Card style={styles.billDiscountCard}>
                  <Text style={styles.billDiscountLabel}>{t('billing.billDiscount')}</Text>
                  <View style={styles.billDiscountInput}>
                    <TextField
                      label=""
                      value={billDiscountText}
                      onChangeText={(text) => setBillDiscountText(text.replace(/[^0-9.]/g, ''))}
                      keyboardType="decimal-pad"
                      placeholder="0"
                      containerStyle={styles.flex}
                    />
                    <Pressable
                      onPress={() => setBillDiscountType((prev) => (prev === 'PERCENT' ? 'FLAT' : 'PERCENT'))}
                      style={styles.billDiscountToggle}
                      accessibilityRole="button"
                      accessibilityLabel={billDiscountType === 'PERCENT' ? '%' : '₹'}
                    >
                      <Text style={styles.billDiscountToggleText}>
                        {billDiscountType === 'PERCENT' ? '%' : '₹'}
                      </Text>
                    </Pressable>
                  </View>
                </Card>
              ) : null}

              {createdBill ? (
                <Button
                  label={t('billing.viewPdf')}
                  onPress={() => navigation.navigate('BillDetail', { billId: createdBill.id })}
                  variant="outline"
                />
              ) : null}
            </View>
          }
        />

        {/* Pinned above the totals, not buried in the scrolling footer — this
            is the single action staff repeat most often per bill, so it must
            never require a scroll to reach once the line list grows long. */}
        {createdBill ? null : (
          <View style={styles.addProductBar}>
            <Button
              label={t('billing.addProduct')}
              onPress={() => setProductPickerOpen(true)}
              variant="gold"
              icon={<Plus size={18} color="#FFFFFF" strokeWidth={ICON_STROKE} />}
            />
          </View>
        )}

        <View style={{ paddingBottom: insets.bottom }}>
          <TotalDock
            preview={preview}
            billingMode={billingMode}
            taxType={taxType}
            onGenerate={() => void handleGenerate()}
            generating={generating}
            canGenerate={canGenerate}
            sending={sending}
            {...(createdBill
              ? {
                  onWhatsApp: () => void handleWhatsApp(),
                  onNewBill: () => confirmDiscard(resetBill),
                }
              : null)}
          />
        </View>
      </KeyboardAvoidingView>

      <CustomerPickerSheet
        visible={customerPickerOpen}
        onClose={() => setCustomerPickerOpen(false)}
        onSelect={handleSelectCustomer}
      />
      <ProductPickerSheet
        visible={productPickerOpen}
        onClose={() => setProductPickerOpen(false)}
        onSelect={handleAddProduct}
        useWholesaleRate={customer?.type === 'WHOLESALE'}
      />
    </View>
  );
}

function rateFor(line: BillLine, customer: Customer | null): number {
  return customer?.type === 'WHOLESALE' ? line.wholesaleRate : line.retailRate;
}

/**
 * Indigo when a tax invoice is being written, gold when it is an estimate —
 * the two documents are legally different and must never be confused at a
 * glance.
 */
function ModeToggle({
  value,
  onChange,
  disabled,
  previewNumber,
}: {
  value: BillingMode;
  onChange: (mode: BillingMode) => void;
  disabled: boolean;
  previewNumber: string | null;
}) {
  const { t } = useTranslation();
  const options: { mode: BillingMode; label: string }[] = [
    { mode: 'GST', label: t('billing.modeGst') },
    { mode: 'NON_GST', label: t('billing.modeEstimate') },
  ];

  return (
    <View style={styles.modeBlock}>
      <View style={styles.modeTrack}>
        {options.map((option) => {
          const active = option.mode === value;
          const activeColour = option.mode === 'GST' ? colors.primary : colors.accent;
          return (
            <Pressable
              key={option.mode}
              onPress={() => onChange(option.mode)}
              disabled={disabled}
              accessibilityRole="button"
              accessibilityState={{ selected: active, disabled }}
              style={[styles.modeSegment, active && { backgroundColor: activeColour }]}
            >
              <Text style={[styles.modeLabel, active && styles.modeLabelActive]}>{option.label}</Text>
            </Pressable>
          );
        })}
      </View>
      <Text style={styles.modeNumber}>
        {previewNumber ? t('billing.nextNumber', { number: previewNumber }) : t('billing.nextNumberPending')}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  flex: { flex: 1 },
  list: { padding: spacing.lg, gap: spacing.md, flexGrow: 1 },
  headerBlock: { gap: spacing.md, marginBottom: spacing.xs },
  footerBlock: { gap: spacing.md, marginTop: spacing.md },
  addProductBar: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    backgroundColor: colors.background,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  emptyLines: { ...type.small, color: colors.muted, textAlign: 'center', paddingVertical: spacing.xl },

  historyButton: {
    width: 36,
    height: 36,
    borderRadius: radius.pill,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },

  modeBlock: { gap: spacing.sm },
  modeTrack: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderRadius: radius.input,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 3,
    gap: 3,
  },
  modeSegment: {
    flex: 1,
    minHeight: TAP_TARGET - 8,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.input - 3,
  },
  modeLabel: { ...type.smallStrong, color: colors.muted },
  modeLabelActive: { color: '#FFFFFF' },
  modeNumber: { ...type.caption, color: colors.muted, textAlign: 'center', ...tabularNumbers },

  customerCard: { paddingVertical: spacing.md },
  customerRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  customerIcon: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  customerText: { flex: 1 },
  customerName: { ...type.bodyStrong, color: colors.text },
  customerSub: { ...type.small, color: colors.muted, marginTop: 1 },
  typeChip: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: radius.pill,
    backgroundColor: colors.primarySoft,
  },
  typeChipText: { ...type.caption, color: colors.primary },

  walkInFields: { flexDirection: 'row', gap: spacing.md },

  billDiscountCard: { gap: spacing.sm },
  billDiscountLabel: { ...type.caption, color: colors.muted, textTransform: 'uppercase' },
  billDiscountInput: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  billDiscountToggle: {
    width: TAP_TARGET,
    height: TAP_TARGET,
    borderRadius: radius.input,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  billDiscountToggleText: { ...type.bodyStrong, color: colors.primary },
});
