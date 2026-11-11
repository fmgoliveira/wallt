import { Platform } from "react-native";

/**
 * Hand a text file to the user: a download on web, the system share sheet on Android (save to Files, Drive, mail…).
 * Native modules are `require`d lazily so the web bundle never loads them.
 */
export async function saveTextFile(name: string, mime: string, text: string): Promise<void> {
  if (Platform.OS === "web") {
    const url = URL.createObjectURL(new Blob([text], { type: `${mime};charset=utf-8` }));
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
    return;
  }
  const { File, Paths } = require("expo-file-system") as typeof import("expo-file-system");
  const Sharing = require("expo-sharing") as typeof import("expo-sharing");
  const file = new File(Paths.cache, name);
  file.create({ overwrite: true });
  file.write(text);
  await Sharing.shareAsync(file.uri, { mimeType: mime, dialogTitle: name });
}

/** Largest export file the app will read back (a 50k-transaction ledger is a few MB). */
export const MAX_RESTORE_BYTES = 200 * 1024 * 1024;

/** Let the user choose a JSON file and return its text; null when they cancel. */
export async function pickJsonText(): Promise<string | null> {
  if (Platform.OS === "web") {
    return new Promise((resolve, reject) => {
      const input = document.createElement("input");
      input.type = "file";
      input.accept = ".json,application/json";
      input.onchange = () => {
        const file = input.files?.[0];
        if (!file) return resolve(null);
        if (file.size > MAX_RESTORE_BYTES) return reject(new Error("too large"));
        file.text().then(resolve, reject);
      };
      input.oncancel = () => resolve(null);
      input.click();
    });
  }
  const DocumentPicker = await import("expo-document-picker");
  const result = await DocumentPicker.getDocumentAsync({
    type: ["application/json", "text/plain", "*/*"],
    copyToCacheDirectory: true,
    multiple: false,
  });
  const asset = result.canceled ? undefined : result.assets[0];
  if (!asset) return null;
  if (asset.size && asset.size > MAX_RESTORE_BYTES) throw new Error("too large");
  return (await fetch(asset.uri)).text();
}
