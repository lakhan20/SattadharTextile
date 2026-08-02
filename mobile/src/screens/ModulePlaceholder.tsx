import { StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Users } from 'lucide-react-native';
import { AppHeader } from '../components/AppHeader';
import { EmptyState } from '../components/EmptyState';
import { Screen } from '../components/Screen';
import { ICON_STROKE, colors } from '../theme';

/**
 * Customers is wired into the tab bar so the shape of the app is real, but
 * the module is not built yet — only the read-only lookup the billing
 * customer picker needs. Rather than fake a list, it says plainly what it
 * will hold and when.
 */

function Placeholder({
  title,
  icon,
  emptyTitle,
  emptyBody,
}: {
  title: string;
  icon: React.ReactNode;
  emptyTitle: string;
  emptyBody: string;
}) {
  const { t } = useTranslation();
  return (
    <View style={styles.root}>
      <AppHeader title={title} />
      <Screen scroll={false} contentStyle={styles.center}>
        <EmptyState icon={icon} badge={t('modules.buildingNow')} title={emptyTitle} body={emptyBody} />
      </Screen>
    </View>
  );
}

export function CustomersScreen() {
  const { t } = useTranslation();
  return (
    <Placeholder
      title={t('tabs.customers')}
      icon={<Users size={28} color={colors.primary} strokeWidth={ICON_STROKE} />}
      emptyTitle={t('modules.customersTitle')}
      emptyBody={t('modules.customersBody')}
    />
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  center: { flex: 1, justifyContent: 'center' },
});
