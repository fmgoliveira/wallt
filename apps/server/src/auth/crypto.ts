import {
  argon2,
  createCipheriv,
  createDecipheriv,
  createHash,
  hkdfSync,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";

/** OWASP-recommended argon2id baseline (64 MiB, 3 passes, 1 lane); stored in the hash so it can be raised later. */
const PARAMS = { memory: 65536, passes: 3, parallelism: 1, tagLength: 32 } as const;

type Argon2Params = { memory: number; passes: number; parallelism: number; tagLength: number };

function derive(password: string, salt: Buffer, p: Argon2Params): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    argon2("argon2id", { message: password, nonce: salt, ...p }, (err, key) =>
      err ? reject(err) : resolve(key),
    );
  });
}

const b64 = (b: Uint8Array) => Buffer.from(b).toString("base64").replace(/=+$/, "");

/** PHC string: `$argon2id$v=19$m=65536,t=3,p=1$<salt>$<hash>` (unpadded base64). */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const hash = await derive(password, salt, PARAMS);
  return `$argon2id$v=19$m=${PARAMS.memory},t=${PARAMS.passes},p=${PARAMS.parallelism}$${b64(salt)}$${b64(hash)}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const m = /^\$argon2id\$v=19\$m=(\d+),t=(\d+),p=(\d+)\$([^$]+)\$([^$]+)$/.exec(stored);
  if (!m) return false;
  const expected = Buffer.from(m[5] as string, "base64");
  const actual = await derive(password, Buffer.from(m[4] as string, "base64"), {
    memory: Number(m[1]),
    passes: Number(m[2]),
    parallelism: Number(m[3]),
    tagLength: expected.length,
  });
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

let dummy: Promise<string> | undefined;
/** A valid hash to verify against when the user does not exist, so timing does not reveal accounts. */
export function dummyHash(): Promise<string> {
  dummy ??= hashPassword(randomToken());
  return dummy;
}

export type Keys = { encKey: Buffer; jwtKey: Buffer };

/** Independent 32-byte keys derived from ENCRYPTION_KEY (base64, >= 32 bytes) with HKDF-SHA256. */
export function deriveKeys(encryptionKeyB64: string): Keys {
  const ikm = Buffer.from(encryptionKeyB64, "base64");
  const key = (info: string) => Buffer.from(hkdfSync("sha256", ikm, Buffer.alloc(0), info, 32));
  return { encKey: key("wallt/enc/v1"), jwtKey: key("wallt/jwt/v1") };
}

/** AES-256-GCM; output `v1.<iv>.<tag>.<ciphertext>` (base64url). */
export function encrypt(key: Buffer, plaintext: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ct = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return ["v1", iv, cipher.getAuthTag(), ct]
    .map((p) => (typeof p === "string" ? p : p.toString("base64url")))
    .join(".");
}

export function decrypt(key: Buffer, payload: string): string {
  const [v, iv, tag, ct] = payload.split(".");
  if (v !== "v1" || !iv || !tag || !ct) throw new Error("Unsupported ciphertext");
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(iv, "base64url"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(ct, "base64url")), decipher.final()]).toString(
    "utf8",
  );
}

export const sha256Hex = (s: string) => createHash("sha256").update(s).digest("hex");

export const randomToken = (bytes = 32) => randomBytes(bytes).toString("base64url");

/** Constant-time string comparison (compares digests, so lengths do not leak). */
export function safeEqual(a: string, b: string): boolean {
  return timingSafeEqual(
    createHash("sha256").update(a).digest(),
    createHash("sha256").update(b).digest(),
  );
}
