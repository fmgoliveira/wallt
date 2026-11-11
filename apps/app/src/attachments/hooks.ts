import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { Attachment } from "@wallt/core";
import { useDataState, useRepository } from "../data/RepositoryProvider";
import { getDeviceMeta, notifyLocalWrite } from "../sync/runtime";
import { getBlobStore } from "./blobs";
import type { PreparedFile } from "./prepare";
import { dropUpload, queueUpload } from "./transfer";

const KEY = ["attachments"] as const;

/** Active attachments of one transaction (empty while there is no id). */
export function useAttachments(transactionId: string | undefined) {
  const data = useDataState();
  return useQuery({
    queryKey: [...KEY, transactionId ?? null],
    queryFn: async (): Promise<Attachment[]> =>
      data.status === "ready" && transactionId
        ? data.repository.attachments.listForTransaction(transactionId)
        : [],
    enabled: data.status === "ready",
  });
}

/** Stores prepared files on a transaction and removes attachments; used when the editor saves. */
export function useAttachmentWriter() {
  const repo = useRepository();
  const client = useQueryClient();
  return {
    async add(transactionId: string, file: PreparedFile): Promise<Attachment> {
      const att = await repo.attachments.create({
        transactionId,
        mime: file.mime,
        name: file.name,
        size: file.bytes.byteLength,
        sha256: file.sha256,
      });
      try {
        await getBlobStore().write(att.filePath, file.bytes);
      } catch (error) {
        await repo.attachments.delete(att.id); // no row without bytes on the device that made it
        throw error;
      }
      const meta = getDeviceMeta();
      if (meta) await queueUpload(meta, { id: att.id, filePath: att.filePath });
      notifyLocalWrite();
      await client.invalidateQueries({ queryKey: KEY });
      return att;
    },
    async remove(att: Attachment): Promise<void> {
      await repo.attachments.delete(att.id);
      const meta = getDeviceMeta();
      if (meta) await dropUpload(meta, att.id);
      await getBlobStore().remove(att.filePath);
      notifyLocalWrite();
      await client.invalidateQueries({ queryKey: KEY });
    },
  };
}
