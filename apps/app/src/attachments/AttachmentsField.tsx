import type { Attachment } from "@wallt/core";
import { Button, Sheet, Text, toast } from "@wallt/ui";
import { Camera, FileText, Image as ImageIcon, Paperclip, X } from "lucide-react-native";
import { useEffect, useState } from "react";
import { Image, Platform, Pressable, View } from "react-native";
import { useTranslation } from "../i18n";
import { getDeviceMeta, useSyncUi } from "../sync/runtime";
import { getBlobStore } from "./blobs";
import {
  AttachmentError,
  canCapture,
  type PickSource,
  type PreparedFile,
  pickAttachment,
  readMaxBytes,
} from "./prepare";
import { ensureLocal } from "./transfer";

/** A file chosen in this editor session, saved with the transaction. */
export interface PendingAttachment {
  key: number;
  file: PreparedFile;
}

let nextKey = 1;

function useLocalUrl(att: Attachment) {
  const [url, setUrl] = useState<string | null>(null);
  const session = useSyncUi((s) => s.session);
  useEffect(() => {
    let alive = true;
    let made: string | null = null;
    (async () => {
      const blobs = getBlobStore();
      // images are small after compression: fetch them as soon as the editor opens, so the thumbnail shows
      if (att.mime.startsWith("image/")) await ensureLocal(att, session, blobs);
      const u = await blobs.url(att.filePath, att.mime);
      if (!alive) return u && blobs.release(u);
      made = u;
      setUrl(u);
    })().catch(() => undefined);
    return () => {
      alive = false;
      if (made) getBlobStore().release(made);
    };
  }, [att, session]);
  return url;
}

/** Opens a file: images in an in-app viewer, PDFs in a browser tab / the system viewer. */
async function openAttachment(
  att: Attachment,
  session: ReturnType<typeof useSyncUi.getState>["session"],
  show: (url: string) => void,
): Promise<"ok" | "unavailable" | "corrupt"> {
  const blobs = getBlobStore();
  const result = await ensureLocal(att, session, blobs);
  if (result !== "ok") return result;
  const url = await blobs.url(att.filePath, att.mime);
  if (!url) return "unavailable";
  if (att.mime.startsWith("image/")) {
    show(url);
  } else if (Platform.OS === "web") {
    window.open(url, "_blank", "noopener");
    setTimeout(() => blobs.release(url), 60_000);
  } else {
    const Sharing = require("expo-sharing") as typeof import("expo-sharing");
    await Sharing.shareAsync(url, { mimeType: att.mime, dialogTitle: att.name });
  }
  return "ok";
}

function Thumb({ uri, pdf }: { uri: string | null; pdf: boolean }) {
  return (
    <View className="h-14 w-14 items-center justify-center overflow-hidden rounded-xl bg-surface-2">
      {uri && !pdf ? (
        <Image source={{ uri }} style={{ width: 56, height: 56 }} resizeMode="cover" />
      ) : pdf ? (
        <FileText size={22} color="#888" strokeWidth={1.6} />
      ) : (
        <Paperclip size={20} color="#888" strokeWidth={1.6} />
      )}
    </View>
  );
}

function ExistingRow({
  att,
  removed,
  onRemove,
  onOpen,
}: {
  att: Attachment;
  removed: boolean;
  onRemove: () => void;
  onOpen: () => void;
}) {
  const { t } = useTranslation();
  const url = useLocalUrl(att);
  if (removed) return null;
  return (
    <View className="flex-row items-center gap-3">
      <Pressable
        onPress={onOpen}
        accessibilityRole="button"
        accessibilityLabel={`${t("transactions.editor.attachments.open")} ${att.name}`}
      >
        <Thumb uri={url} pdf={att.mime === "application/pdf"} />
      </Pressable>
      <View className="flex-1">
        <Text numberOfLines={1}>{att.name || att.filePath}</Text>
        <Text variant="small" tone="muted">
          {url
            ? `${Math.max(1, Math.round(att.size / 1024))} KB`
            : t("transactions.editor.attachments.notOnDevice")}
        </Text>
      </View>
      <Pressable
        onPress={onRemove}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel={`${t("transactions.editor.attachments.remove")} ${att.name}`}
      >
        <X size={18} color="#888" />
      </Pressable>
    </View>
  );
}

