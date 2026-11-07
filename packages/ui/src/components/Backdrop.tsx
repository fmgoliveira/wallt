import { LinearGradient } from "expo-linear-gradient";
import { View } from "react-native";
import { useTheme } from "../theme/ThemeProvider";
import { accentPalette, heroGradient, mixHex } from "../tokens";
import { cn } from "./primitives";

/**
 * Soft accent "glows" behind the page (ADR 0004: gradients only in glows, hero cards and the logo).
 * They are what the glass surfaces blur, so they must be clearly visible but never loud.
 * Purely decorative and ignored by assistive tech.
 */
export function Backdrop() {
  const { scheme, accent } = useTheme();
  const dark = scheme === "dark";
  // Light theme uses the (saturated) dark-theme accent shade so the glow is vivid on a pale background.
  const a = accentPalette[accent][dark ? "dark" : "light"];
  const b = mixHex(a, dark ? "#22d3ee" : "#f472b6", 0.55);
  const c = mixHex(a, dark ? "#a855f7" : "#38bdf8", 0.5);
  const alpha = dark ? "66" : "4d";

  return (
    <View
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      className="absolute inset-0 overflow-hidden"
    >
      <Glow color={a + alpha} className="-top-48 -left-40 h-[560px] w-[560px]" />
      <Glow color={b + alpha} className="top-[28%] -right-48 h-[520px] w-[520px]" />
      <Glow color={c + alpha} className="-bottom-56 left-[18%] h-[520px] w-[520px]" />
    </View>
  );
}

function Glow({ color, className }: { color: string; className: string }) {
  return (
    <View className={cn("absolute rounded-full web:blur-3xl", className)}>
      <LinearGradient
        colors={[color, `${color.slice(0, 7)}00`]}
        start={{ x: 0.2, y: 0.1 }}
        end={{ x: 0.85, y: 0.95 }}
        style={{ flex: 1, borderRadius: 9999 }}
      />
    </View>
  );
}

/** Rounded-square logo mark with the hero gradient. */
export function LogoMark({ size = 40 }: { size?: number }) {
  const { accent } = useTheme();
  return (
    <LinearGradient
      colors={[...heroGradient(accent)]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      accessibilityElementsHidden
      style={{ width: size, height: size, borderRadius: size * 0.3 }}
    />
  );
}
