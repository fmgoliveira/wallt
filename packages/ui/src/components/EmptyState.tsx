import type { ReactNode } from "react";
import { View } from "react-native";
import { useTheme } from "../theme/context";
import { depthShadow, radius } from "../tokens";
import { Button } from "./Button";
import { cn, Text } from "./primitives";

export interface EmptyStateProps {
  title: string;
  description?: string;
  /** Line icon (stroke 1.6) shown in the raised badge. */
  icon?: ReactNode;
  actionLabel?: string;
  onAction?: () => void;
  className?: string | undefined;
}

export function EmptyState({
  title,
  description,
  icon,
  actionLabel,
  onAction,
  className,
}: EmptyStateProps) {
  const { scheme, colors } = useTheme();
  return (
    <View className={cn("items-center justify-center gap-3 px-6 py-10", className)}>
      {icon ? (
        <View
          className="items-center justify-center"
          style={{
            width: 48,
            height: 48,
            borderRadius: radius.lg,
            backgroundColor: colors.elevated,
            borderWidth: 1,
            borderColor: colors.border,
            boxShadow: depthShadow(scheme),
          }}
        >
          {icon}
        </View>
      ) : null}
      <Text variant="title" className="text-center">
        {title}
      </Text>
      {description ? (
        <Text tone="muted" className="max-w-[320px] text-center">
          {description}
        </Text>
      ) : null}
      {actionLabel && onAction ? (
        <Button label={actionLabel} onPress={onAction} className="mt-2" />
      ) : null}
    </View>
  );
}
