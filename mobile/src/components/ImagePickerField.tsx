import { useState } from 'react';
import { ActivityIndicator, Alert, Image, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { useTranslation } from 'react-i18next';
import { Camera, ImagePlus, X } from 'lucide-react-native';
import { ICON_STROKE, TAP_TARGET, colors, radius, spacing, type } from '../theme';
import type { PickedImage } from '../api/products';

interface ImagePickerFieldProps {
  label: string;
  /** Full URL of the image already on the server, shown until a new one is picked. */
  remoteUri?: string;
  onPick: (file: PickedImage) => void;
  disabled?: boolean;
}

/**
 * The backend rejects anything over this (see `middleware/upload.ts`), so it
 * is caught here with a clear message before an upload is even attempted.
 *
 * There is deliberately no client-side resize/re-encode step: expo-image-manipulator's
 * newer native module is not available inside Expo Go, and calling it there
 * crashed the JS thread right after the picker confirmed (looked like the
 * "Done"/checkmark button did nothing, then Metro rebuilt). The picker's own
 * `quality` option compresses the JPEG without needing a second native module,
 * which is the trade-off: no dimension resize, just recompression.
 */
const MAX_FILE_BYTES = 5 * 1024 * 1024;
const JPEG_QUALITY = 0.6;

export function ImagePickerField({ label, remoteUri, onPick, disabled = false }: ImagePickerFieldProps) {
  const { t } = useTranslation();
  const [localUri, setLocalUri] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [viewerOpen, setViewerOpen] = useState(false);

  const previewUri = localUri ?? remoteUri;

  function acceptAsset(asset: ImagePicker.ImagePickerAsset) {
    if (asset.fileSize && asset.fileSize > MAX_FILE_BYTES) {
      Alert.alert(label, t('errors.imageTooLarge'));
      return;
    }
    const mimeType = asset.mimeType === 'image/png' ? 'image/png' : 'image/jpeg';
    const ext = mimeType === 'image/png' ? 'png' : 'jpg';
    setLocalUri(asset.uri);
    onPick({ uri: asset.uri, name: `product-${Date.now()}.${ext}`, type: mimeType });
  }

  // Every step here is inside a try/catch: a permission prompt or the native
  // picker itself throwing (device busy, picker cancelled oddly, etc.) used
  // to fail silently — the "Done" tap looked like it did nothing. Now any
  // failure surfaces as an alert instead of vanishing.
  async function handleTakePhoto() {
    setBusy(true);
    try {
      const permission = await ImagePicker.requestCameraPermissionsAsync();
      if (!permission.granted) {
        Alert.alert(label, t('errors.cameraPermission'));
        return;
      }
      const result = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: JPEG_QUALITY });
      if (result.canceled || !result.assets[0]) return;
      acceptAsset(result.assets[0]);
    } catch (error) {
      Alert.alert(label, error instanceof Error ? error.message : t('errors.unknown'));
    } finally {
      setBusy(false);
    }
  }

  async function handlePickGallery() {
    setBusy(true);
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        Alert.alert(label, t('errors.mediaLibraryPermission'));
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: JPEG_QUALITY });
      if (result.canceled || !result.assets[0]) return;
      acceptAsset(result.assets[0]);
    } catch (error) {
      Alert.alert(label, error instanceof Error ? error.message : t('errors.unknown'));
    } finally {
      setBusy(false);
    }
  }

  function handlePickerPress() {
    if (disabled || busy) return;
    Alert.alert(label, undefined, [
      { text: t('products.takePhoto'), onPress: () => void handleTakePhoto() },
      { text: t('products.chooseFromGallery'), onPress: () => void handlePickGallery() },
      { text: t('common.cancel'), style: 'cancel' },
    ]);
  }

  return (
    <View>
      <Text style={styles.label}>{label}</Text>

      <Pressable
        // With a photo already picked, tapping it opens the full-size viewer;
        // changing it is a separate, explicit control below. With no photo
        // yet, tapping the empty box goes straight to the picker.
        onPress={previewUri ? () => setViewerOpen(true) : handlePickerPress}
        disabled={disabled || busy}
        accessibilityRole="button"
        accessibilityLabel={previewUri ? t('products.viewPhoto') : t('products.addPhoto')}
        style={[styles.box, disabled && styles.disabled]}
      >
        {previewUri ? (
          <Image source={{ uri: previewUri }} style={styles.image} />
        ) : (
          <View style={styles.placeholder}>
            <ImagePlus size={28} color={colors.muted} strokeWidth={ICON_STROKE} />
          </View>
        )}

        {busy ? (
          <View style={styles.overlay}>
            <ActivityIndicator color={colors.surface} />
          </View>
        ) : null}
      </Pressable>

      <Pressable
        onPress={handlePickerPress}
        disabled={disabled || busy}
        accessibilityRole="button"
        accessibilityLabel={previewUri ? t('products.changePhoto') : t('products.addPhoto')}
        style={[styles.changeButton, (disabled || busy) && styles.disabled]}
      >
        <Camera size={14} color={colors.primary} strokeWidth={ICON_STROKE} />
        <Text style={styles.changeButtonText}>{previewUri ? t('products.changePhoto') : t('products.addPhoto')}</Text>
      </Pressable>

      <Modal visible={viewerOpen} transparent animationType="fade" onRequestClose={() => setViewerOpen(false)}>
        <View style={styles.viewerBackdrop}>
          <Pressable
            onPress={() => setViewerOpen(false)}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel={t('common.close')}
            style={styles.viewerClose}
          >
            <X size={22} color={colors.onAccent} strokeWidth={ICON_STROKE} />
          </Pressable>
          {previewUri ? <Image source={{ uri: previewUri }} style={styles.viewerImage} resizeMode="contain" /> : null}
        </View>
      </Modal>
    </View>
  );
}

const BOX_SIZE = 128;

const styles = StyleSheet.create({
  label: { ...type.smallStrong, color: colors.text, marginBottom: spacing.xs + 2 },
  box: {
    width: BOX_SIZE,
    height: BOX_SIZE,
    borderRadius: radius.card,
    backgroundColor: colors.primarySoft,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  disabled: { opacity: 0.55 },
  placeholder: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  image: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, resizeMode: 'cover' },
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: colors.overlay,
    alignItems: 'center',
    justifyContent: 'center',
  },
  changeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: spacing.sm,
    minHeight: TAP_TARGET - 14,
    alignSelf: 'flex-start',
  },
  changeButtonText: { ...type.smallStrong, color: colors.primary },

  viewerBackdrop: {
    flex: 1,
    backgroundColor: colors.scrim,
    alignItems: 'center',
    justifyContent: 'center',
  },
  viewerClose: {
    position: 'absolute',
    top: spacing.xxl,
    right: spacing.lg,
    zIndex: 1,
    width: TAP_TARGET - 12,
    height: TAP_TARGET - 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  viewerImage: { width: '100%', height: '80%' },
});
