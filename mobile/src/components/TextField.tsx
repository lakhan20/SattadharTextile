import { forwardRef, useState, type ReactNode } from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type StyleProp,
  type TextInputProps,
  type ViewStyle,
} from 'react-native';
import { Eye, EyeOff } from 'lucide-react-native';
import { ICON_STROKE, TAP_TARGET, colors, radius, spacing, type } from '../theme';

interface TextFieldProps extends Omit<TextInputProps, 'style'> {
  label: string;
  error?: string | undefined;
  hint?: string;
  leftIcon?: ReactNode;
  /** Adds the show/hide eye and starts masked. */
  secure?: boolean;
  containerStyle?: StyleProp<ViewStyle>;
  showPasswordLabel?: string;
  hidePasswordLabel?: string;
}

export const TextField = forwardRef<TextInput, TextFieldProps>(function TextField(
  {
    label,
    error,
    hint,
    leftIcon,
    secure = false,
    containerStyle,
    showPasswordLabel = 'Show password',
    hidePasswordLabel = 'Hide password',
    ...inputProps
  },
  ref,
) {
  const [focused, setFocused] = useState(false);
  const [revealed, setRevealed] = useState(false);

  const borderColor = error ? colors.danger : focused ? colors.primary : colors.border;

  return (
    <View style={containerStyle}>
      <Text style={styles.label}>{label}</Text>

      <View style={[styles.field, { borderColor, borderWidth: focused || error ? 1.5 : 1 }]}>
        {leftIcon ? <View style={styles.leftIcon}>{leftIcon}</View> : null}

        <TextInput
          ref={ref}
          style={styles.input}
          placeholderTextColor={colors.muted}
          secureTextEntry={secure && !revealed}
          onFocus={(e) => {
            setFocused(true);
            inputProps.onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            inputProps.onBlur?.(e);
          }}
          accessibilityLabel={label}
          {...inputProps}
        />

        {secure ? (
          <Pressable
            onPress={() => setRevealed((v) => !v)}
            hitSlop={12}
            style={styles.eye}
            accessibilityRole="button"
            accessibilityLabel={revealed ? hidePasswordLabel : showPasswordLabel}
          >
            {revealed ? (
              <EyeOff size={20} color={colors.muted} strokeWidth={ICON_STROKE} />
            ) : (
              <Eye size={20} color={colors.muted} strokeWidth={ICON_STROKE} />
            )}
          </Pressable>
        ) : null}
      </View>

      {error ? (
        <Text style={styles.error}>{error}</Text>
      ) : hint ? (
        <Text style={styles.hint}>{hint}</Text>
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  label: {
    ...type.smallStrong,
    color: colors.text,
    marginBottom: spacing.xs + 2,
  },
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: TAP_TARGET,
    backgroundColor: colors.surface,
    borderRadius: radius.input,
    paddingHorizontal: spacing.md,
  },
  leftIcon: { marginRight: spacing.sm },
  input: {
    flex: 1,
    ...type.body,
    color: colors.text,
    paddingVertical: spacing.md,
    // Android adds vertical padding inside the font box; this keeps the
    // 48px target honest without the text drifting off-centre.
    includeFontPadding: false,
  },
  eye: {
    paddingLeft: spacing.sm,
    height: TAP_TARGET,
    justifyContent: 'center',
  },
  error: {
    ...type.small,
    color: colors.danger,
    marginTop: spacing.xs + 2,
  },
  hint: {
    ...type.small,
    color: colors.muted,
    marginTop: spacing.xs + 2,
  },
});
