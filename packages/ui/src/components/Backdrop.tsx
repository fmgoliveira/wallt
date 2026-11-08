import { View } from "react-native";
import Svg, { Defs, RadialGradient, Rect, Stop } from "react-native-svg";
import { useTheme } from "../theme/context";
import { glowColors } from "../tokens";
import { cn } from "./primitives";

/**
 * Page backdrop: two large, static, desaturated slate-blue glows (guidelines §3). They give floating glass
 * something to blur and add depth, never colour. Purely decorative and hidden from assistive tech.
 */
export function Backdrop() {
  const { scheme } = useTheme();
  const g = glowColors[scheme];
  return (
    <View
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      className="absolute inset-0 overflow-hidden"
    >
      <Glow
        id="glow-a"
        color={g.a}
        alpha={g.alpha}
        className="-top-64 -left-52 h-[560px] w-[760px]"
      />
      <Glow
        id="glow-b"
        color={g.b}
        alpha={g.alpha}
        className="top-[30%] -right-64 h-[640px] w-[640px]"
      />
    </View>
  );
}

/**
 * Soft radial glow. An SVG radial gradient fades to transparent, so it needs no blur filter and looks the
 * same on web and Android (CSS blur does not exist on native).
 */
function Glow({
  color,
  alpha,
  className,
  id,
}: {
  color: string;
  alpha: number;
  className: string;
  id: string;
}) {
  return (
    <View className={cn("absolute", className)}>
      <Svg width="100%" height="100%">
        <Defs>
          <RadialGradient id={id} cx="50%" cy="50%" r="50%">
            <Stop offset="0%" stopColor={color} stopOpacity={alpha} />
            <Stop offset="55%" stopColor={color} stopOpacity={alpha * 0.4} />
            <Stop offset="100%" stopColor={color} stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Rect width="100%" height="100%" fill={`url(#${id})`} />
      </Svg>
    </View>
  );
}