/**
 * Receipts on a transaction: pick a photo (camera/library) or PDF, see thumbnails, open and remove. Changes are only
 * held here; the editor writes them when the transaction is saved (so Cancel leaves everything as it was).
 */
export function AttachmentsField({
  existing,
  removedIds,
  onRemoveExisting,
  pending,
  onPendingChange,
}: {
  existing: readonly Attachment[];
  removedIds: ReadonlySet<string>;
  onRemoveExisting: (id: string) => void;
  pending: readonly PendingAttachment[];
  onPendingChange: (next: PendingAttachment[]) => void;
}) {
  const { t } = useTranslation();
  const session = useSyncUi((s) => s.session);
  const [busy, setBusy] = useState(false);
  const [viewing, setViewing] = useState<string | null>(null);

  async function open(att: Attachment) {
    try {
      const result = await openAttachment(att, session, setViewing);
      if (result === "corrupt") toast.error(t("transactions.editor.attachments.corrupt"));
      else if (result === "unavailable")
        toast.error(t("transactions.editor.attachments.unavailable"));
    } catch {
      toast.error(t("transactions.editor.attachments.failed"));
    }
  }

  async function pick(source: PickSource) {
    setBusy(true);
    try {
      const max = await readMaxBytes(getDeviceMeta());
      const file = await pickAttachment(source, max);
      if (!file) return;
      onPendingChange([...pending, { key: nextKey++, file }]);
    } catch (error) {
      if (error instanceof AttachmentError) {
        const mb = Math.round((await readMaxBytes(getDeviceMeta())) / (1024 * 1024));
        toast.error(
          error.code === "too_large"
            ? t("transactions.editor.attachments.tooLarge", { mb })
            : error.code === "unsupported"
              ? t("transactions.editor.attachments.unsupported")
              : t("transactions.editor.attachments.permission"),
        );
      } else {
        toast.error(t("transactions.editor.attachments.failed"));
      }
    } finally {
      setBusy(false);
    }
  }

  const visible = existing.filter((a) => !removedIds.has(a.id));
  return (
    <View className="gap-2">
      <Text variant="small" tone="muted" weight="medium">
        {t("transactions.editor.attachments.title")}
      </Text>
      {visible.map((att) => (
        <ExistingRow
          key={att.id}
          att={att}
          removed={false}
          onRemove={() => onRemoveExisting(att.id)}
          onOpen={() => void open(att)}
        />
      ))}
      {pending.map((p) => (
        <View key={p.key} className="flex-row items-center gap-3">
          <Thumb uri={p.file.previewUri ?? null} pdf={p.file.mime === "application/pdf"} />
          <View className="flex-1">
            <Text numberOfLines={1}>{p.file.name}</Text>
            <Text variant="small" tone="muted">
              {Math.max(1, Math.round(p.file.bytes.byteLength / 1024))} KB
            </Text>
          </View>
          <Pressable
            onPress={() => onPendingChange(pending.filter((x) => x.key !== p.key))}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel={`${t("transactions.editor.attachments.remove")} ${p.file.name}`}
          >
            <X size={18} color="#888" />
          </Pressable>
        </View>
      ))}
      <View className="flex-row flex-wrap gap-2">
        {canCapture ? (
          <Button
            variant="secondary"
            label={t("transactions.editor.attachments.camera")}
            leading={<Camera size={16} color="#888" />}
            loading={busy}
            onPress={() => void pick("camera")}
          />
        ) : null}
        <Button
          variant="secondary"
          label={t("transactions.editor.attachments.library")}
          leading={<ImageIcon size={16} color="#888" />}
          disabled={busy}
          onPress={() => void pick("library")}
        />
        <Button
          variant="secondary"
          label={t("transactions.editor.attachments.file")}
          leading={<FileText size={16} color="#888" />}
          disabled={busy}
          onPress={() => void pick("file")}
        />
      </View>
      <Sheet
        visible={viewing !== null}
        onClose={() => setViewing(null)}
        title={t("transactions.editor.attachments.title")}
      >
        {viewing ? (
          <Image
            source={{ uri: viewing }}
            style={{ width: "100%", height: 480 }}
            resizeMode="contain"
          />
        ) : null}
        <Button
          variant="secondary"
          label={t("transactions.editor.attachments.close")}
          onPress={() => setViewing(null)}
        />
      </Sheet>
    </View>
  );
}
