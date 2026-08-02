import { useEffect, useMemo, useState } from 'react';
import { StyleSheet, Switch, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { AppHeader } from '../../components/AppHeader';
import { Banner } from '../../components/Banner';
import { Button } from '../../components/Button';
import { Screen } from '../../components/Screen';
import { SelectField } from '../../components/SelectField';
import { TextField } from '../../components/TextField';
import { categoriesApi } from '../../api/categories';
import { subCategoriesApi } from '../../api/subcategories';
import { ApiError } from '../../api/client';
import type { Category } from '../../api/types';
import { useApiError, type ReadableError } from '../../hooks/useApiError';
import { colors, spacing, type } from '../../theme';
import type { ProductsStackParamList } from '../../navigation/types';

type Props = NativeStackScreenProps<ProductsStackParamList, 'SubCategoryForm'>;

export function SubCategoryFormScreen({ navigation, route }: Props) {
  const { t } = useTranslation();
  const readError = useApiError();
  const subCategoryId = route.params?.subCategoryId;
  const isEdit = Boolean(subCategoryId);

  const [loading, setLoading] = useState(isEdit);
  const [categories, setCategories] = useState<Category[]>([]);
  const [name, setName] = useState('');
  const [categoryId, setCategoryId] = useState<string | null>(route.params?.categoryId ?? null);
  const [isActive, setIsActive] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [failure, setFailure] = useState<ReadableError | null>(null);
  const [touched, setTouched] = useState(false);
  const [conflict, setConflict] = useState(false);
  const [inactiveCategoryError, setInactiveCategoryError] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const result = await categoriesApi.list({ pageSize: 100, isActive: true });
        setCategories(result.items);
      } catch (error) {
        setFailure(readError(error));
      }
    })();
  }, [readError]);

  useEffect(() => {
    if (!subCategoryId) return;
    (async () => {
      try {
        const subCategory = await subCategoriesApi.get(subCategoryId);
        setName(subCategory.name);
        setCategoryId(subCategory.categoryId);
        setIsActive(subCategory.isActive);
      } catch (error) {
        setFailure(readError(error));
      } finally {
        setLoading(false);
      }
    })();
  }, [subCategoryId, readError]);

  const categoryOptions = useMemo(
    () => categories.map((c) => ({ value: c.id, label: c.name })),
    [categories],
  );

  const nameError = touched && !name.trim() ? t('errors.fieldRequired') : undefined;
  const categoryError = touched && !categoryId ? t('errors.fieldRequired') : undefined;

  async function handleSave() {
    setTouched(true);
    setConflict(false);
    setInactiveCategoryError(false);
    if (!name.trim() || !categoryId) return;

    setSubmitting(true);
    setFailure(null);
    try {
      if (subCategoryId) {
        await subCategoriesApi.update(subCategoryId, { name: name.trim(), categoryId, isActive });
      } else {
        await subCategoriesApi.create({ name: name.trim(), categoryId });
      }
      navigation.goBack();
    } catch (error) {
      if (error instanceof ApiError && error.code === 'CONFLICT') {
        setConflict(true);
      } else if (error instanceof ApiError && error.code === 'VALIDATION_ERROR') {
        setInactiveCategoryError(true);
      } else {
        setFailure(readError(error));
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <View style={styles.root}>
      <AppHeader title={t(isEdit ? 'subCategories.edit' : 'subCategories.add')} onBack={() => navigation.goBack()} />

      <Screen>
        {failure ? <Banner tone={failure.isOffline ? 'offline' : 'error'} title={failure.title} body={failure.body} /> : null}
        {conflict ? <Banner tone="error" title={t('subCategories.conflict')} /> : null}
        {inactiveCategoryError ? <Banner tone="error" title={t('subCategories.inactiveCategoryError')} /> : null}

        {loading ? null : (
          <View style={styles.fields}>
            <TextField
              label={t('subCategories.name')}
              value={name}
              onChangeText={setName}
              error={nameError}
              editable={!submitting}
              autoCapitalize="words"
            />

            <SelectField
              label={t('subCategories.category')}
              value={categoryId}
              onChange={setCategoryId}
              options={categoryOptions}
              placeholder={t('subCategories.categoryPlaceholder')}
              error={categoryError}
              disabled={submitting}
            />

            {isEdit ? (
              <View style={styles.switchRow}>
                <Text style={styles.switchLabel}>{t('subCategories.active')}</Text>
                <Switch
                  value={isActive}
                  onValueChange={setIsActive}
                  disabled={submitting}
                  trackColor={{ false: colors.border, true: colors.primary }}
                  thumbColor={colors.surface}
                />
              </View>
            ) : null}

            <Button
              label={submitting ? t('common.loading') : t('subCategories.save')}
              onPress={() => void handleSave()}
              variant="accent"
              loading={submitting}
              style={styles.submit}
            />
          </View>
        )}
      </Screen>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  fields: { gap: spacing.lg },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.xs,
  },
  switchLabel: { ...type.smallStrong, color: colors.text },
  submit: { marginTop: spacing.md },
});
