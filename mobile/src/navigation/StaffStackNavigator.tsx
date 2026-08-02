import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { StaffDetailScreen } from '../screens/staff/StaffDetailScreen';
import { StaffFormScreen } from '../screens/staff/StaffFormScreen';
import { StaffListScreen } from '../screens/staff/StaffListScreen';
import type { StaffStackParamList } from './types';

const Stack = createNativeStackNavigator<StaffStackParamList>();

/**
 * Staff accounts, and which screens each of them sees.
 *
 * Registered only in the owner's branch of `AppFlow`, so a staff session's
 * navigator contains none of this. That is deliberate belt-and-braces: every
 * endpoint behind these screens is `requireRole(ADMIN)` and returns 403 for a
 * staff token regardless of what the app renders.
 */
export function StaffStackNavigator() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false, animation: 'slide_from_right' }}>
      <Stack.Screen name="StaffList" component={StaffListScreen} />
      <Stack.Screen name="StaffForm" component={StaffFormScreen} />
      <Stack.Screen name="StaffDetail" component={StaffDetailScreen} />
    </Stack.Navigator>
  );
}
