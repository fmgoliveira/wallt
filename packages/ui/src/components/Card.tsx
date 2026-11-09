import type { ReactNode } from "react";
import { View, type ViewProps } from "react-native";
import { useTheme } from "../theme/context";
import { depthShadow, radius, surfaceGradient } from "../tokens";
import { Gradient } from "./Gradient";
import { cn } from "./primitives";

export interface CardProps extends ViewProps {
  className?: string | undefined;
  children?: ReactNode;
}

/**
 * Raised surface (guidelines §3/§7): solid `surfaceGradient`, 1 px hairline, top highlight, layered shadow.
 * Cards are never glass (glass is for floating layers only).
 */
export function Card({ className, children, style, ...rest }: CardProps) {
  const { scheme, colors } = useTheme();
  // The default padding is not merged with overrides (cn only joins), so `p-0` opts out of it explicitly;
  // otherwise `p-4 tablet:p-5` and `p-0` both apply and CSS order decides (double padding on web).
  const flush = /(^|\s)p-0(\s|$)/.test(className ?? "");
  return (
    <View
      {...rest}
      className={cn(!flush && "p-4 tablet:p-5", className)}
      style={[
        {
          borderRadius: radius.lg,
          borderWidth: 1,
          borderColor: colors.border,
          backgroundColor: colors.surface,
          boxShadow: depthShadow(scheme),
        },
        style,
      ]}
    >
      <Gradient fill spec={surfaceGradient(scheme)} style={{ borderRadius: radius.lg - 1 }} />
      {children}
    </View>
  );
}
