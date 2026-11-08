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
  return (
    <View
      {...rest}
      className={cn("p-4 tablet:p-5", className)}
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
