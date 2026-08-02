import { useCallback, useMemo, useRef, useState } from 'react';
import {
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Linking,
  Platform,
  Pressable,
  ScrollView,
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
import { Touchable } from '../../components/Touchable';
import { ApiError } from '../../api/client';
import { billsApi } from '../../api/bills';
import type {
  Bill,
  BillingMode,
  Customer,
  DiscountType,
  PaymentMode,
  Product,
  TaxType,
} from '../../api/types';
import { useApiError, type ReadableError } from '../../hooks/useApiError';
import { useKeyboardVisible } from '../../hooks/useKeyboardVisible';
import { useResponsive } from '../../hooks/useResponsive';
import { useAuthStore, useIsAdmin } from '../../store/authStore';
import {
  ICON_STROKE,
  TAP_TARGET,
  TRACK_INSET,
  colors,
  control,
  radius,
  ring,
  shadow,
  spacing,
  tabularNumbers,
  type,
} from '../../theme';
import { previewBill } from '../../utils/billCalc';
import { formatMoney } from '../../utils/money';
import type { BillingStackParamList } from '../../navigation/types';
import { BillLineRow, type BillLine } from './BillLineRow';
import { CustomerPickerSheet } from './CustomerPickerSheet';
import { PaymentPanel } from './PaymentPanel';
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
  const { isTablet, isLandscape } = useResponsive();
  const keyboardVisible = useKeyboardVisible();
  const readError = useApiError();

  /**
   * The walk-in fields live in the list header, so focusing one has to bring
   * it into a viewport the keyboard has just made much shorter. `y` is
   * captured on layout rather than measured on demand — measuring after focus
   * races the keyboard animation and lands on the pre-keyboard geometry.
   */
  const listRef = useRef<FlatList<BillLine>>(null);
  const walkInY = useRef(0);

  function revealWalkInFields() {
    // One frame after the keyboard has committed, so the list has already been
    // resized and the offset lands where we expect it to.
    setTimeout(() => {
      listRef.current?.scrollToOffset({
        offset: Math.max(0, walkInY.current + spacing.lg - spacing.sm),
        animated: true,
      });
    }, 150);
  }

  /**
   * Wide enough to put the running total beside the lines instead of under
   * them. On a phone in landscape the dock would otherwise eat most of the
   * remaining height and leave two line rows visible; side by side, the total
   * stays permanently in view while the list keeps its full height.
   */
  const sideBySide = isTablet || isLandscape;
  const maxDiscountPercent = useAuthStore((s) => s.user?.maxDiscountPercent ?? 0);
  const isAdmin = useIsAdmin();

  const [billingMode, setBillingMode] = useState<BillingMode>('GST');
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [walkInName, setWalkInName] = useState('');
  const [walkInPhone, setWalkInPhone] = useState('');
  const [lines, setLines] = useState<BillLine[]>([]);
  const [billDiscountType, setBillDiscountType] = useState<DiscountType>('PERCENT');
  const [billDiscountText, setBillDiscountText] = useState('');
  const [paymentMode, setPaymentMode] = useState<PaymentMode>('CASH');
  const [paidText, setPaidText] = useState('');
  /** Set only after the server refuses a credit sale and an owner chooses to go ahead. */
  const [overrideCreditLimit, setOverrideCreditLimit] = useState(false);

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

  /**
   * A khata sale needs someone to chase. A saved customer obviously qualifies;
   * so does a walk-in who left a number, because the server registers them as
   * a customer inside the same transaction that writes the bill.
   */
  const creditAllowed = customer !== null || walkInPhone.trim().length > 0;

  /**
   * Derived rather than corrected in an effect: clearing the phone on a bill
   * already marked CREDIT falls back to CASH immediately, and the state can
   * never sit in a combination the server would reject.
   */
  const effectiveMode: PaymentMode = paymentMode === 'CREDIT' && !creditAllowed ? 'CASH' : paymentMode;

  const isDirty = hasLines || customer !== null || walkInName.trim().length > 0;

  function resetBill() {
    setLines([]);
    setCustomer(null);
    setWalkInName('');
    setWalkInPhone('');
    setBillDiscountText('');
    setBillDiscountType('PERCENT');
    setPaymentMode('CASH');
    setPaidText('');
    setOverrideCreditLimit(false);
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

  async function handleGenerate(override = overrideCreditLimit) {
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
        paymentMode: effectiveMode,
        // Blank means "the default for this mode" — the whole amount for a
        // settled sale, nothing for a khata one. Sending a computed number
        // here would silently disagree with the server's own rounding.
        ...(paidText.trim() === '' ? null : { paidAmount: Number(paidText) || 0 }),
        ...(override ? { overrideCreditLimit: true } : null),
        items: lines.map((line) => ({
          productId: line.productId,
          qty: line.qty,
          rate: line.rate,
          discountType: line.discountType,
          discountValue: line.discountValue,
        })),
      });
      setCreatedBill(bill);
      setOverrideCreditLimit(false);
    } catch (error) {
      // The lines stay on screen so a stock or discount failure can be fixed
      // and retried without re-entering the bill.
      if (error instanceof ApiError) {
        setServerMessage(error.message);
        setFailure(readError(error));
        // An owner may sell past a customer's limit; a staff member may not,
        // and the server would refuse the retry anyway — so only offer it to
        // an owner rather than dangling a button that always fails.
        if (error.code === 'CREDIT_LIMIT_EXCEEDED' && isAdmin) {
          Alert.alert(t('billing.creditLimitTitle'), error.message, [
            { text: t('common.cancel'), style: 'cancel' },
            {
              text: t('billing.sellAnyway'),
              style: 'destructive',
              onPress: () => {
                setOverrideCreditLimit(true);
                void handleGenerate(true);
              },
            },
          ]);
        }
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

  const dockBody = (
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
  );

  /**
   * In the side-by-side layout the dock lives in a column of fixed height, and
   * a GST bill with a discount row can be taller than that column on a phone
   * held in landscape — so it scrolls, and only then. Stacked under the list on
   * a phone held upright there is nothing to scroll: the list above it is the
   * flexible element and the dock is simply as tall as its contents.
   */
  const dock = sideBySide ? (
    <ScrollView
      style={styles.flex}
      contentContainerStyle={styles.dockScroll}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
      // The dock is the anchor of this screen; it should never bounce away
      // from the edge it is docked to.
      bounces={false}
    >
      {dockBody}
    </ScrollView>
  ) : (
    dockBody
  );

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

      {/*
        `behavior` must be set on Android too. It used to be left undefined
        here, which makes this component inert — that was survivable back when
        Android's adjustResize shrank the window for us, but the app runs
        edge-to-edge (see app.json), so the window no longer resizes and the
        app owns its own keyboard inset. Undefined meant the focused field
        simply sat underneath the keyboard.
      */}
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={insets.top + 56}
      >
        {/* Which document is being written is the one fact that must never
            leave the screen. A tax invoice and an estimate are legally
            different and the counter can be twenty lines deep in a bill when
            someone asks "is this pakka?" — so this is pinned outside the list
            rather than scrolling away with the rest of the header. */}
        <View style={styles.modeBar}>
          <ModeToggle
            value={billingMode}
            onChange={(mode) => {
              setBillingMode(mode);
              setCreatedBill(null);
            }}
            disabled={Boolean(createdBill)}
            previewNumber={createdBill?.billNumber ?? null}
          />
        </View>

        <View style={sideBySide ? styles.wideRow : styles.flex}>
        <FlatList
          ref={listRef}
          data={lines}
          keyExtractor={(item) => item.key}
          // `flex: 1` so the list takes the remaining width beside the dock
          // column on a wide screen, and the full height under it on a phone.
          style={styles.flex}
          contentContainerStyle={styles.list}
          keyboardShouldPersistTaps="handled"
          ListHeaderComponent={
            <View style={styles.headerBlock}>
              <Card onPress={createdBill ? undefined : () => setCustomerPickerOpen(true)}>
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
                <View
                  style={styles.walkInFields}
                  onLayout={(event) => {
                    walkInY.current = event.nativeEvent.layout.y;
                  }}
                >
                  <TextField
                    label={t('billing.walkInName')}
                    value={walkInName}
                    onChangeText={setWalkInName}
                    onFocus={revealWalkInFields}
                    autoCapitalize="words"
                    containerStyle={styles.flex}
                  />
                  <TextField
                    label={t('billing.walkInPhone')}
                    value={walkInPhone}
                    onChangeText={setWalkInPhone}
                    onFocus={revealWalkInFields}
                    keyboardType="phone-pad"
                    containerStyle={styles.flex}
                  />
                </View>
              ) : null}

              {createdBill ? (
                <Banner
                  // A part-paid or khata bill is not the same good news as a
                  // settled one, and the counter should see which it was
                  // before the customer walks away.
                  tone={createdBill.dueAmount > 0 ? 'warning' : 'success'}
                  title={t('billing.createdTitle', { number: createdBill.billNumber })}
                  body={
                    createdBill.dueAmount > 0
                      ? t('billing.createdBodyDue', {
                          total: formatMoney(createdBill.grandTotal),
                          due: formatMoney(createdBill.dueAmount),
                        })
                      : t('billing.createdBody', { total: formatMoney(createdBill.grandTotal) })
                  }
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

              <SectionHeader title={t('billing.items')} rule />
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

              {/* How the bill is settled, chosen where the money changes hands.
                  Before this lived here, a khata sale meant leaving billing,
                  registering the customer, coming back, and re-entering the
                  lines — the long way round the shopkeeper complained about. */}
              {hasLines && !createdBill ? (
                <Card style={styles.paymentCard}>
                  <PaymentPanel
                    mode={effectiveMode}
                    onModeChange={setPaymentMode}
                    paidText={paidText}
                    onPaidChange={setPaidText}
                    grandTotal={preview.grandTotal}
                    creditAllowed={creditAllowed}
                    creditBlockedReason={t('billing.creditNeedsPhone')}
                  />
                </Card>
              ) : null}

              {/* A walk-in who left a number is now either recognised or
                  registered. Saying which — and naming them — is the only way
                  the counter learns that the customer list is being kept up,
                  rather than wondering why the same person keeps appearing. */}
              {createdBill?.walkInCustomer ? (
                <Banner
                  tone="success"
                  title={
                    createdBill.walkInCustomer.outcome === 'registered'
                      ? t('billing.walkInRegistered', { name: createdBill.walkInCustomer.name })
                      : t('billing.walkInMatched', { name: createdBill.walkInCustomer.name })
                  }
                  body={t('billing.walkInCustomerBody')}
                />
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

        {/* The dock column. Side by side on a wide screen, stacked under the
            list on a phone held upright — either way the running total and the
            two actions travel together and neither can be scrolled away. */}
        <View style={sideBySide ? styles.sidebar : null}>
          {/* A round + rather than a full-width bar. Adding a line is the
              action staff repeat most per bill so it stays pinned and can
              never be scrolled away — but at full width it was claiming the
              visual weight that belongs to Generate bill, and eating a row of
              height on every screen. It is `primary`, not `accent`: adding a
              line is a step, the accent belongs to the action that finishes
              the bill. */}
          {/* Stood down while the keyboard is up. Nobody reaches for "add a
              product" mid-way through typing a name or a rate, and the 68pt it
              occupies is the difference between the focused field having
              somewhere to scroll to and not. The dock stays: when the field
              being typed into is a rate, watching the total move is the whole
              point. */}
          {createdBill || keyboardVisible ? null : (
            <View style={styles.addBar}>
              <Touchable
                onPress={() => setProductPickerOpen(true)}
                accessibilityRole="button"
                accessibilityLabel={t('billing.addProduct')}
                style={styles.addButton}
              >
                <Plus size={26} color={colors.onPrimary} strokeWidth={ICON_STROKE} />
              </Touchable>
            </View>
          )}

          {dock}
        </View>
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
 * Teal when a tax invoice is being written, mulberry when it is an estimate —
 * the two documents are legally different and must never be confused at a
 * glance. This is the one place the accent marks state rather than an action,
 * and it earns the exception: picking the wrong one is a compliance problem,
 * not a UI mistake.
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
  wideRow: { flex: 1, flexDirection: 'row' },
  /**
   * Wide enough to hold "Taxable value" against a six-figure amount without
   * either wrapping, capped as a fraction so it never crowds the line list on
   * a phone in landscape. Bottom-aligned so the dock sits on the floor of the
   * column rather than floating in the middle of it.
   */
  sidebar: { width: 340, maxWidth: '44%', minWidth: 260, justifyContent: 'flex-end' },
  list: { padding: spacing.lg, gap: spacing.md, flexGrow: 1 },
  headerBlock: { gap: spacing.md, marginBottom: spacing.xs },
  footerBlock: { gap: spacing.md, marginTop: spacing.md },
  /** The pinned GST/Estimate bar. Content scrolls under it, never over it. */
  modeBar: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.md,
    backgroundColor: colors.background,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },

  addBar: {
    alignItems: 'flex-end',
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
  },
  addButton: {
    width: control.field,
    height: control.field,
    borderRadius: radius.pill,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadow.raised,
  },

  /** `flexGrow` + end-justified: the dock sits on the floor until it outgrows it. */
  dockScroll: { flexGrow: 1, justifyContent: 'flex-end' },
  emptyLines: { ...type.small, color: colors.muted, textAlign: 'center', paddingVertical: spacing.xl },

  historyButton: {
    width: ring.sm,
    height: ring.sm,
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
    padding: TRACK_INSET,
    gap: TRACK_INSET,
  },
  modeSegment: {
    flex: 1,
    minHeight: TAP_TARGET - 8,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.input - TRACK_INSET,
  },
  modeLabel: { ...type.smallStrong, color: colors.muted },
  // White reads on both the teal and the mulberry thumb, so the active label
  // needs no per-mode branch.
  modeLabelActive: { color: colors.onPrimary },
  modeNumber: { ...type.caption, color: colors.muted, textAlign: 'center', ...tabularNumbers },

  // No padding override: who the bill is for is a headline on this screen, so
  // the card gets the same full padding as any other and the row inside it is
  // sized to be hit reliably with a thumb mid-transaction.
  customerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    minHeight: TAP_TARGET,
  },
  customerIcon: {
    width: ring.md,
    height: ring.md,
    borderRadius: radius.pill,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  customerText: { flex: 1 },
  customerName: { ...type.h3, color: colors.text },
  customerSub: { ...type.small, color: colors.muted, marginTop: spacing.xs },
  typeChip: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: radius.pill,
    backgroundColor: colors.primarySoft,
  },
  typeChipText: { ...type.caption, color: colors.primary },

  walkInFields: { flexDirection: 'row', gap: spacing.md },

  paymentCard: { gap: spacing.sm },
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
