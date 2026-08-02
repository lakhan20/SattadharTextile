import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { BillDetailScreen } from '../screens/billing/BillDetailScreen';
import { BillEditScreen } from '../screens/billing/BillEditScreen';
import { BillRevisionsScreen } from '../screens/billing/BillRevisionsScreen';
import { CustomerBillsScreen } from '../screens/customers/CustomerBillsScreen';
import { CustomerDetailScreen } from '../screens/customers/CustomerDetailScreen';
import { CustomerFormScreen } from '../screens/customers/CustomerFormScreen';
import { CustomersListScreen } from '../screens/customers/CustomersListScreen';
import { AgeingScreen } from '../screens/khata/AgeingScreen';
import { CustomerKhataScreen } from '../screens/khata/CustomerKhataScreen';
import { KhataNoteScreen } from '../screens/khata/KhataNoteScreen';
import { OutstandingScreen } from '../screens/khata/OutstandingScreen';
import { RecordPaymentScreen } from '../screens/khata/RecordPaymentScreen';
import { useAuthStore, useHasMenu, useHasPermission } from '../store/authStore';
import type { CustomersStackParamList } from './types';

const Stack = createNativeStackNavigator<CustomersStackParamList>();

/**
 * The Customers tab, and the khata behind it.
 *
 * The last three screens are registered ONLY for the shop owner. A staff
 * session's navigator does not contain a `Outstanding`, `Ageing` or
 * `KhataNote` route at all — not a hidden one, not a disabled one — so there
 * is nothing to reach by deep link, by a stale back-stack entry, or by a
 * mistyped `navigate()`. The server's 403 is still the real boundary; this is
 * defence in depth on top of it, exactly as with the Reports stack.
 *
 * The khata screens — one customer's book, and taking money against it — are
 * registered only when the owner put `KHATA` on this account's menu. That is
 * visibility, not authority: what actually decides whether a payment may be
 * recorded is the `payment.record` permission, checked server-side on every
 * call. An account with the permission and no menu simply has no screen to do
 * it from; an account with the menu and no permission gets a 403 at the button.
 */
export function CustomersStackNavigator() {
  const isAdmin = useAuthStore((s) => s.user?.role === 'ADMIN');
  const canEdit = useHasPermission('bill.edit');
  const hasKhata = useHasMenu('KHATA');

  return (
    <Stack.Navigator screenOptions={{ headerShown: false, animation: 'slide_from_right' }}>
      <Stack.Screen name="CustomersList" component={CustomersListScreen} />
      {/* Not role-gated: `customer.create` is a permission toggle the owner
          can flip at any time, so the screens that link here check the
          permission instead, and the server has the final say. */}
      <Stack.Screen name="CustomerForm" component={CustomerFormScreen} />
      <Stack.Screen name="CustomerDetail" component={CustomerDetailScreen} />
      <Stack.Screen name="CustomerBills" component={CustomerBillsScreen} />
      {hasKhata ? (
        <>
          <Stack.Screen name="CustomerKhata" component={CustomerKhataScreen} />
          <Stack.Screen name="RecordPayment" component={RecordPaymentScreen} />
        </>
      ) : null}

      {/* A bill opened from a customer's history stays in THIS stack, so back
          returns to the customer rather than dropping the user into the
          Billing tab halfway through a conversation at the counter. */}
      <Stack.Screen name="BillDetail" component={BillDetailScreen} />
      <Stack.Screen name="BillRevisions" component={BillRevisionsScreen} />
      {canEdit ? <Stack.Screen name="BillEdit" component={BillEditScreen} /> : null}

      {isAdmin ? (
        <>
          <Stack.Screen name="KhataNote" component={KhataNoteScreen} />
          <Stack.Screen name="Outstanding" component={OutstandingScreen} />
          <Stack.Screen name="Ageing" component={AgeingScreen} />
        </>
      ) : null}
    </Stack.Navigator>
  );
}
