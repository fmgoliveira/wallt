import type { ReactNode } from "react";
import { View, type ViewProps } from "react-native";
import { GlassSurface } from "./GlassSurface";
import { cn, glass } from "./primitives";

export interface CardProps extends ViewProps {
  /** `glass` = translucent surface with blur (ADR 0004); use sparingly (nav, hero cards). */
  variant?: "solid" | "glass";
  className?: string | undefined;
  children?: ReactNode;
}

export function Card({ variant = "solid", className, children, ...rest }: CardProps) {
  if (variant === "glass") {
    return <GlassSurface className={cn("p-4 shadow-e1", className)}>{children}</GlassSurface>;
  }
  return (
    <View {...rest} className={cn("rounded-lg p-4", glass, className)}>
      {children}
    </View>
  );
}
