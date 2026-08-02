import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Plus, Search, Tags, Trash2 } from 'lucide-react-native';
import { AppHeader } from '../../components/AppHeader';
import { Banner } from '../../components/Banner';
import { Card } from '../../components/Card';
import { EmptyState } from '../../components/EmptyState';
import { TextField } from '../../components/TextField';
import { categoriesApi } from '../../api/categories';
import type { Category } from '../../api/types';
import { useApiError, type ReadableError } from '../../hooks/useApiError';
import { useDebouncedValue } from '../../hooks/useDebouncedValue';
import { useAuthStore } from '../../store/authStore';
import { ICON_STROKE, TAP_TARGET, colors, radius, spacing, type } from '../../theme';
import type { ProductsStackParamList } from '../../navigation/types';

type Props = NativeStackScreenProps<ProductsStackParamList, 'Categories'>;

export function CategoryListScreen({ navigation }: Props) {
  const { t } = useTranslation();
  const readError = useApiError();
  const isAdmin = useAuthStore((s) => s.user?.role === 'ADMIN');

  const [search, setSearch] = useState('');
  const debouncedSearch = useDebouncedValue(search);
  const [items, setItems] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [failure, setFailure] = useState<ReadableError | null>(null);

  const load = useCallback(
    async (opts: { silent?: boolean } = {}) => {
      if (!opts.silent) setLoading(true);
      setFailure(null);
      try {
        const result = await categoriesApi.list({
          search: debouncedSearch.trim() || undefined,
          pageSize: 100,
        });
        setItems(result.items);
      } catch (error) {
        setFailure(readError(error));
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [debouncedSearch, readError],
  );

  useEffect(() => {
    void load();
  }, [load]);

  function handleDelete(category: Category) {
    Alert.alert(t('categories.deleteConfirmTitle'), t('categories.deleteConfirmBody'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('common.delete'),
        style: 'destructive',
        onPress: async () => {
          try {
            await categoriesApi.remove(category.id);
            setItems((prev) => prev.filter((c) => c.id !== category.id));
          } catch (error) {
            const readable = readError(error);
            Alert.alert(readable.title, readable.body);
          }
        },
      },
    ]);
  }

  const hasQuery = debouncedSearch.trim().length > 0;

  return (
    <View style={styles.root}>
      <AppHeader
        title={t('categories.title')}
        onBack={() => navigation.goBack()}
        right={
          isAdmin ? (
            <Pressable
              onPress={() => navigation.navigate('CategoryForm')}
              accessibilityRole="button"
              accessibilityLabel={t('categories.add')}
              style={styles.addButton}
            >
              <Plus size={20} color="#FFFFFF" strokeWidth={ICON_STROKE} />
            </Pressable>
          ) : undefined
        }
      />

      <FlatList
        data={items}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        refreshing={refreshing}
        onRefresh={() => {
          setRefreshing(true);
          void load({ silent: true });
        }}
        ListHeaderComponent={
          <View style={styles.searchWrap}>
            <TextField
              label=""
              value={search}
              onChangeText={setSearch}
              placeholder={t('categories.searchPlaceholder')}
              leftIcon={<Search size={18} color={colors.muted} strokeWidth={ICON_STROKE} />}
              autoCapitalize="none"
              autoCorrect={false}
            />
            {failure ? (
              <View style={styles.bannerSlot}>
                <Banner tone={failure.isOffline ? 'offline' : 'error'} title={failure.title} body={failure.body} />
              </View>
            ) : null}
          </View>
        }
        ListEmptyComponent={
          loading ? (
            <ActivityIndicator style={styles.spinner} color={colors.primary} />
          ) : failure ? null : (
            <EmptyState
              icon={<Tags size={28} color={colors.primary} strokeWidth={ICON_STROKE} />}
              title={hasQuery ? t('common.noResults') : t(isAdmin ? 'categories.emptyTitleAdmin' : 'categories.emptyTitleStaff')}
              body={hasQuery ? undefined : t(isAdmin ? 'categories.emptyBodyAdmin' : 'categories.emptyBodyStaff')}
              actionLabel={!hasQuery && isAdmin ? t('categories.add') : undefined}
              onAction={!hasQuery && isAdmin ? () => navigation.navigate('CategoryForm') : undefined}
            />
          )
        }
        renderItem={({ item }) => (
          <Card
            onPress={isAdmin ? () => navigation.navigate('CategoryForm', { categoryId: item.id }) : undefined}
            style={styles.row}
            tone={item.isActive ? 'default' : undefined}
          >
            <View style={[styles.rowContent, !item.isActive && styles.rowInactive]}>
              <View style={styles.rowText}>
                <Text style={styles.rowTitle} numberOfLines={1}>
                  {item.name}
                </Text>
                <View style={styles.rowMeta}>
                  <Text style={styles.rowCode}>{item.code}</Text>
                  {!item.isActive ? <Text style={styles.rowInactiveTag}>{t('common.off')}</Text> : null}
                </View>
                {item.description ? (
                  <Text style={styles.rowDescription} numberOfLines={1}>
                    {item.description}
                  </Text>
                ) : null}
              </View>

              {isAdmin ? (
                <Pressable
                  onPress={() => handleDelete(item)}
                  hitSlop={10}
                  accessibilityRole="button"
                  accessibilityLabel={t('common.delete')}
                  style={styles.deleteButton}
                >
                  <Trash2 size={18} color={colors.danger} strokeWidth={ICON_STROKE} />
                </Pressable>
              ) : null}
            </View>
          </Card>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  list: { padding: spacing.lg, gap: spacing.md, flexGrow: 1 },
  searchWrap: { marginBottom: spacing.md },
  bannerSlot: { marginTop: spacing.md },
  spinner: { marginTop: spacing.xxxl },
  addButton: {
    width: TAP_TARGET - 12,
    height: TAP_TARGET - 12,
    borderRadius: radius.pill,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  row: { marginBottom: spacing.sm },
  rowContent: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  rowInactive: { opacity: 0.55 },
  rowText: { flex: 1, gap: 2 },
  rowTitle: { ...type.bodyStrong, color: colors.text },
  rowMeta: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  rowCode: { ...type.small, color: colors.muted },
  rowInactiveTag: { ...type.caption, color: colors.danger, textTransform: 'uppercase' },
  rowDescription: { ...type.small, color: colors.muted, marginTop: 2 },
  deleteButton: {
    width: TAP_TARGET - 12,
    height: TAP_TARGET - 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
