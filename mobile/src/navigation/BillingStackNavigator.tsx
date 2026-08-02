import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { BillDetailScreen } from '../screens/billing/BillDetailScreen';
import { BillingScreen } from '../screens/billing/BillingScreen';
import { BillsListScreen } from '../screens/billing/BillsListScreen';
import type { BillingStackParamList } from './types';

const Stack = createNativeStackNavigator<BillingStackParamList>();

export function BillingStackNavigator() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false, animation: 'slide_from_right' }}>
      <Stack.Screen name="NewBill" component={BillingScreen} />
      <Stack.Screen name="BillsList" component={BillsListScreen} />
      <Stack.Screen name="BillDetail" component={BillDetailScreen} />
    </Stack.Navigator>
  );
}
