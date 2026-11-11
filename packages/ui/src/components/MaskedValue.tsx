import { View } from "react-native";
import { useUiStrings } from "../strings";
import { useTheme } from "../theme/context";
import { withAlpha } from "../tokens";
import type { TextVariant } from "./primitives";

/** Pill height / width per text variant, tuned to sit on the same baseline box as the real amount. */
const pill: Record<Exclude<TextVariant, "label">, { h: number; w: number; line: number }> = {
  display: { h: 22, w: 112, line: 38 },
  heading: { h: 16, w: 84, line: 28 },
  title: { h: 12, w: 64, line: 20 },
  body: { h: 11, w: 56, line: 20 },
  small: { h: 10, w: 48, line: 18 },
};

export interface MaskedValueProps {
  size?: Exclude<TextVariant, "label">;
  /** Colour of the text it replaces; the pill is a faint tint of it. */
  color: string;
  className?: string | undefined;
}

/**
 * Privacy-mode stand-in for a sensitive value: a soft frosted pill instead of bullet characters.
 * Same line box as the text, so toggling privacy never shifts the layout.
 */
export function MaskedValue({ size = "body", color, className }: MaskedValueProps) {
  const { scheme } = useTheme();
  const ui = useUiStrings();
  const p = pill[size];
  return (
    <View
      accessible
      accessibilityLabel={ui.hiddenAmount}
      className={className}
      style={{ height: p.line, justifyContent: "center", alignSelf: "flex-start" }}
    >
      <View
        style={{
          height: p.h,
          width: p.w,
          borderRadius: p.h / 2,
          backgroundColor: withAlpha(color, scheme === "dark" ? 0.16 : 0.12),
          borderWidth: 1,
          borderColor: withAlpha(color, scheme === "dark" ? 0.2 : 0.14),
        }}
      />
    </View>
  );
}
