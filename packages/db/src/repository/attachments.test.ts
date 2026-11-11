import { describe, expect, it } from "vitest";
import { createTestRepository } from "./test-utils";

const sha = "ab".repeat(32);

async function ledger() {
  const { repo } = await createTestRepository({ nodeId: "d1" });
  const account = await repo.accounts.create({
    name: "Main",
    type: "cash",
    currency: "EUR",
    openingBalance: 0,
  });
  const tx = await repo.transactions.create({
    accountId: account.id,
    amount: -1200,
    currency: "EUR",
    bookingDate: "2026-01-02",
  });
  return { repo, tx };
}

describe("attachments repository", () => {
  it("records a file and derives its path from the id and type", async () => {
    const { repo, tx } = await ledger();
    const a = await repo.attachments.create({
      transactionId: tx.id,
      mime: "image/jpeg",
      name: "receipt.jpg",
      size: 10,
      sha256: sha,
    });
    expect(a.filePath).toBe(`${a.id}.jpg`);
    expect(await repo.attachments.listForTransaction(tx.id)).toEqual([a]);
    expect(await repo.attachments.listForTransactions([tx.id, "other"])).toEqual([a]);
    expect(await repo.attachments.listAll()).toEqual([a]);
    expect(await repo.attachments.get(a.id)).toEqual(a);
  });

  it("works without any attachment", async () => {
    const { repo, tx } = await ledger();
    expect(await repo.attachments.listForTransaction(tx.id)).toEqual([]);
    expect(await repo.attachments.listForTransactions([])).toEqual([]);
  });

  it("refuses unknown transactions, bad hashes and other mime types", async () => {
    const { repo, tx } = await ledger();
    const ok = {
      transactionId: tx.id,
      mime: "application/pdf",
      name: "x.pdf",
      size: 1,
      sha256: sha,
    } as const;
    await expect(repo.attachments.create({ ...ok, transactionId: "nope" })).rejects.toMatchObject({
      code: "not_found",
    });
    await expect(repo.attachments.create({ ...ok, sha256: "zz" })).rejects.toMatchObject({
      code: "validation",
    });
    await expect(
      repo.attachments.create({ ...ok, mime: "text/html" as never }),
    ).rejects.toMatchObject({ code: "validation" });
  });

  it("deleting an attachment or its transaction tombstones it", async () => {
    const { repo, tx } = await ledger();
    const a = await repo.attachments.create({
      transactionId: tx.id,
      mime: "image/png",
      name: "",
      size: 1,
      sha256: sha,
    });
    const b = await repo.attachments.create({
      transactionId: tx.id,
      mime: "image/png",
      name: "",
      size: 1,
      sha256: sha,
    });
    await repo.attachments.delete(a.id);
    expect((await repo.attachments.listForTransaction(tx.id)).map((x) => x.id)).toEqual([b.id]);
    await expect(repo.attachments.delete(a.id)).rejects.toMatchObject({ code: "not_found" });
    await repo.transactions.delete(tx.id);
    expect(await repo.attachments.listAll()).toEqual([]);
  });
});
