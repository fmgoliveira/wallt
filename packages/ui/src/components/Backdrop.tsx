import { LinearGradient } from "expo-linear-gradient";
import { View } from "react-native";
import Svg, { Defs, RadialGradient, Rect, Stop } from "react-native-svg";
import { useTheme } from "../theme/context";
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
  const alpha = dark ? "78" : "55";

  return (
    <View
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      className="absolute inset-0 overflow-hidden"
    >
      <Glow id="glow-a" color={a + alpha} className="-top-48 -left-40 h-[560px] w-[560px]" />
      <Glow id="glow-b" color={b + alpha} className="top-[28%] -right-48 h-[520px] w-[520px]" />
      <Glow id="glow-c" color={c + alpha} className="-bottom-56 left-[18%] h-[520px] w-[520px]" />
    </View>
  );
}

/**
 * Soft radial glow. An SVG radial gradient fades to transparent, so it needs no blur filter and looks the
 * same on web and Android (CSS blur does not exist on native).
 */
function Glow({ color, className, id }: { color: string; className: string; id: string }) {
  return (
    <View className={cn("absolute", className)}>
      <Svg width="100%" height="100%">
        <Defs>
          <RadialGradient id={id} cx="50%" cy="50%" r="50%">
            <Stop offset="0%" stopColor={color.slice(0, 7)} stopOpacity={alphaOf(color)} />
            <Stop offset="55%" stopColor={color.slice(0, 7)} stopOpacity={alphaOf(color) * 0.35} />
            <Stop offset="100%" stopColor={color.slice(0, 7)} stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Rect width="100%" height="100%" fill={`url(#${id})`} />
      </Svg>
    </View>
  );
}

function alphaOf(hex8: string): number {
  return Number.parseInt(hex8.slice(7, 9), 16) / 255;
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
