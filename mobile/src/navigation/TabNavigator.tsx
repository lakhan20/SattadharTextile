import { Platform, StyleSheet } from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { LayoutGrid, MoreHorizontal, Package, Receipt, Users } from 'lucide-react-native';
import { DashboardScreen } from '../screens/dashboard/DashboardScreen';
import { CustomersScreen } from '../screens/ModulePlaceholder';
import { MoreScreen } from '../screens/settings/MoreScreen';
import { ICON_STROKE, colors, fonts } from '../theme';
import { BillingStackNavigator } from './BillingStackNavigator';
import { ProductsStackNavigator } from './ProductsStackNavigator';
import type { TabParamList } from './types';

const Tab = createBottomTabNavigator<TabParamList>();

/** Mulberry marks the active tab — the only place the accent appears in the chrome. */
export function TabNavigator({ onOpenServer }: { onOpenServer: () => void }) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();

  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.accentDark,
        tabBarInactiveTintColor: colors.muted,
        tabBarStyle: {
          backgroundColor: colors.surface,
          borderTopColor: colors.border,
          borderTopWidth: StyleSheet.hairlineWidth,
          height: 58 + insets.bottom,
          paddingTop: 6,
          paddingBottom: insets.bottom > 0 ? insets.bottom : 8,
          elevation: 0,
        },
        tabBarLabelStyle: {
          fontFamily: fonts.bodyMedium,
          // 11px truncated "Dashboard" and "Customers" to "Dashbo…" once five
          // tabs share a 360dp bar. 10 with tightened tracking clears both.
          fontSize: 10,
          letterSpacing: -0.1,
          // Gujarati labels sit taller than Latin ones; give them the room.
          lineHeight: Platform.OS === 'android' ? 16 : 14,
        },
        // The default horizontal padding is what squeezed the label box.
        tabBarItemStyle: { paddingVertical: 2, paddingHorizontal: 0 },
      }}
    >
      <Tab.Screen
        name="Dashboard"
        component={DashboardScreen}
        options={{
          title: t('tabs.dashboard'),
          tabBarIcon: ({ color, focused }) => (
            <LayoutGrid size={22} color={color} strokeWidth={focused ? 2.4 : ICON_STROKE} />
          ),
        }}
      />
      <Tab.Screen
        name="Billing"
        component={BillingStackNavigator}
        options={{
          title: t('tabs.billing'),
          tabBarIcon: ({ color, focused }) => (
            <Receipt size={22} color={color} strokeWidth={focused ? 2.4 : ICON_STROKE} />
          ),
        }}
      />
      <Tab.Screen
        name="Products"
        component={ProductsStackNavigator}
        options={{
          title: t('tabs.products'),
          tabBarIcon: ({ color, focused }) => (
            <Package size={22} color={color} strokeWidth={focused ? 2.4 : ICON_STROKE} />
          ),
        }}
      />
      <Tab.Screen
        name="Customers"
        component={CustomersScreen}
        options={{
          title: t('tabs.customers'),
          tabBarIcon: ({ color, focused }) => (
            <Users size={22} color={color} strokeWidth={focused ? 2.4 : ICON_STROKE} />
          ),
        }}
      />
      <Tab.Screen
        name="More"
        options={{
          title: t('tabs.more'),
          tabBarIcon: ({ color, focused }) => (
            <MoreHorizontal size={22} color={color} strokeWidth={focused ? 2.4 : ICON_STROKE} />
          ),
        }}
      >
        {() => <MoreScreen onOpenServer={onOpenServer} />}
      </Tab.Screen>
    </Tab.Navigator>
  );
}
