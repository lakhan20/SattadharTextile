import { Image, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Package } from 'lucide-react-native';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { resolveMediaUrl } from '../../api/config';
import type { Product } from '../../api/types';
import { useSettingsStore } from '../../store/settingsStore';
import { ICON_STROKE, colors, radius, spacing, tabularNumbers, type } from '../../theme';
import { useStockFormat } from './stockFormat';

interface SelectedProductCardProps {
  product: Product | null;
  onPick: () => void;
}

/** The chosen product, with the balance the entry is about to change. */
export function SelectedProductCard({ product, onPick }: SelectedProductCardProps) {
  const { t } = useTranslation();
  const baseUrl = useSettingsStore((s) => s.baseUrl);
  const { formatStock } = useStockFormat();

  if (!product) {
    return (
      <Card>
        <Text style={styles.emptyTitle}>{t('stock.noProductChosen')}</Text>
        <Text style={styles.emptyBody}>{t('stock.noProductChosenBody')}</Text>
        <Button label={t('stock.pickProduct')} onPress={onPick} variant="outline" style={styles.emptyAction} />
      </Card>
    );
  }

  const imageUri = resolveMediaUrl(product.imageUrl, baseUrl);
  const low = product.currentStock <= product.reorderLevel;

  return (
    <Card tone={low ? 'warning' : 'default'}>
      <View style={styles.row}>
        {imageUri ? (
          <Image source={{ uri: imageUri }} style={styles.thumb} />
        ) : (
          <View style={styles.thumbPlaceholder}>
            <Package size={22} color={colors.muted} strokeWidth={ICON_STROKE} />
          </View>
        )}

        <View style={styles.text}>
          <Text style={styles.name} numberOfLines={1}>
            {product.name}
          </Text>
          <Text style={styles.sku} numberOfLines={1}>
            {product.sku}
          </Text>
          <Text style={styles.balance}>
            {t('stock.currentBalance')} <Text style={styles.balanceValue}>{formatStock(product.currentStock, product.unit)}</Text>
          </Text>
        </View>
      </View>

      <Button label={t('billing.change')} onPress={onPick} variant="ghost" size="small" style={styles.change} />
    </Card>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  thumb: { width: 52, height: 52, borderRadius: radius.input, backgroundColor: colors.primarySoft },
  thumbPlaceholder: {
    width: 52,
    height: 52,
    borderRadius: radius.input,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: { flex: 1, gap: 2 },
  name: { ...type.bodyStrong, color: colors.text },
  sku: { ...type.small, color: colors.muted },
  balance: { ...type.small, color: colors.muted, marginTop: 2 },
  balanceValue: { ...type.smallStrong, color: colors.text, ...tabularNumbers },
  change: { marginTop: spacing.sm, alignSelf: 'flex-start' },

  emptyTitle: { ...type.bodyStrong, color: colors.text },
  emptyBody: { ...type.small, color: colors.muted, marginTop: 2 },
  emptyAction: { marginTop: spacing.md },
});
