import { describe, expect, it } from "vitest";
import { decodeText, detectEncoding } from "./decode";
import { utf8 } from "./test-utils";

const bytes = (...n: number[]) => Uint8Array.from(n);
const latin1 = (s: string) => Uint8Array.from([...s].map((c) => c.charCodeAt(0)));

describe("detectEncoding", () => {
  it("honours BOMs", () => {
    expect(detectEncoding(bytes(0xef, 0xbb, 0xbf, 0x61)).encoding).toBe("utf-8");
    expect(detectEncoding(bytes(0xff, 0xfe, 0x61, 0)).encoding).toBe("utf-16le");
    expect(detectEncoding(bytes(0xfe, 0xff, 0, 0x61)).encoding).toBe("utf-16be");
  });
  it("detects UTF-16 without BOM", () => {
    const le = Uint8Array.from([..."Data;Valor"].flatMap((c) => [c.charCodeAt(0), 0]));
    expect(detectEncoding(le).encoding).toBe("utf-16le");
  });
  it("accepts valid UTF-8 and falls back to Windows-1252", () => {
    expect(detectEncoding(utf8("Descrição")).encoding).toBe("utf-8");
    expect(detectEncoding(latin1("Descri\xe7\xe3o")).encoding).toBe("windows-1252");
  });
  it("treats plain ASCII as UTF-8", () => {
    expect(detectEncoding(utf8("a;b\n1;2")).encoding).toBe("utf-8");
  });
});

describe("decodeText", () => {
  it("decodes Windows-1252 accents and the euro sign", () => {
    expect(decodeText(latin1("Descri\xe7\xe3o \x80 12,30")).text).toBe("Descrição € 12,30");
  });
  it("decodes UTF-8 with and without BOM", () => {
    const enc = utf8("Saúde €");
    expect(decodeText(enc).text).toBe("Saúde €");
    expect(decodeText(Uint8Array.from([0xef, 0xbb, 0xbf, ...enc])).text).toBe("Saúde €");
  });
  it("decodes UTF-16 LE/BE", () => {
    const le = Uint8Array.from([0xff, 0xfe, ...[..."Data"].flatMap((c) => [c.charCodeAt(0), 0])]);
    const be = Uint8Array.from([0xfe, 0xff, ...[..."Data"].flatMap((c) => [0, c.charCodeAt(0)])]);
    expect(decodeText(le).text).toBe("Data");
    expect(decodeText(be).text).toBe("Data");
  });
  it("rejects overlong or truncated UTF-8 and lets the caller override", () => {
    expect(detectEncoding(bytes(0xc3)).encoding).toBe("windows-1252");
    expect(decodeText(latin1("caf\xe9"), "iso-8859-1").text).toBe("café");
  });
});
