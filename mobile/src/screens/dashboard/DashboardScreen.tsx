import { useCallback, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useTranslation } from 'react-i18next';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import {
  ArrowDownToLine,
  BadgeIndianRupee,
  CalendarDays,
  ChartNoAxesColumn,
  ChevronRight,
  FileBarChart,
  Receipt,
  TriangleAlert,
  UserPlus,
  Wallet,
} from 'lucide-react-native';
import { AppHeader } from '../../components/AppHeader';
import { Banner } from '../../components/Banner';
import { Card, SectionHeader } from '../../components/Card';
import { KpiTile } from '../../components/KpiTile';
import { Reveal } from '../../components/Reveal';
import { Screen } from '../../components/Screen';
import { SegmentedControl } from '../../components/SegmentedControl';
import { Touchable } from '../../components/Touchable';
import { TrendChart } from '../../components/charts/TrendChart';
import { dashboardApi } from '../../api/dashboard';
import type { AdminDashboard, StaffDashboard, TopCustomer, TopProduct, TrendRange } from '../../api/types';
import { useApiError, type ReadableError } from '../../hooks/useApiError';
import { useResponsive } from '../../hooks/useResponsive';
import { useAuthStore } from '../../store/authStore';
import { ICON_STROKE, colors, radius, ring, shadow, spacing, tabularNumbers, type } from '../../theme';
import { formatQty, formatRupees } from '../../utils/money';
import type { AppStackParamList, TabParamList } from '../../navigation/types';

/**
 * Tile width for a wrapping grid inside `Screen`, which pads every side by
 * `spacing.lg`.
 *
 * Columns are solved against the *content* width and the gaps that sit between
 * the tiles — `width / minTileWidth` ignores both, and on a mid-size screen
 * that returns one column more than actually fits, leaving every tile narrower
 * than the minimum it asked for.
 */
function useGridColumn(minTileWidth: number, opts?: { min?: number; max?: number }) {
  const { min = 2, max = 6 } = opts ?? {};
  const { width } = useResponsive();
  const contentWidth = width - spacing.lg * 2;
  const gap = spacing.md;

  // c tiles fit when c * min + (c - 1) * gap <= contentWidth.
  const fits = Math.floor((contentWidth + gap) / (minTileWidth + gap));
  const columns = Math.min(max, Math.max(min, fits));
  const tileWidth = (contentWidth - gap * (columns - 1)) / columns;
  return { columns, tileWidth };
}

type TabNav = BottomTabNavigationProp<TabParamList>;
type AppNav = NativeStackNavigationProp<AppStackParamList>;

function greetingKey(): 'dashboard.greetingMorning' | 'dashboard.greetingAfternoon' | 'dashboard.greetingEvening' {
  const hour = new Date().getHours();
  if (hour < 12) return 'dashboard.greetingMorning';
  if (hour < 17) return 'dashboard.greetingAfternoon';
  return 'dashboard.greetingEvening';
}

/**
 * ── The home screen, and the clearest expression of the role split ───────
 *
 * There is one endpoint and two payloads. The server decides which to build
 * from the token before it queries anything, and this screen switches on the
 * `role` the response declares rather than on the presence of a field — so a
 * staff device never holds a shop-wide figure in memory, let alone renders one.
 *
 * The staff view is deliberately *complete for what it is*, not a stripped
 * admin view with holes: their own day's work, the low-stock alert they act
 * on, and the two actions they spend the day in. Nothing on it says "you
 * cannot see this".
 */
