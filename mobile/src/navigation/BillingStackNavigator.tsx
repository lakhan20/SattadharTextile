import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { BillDetailScreen } from '../screens/billing/BillDetailScreen';
import { BillEditScreen } from '../screens/billing/BillEditScreen';
import { BillingScreen } from '../screens/billing/BillingScreen';
import { BillsListScreen } from '../screens/billing/BillsListScreen';
import { BillEditLogScreen, BillRevisionsScreen } from '../screens/billing/BillRevisionsScreen';
import { useHasPermission, useIsAdmin } from '../store/authStore';
import type { BillingStackParamList } from './types';

const Stack = createNativeStackNavigator<BillingStackParamList>();

export function BillingStackNavigator() {
  const isAdmin = useIsAdmin();
  const canEdit = useHasPermission('bill.edit');

  return (
    <Stack.Navigator screenOptions={{ headerShown: false, animation: 'slide_from_right' }}>
      <Stack.Screen name="NewBill" component={BillingScreen} />
      <Stack.Screen name="BillsList" component={BillsListScreen} />
      <Stack.Screen name="BillDetail" component={BillDetailScreen} />
      <Stack.Screen name="BillRevisions" component={BillRevisionsScreen} />

      {/* Registered only when the account may actually use them. A staff
          session without `bill.edit` has no edit route to reach, and no
          session but an owner's has the shop-wide log — the server's 403 is
          the real boundary, this keeps the navigator honest about it. */}
      {canEdit ? <Stack.Screen name="BillEdit" component={BillEditScreen} /> : null}
      {isAdmin ? <Stack.Screen name="BillEditLog" component={BillEditLogScreen} /> : null}
    </Stack.Navigator>
  );
}
