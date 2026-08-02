import { useEffect, useState } from 'react';
import { StyleSheet, Switch, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { AppHeader } from '../../components/AppHeader';
import { Banner } from '../../components/Banner';
import { Button } from '../../components/Button';
import { Screen } from '../../components/Screen';
import { TextField } from '../../components/TextField';
import { categoriesApi } from '../../api/categories';
import { ApiError } from '../../api/client';
import { useApiError, type ReadableError } from '../../hooks/useApiError';
import { colors, spacing, type } from '../../theme';
import type { ProductsStackParamList } from '../../navigation/types';

type Props = NativeStackScreenProps<ProductsStackParamList, 'CategoryForm'>;

export function CategoryFormScreen({ navigation, route }: Props) {
  const { t } = useTranslation();
  const readError = useApiError();
  const categoryId = route.params?.categoryId;
  const isEdit = Boolean(categoryId);

  const [loading, setLoading] = useState(isEdit);
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [description, setDescription] = useState('');
  const [isActive, setIsActive] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [failure, setFailure] = useState<ReadableError | null>(null);
  const [touched, setTouched] = useState(false);
  const [conflict, setConflict] = useState(false);

  useEffect(() => {
    if (!categoryId) return;
    (async () => {
      try {
        const category = await categoriesApi.get(categoryId);
        setName(category.name);
        setCode(category.code);
        setDescription(category.description ?? '');
        setIsActive(category.isActive);
      } catch (error) {
        setFailure(readError(error));
      } finally {
        setLoading(false);
      }
    })();
  }, [categoryId, readError]);

  const nameError = touched && !name.trim() ? t('errors.fieldRequired') : undefined;
  const codeError = touched && !code.trim() ? t('errors.fieldRequired') : undefined;

  async function handleSave() {
    setTouched(true);
    setConflict(false);
    if (!name.trim() || !code.trim()) return;

    setSubmitting(true);
    setFailure(null);
    try {
      if (categoryId) {
        await categoriesApi.update(categoryId, {
          name: name.trim(),
          code: code.trim(),
          description: description.trim() || undefined,
          isActive,
        });
      } else {
        await categoriesApi.create({
          name: name.trim(),
          code: code.trim(),
          description: description.trim() || undefined,
        });
      }
      navigation.goBack();
    } catch (error) {
      if (error instanceof ApiError && error.code === 'CONFLICT') {
        setConflict(true);
      } else {
        setFailure(readError(error));
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <View style={styles.root}>
      <AppHeader title={t(isEdit ? 'categories.edit' : 'categories.add')} onBack={() => navigation.goBack()} />

      <Screen>
        {failure ? <Banner tone={failure.isOffline ? 'offline' : 'error'} title={failure.title} body={failure.body} /> : null}
        {conflict ? <Banner tone="error" title={t('categories.conflict')} /> : null}

        {loading ? null : (
          <View style={styles.fields}>
            <TextField
              label={t('categories.name')}
              value={name}
              onChangeText={setName}
              error={nameError}
              editable={!submitting}
              autoCapitalize="words"
            />
            <TextField
              label={t('categories.code')}
              value={code}
              onChangeText={(v) => setCode(v.toUpperCase())}
              error={codeError}
              editable={!submitting}
              autoCapitalize="characters"
              autoCorrect={false}
              hint="A–Z, 0–9, _ and - only"
            />
            <TextField
              label={t('categories.description')}
              value={description}
              onChangeText={setDescription}
              editable={!submitting}
              multiline
            />

            {isEdit ? (
              <View style={styles.switchRow}>
                <Text style={styles.switchLabel}>{t('categories.active')}</Text>
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
              label={submitting ? t('common.loading') : t('categories.save')}
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
