import {
  ATTACHMENT_DEFAULT_MAX_BYTES,
  ATTACHMENT_HARD_MAX_BYTES,
  type AttachmentMime,
} from "@wallt/core";
import { sha256Bytes } from "@wallt/ingest";
import { Platform } from "react-native";

/** A file ready to be stored: already compressed when it is a photo, checked against the size limit. */
export interface PreparedFile {
  bytes: Uint8Array;
  mime: AttachmentMime;
  name: string;
  sha256: string;
  /** Where the compressed photo can be shown from (a file or blob URI); absent for PDFs. */
  previewUri?: string;
}

export type PickSource = "camera" | "library" | "file";

export class AttachmentError extends Error {
  constructor(readonly code: "too_large" | "unsupported" | "permission") {
    super(code);
    this.name = "AttachmentError";
  }
}

/** Photos are shrunk to this many pixels on the long side and re-encoded as JPEG (receipts stay legible). */
export const MAX_IMAGE_EDGE = 2000;
export const JPEG_QUALITY = 0.7;

const META_KEY = "attachment_max_bytes";

/** The size limit (bytes) from device settings, clamped to the hard cap; the default is 10 MB. */
export async function readMaxBytes(meta: { getMeta(k: string): Promise<string | null> } | null) {
  const raw = Number((await meta?.getMeta(META_KEY)) ?? Number.NaN);
  return Number.isFinite(raw) && raw > 0
    ? Math.min(raw, ATTACHMENT_HARD_MAX_BYTES)
    : ATTACHMENT_DEFAULT_MAX_BYTES;
}

export const writeMaxBytes = (
  meta: { setMeta(k: string, v: string): Promise<void> },
  bytes: number,
) =>
  meta.setMeta(
    META_KEY,
    String(Math.min(Math.max(1, Math.round(bytes)), ATTACHMENT_HARD_MAX_BYTES)),
  );

interface Picked {
  uri: string;
  name: string;
  mime: string;
  width?: number;
  height?: number;
}

async function pickRaw(source: PickSource): Promise<Picked | null> {
  if (source === "file") {
    const DocumentPicker = await import("expo-document-picker");
    const r = await DocumentPicker.getDocumentAsync({
      type: ["application/pdf", "image/*"],
      copyToCacheDirectory: true,
      multiple: false,
    });
    const a = r.canceled ? undefined : r.assets[0];
    return a ? { uri: a.uri, name: a.name, mime: a.mimeType ?? "" } : null;
  }
  const ImagePicker = await import("expo-image-picker");
  if (source === "camera") {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) throw new AttachmentError("permission");
  }
  const options = { mediaTypes: ["images"] as "images"[], quality: 1 };
  const r =
    source === "camera"
      ? await ImagePicker.launchCameraAsync(options)
      : await ImagePicker.launchImageLibraryAsync(options);
  const a = r.canceled ? undefined : r.assets[0];
  return a
    ? {
        uri: a.uri,
        name: a.fileName ?? "",
        mime: a.mimeType ?? "image/jpeg",
        width: a.width,
        height: a.height,
      }
    : null;
}

async function loadBytes(uri: string): Promise<Uint8Array> {
  return new Uint8Array(await (await fetch(uri)).arrayBuffer());
}

/** Shrinks and re-encodes a photo as JPEG. Runs on a canvas on web and natively on Android. */
async function compressImage(p: Picked): Promise<{ bytes: Uint8Array; uri: string }> {
  const Manipulator = await import("expo-image-manipulator");
  const long = Math.max(p.width ?? 0, p.height ?? 0);
  const scale = long > MAX_IMAGE_EDGE ? MAX_IMAGE_EDGE / long : 1;
  const actions =
    scale < 1 && p.width && p.height
      ? [{ resize: { width: Math.round(p.width * scale), height: Math.round(p.height * scale) } }]
      : [];
  const out = await Manipulator.manipulateAsync(p.uri, actions, {
    compress: JPEG_QUALITY,
    format: Manipulator.SaveFormat.JPEG,
  });
  return { bytes: await loadBytes(out.uri), uri: out.uri };
}

/**
 * Lets the user pick a file, compresses photos, and enforces the size limit. Null when they cancel.
 * Throws `AttachmentError` (`too_large`, `unsupported`, `permission`).
 */
export async function pickAttachment(
  source: PickSource,
  maxBytes: number,
): Promise<PreparedFile | null> {
  const picked = await pickRaw(source);
  if (!picked) return null;
  const isPdf = picked.mime === "application/pdf" || /\.pdf$/i.test(picked.name);
  const isImage = picked.mime.startsWith("image/") && !isPdf;
  if (!isPdf && !isImage) throw new AttachmentError("unsupported");

  const image = isPdf ? null : await compressImage(picked);
  const bytes = image ? image.bytes : await loadBytes(picked.uri);
  if (bytes.byteLength > maxBytes) throw new AttachmentError("too_large");
  const base = (picked.name || (isPdf ? "receipt.pdf" : "photo.jpg")).slice(0, 200);
  const name = isPdf ? base : base.replace(/\.[^.]+$/, "") + ".jpg";
  return {
    bytes,
    mime: isPdf ? "application/pdf" : "image/jpeg",
    name,
    sha256: sha256Bytes(bytes),
    ...(image ? { previewUri: image.uri } : {}),
  };
}

/** Camera capture is offered on phones; desktop browsers just have the file dialog. */
export const canCapture = Platform.OS !== "web";
