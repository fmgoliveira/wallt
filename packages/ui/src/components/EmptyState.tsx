import type { ReactNode } from "react";
import { View } from "react-native";
import { Button } from "./Button";
import { cn, Text } from "./primitives";

export interface EmptyStateProps {
  title: string;
  description?: string;
  /** Large glyph or illustration slot. */
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
  return (
    <View className={cn("items-center justify-center gap-3 px-6 py-10", className)}>
      {icon ? (
        <View className="h-16 w-16 items-center justify-center rounded-full bg-accent/10">
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
