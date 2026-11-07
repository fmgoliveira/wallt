import { LinearGradient } from "expo-linear-gradient";
import { View } from "react-native";
import { useTheme } from "../theme/ThemeProvider";
import { accentPalette, heroGradient, mixHex } from "../tokens";
import { cn } from "./primitives";

/**
 * Soft accent "glows" behind the page (ADR 0004: gradients only in glows, hero cards and the logo).
 * Gives the glass surfaces something to blur. Purely decorative and ignored by assistive tech.
 */
export function Backdrop() {
  const { scheme, accent } = useTheme();
  const a = accentPalette[accent][scheme];
  const b = mixHex(a, scheme === "dark" ? "#38bdf8" : "#a78bfa", 0.5);
  const alpha = scheme === "dark" ? "55" : "40";

  return (
    <View
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      className="absolute inset-0 overflow-hidden"
    >
      <Glow color={a + alpha} className="-top-40 -left-32 h-[480px] w-[480px]" />
      <Glow color={b + alpha} className="top-1/3 -right-40 h-[420px] w-[420px]" />
    </View>
  );
}

function Glow({ color, className }: { color: string; className: string }) {
  return (
    <View className={cn("absolute rounded-full web:blur-3xl", className)}>
      <LinearGradient
        colors={[color, `${color.slice(0, 7)}00`]}
        start={{ x: 0.2, y: 0.1 }}
        end={{ x: 0.8, y: 0.9 }}
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
