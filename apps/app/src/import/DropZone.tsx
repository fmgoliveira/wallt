import { Text, useTheme } from "@wallt/ui";
import { FileUp } from "lucide-react-native";
import { useCallback, useEffect, useState } from "react";
import { Platform, Pressable, View } from "react-native";
import { useTranslation } from "../i18n";
import { FileTooLargeError, type PickedFile, pickFile, readWebFile } from "./files";

export interface DropZoneProps {
  onFile: (file: PickedFile) => void;
  onError: (message: string) => void;
  disabled?: boolean;
}

/**
 * Big target for a bank export: click/tap to choose (web, Android), and drag-and-drop a file onto it on the web.
 * The same component serves the import wizard and the format setup.
 */
export function DropZone({ onFile, onError, disabled }: DropZoneProps) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const messageOf = useCallback(
    (e: unknown) =>
      e instanceof FileTooLargeError
        ? t("importing.drop.tooLarge")
        : t("importing.drop.unreadable"),
    [t],
  );
  const [el, setEl] = useState<HTMLElement | null>(null);
  const [over, setOver] = useState(false);

  useEffect(() => {
    if (Platform.OS !== "web" || disabled) return;
    if (!el) return;
    const stop = (e: Event) => {
      e.preventDefault();
      e.stopPropagation();
    };
    const enter = (e: DragEvent) => {
      stop(e);
      setOver(true);
    };
    const leave = (e: DragEvent) => {
      stop(e);
      // moving between children also fires leave: only clear when the pointer left the zone
      if (!el.contains(e.relatedTarget as Node | null)) setOver(false);
    };
    const drop = (e: DragEvent) => {
      stop(e);
      setOver(false);
      const file = e.dataTransfer?.files?.[0];
      if (file) readWebFile(file).then(onFile, (err) => onError(messageOf(err)));
    };
    el.addEventListener("dragenter", enter);
    el.addEventListener("dragover", enter);
    el.addEventListener("dragleave", leave);
    el.addEventListener("drop", drop);
    return () => {
      el.removeEventListener("dragenter", enter);
      el.removeEventListener("dragover", enter);
      el.removeEventListener("dragleave", leave);
      el.removeEventListener("drop", drop);
    };
  }, [el, disabled, onFile, onError, messageOf]);

  const choose = () => {
    pickFile()
      .then((f) => f && onFile(f))
      .catch((err) => onError(messageOf(err)));
  };

  return (
    <View ref={(node) => setEl(node as unknown as HTMLElement | null)}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t("importing.drop.choose")}
        disabled={disabled}
        onPress={choose}
        className="items-center gap-3 px-6 py-12 web:cursor-pointer web:outline-none web:transition-colors web:duration-150"
        style={{
          borderRadius: 16,
          borderWidth: 1.5,
          borderStyle: "dashed",
          borderColor: over ? colors.data : colors.borderStrong,
          backgroundColor: over ? `${colors.data}1a` : "transparent",
        }}
      >
        <View
          className="h-12 w-12 items-center justify-center rounded-full"
          style={{ backgroundColor: colors.elevated }}
        >
          <FileUp size={22} color={over ? colors.data : colors.muted} strokeWidth={1.6} />
        </View>
        <Text variant="title" className="text-center">
          {over
            ? t("importing.drop.over")
            : Platform.OS === "web"
              ? t("importing.drop.web")
              : t("importing.drop.native")}
        </Text>
        <Text tone="muted" className="max-w-[380px] text-center">
          {t("importing.drop.hint")}
        </Text>
      </Pressable>
    </View>
  );
}
