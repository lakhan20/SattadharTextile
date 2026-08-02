import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Plus, X } from 'lucide-react-native';
import { ICON_STROKE, TAP_TARGET, colors, radius, spacing, type } from '../theme';
import { TextField } from './TextField';

interface TagInputProps {
  label: string;
  values: string[];
  onChange: (values: string[]) => void;
  placeholder?: string;
  disabled?: boolean;
}

/**
 * A product can come in several colours without being several products —
 * this stores each colour as a tag rather than one free-text value.
 */
export function TagInput({ label, values, onChange, placeholder, disabled = false }: TagInputProps) {
  const [draft, setDraft] = useState('');

  function commit() {
    const value = draft.trim();
    if (!value) return;
    if (!values.some((v) => v.toLowerCase() === value.toLowerCase())) {
      onChange([...values, value]);
    }
    setDraft('');
  }

  function remove(index: number) {
    onChange(values.filter((_, i) => i !== index));
  }

  return (
    <View>
      <Text style={styles.label}>{label}</Text>

      {values.length > 0 ? (
        <View style={styles.tagRow}>
          {values.map((value, index) => (
            <View key={`${value}-${index}`} style={styles.tag}>
              <Text style={styles.tagText}>{value}</Text>
              {!disabled ? (
                <Pressable onPress={() => remove(index)} hitSlop={8} accessibilityRole="button" accessibilityLabel={`Remove ${value}`}>
                  <X size={13} color={colors.primary} strokeWidth={ICON_STROKE} />
                </Pressable>
              ) : null}
            </View>
          ))}
        </View>
      ) : null}

      <View style={styles.inputRow}>
        <TextField
          label=""
          value={draft}
          onChangeText={setDraft}
          placeholder={placeholder}
          editable={!disabled}
          onSubmitEditing={commit}
          returnKeyType="done"
          containerStyle={styles.input}
        />
        <Pressable
          onPress={commit}
          disabled={disabled || !draft.trim()}
          accessibilityRole="button"
          accessibilityLabel="Add"
          style={[styles.addButton, (disabled || !draft.trim()) && styles.addButtonDisabled]}
        >
          <Plus size={18} color="#FFFFFF" strokeWidth={ICON_STROKE} />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  label: { ...type.smallStrong, color: colors.text, marginBottom: spacing.xs + 2 },
  tagRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.sm },
  tag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: spacing.md,
    height: 34,
    borderRadius: radius.pill,
    backgroundColor: colors.primarySoft,
  },
  tagText: { ...type.smallStrong, color: colors.primary },
  inputRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  input: { flex: 1 },
  addButton: {
    width: TAP_TARGET,
    height: TAP_TARGET,
    borderRadius: radius.input,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addButtonDisabled: { opacity: 0.4 },
});
