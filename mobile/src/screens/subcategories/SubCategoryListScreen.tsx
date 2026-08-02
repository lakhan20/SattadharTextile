import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Layers, Plus, Search, Trash2 } from 'lucide-react-native';
import { AppHeader } from '../../components/AppHeader';
import { Banner } from '../../components/Banner';
import { Card } from '../../components/Card';
import { Chip } from '../../components/Chip';
import { EmptyState } from '../../components/EmptyState';
import { TextField } from '../../components/TextField';
import { categoriesApi } from '../../api/categories';
import { subCategoriesApi } from '../../api/subcategories';
import type { Category, SubCategory } from '../../api/types';
import { useApiError, type ReadableError } from '../../hooks/useApiError';
import { useDebouncedValue } from '../../hooks/useDebouncedValue';
import { useAuthStore } from '../../store/authStore';
import { ICON_STROKE, TAP_TARGET, colors, radius, spacing, type } from '../../theme';
import type { ProductsStackParamList } from '../../navigation/types';

type Props = NativeStackScreenProps<ProductsStackParamList, 'SubCategories'>;

export function SubCategoryListScreen({ navigation }: Props) {
  const { t } = useTranslation();
  const readError = useApiError();
  const isAdmin = useAuthStore((s) => s.user?.role === 'ADMIN');

  const [categories, setCategories] = useState<Category[]>([]);
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebouncedValue(search);
  const [items, setItems] = useState<SubCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [failure, setFailure] = useState<ReadableError | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const result = await categoriesApi.list({ pageSize: 100, isActive: true });
        setCategories(result.items);
      } catch {
        // The filter row and category names are a convenience; a failed
        // fetch here should not block the sub-category list itself.
      }
    })();
  }, []);

  const categoryNameById = useMemo(() => {
    const map = new Map<string, string>();
    categories.forEach((c) => map.set(c.id, c.name));
    return map;
  }, [categories]);

  const load = useCallback(
    async (opts: { silent?: boolean } = {}) => {
      if (!opts.silent) setLoading(true);
      setFailure(null);
      try {
        const result = await subCategoriesApi.list({
          search: debouncedSearch.trim() || undefined,
          categoryId: categoryFilter ?? undefined,
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
    [debouncedSearch, categoryFilter, readError],
  );

  useEffect(() => {
    void load();
  }, [load]);

  function handleDelete(subCategory: SubCategory) {
    Alert.alert(t('subCategories.deleteConfirmTitle'), t('categories.deleteConfirmBody'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('common.delete'),
        style: 'destructive',
        onPress: async () => {
          try {
            await subCategoriesApi.remove(subCategory.id);
            setItems((prev) => prev.filter((s) => s.id !== subCategory.id));
          } catch (error) {
            const readable = readError(error);
            Alert.alert(readable.title, readable.body);
          }
        },
      },
    ]);
  }

  const hasQuery = debouncedSearch.trim().length > 0 || categoryFilter !== null;

  return (
    <View style={styles.root}>
      <AppHeader
        title={t('subCategories.title')}
        onBack={() => navigation.goBack()}
        right={
          isAdmin ? (
            <Pressable
              onPress={() => navigation.navigate('SubCategoryForm', { categoryId: categoryFilter ?? undefined })}
              accessibilityRole="button"
              accessibilityLabel={t('subCategories.add')}
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
          <View style={styles.headerBlock}>
            <TextField
              label=""
              value={search}
              onChangeText={setSearch}
              placeholder={t('subCategories.searchPlaceholder')}
              leftIcon={<Search size={18} color={colors.muted} strokeWidth={ICON_STROKE} />}
              autoCapitalize="none"
              autoCorrect={false}
            />

            {categories.length > 0 ? (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
                <Chip label={t('subCategories.all')} active={categoryFilter === null} onPress={() => setCategoryFilter(null)} />
                {categories.map((category) => (
                  <Chip
                    key={category.id}
                    label={category.name}
                    active={categoryFilter === category.id}
                    onPress={() => setCategoryFilter(category.id)}
                  />
                ))}
              </ScrollView>
            ) : null}

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
              icon={<Layers size={28} color={colors.primary} strokeWidth={ICON_STROKE} />}
              title={hasQuery ? t('common.noResults') : t(isAdmin ? 'subCategories.emptyTitleAdmin' : 'subCategories.emptyTitleStaff')}
              body={hasQuery ? undefined : t(isAdmin ? 'subCategories.emptyBodyAdmin' : 'subCategories.emptyBodyStaff')}
              actionLabel={!hasQuery && isAdmin ? t('subCategories.add') : undefined}
              onAction={!hasQuery && isAdmin ? () => navigation.navigate('SubCategoryForm', undefined) : undefined}
            />
          )
        }
        renderItem={({ item }) => (
          <Card
            onPress={isAdmin ? () => navigation.navigate('SubCategoryForm', { subCategoryId: item.id }) : undefined}
            style={styles.row}
          >
            <View style={[styles.rowContent, !item.isActive && styles.rowInactive]}>
              <View style={styles.rowText}>
                <Text style={styles.rowTitle} numberOfLines={1}>
                  {item.name}
                </Text>
                <View style={styles.rowMeta}>
                  <Text style={styles.rowCategory}>{categoryNameById.get(item.categoryId) ?? '—'}</Text>
                  {!item.isActive ? <Text style={styles.rowInactiveTag}>{t('common.off')}</Text> : null}
                </View>
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
  headerBlock: { marginBottom: spacing.md, gap: spacing.md },
  chipRow: { gap: spacing.sm },
  bannerSlot: {},
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
  rowCategory: { ...type.small, color: colors.muted },
  rowInactiveTag: { ...type.caption, color: colors.danger, textTransform: 'uppercase' },
  deleteButton: {
    width: TAP_TARGET - 12,
    height: TAP_TARGET - 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
