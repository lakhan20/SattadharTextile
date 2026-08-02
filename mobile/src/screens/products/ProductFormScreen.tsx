import { useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, Switch, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { AppHeader } from '../../components/AppHeader';
import { Banner } from '../../components/Banner';
import { Button } from '../../components/Button';
import { ImagePickerField } from '../../components/ImagePickerField';
import { Screen } from '../../components/Screen';
import { SegmentedControl } from '../../components/SegmentedControl';
import { SelectField } from '../../components/SelectField';
import { TagInput } from '../../components/TagInput';
import { TextField } from '../../components/TextField';
import { categoriesApi } from '../../api/categories';
import { ApiError } from '../../api/client';
import { resolveMediaUrl } from '../../api/config';
import { productsApi, type PickedImage } from '../../api/products';
import { subCategoriesApi } from '../../api/subcategories';
import type { Category, SubCategory, Unit } from '../../api/types';
import { useApiError, type ReadableError } from '../../hooks/useApiError';
import { useAuthStore } from '../../store/authStore';
import { useSettingsStore } from '../../store/settingsStore';
import { colors, spacing, tabularNumbers, type } from '../../theme';
import type { ProductsStackParamList } from '../../navigation/types';

type Props = NativeStackScreenProps<ProductsStackParamList, 'ProductForm'>;

/** Server accepts a string but only ever renders numbers; parses trimmed digits into a finite, non-negative value. */
function parseNonNegative(value: string): number | null {
  if (!value.trim()) return null;
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

export function ProductFormScreen({ navigation, route }: Props) {
  const { t } = useTranslation();
  const readError = useApiError();
  const isAdmin = useAuthStore((s) => s.user?.role === 'ADMIN');
  const baseUrl = useSettingsStore((s) => s.baseUrl);
  const productId = route.params?.productId;
  const isEdit = Boolean(productId);

  const [loading, setLoading] = useState(isEdit);
  const [categories, setCategories] = useState<Category[]>([]);
  const [subCategories, setSubCategories] = useState<SubCategory[]>([]);
  const initialCategoryRef = useRef<string | null>(null);

  const [name, setName] = useState('');
  const [sku, setSku] = useState('');
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [subCategoryId, setSubCategoryId] = useState<string | null>(null);
  const [hsnCode, setHsnCode] = useState('');
  const [unit, setUnit] = useState<Unit>('METER');
  const [retailRate, setRetailRate] = useState('');
  const [wholesaleRate, setWholesaleRate] = useState('');
  const [costPrice, setCostPrice] = useState('');
  const [gstPercent, setGstPercent] = useState('5');
  const [colours, setColours] = useState<string[]>([]);
  const [width, setWidth] = useState('');
  const [gsm, setGsm] = useState('');
  const [openingStock, setOpeningStock] = useState('0');
  const [currentStock, setCurrentStock] = useState<number | null>(null);
  const [reorderLevel, setReorderLevel] = useState('0');
  const [isActive, setIsActive] = useState(true);
  const [remoteImageUrl, setRemoteImageUrl] = useState<string | undefined>(undefined);
  const [pendingImage, setPendingImage] = useState<PickedImage | null>(null);

  const [submitting, setSubmitting] = useState(false);
  const [failure, setFailure] = useState<ReadableError | null>(null);
  const [conflict, setConflict] = useState(false);
  const [touched, setTouched] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string | undefined>>({});

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
    if (!productId) return;
    (async () => {
      try {
        const product = await productsApi.get(productId);
        initialCategoryRef.current = product.categoryId;
        setName(product.name);
        setSku(product.sku);
        setCategoryId(product.categoryId);
        setSubCategoryId(product.subCategoryId);
        setHsnCode(product.hsnCode ?? '');
        setUnit(product.unit);
        setRetailRate(String(product.retailRate));
        setWholesaleRate(String(product.wholesaleRate));
        if ('costPrice' in product) setCostPrice(String(product.costPrice ?? 0));
        setGstPercent(String(product.gstPercent));
        setColours(
          product.colour
            ? product.colour.split(',').map((c) => c.trim()).filter(Boolean)
            : [],
        );
        setWidth(product.width ?? '');
        setGsm(product.gsm != null ? String(product.gsm) : '');
        setCurrentStock(product.currentStock);
        setReorderLevel(String(product.reorderLevel));
        setIsActive(product.isActive);
        setRemoteImageUrl(resolveMediaUrl(product.imageUrl, baseUrl));
      } catch (error) {
        setFailure(readError(error));
      } finally {
        setLoading(false);
      }
    })();
    // Only the base URL used to build the initial image preview matters here;
    // re-resolving on every settings change would clobber a freshly picked image.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [productId, readError]);

  useEffect(() => {
    if (!categoryId) {
      setSubCategories([]);
      return;
    }
    (async () => {
      try {
        const result = await subCategoriesApi.list({ categoryId, pageSize: 100 });
        setSubCategories(result.items);
      } catch {
        // The dropdown just stays empty; this is not worth blocking the form over.
      }
    })();
  }, [categoryId]);

  useEffect(() => {
    if (categoryId !== initialCategoryRef.current) setSubCategoryId(null);
  }, [categoryId]);

  const categoryOptions = useMemo(() => categories.map((c) => ({ value: c.id, label: c.name })), [categories]);
  const subCategoryOptions = useMemo(
    () => subCategories.map((s) => ({ value: s.id, label: s.name })),
    [subCategories],
  );

  const nameError = fieldErrors.name ?? (touched && !name.trim() ? t('errors.fieldRequired') : undefined);
  const skuError = fieldErrors.sku ?? (touched && !sku.trim() ? t('errors.fieldRequired') : undefined);
  const categoryError = fieldErrors.categoryId ?? (touched && !categoryId ? t('errors.fieldRequired') : undefined);
  const retailRateValue = parseNonNegative(retailRate);
  const wholesaleRateValue = parseNonNegative(wholesaleRate);
  const retailRateError = fieldErrors.retailRate ?? (touched && retailRateValue === null ? t('errors.fieldRequired') : undefined);
  const wholesaleRateError =
    fieldErrors.wholesaleRate ?? (touched && wholesaleRateValue === null ? t('errors.fieldRequired') : undefined);

  async function handleSave() {
    setTouched(true);
    setConflict(false);
    setFieldErrors({});

    if (!name.trim() || !sku.trim() || !categoryId || retailRateValue === null || wholesaleRateValue === null) return;

    setSubmitting(true);
    setFailure(null);
    try {
      let imageUrl: string | undefined;
      if (pendingImage) {
        const uploaded = await productsApi.uploadImage(pendingImage);
        imageUrl = uploaded.imageUrl;
      }

      const gsmValue = parseNonNegative(gsm);
      const reorderValue = parseNonNegative(reorderLevel) ?? 0;
      const gstValue = parseNonNegative(gstPercent) ?? 0;
      const costPriceValue = isAdmin ? parseNonNegative(costPrice) ?? 0 : undefined;

      if (productId) {
        await productsApi.update(productId, {
          name: name.trim(),
          sku: sku.trim(),
          categoryId,
          subCategoryId: subCategoryId ?? null,
          hsnCode: hsnCode.trim() || undefined,
          unit,
          retailRate: retailRateValue,
          wholesaleRate: wholesaleRateValue,
          ...(isAdmin ? { costPrice: costPriceValue } : null),
          gstPercent: gstValue,
          colour: colours.length > 0 ? colours.join(', ') : undefined,
          width: width.trim() || undefined,
          gsm: gsmValue ?? undefined,
          reorderLevel: reorderValue,
          isActive,
          ...(imageUrl ? { imageUrl } : null),
        });
      } else {
        await productsApi.create({
          name: name.trim(),
          sku: sku.trim(),
          categoryId,
          subCategoryId: subCategoryId ?? undefined,
          hsnCode: hsnCode.trim() || undefined,
          unit,
          retailRate: retailRateValue,
          wholesaleRate: wholesaleRateValue,
          ...(isAdmin ? { costPrice: costPriceValue } : null),
          gstPercent: gstValue,
          colour: colours.length > 0 ? colours.join(', ') : undefined,
          width: width.trim() || undefined,
          gsm: gsmValue ?? undefined,
          openingStock: parseNonNegative(openingStock) ?? 0,
          reorderLevel: reorderValue,
          ...(imageUrl ? { imageUrl } : null),
        });
      }
      navigation.goBack();
    } catch (error) {
      if (error instanceof ApiError && error.code === 'CONFLICT') {
        setConflict(true);
      } else if (error instanceof ApiError && error.code === 'VALIDATION_ERROR') {
        setFieldErrors({
          name: error.fieldError('name'),
          sku: error.fieldError('sku'),
          categoryId: error.fieldError('categoryId'),
          retailRate: error.fieldError('retailRate'),
          wholesaleRate: error.fieldError('wholesaleRate'),
        });
        setFailure(readError(error));
      } else {
        setFailure(readError(error));
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <View style={styles.root}>
      <AppHeader title={t(isEdit ? 'products.edit' : 'products.add')} onBack={() => navigation.goBack()} />

      <Screen>
        {failure ? <Banner tone={failure.isOffline ? 'offline' : 'error'} title={failure.title} body={failure.body} /> : null}
        {conflict ? <Banner tone="error" title={t('products.conflict')} /> : null}

        {loading ? null : (
          <View style={styles.fields}>
            <ImagePickerField
              label={t('products.photo')}
              remoteUri={remoteImageUrl}
              onPick={setPendingImage}
              disabled={submitting}
            />

            <TextField label={t('products.name')} value={name} onChangeText={setName} error={nameError} editable={!submitting} autoCapitalize="words" />
            <TextField
              label={t('products.sku')}
              value={sku}
              onChangeText={(v) => setSku(v.toUpperCase())}
              error={skuError}
              editable={!submitting}
              autoCapitalize="characters"
              autoCorrect={false}
            />

            <SelectField
              label={t('products.category')}
              value={categoryId}
              onChange={setCategoryId}
              options={categoryOptions}
              placeholder={t('products.categoryPlaceholder')}
              error={categoryError}
              disabled={submitting}
            />

            <SelectField
              label={t('products.subCategory')}
              value={subCategoryId}
              onChange={setSubCategoryId}
              options={subCategoryOptions}
              placeholder={t('products.subCategoryPlaceholder')}
              disabled={submitting || !categoryId}
              clearable
              onClear={() => setSubCategoryId(null)}
            />

            <TextField label={t('products.hsnCode')} value={hsnCode} onChangeText={setHsnCode} editable={!submitting} autoCapitalize="characters" />

            <SegmentedControl
              label={t('products.unit')}
              value={unit}
              onChange={setUnit}
              options={[
                { value: 'METER', label: t('products.unitMeter') },
                { value: 'PIECE', label: t('products.unitPiece') },
              ]}
            />

            <View style={styles.row2}>
              <TextField
                label={t('products.retailRate')}
                value={retailRate}
                onChangeText={setRetailRate}
                error={retailRateError}
                editable={!submitting}
                keyboardType="decimal-pad"
                containerStyle={styles.half}
              />
              <TextField
                label={t('products.wholesaleRate')}
                value={wholesaleRate}
                onChangeText={setWholesaleRate}
                error={wholesaleRateError}
                editable={!submitting}
                keyboardType="decimal-pad"
                containerStyle={styles.half}
              />
            </View>

            {/* CRITICAL: cost price is an ADMIN-only field — STAFF must never see or submit it. */}
            {isAdmin ? (
              <TextField
                label={t('products.costPrice')}
                value={costPrice}
                onChangeText={setCostPrice}
                editable={!submitting}
                keyboardType="decimal-pad"
              />
            ) : null}

            <TextField label={t('products.gstPercent')} value={gstPercent} onChangeText={setGstPercent} editable={!submitting} keyboardType="decimal-pad" />

            <TagInput
              label={t('products.colour')}
              values={colours}
              onChange={setColours}
              placeholder={t('products.colourPlaceholder')}
              disabled={submitting}
            />

            <View style={styles.row2}>
              <TextField label={t('products.width')} value={width} onChangeText={setWidth} editable={!submitting} containerStyle={styles.half} />
              <TextField label={t('products.gsm')} value={gsm} onChangeText={setGsm} editable={!submitting} keyboardType="number-pad" containerStyle={styles.half} />
            </View>

            {isEdit ? (
              <View style={styles.readOnlyRow}>
                <Text style={styles.readOnlyLabel}>{t('products.currentStock')}</Text>
                <Text style={styles.readOnlyValue}>{currentStock}</Text>
              </View>
            ) : (
              <TextField label={t('products.openingStock')} value={openingStock} onChangeText={setOpeningStock} editable={!submitting} keyboardType="number-pad" />
            )}

            <TextField label={t('products.reorderLevel')} value={reorderLevel} onChangeText={setReorderLevel} editable={!submitting} keyboardType="number-pad" />

            {isEdit ? (
              <View style={styles.switchRow}>
                <Text style={styles.switchLabel}>{t('products.active')}</Text>
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
              label={submitting ? t('common.loading') : t('products.save')}
              onPress={() => void handleSave()}
              variant="gold"
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
  row2: { flexDirection: 'row', gap: spacing.md },
  half: { flex: 1 },
  readOnlyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.xs,
  },
  readOnlyLabel: { ...type.smallStrong, color: colors.text },
  readOnlyValue: { ...type.bodyStrong, color: colors.muted, ...tabularNumbers },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.xs,
  },
  switchLabel: { ...type.smallStrong, color: colors.text },
  submit: { marginTop: spacing.md },
});
