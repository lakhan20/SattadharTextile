import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Globe, Radio } from 'lucide-react-native';
import { AppHeader } from '../../components/AppHeader';
import { Banner } from '../../components/Banner';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { Screen } from '../../components/Screen';
import { TextField } from '../../components/TextField';
import { detectedLanBaseUrl, isValidBaseUrl, normaliseBaseUrl } from '../../api/config';
import { pingServer } from '../../api/auth';
import { useApiError } from '../../hooks/useApiError';
import { useSettingsStore } from '../../store/settingsStore';
import { ICON_STROKE, colors, spacing, type } from '../../theme';

type ProbeState =
  | { kind: 'idle' }
  | { kind: 'testing' }
  | { kind: 'ok'; database: 'up' | 'down' }
  | { kind: 'failed'; title: string; body?: string | undefined };

export function ServerScreen({ onBack }: { onBack: () => void }) {
  const { t } = useTranslation();
  const readError = useApiError();

  const savedUrl = useSettingsStore((s) => s.baseUrl);
  const setBaseUrl = useSettingsStore((s) => s.setBaseUrl);

  const [draft, setDraft] = useState(savedUrl);
  const [probe, setProbe] = useState<ProbeState>({ kind: 'idle' });
  const [saved, setSaved] = useState(false);

  const detected = detectedLanBaseUrl();
  const valid = isValidBaseUrl(draft);
  const dirty = normaliseBaseUrl(draft) !== savedUrl;

  async function handleTest() {
    if (!valid) return;
    setProbe({ kind: 'testing' });
    setSaved(false);
    try {
      const health = await pingServer(normaliseBaseUrl(draft));
      setProbe({ kind: 'ok', database: health.database });
    } catch (error) {
      const readable = readError(error);
      setProbe({ kind: 'failed', title: t('server.unreachable'), body: readable.body ?? readable.title });
    }
  }

  function handleSave() {
    if (!valid) return;
    setBaseUrl(draft);
    setDraft(normaliseBaseUrl(draft));
    setSaved(true);
  }

  return (
    <View style={styles.root}>
      <AppHeader title={t('server.title')} subtitle={t('server.subtitle')} onBack={onBack} />

      <Screen>
        <Card>
          <TextField
            label={t('server.urlLabel')}
            placeholder={t('server.urlPlaceholder')}
            hint={t('server.urlHint')}
            error={draft.length > 0 && !valid ? t('server.invalidUrl') : undefined}
            value={draft}
            onChangeText={(value) => {
              setDraft(value);
              setProbe({ kind: 'idle' });
              setSaved(false);
            }}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
            inputMode="url"
            leftIcon={<Globe size={19} color={colors.muted} strokeWidth={ICON_STROKE} />}
          />

          {detected && normaliseBaseUrl(draft) !== detected ? (
            <View style={styles.detected}>
              <Text style={styles.detectedText}>{t('server.detectedHint', { url: detected })}</Text>
              <Button
                label={t('server.useDetected')}
                onPress={() => {
                  setDraft(detected);
                  setProbe({ kind: 'idle' });
                  setSaved(false);
                }}
                variant="ghost"
                size="small"
                fullWidth={false}
              />
            </View>
          ) : null}

          {probe.kind === 'ok' ? (
            <View style={styles.result}>
              <Banner tone="success" title={t('server.reachable', { database: probe.database })} />
            </View>
          ) : null}

          {probe.kind === 'failed' ? (
            <View style={styles.result}>
              <Banner tone="offline" title={probe.title} body={probe.body} />
            </View>
          ) : null}

          {saved ? (
            <View style={styles.result}>
              <Banner tone="success" title={t('server.saved')} />
            </View>
          ) : null}

          <View style={styles.actions}>
            <Button
              label={probe.kind === 'testing' ? t('server.testing') : t('server.test')}
              onPress={() => void handleTest()}
              variant="outline"
              loading={probe.kind === 'testing'}
              disabled={!valid}
              icon={<Radio size={17} color={colors.primary} strokeWidth={ICON_STROKE} />}
            />
            <Button
              label={t('common.save')}
              onPress={handleSave}
              variant="accent"
              disabled={!valid || !dirty}
            />
          </View>
        </Card>

        <View style={styles.currentBlock}>
          <Text style={styles.currentLabel}>{t('server.current')}</Text>
          <Text style={styles.currentValue}>{savedUrl}</Text>
        </View>
      </Screen>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  detected: {
    marginTop: spacing.lg,
    padding: spacing.md,
    borderRadius: 8,
    backgroundColor: colors.primarySoft,
    gap: spacing.sm,
    alignItems: 'flex-start',
  },
  detectedText: { ...type.small, color: colors.primary },
  result: { marginTop: spacing.lg },
  actions: { marginTop: spacing.xl, gap: spacing.md },
  currentBlock: { paddingHorizontal: spacing.xs },
  currentLabel: { ...type.caption, color: colors.muted, textTransform: 'uppercase' },
  currentValue: { ...type.small, color: colors.text, marginTop: 2 },
});
