import React, { useState } from "react";
import { Modal, Pressable, StyleSheet, Switch, Text, TextInput, TouchableOpacity, View } from "react-native";
import { useColors } from "@/hooks/useColors";
import { useKeyboardHeight } from "@/hooks/useKeyboardHeight";

/** Small form controls shared by the payslip template screens (web + mobile). */

export const ACCENT = "#8B5CF6";

export function Panel({
  title,
  subtitle,
  children,
  defaultOpen = false,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const colors = useColors();
  const [open, setOpen] = useState(defaultOpen);
  return (
    <View style={[styles.panel, { borderColor: colors.border, backgroundColor: colors.card }]}>
      <TouchableOpacity
        style={styles.panelHead}
        onPress={() => setOpen((o) => !o)}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
      >
        <View style={{ flex: 1 }}>
          <Text style={[styles.panelTitle, { color: colors.foreground }]}>{title}</Text>
          {subtitle ? <Text style={[styles.hint, { color: colors.mutedForeground }]}>{subtitle}</Text> : null}
        </View>
        <Text style={{ color: colors.mutedForeground, fontSize: 14 }}>{open ? "▾" : "▸"}</Text>
      </TouchableOpacity>
      {open ? <View style={styles.panelBody}>{children}</View> : null}
    </View>
  );
}

export function FieldLabel({ children }: { children: React.ReactNode }) {
  const colors = useColors();
  return <Text style={[styles.label, { color: colors.mutedForeground }]}>{children}</Text>;
}

export function Input({
  value,
  onChangeText,
  placeholder,
  multiline,
  maxLength,
  accessibilityLabel,
  style,
}: {
  value: string;
  onChangeText: (v: string) => void;
  placeholder?: string;
  multiline?: boolean;
  maxLength?: number;
  accessibilityLabel?: string;
  style?: any;
}) {
  const colors = useColors();
  return (
    <TextInput
      value={value}
      onChangeText={onChangeText}
      placeholder={placeholder}
      placeholderTextColor={colors.mutedForeground + "99"}
      multiline={multiline}
      maxLength={maxLength}
      accessibilityLabel={accessibilityLabel || placeholder}
      style={[
        styles.input,
        { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.background },
        multiline && { minHeight: 64, textAlignVertical: "top" },
        style,
      ]}
    />
  );
}

export function Segmented<T extends string | number>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: Array<{ value: T; label: string }>;
  onChange: (v: T) => void;
}) {
  const colors = useColors();
  return (
    <View style={styles.segWrap}>
      {options.map((o) => {
        const active = o.value === value;
        return (
          <TouchableOpacity
            key={String(o.value)}
            onPress={() => onChange(o.value)}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            style={[
              styles.seg,
              { borderColor: active ? ACCENT : colors.border, backgroundColor: active ? ACCENT : colors.background },
            ]}
          >
            <Text style={{ color: active ? "#FFF" : colors.foreground, fontSize: 12, fontWeight: "600" }}>{o.label}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

export function ToggleRow({
  label,
  value,
  onChange,
  disabled,
  hint,
}: {
  label: string;
  value: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
  hint?: string;
}) {
  const colors = useColors();
  return (
    <View style={styles.toggleRow}>
      <View style={{ flex: 1 }}>
        <Text style={{ color: colors.foreground, fontSize: 13 }}>{label}</Text>
        {hint ? <Text style={[styles.hint, { color: colors.mutedForeground }]}>{hint}</Text> : null}
      </View>
      <Switch
        value={value}
        onValueChange={onChange}
        disabled={disabled}
        trackColor={{ true: ACCENT, false: colors.border }}
        accessibilityLabel={label}
      />
    </View>
  );
}

export function Stepper({
  label,
  value,
  onChange,
  step = 1,
  min,
  max,
  suffix = "",
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  step?: number;
  min: number;
  max: number;
  suffix?: string;
}) {
  const colors = useColors();
  const set = (v: number) => onChange(Math.min(max, Math.max(min, Math.round(v * 10) / 10)));
  return (
    <View style={styles.toggleRow}>
      <Text style={{ color: colors.foreground, fontSize: 13, flex: 1 }}>{label}</Text>
      <View style={styles.stepper}>
        <TouchableOpacity
          style={[styles.stepBtn, { borderColor: colors.border }]}
          onPress={() => set(value - step)}
          accessibilityLabel={`Decrease ${label}`}
        >
          <Text style={{ color: colors.foreground, fontWeight: "700" }}>−</Text>
        </TouchableOpacity>
        <Text style={{ color: colors.foreground, minWidth: 56, textAlign: "center", fontSize: 13 }}>
          {value}
          {suffix}
        </Text>
        <TouchableOpacity
          style={[styles.stepBtn, { borderColor: colors.border }]}
          onPress={() => set(value + step)}
          accessibilityLabel={`Increase ${label}`}
        >
          <Text style={{ color: colors.foreground, fontWeight: "700" }}>+</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

export function SmallButton({
  label,
  onPress,
  tone = "default",
  disabled,
  accessibilityLabel,
}: {
  label: string;
  onPress: () => void;
  tone?: "default" | "primary" | "danger";
  disabled?: boolean;
  accessibilityLabel?: string;
}) {
  const colors = useColors();
  const bg = tone === "primary" ? ACCENT : tone === "danger" ? colors.expense + "14" : colors.background;
  const fg = tone === "primary" ? "#FFF" : tone === "danger" ? colors.expense : colors.foreground;
  const border = tone === "primary" ? ACCENT : tone === "danger" ? colors.expense + "55" : colors.border;
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel || label}
      style={[styles.smallBtn, { backgroundColor: bg, borderColor: border, opacity: disabled ? 0.45 : 1 }]}
    >
      <Text style={{ color: fg, fontSize: 12, fontWeight: "700" }}>{label}</Text>
    </TouchableOpacity>
  );
}

export function IconBtn({ label, onPress, disabled, a11y }: { label: string; onPress: () => void; disabled?: boolean; a11y: string }) {
  const colors = useColors();
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled}
      accessibilityLabel={a11y}
      style={[styles.iconBtn, { borderColor: colors.border, opacity: disabled ? 0.3 : 1 }]}
    >
      <Text style={{ color: colors.foreground, fontSize: 12, fontWeight: "700" }}>{label}</Text>
    </TouchableOpacity>
  );
}

export function ConfirmDialog({
  visible,
  title,
  message,
  confirmLabel,
  destructive,
  onConfirm,
  onCancel,
}: {
  visible: boolean;
  title: string;
  message: string;
  confirmLabel: string;
  destructive?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const colors = useColors();
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <Pressable style={styles.backdrop} onPress={onCancel}>
        <Pressable style={[styles.dialog, { backgroundColor: colors.card, borderColor: colors.border }]} onPress={() => {}}>
          <Text style={[styles.panelTitle, { color: colors.foreground, fontSize: 16 }]}>{title}</Text>
          <Text style={{ color: colors.mutedForeground, marginTop: 8, fontSize: 13, lineHeight: 19 }}>{message}</Text>
          <View style={styles.dialogActions}>
            <SmallButton label="Cancel" onPress={onCancel} />
            <SmallButton label={confirmLabel} onPress={onConfirm} tone={destructive ? "danger" : "primary"} />
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

export function PromptDialog({
  visible,
  title,
  initialValue,
  confirmLabel,
  onSubmit,
  onCancel,
}: {
  visible: boolean;
  title: string;
  initialValue: string;
  confirmLabel: string;
  onSubmit: (value: string) => void;
  onCancel: () => void;
}) {
  const colors = useColors();
  const keyboardHeight = useKeyboardHeight();
  const [value, setValue] = useState(initialValue);
  React.useEffect(() => {
    if (visible) setValue(initialValue);
  }, [visible, initialValue]);
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <Pressable style={[styles.backdrop, { paddingBottom: 16 + keyboardHeight }]} onPress={onCancel}>
        <Pressable style={[styles.dialog, { backgroundColor: colors.card, borderColor: colors.border }]} onPress={() => {}}>
          <Text style={[styles.panelTitle, { color: colors.foreground, fontSize: 16, marginBottom: 10 }]}>{title}</Text>
          <Input value={value} onChangeText={setValue} maxLength={120} accessibilityLabel={title} />
          <View style={styles.dialogActions}>
            <SmallButton label="Cancel" onPress={onCancel} />
            <SmallButton label={confirmLabel} tone="primary" disabled={!value.trim()} onPress={() => onSubmit(value.trim())} />
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

export const styles = StyleSheet.create({
  panel: { borderWidth: 1, borderRadius: 12, overflow: "hidden" },
  panelHead: { flexDirection: "row", alignItems: "center", paddingHorizontal: 14, paddingVertical: 12, gap: 8 },
  panelTitle: { fontSize: 14, fontWeight: "700" },
  panelBody: { paddingHorizontal: 14, paddingBottom: 14, gap: 10 },
  hint: { fontSize: 11, marginTop: 2, lineHeight: 15 },
  label: { fontSize: 11, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.4, marginBottom: 4 },
  input: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8, fontSize: 13 },
  segWrap: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  seg: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 7 },
  toggleRow: { flexDirection: "row", alignItems: "center", gap: 10, minHeight: 36 },
  stepper: { flexDirection: "row", alignItems: "center", gap: 4 },
  stepBtn: { width: 32, height: 32, borderWidth: 1, borderRadius: 8, alignItems: "center", justifyContent: "center" },
  smallBtn: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8, alignItems: "center", justifyContent: "center" },
  iconBtn: { width: 30, height: 30, borderWidth: 1, borderRadius: 7, alignItems: "center", justifyContent: "center" },
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.55)", alignItems: "center", justifyContent: "center", padding: 16 },
  dialog: { width: "100%", maxWidth: 420, borderRadius: 14, borderWidth: 1, padding: 18 },
  dialogActions: { flexDirection: "row", justifyContent: "flex-end", gap: 8, marginTop: 16 },
});
