import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { StockAdjustScreen } from '../screens/stock/StockAdjustScreen';
import { StockInScreen } from '../screens/stock/StockInScreen';
import { StockLedgerScreen } from '../screens/stock/StockLedgerScreen';
import { StockOverviewScreen } from '../screens/stock/StockOverviewScreen';
import type { StockStackParamList } from './types';

const Stack = createNativeStackNavigator<StockStackParamList>();

/** Reached from the More tab — see the note on StockStackParamList. */
export function StockStackNavigator() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false, animation: 'slide_from_right' }}>
      <Stack.Screen name="StockOverview" component={StockOverviewScreen} />
      <Stack.Screen name="StockIn" component={StockInScreen} />
      <Stack.Screen name="StockAdjust" component={StockAdjustScreen} />
      <Stack.Screen name="StockLedger" component={StockLedgerScreen} />
    </Stack.Navigator>
  );
}