export function DashboardScreen() {
  const { t } = useTranslation();
  const user = useAuthStore((s) => s.user);
  const isAdmin = user?.role === 'ADMIN';
  const readError = useApiError();

  const [range, setRange] = useState<TrendRange>('7D');
  const [data, setData] = useState<AdminDashboard | StaffDashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [failure, setFailure] = useState<ReadableError | null>(null);

  const load = useCallback(
    async (opts: { silent?: boolean } = {}) => {
      if (!opts.silent) setLoading(true);
      setFailure(null);
      try {
        setData(await dashboardApi.get(range));
      } catch (error) {
        setFailure(readError(error));
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [range, readError],
  );

  // Refetches on every return to the tab, so a bill written one screen away is
  // reflected the moment you come back — the same pattern the stock overview
  // uses.
  useFocusEffect(
    useCallback(() => {
      void load({ silent: true });
    }, [load]),
  );

  const firstName = user?.name.split(' ')[0] ?? '';

  return (
    <View style={styles.root}>
      <AppHeader brand />

      <Screen
        onRefresh={() => {
          setRefreshing(true);
          void load({ silent: true });
        }}
        refreshing={refreshing}
      >
        <Reveal index={0} offset={14}>
          <LinearGradient
            colors={[colors.primary, colors.primaryDark]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.hero}
          >
            <Text style={styles.heroEyebrow}>
              {isAdmin ? t('common.admin') : t('common.staff')} · @{user?.username}
            </Text>
            <Text style={styles.greeting} numberOfLines={2}>
              {t(greetingKey())}
              {firstName ? `, ${firstName}` : ''}
            </Text>
            <Text style={styles.heroDate}>{todayLabel()}</Text>
          </LinearGradient>
        </Reveal>

        {failure ? (
          <Reveal index={1}>
            <Banner tone={failure.isOffline ? 'offline' : 'error'} title={failure.title} body={failure.body} />
          </Reveal>
        ) : null}

        {loading && !data ? (
          <ActivityIndicator style={styles.spinner} color={colors.primary} />
        ) : data?.role === 'ADMIN' ? (
          <AdminView data={data} range={range} onRangeChange={setRange} />
        ) : data?.role === 'STAFF' ? (
          <StaffView data={data} />
        ) : null}
      </Screen>
    </View>
  );
}

function todayLabel(): string {
  return new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' });
}

// ── ADMIN ────────────────────────────────────────────────────────────────

function AdminView({
  data,
  range,
  onRangeChange,
}: {
  data: AdminDashboard;
  range: TrendRange;
  onRangeChange: (range: TrendRange) => void;
}) {
  const { t } = useTranslation();
  const navigation = useNavigation<AppNav>();
  const { tileWidth } = useGridColumn(150, { min: 2, max: 4 });
  const tileStyle = { width: tileWidth };

  return (
    <>
      <Reveal index={1}>
        <View style={styles.kpiGrid}>
          {/* Today's sales is the figure the owner opens the app for, so it
              is the one filled tile — everything else is paper. */}
          <View style={[styles.filledTile, tileStyle]}>
            <View style={styles.filledIconRing}>
              <BadgeIndianRupee size={18} color={colors.onPrimary} strokeWidth={ICON_STROKE} />
            </View>
            <Text style={styles.filledLabel}>{t('dashboard.todaysSales')}</Text>
            <Text style={styles.filledValue} numberOfLines={1} adjustsFontSizeToFit>
              {formatRupees(data.today.sales)}
            </Text>
            <Text style={styles.filledCaption}>
              {t('dashboard.billsToday', { count: data.today.billCount })}
            </Text>
          </View>

          <KpiTile
            style={tileStyle}
            label={t('dashboard.monthSales')}
            value={formatRupees(data.month.sales)}
            caption={t('dashboard.billsCount', { count: data.month.billCount })}
            icon={<CalendarDays size={18} color={colors.primary} strokeWidth={ICON_STROKE} />}
          />
          <KpiTile
            style={tileStyle}
            label={t('dashboard.outstanding')}
            value={formatRupees(data.totalOutstanding)}
            caption={t('dashboard.customersOwing', { count: data.outstandingCustomerCount })}
            tone={data.totalOutstanding > 0 ? 'danger' : 'default'}
            icon={<Wallet size={18} color={colors.danger} strokeWidth={ICON_STROKE} />}
          />
          <KpiTile
            style={tileStyle}
            label={t('dashboard.lowStock')}
            value={String(data.lowStockCount)}
            caption={t('dashboard.needReorder')}
            tone={data.lowStockCount > 0 ? 'warning' : 'success'}
            icon={<TriangleAlert size={18} color={colors.warning} strokeWidth={ICON_STROKE} />}
          />
        </View>
      </Reveal>

      <Reveal index={2}>
        <SectionHeader
          rule
          title={t('dashboard.salesTrend')}
          action={
            <View style={styles.rangeToggle}>
              <SegmentedControl
                label=""
                value={range}
                onChange={onRangeChange}
                options={[
                  { value: '7D', label: t('dashboard.range7d') },
                  { value: '30D', label: t('dashboard.range30d') },
                ]}
              />
            </View>
          }
        />
        <Card>
          <TrendChart
            points={data.salesTrend}
            height={160}
            emptyText={t('dashboard.trendEmpty')}
            accessibilityLabel={t('dashboard.trendA11y', { days: range === '7D' ? 7 : 30 })}
          />
        </Card>
      </Reveal>

      <Reveal index={3}>
        <SectionHeader title={t('dashboard.quickActions')} rule />
        <QuickActions isAdmin />
      </Reveal>

      <Reveal index={4}>
        <SectionHeader title={t('dashboard.gstPayable')} rule />
        <Card style={styles.gstCard}>
          <View style={styles.gstRow}>
            <View style={styles.gstIconRing}>
              <Receipt size={20} color={colors.primary} strokeWidth={ICON_STROKE} />
            </View>
            <View style={styles.gstText}>
              <Text style={styles.gstValue}>{formatRupees(data.month.gstPayable)}</Text>
              <Text style={styles.gstCaption}>{t('dashboard.gstCaption', { month: data.month.label })}</Text>
            </View>
          </View>
          <Text style={styles.gstFootnote}>
            {t('dashboard.fyCaption', { fy: data.financialYear.label, value: formatRupees(data.financialYear.sales) })}
          </Text>
        </Card>
      </Reveal>

      <Reveal index={5}>
        <SectionHeader title={t('dashboard.topProducts')} rule />
        <Card padded={false}>
          <MiniList
            rows={data.topProducts.map((product: TopProduct) => ({
              key: product.productId,
              title: product.name,
              subtitle: `${formatQty(product.qty)} ${
                product.unit === 'METER' ? t('stock.unitShortMeter') : t('stock.unitShortPiece')
              } · ${product.sku}`,
              value: formatRupees(product.value),
            }))}
            emptyText={t('dashboard.noSalesThisMonth')}
          />
        </Card>
      </Reveal>

      <Reveal index={6}>
        <SectionHeader title={t('dashboard.topCustomers')} rule />
        <Card padded={false}>
          <MiniList
            rows={data.topCustomers.map((customer: TopCustomer) => ({
              key: customer.customerId,
              title: customer.name,
              subtitle:
                customer.outstanding > 0
                  ? t('dashboard.owesAmount', { value: formatRupees(customer.outstanding) })
                  : t('dashboard.billsCount', { count: customer.billCount }),
              value: formatRupees(customer.value),
            }))}
            emptyText={t('dashboard.noCustomerSales')}
          />
        </Card>
      </Reveal>

      <Reveal index={7}>
        <Touchable
          onPress={() => navigation.navigate('Reports', { screen: 'ReportsHub' })}
          accessibilityRole="button"
          accessibilityLabel={t('reports.title')}
          feedback="subtle"
          style={styles.reportsEntry}
        >
          <View style={styles.reportsIconRing}>
            <FileBarChart size={20} color={colors.onAccent} strokeWidth={ICON_STROKE} />
          </View>
          <View style={styles.reportsText}>
            <Text style={styles.reportsTitle}>{t('reports.title')}</Text>
            <Text style={styles.reportsBody}>{t('dashboard.reportsEntryBody')}</Text>
          </View>
          <ChevronRight size={20} color={colors.muted} strokeWidth={ICON_STROKE} />
        </Touchable>
      </Reveal>

      <Reveal index={8}>
        <Text style={styles.valuationNote}>
          {t('dashboard.valuationNote', { value: formatRupees(data.stockValueAtCost) })}
        </Text>
      </Reveal>
    </>
  );
}

// ── STAFF ────────────────────────────────────────────────────────────────

/**
 * Everything a staff member's home screen has. There is no revenue KPI, no
 * trend, no top lists and no reports entry point — and none of that is fetched
 * or rendered conditionally: the payload this reads simply has no such fields.
 */
function StaffView({ data }: { data: StaffDashboard }) {
  const { t } = useTranslation();
  const navigation = useNavigation<AppNav>();

  return (
    <>
      <Reveal index={1}>
        <Card style={styles.myBillsCard}>
          <View style={styles.myBillsHeader}>
            <View style={styles.myBillsIconRing}>
              <Receipt size={20} color={colors.primary} strokeWidth={ICON_STROKE} />
            </View>
            <Text style={styles.myBillsLabel}>{t('dashboard.myBillsToday')}</Text>
          </View>

          <View style={styles.myBillsFigures}>
            <View style={styles.myBillsFigure}>
              <Text style={styles.myBillsCount}>{data.myBillsToday.count}</Text>
              <Text style={styles.myBillsCaption}>{t('dashboard.billsMade')}</Text>
            </View>
            <View style={styles.myBillsDivider} />
            <View style={styles.myBillsFigure}>
              <Text style={styles.myBillsTotal} numberOfLines={1} adjustsFontSizeToFit>
                {formatRupees(data.myBillsToday.total)}
              </Text>
              <Text style={styles.myBillsCaption}>{t('dashboard.myTotal')}</Text>
            </View>
          </View>
        </Card>
      </Reveal>

      <Reveal index={2}>
        <SectionHeader title={t('dashboard.quickActions')} rule />
        <QuickActions isAdmin={false} />
      </Reveal>

      <Reveal index={3}>
        <SectionHeader title={t('dashboard.lowStockAlerts')} rule />
        <Touchable
          onPress={() => navigation.navigate('Stock', { screen: 'StockOverview' })}
          accessibilityRole="button"
          accessibilityLabel={t('dashboard.lowStockAlerts')}
          feedback="subtle"
          style={[styles.lowStockCard, data.lowStockCount === 0 && styles.lowStockCardClear]}
        >
          <View style={[styles.lowStockIconRing, data.lowStockCount === 0 && styles.lowStockIconRingClear]}>
            <TriangleAlert
              size={20}
              color={data.lowStockCount > 0 ? colors.warning : colors.success}
              strokeWidth={ICON_STROKE}
            />
          </View>
          <View style={styles.lowStockText}>
            <Text style={styles.lowStockCount}>
              {data.lowStockCount > 0
                ? t('dashboard.itemsRunningLow', { count: data.lowStockCount })
                : t('stock.emptyLowTitle')}
            </Text>
            <Text style={styles.lowStockBody}>
              {data.lowStockCount > 0 ? t('dashboard.lowStockTapBody') : t('stock.emptyLowBody')}
            </Text>
          </View>
          <ChevronRight size={20} color={colors.muted} strokeWidth={ICON_STROKE} />
        </Touchable>
      </Reveal>
    </>
  );
}

// ── Shared pieces ────────────────────────────────────────────────────────

/**
 * New Bill carries the mulberry accent — one emphasis action per screen, and
 * this is the thing the counter reaches for all day.
 */
function QuickActions({ isAdmin }: { isAdmin: boolean }) {
  const { t } = useTranslation();
  const tabNavigation = useNavigation<TabNav>();
  const appNavigation = useNavigation<AppNav>();
  const { tileWidth } = useGridColumn(150, { min: 2, max: 4 });

  const items: { key: string; icon: React.ReactNode; label: string; onPress: () => void; emphasis?: boolean }[] = [
    {
      key: 'newBill',
      icon: <Receipt size={20} color={colors.onAccent} strokeWidth={ICON_STROKE} />,
      label: t('billing.newBill'),
      onPress: () => tabNavigation.navigate('Billing', { screen: 'NewBill' }),
      emphasis: true,
    },
    {
      key: 'customers',
      icon: <UserPlus size={20} color={colors.primary} strokeWidth={ICON_STROKE} />,
      // Was "Add customer" while the tab was a placeholder. The tab is a real
      // list and khata now, and there is still no add form, so the tile says
      // what it actually opens.
      label: t('customers.title'),
      onPress: () => tabNavigation.navigate('Customers', { screen: 'CustomersList' }),
    },
  ];

  // Adding stock is an owner/permission action; staff without the toggle would
  // only meet a 403, so the tile is not offered to them.
  if (isAdmin) {
    items.push({
      key: 'addStock',
      icon: <ArrowDownToLine size={20} color={colors.primary} strokeWidth={ICON_STROKE} />,
      label: t('stock.stockIn'),
      onPress: () => appNavigation.navigate('Stock', { screen: 'StockIn' }),
    });
    items.push({
      key: 'stock',
      icon: <ChartNoAxesColumn size={20} color={colors.primary} strokeWidth={ICON_STROKE} />,
      label: t('stock.title'),
      onPress: () => appNavigation.navigate('Stock', { screen: 'StockOverview' }),
    });
  }

  return (
    <View style={styles.actionGrid}>
      {items.map((item) => (
        <Touchable
          key={item.key}
          onPress={item.onPress}
          accessibilityRole="button"
          accessibilityLabel={item.label}
          style={[styles.action, { width: tileWidth }]}
        >
          <View style={[styles.actionIcon, item.emphasis && styles.actionIconEmphasis]}>{item.icon}</View>
          <Text style={styles.actionLabel} numberOfLines={2}>
            {item.label}
          </Text>
        </Touchable>
      ))}
    </View>
  );
}

interface MiniRow {
  key: string;
  title: string;
  subtitle: string;
  value: string;
}

function MiniList({ rows, emptyText }: { rows: MiniRow[]; emptyText: string }) {
  if (rows.length === 0) {
    return <Text style={styles.miniEmpty}>{emptyText}</Text>;
  }

  return (
    <View>
      {rows.map((row, index) => (
        <View key={row.key} style={[styles.miniRow, index < rows.length - 1 && styles.miniRowBorder]}>
          <View style={styles.miniRank}>
            <Text style={styles.miniRankText}>{index + 1}</Text>
          </View>
          <View style={styles.miniText}>
            <Text style={styles.miniTitle} numberOfLines={1}>
              {row.title}
            </Text>
            <Text style={styles.miniSubtitle} numberOfLines={1}>
              {row.subtitle}
            </Text>
          </View>
          <Text style={styles.miniValue}>{row.value}</Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  spinner: { marginTop: spacing.xxl },

  hero: { borderRadius: radius.card, padding: spacing.xl, gap: spacing.sm, ...shadow.card },
  heroEyebrow: { ...type.label, color: colors.onPrimaryMuted, textTransform: 'uppercase' },
  greeting: { ...type.h1, color: colors.onPrimary },
  heroDate: { ...type.small, color: colors.onPrimaryMuted },

  kpiGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },

  filledTile: {
    flexGrow: 1,
    minWidth: 0,
    backgroundColor: colors.primary,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.primary,
    padding: spacing.lg,
    ...shadow.card,
  },
  filledIconRing: {
    width: ring.sm,
    height: ring.sm,
    borderRadius: radius.sm,
    backgroundColor: colors.onPrimaryWash,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  filledLabel: { ...type.label, color: colors.onPrimaryMuted, textTransform: 'uppercase' },
  filledValue: { ...type.kpi, color: colors.onPrimary, marginTop: spacing.xs, ...tabularNumbers },
  filledCaption: { ...type.small, color: colors.onPrimaryMuted, marginTop: 2 },

  rangeToggle: { width: 132 },

  gstCard: { gap: spacing.md },
  gstRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  gstIconRing: {
    width: ring.md,
    height: ring.md,
    borderRadius: radius.sm,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  gstText: { flex: 1 },
  gstValue: { ...type.kpiSmall, color: colors.text, ...tabularNumbers },
  gstCaption: { ...type.small, color: colors.muted },
  gstFootnote: {
    ...type.caption,
    color: colors.muted,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    paddingTop: spacing.md,
  },

  actionGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  action: {
    padding: spacing.lg,
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadow.card,
  },
  actionIcon: {
    width: ring.sm,
    height: ring.sm,
    borderRadius: radius.sm,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionIconEmphasis: { backgroundColor: colors.accent },
  actionLabel: { ...type.bodyStrong, color: colors.text },

  miniRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  miniRowBorder: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  miniRank: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  miniRankText: { ...type.caption, color: colors.primaryInk },
  miniText: { flex: 1, gap: 1 },
  miniTitle: { ...type.bodyStrong, color: colors.text },
  miniSubtitle: { ...type.caption, color: colors.muted },
  miniValue: { ...type.money, color: colors.text, ...tabularNumbers },
  miniEmpty: { ...type.small, color: colors.muted, padding: spacing.lg, textAlign: 'center' },

  reportsEntry: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.lg,
    backgroundColor: colors.surface,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadow.card,
  },
  reportsIconRing: {
    width: ring.md,
    height: ring.md,
    borderRadius: radius.sm,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  reportsText: { flex: 1, gap: 2 },
  reportsTitle: { ...type.h3, color: colors.text },
  reportsBody: { ...type.small, color: colors.muted },

  valuationNote: { ...type.caption, color: colors.muted, textAlign: 'center' },

  myBillsCard: { gap: spacing.lg },
  myBillsHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  myBillsIconRing: {
    width: ring.md,
    height: ring.md,
    borderRadius: radius.sm,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  myBillsLabel: { ...type.h3, color: colors.text, flex: 1 },
  myBillsFigures: { flexDirection: 'row', alignItems: 'center' },
  myBillsFigure: { flex: 1, gap: 2 },
  myBillsDivider: { width: StyleSheet.hairlineWidth, alignSelf: 'stretch', backgroundColor: colors.border },
  myBillsCount: { ...type.kpi, color: colors.text, ...tabularNumbers },
  myBillsTotal: { ...type.kpi, color: colors.text, ...tabularNumbers, textAlign: 'right' },
  myBillsCaption: { ...type.caption, color: colors.muted },

  lowStockCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.lg,
    backgroundColor: colors.surface,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderLeftWidth: 3,
    borderLeftColor: colors.warning,
    ...shadow.card,
  },
  lowStockCardClear: { borderLeftColor: colors.success },
  lowStockIconRing: {
    width: ring.md,
    height: ring.md,
    borderRadius: radius.sm,
    backgroundColor: colors.warningSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  lowStockIconRingClear: { backgroundColor: colors.successSoft },
  lowStockText: { flex: 1, gap: 2 },
  lowStockCount: { ...type.bodyStrong, color: colors.text },
  lowStockBody: { ...type.small, color: colors.muted },
});
