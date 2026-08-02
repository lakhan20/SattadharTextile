import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { AgeingReportScreen } from '../screens/reports/AgeingReportScreen';
import { CategorySalesReportScreen } from '../screens/reports/CategorySalesReportScreen';
import { GstSummaryReportScreen } from '../screens/reports/GstSummaryReportScreen';
import { LowStockReportScreen } from '../screens/reports/LowStockReportScreen';
import { OutstandingReportScreen } from '../screens/reports/OutstandingReportScreen';
import { PaymentCollectionReportScreen } from '../screens/reports/PaymentCollectionReportScreen';
import { ProductSalesReportScreen } from '../screens/reports/ProductSalesReportScreen';
import { ProfitMarginReportScreen } from '../screens/reports/ProfitMarginReportScreen';
import { ReportsHubScreen } from '../screens/reports/ReportsHubScreen';
import { SalesReportScreen } from '../screens/reports/SalesReportScreen';
import { StockValuationReportScreen } from '../screens/reports/StockValuationReportScreen';
import type { ReportsStackParamList } from './types';

const Stack = createNativeStackNavigator<ReportsStackParamList>();

/**
 * Mounted only inside the ADMIN branch of `RootNavigator`. A staff session
 * never constructs this navigator, so none of these screens exist for them —
 * see the note on `ReportsStackParamList`.
 */
export function ReportsStackNavigator() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false, animation: 'slide_from_right' }}>
      <Stack.Screen name="ReportsHub" component={ReportsHubScreen} />
      <Stack.Screen name="SalesReport" component={SalesReportScreen} />
      <Stack.Screen name="GstSummaryReport" component={GstSummaryReportScreen} />
      <Stack.Screen name="StockValuationReport" component={StockValuationReportScreen} />
      <Stack.Screen name="LowStockReport" component={LowStockReportScreen} />
      <Stack.Screen name="OutstandingReport" component={OutstandingReportScreen} />
      <Stack.Screen name="AgeingReport" component={AgeingReportScreen} />
      <Stack.Screen name="ProductSalesReport" component={ProductSalesReportScreen} />
      <Stack.Screen name="CategorySalesReport" component={CategorySalesReportScreen} />
      <Stack.Screen name="PaymentCollectionReport" component={PaymentCollectionReportScreen} />
      <Stack.Screen name="ProfitMarginReport" component={ProfitMarginReportScreen} />
    </Stack.Navigator>
  );
}
