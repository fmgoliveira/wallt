import { Platform } from "react-native";

export interface PickedFile {
  name: string;
  bytes: Uint8Array;
}

/** Accepted bank-export types; the picker is a convenience, detection decides what the bytes really are. */
export const ACCEPT = ".csv,.tsv,.txt,.xls,.xlsx,.ods,.ofx,.qfx,.xml";

/** Largest file the wizard will read: a bank export is kilobytes; this stops a wrong file from freezing the app. */
export const MAX_BYTES = 20 * 1024 * 1024;

export class FileTooLargeError extends Error {}

async function fromWebFile(file: File): Promise<PickedFile> {
  if (file.size > MAX_BYTES)
    throw new FileTooLargeError("That file is too large to be a bank export.");
  return { name: file.name, bytes: new Uint8Array(await file.arrayBuffer()) };
}

/** Read a file dropped or chosen on the web. */
export const readWebFile = fromWebFile;

/** Open the platform file chooser. Resolves to null when the user cancels. */
export async function pickFile(): Promise<PickedFile | null> {
  if (Platform.OS === "web") {
    return new Promise((resolve, reject) => {
      const input = document.createElement("input");
      input.type = "file";
      input.accept = ACCEPT;
      input.onchange = () => {
        const file = input.files?.[0];
        if (!file) return resolve(null);
        fromWebFile(file).then(resolve, reject);
      };
      input.oncancel = () => resolve(null);
      input.click();
    });
  }
  const DocumentPicker = await import("expo-document-picker");
  const result = await DocumentPicker.getDocumentAsync({
    type: "*/*",
    copyToCacheDirectory: true,
    multiple: false,
  });
  const asset = result.canceled ? undefined : result.assets[0];
  if (!asset) return null;
  if (asset.size && asset.size > MAX_BYTES)
    throw new FileTooLargeError("That file is too large to be a bank export.");
  const response = await fetch(asset.uri);
  return { name: asset.name, bytes: new Uint8Array(await response.arrayBuffer()) };
}
