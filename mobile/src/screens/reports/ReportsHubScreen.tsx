import { StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import {
  BadgeIndianRupee,
  ChevronRight,
  Clock,
  Coins,
  Layers,
  Receipt,
  ShoppingBag,
  TrendingUp,
  TriangleAlert,
  Wallet,
  Warehouse,
} from 'lucide-react-native';
import { AppHeader } from '../../components/AppHeader';
import { Card, SectionHeader } from '../../components/Card';
import { Screen } from '../../components/Screen';
import { Touchable } from '../../components/Touchable';
import { ICON_STROKE, colors, radius, spacing, type } from '../../theme';
import type { ReportsStackParamList } from '../../navigation/types';

type Props = NativeStackScreenProps<ReportsStackParamList, 'ReportsHub'>;
type ReportRoute = Exclude<keyof ReportsStackParamList, 'ReportsHub'>;

interface ReportLink {
  route: ReportRoute;
  titleKey: string;
  bodyKey: string;
  icon: React.ReactNode;
  /** Marks the reports built on cost price. */
  ownerOnly?: boolean;
}

interface ReportGroup {
  titleKey: string;
  links: ReportLink[];
}

const icon = (Icon: typeof Receipt, tint: string = colors.primary) => (
  <Icon size={20} color={tint} strokeWidth={ICON_STROKE} />
);

/**
 * Grouped the way a shopkeeper thinks about their week — what sold, what the
 * government is owed, what is on the shelf, who owes money, and what was
 * actually earned — rather than by which table the data lives in.
 *
 * The whole screen is ADMIN-only: it is not reachable from staff navigation,
 * and every endpoint behind it refuses a staff token regardless.
 */
const GROUPS: ReportGroup[] = [
  {
    titleKey: 'reports.groupSales',
    links: [
      {
        route: 'SalesReport',
        titleKey: 'reports.sales',
        bodyKey: 'reports.salesBody',
        icon: icon(BadgeIndianRupee),
      },
      {
        route: 'ProductSalesReport',
        titleKey: 'reports.productSales',
        bodyKey: 'reports.productSalesBody',
        icon: icon(ShoppingBag),
      },
      {
        route: 'CategorySalesReport',
        titleKey: 'reports.categorySales',
        bodyKey: 'reports.categorySalesBody',
        icon: icon(Layers),
      },
    ],
  },
  {
    titleKey: 'reports.groupTax',
    links: [
      { route: 'GstSummaryReport', titleKey: 'reports.gstSummary', bodyKey: 'reports.gstSummaryBody', icon: icon(Receipt) },
    ],
  },
  {
    titleKey: 'reports.groupStock',
    links: [
      {
        route: 'StockValuationReport',
        titleKey: 'reports.stockValuation',
        bodyKey: 'reports.stockValuationBody',
        icon: icon(Warehouse),
        ownerOnly: true,
      },
      {
        route: 'LowStockReport',
        titleKey: 'reports.lowStock',
        bodyKey: 'reports.lowStockBody',
        icon: icon(TriangleAlert, colors.warning),
      },
    ],
  },
  {
    titleKey: 'reports.groupCredit',
    links: [
      { route: 'OutstandingReport', titleKey: 'reports.outstanding', bodyKey: 'reports.outstandingBody', icon: icon(Wallet) },
      { route: 'AgeingReport', titleKey: 'reports.ageing', bodyKey: 'reports.ageingBody', icon: icon(Clock) },
      {
        route: 'PaymentCollectionReport',
        titleKey: 'reports.paymentCollection',
        bodyKey: 'reports.paymentCollectionBody',
        icon: icon(Coins),
      },
    ],
  },
  {
    titleKey: 'reports.groupProfit',
    links: [
      {
        route: 'ProfitMarginReport',
        titleKey: 'reports.profitMargin',
        bodyKey: 'reports.profitMarginBody',
        icon: icon(TrendingUp),
        ownerOnly: true,
      },
    ],
  },
];

export function ReportsHubScreen({ navigation }: Props) {
  const { t } = useTranslation();

  return (
    <View style={styles.root}>
      <AppHeader title={t('reports.title')} subtitle={t('reports.subtitle')} onBack={() => navigation.goBack()} />

      <Screen>
        {GROUPS.map((group) => (
          <View key={group.titleKey}>
            <SectionHeader title={t(group.titleKey)} />
            <Card padded={false}>
              {group.links.map((link, index) => (
                <Touchable
                  key={link.route}
                  onPress={() => navigation.navigate(link.route)}
                  accessibilityRole="button"
                  accessibilityLabel={t(link.titleKey)}
                  feedback="subtle"
                  style={[styles.row, index < group.links.length - 1 && styles.rowBorder]}
                >
                  <View style={styles.iconRing}>{link.icon}</View>

                  <View style={styles.rowText}>
                    <View style={styles.titleRow}>
                      <Text style={styles.rowTitle}>{t(link.titleKey)}</Text>
                      {link.ownerOnly ? (
                        <View style={styles.badge}>
                          <Text style={styles.badgeText}>{t('reports.costBadge')}</Text>
                        </View>
                      ) : null}
                    </View>
                    <Text style={styles.rowBody}>{t(link.bodyKey)}</Text>
                  </View>

                  <ChevronRight size={18} color={colors.muted} strokeWidth={ICON_STROKE} />
                </Touchable>
              ))}
            </Card>
          </View>
        ))}

        <Text style={styles.footnote}>{t('reports.footnote')}</Text>
      </Screen>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },

  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    minHeight: 68,
  },
  rowBorder: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },

  iconRing: {
    width: 38,
    height: 38,
    borderRadius: radius.sm,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowText: { flex: 1, gap: 2 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  rowTitle: { ...type.bodyStrong, color: colors.text },
  rowBody: { ...type.small, color: colors.muted },

  badge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radius.pill,
    backgroundColor: colors.accentSoft,
  },
  badgeText: { ...type.caption, color: colors.accentInk, textTransform: 'uppercase' },

  footnote: { ...type.caption, color: colors.muted, textAlign: 'center', paddingHorizontal: spacing.lg },
});
