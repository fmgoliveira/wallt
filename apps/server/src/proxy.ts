import { BlockList, isIP } from "node:net";

/** Parses a comma-separated list of IPs / CIDRs (e.g. `127.0.0.1,::1,172.18.0.0/16`). */
export function parseTrustedProxies(list: string): BlockList {
  const bl = new BlockList();
  for (const raw of list.split(",")) {
    const entry = raw.trim();
    if (!entry) continue;
    const [addr = "", prefix] = entry.split("/");
    const family = isIP(addr);
    if (!family) throw new Error(`Invalid TRUSTED_PROXIES entry: ${entry}`);
    const type = family === 4 ? "ipv4" : "ipv6";
    if (prefix === undefined) bl.addAddress(addr, type);
    else bl.addSubnet(addr, Number(prefix), type);
  }
  return bl;
}

function normalize(ip: string): string {
  return ip.startsWith("::ffff:") && isIP(ip.slice(7)) === 4 ? ip.slice(7) : ip;
}

/**
 * Real client IP. `X-Real-IP` (set by the reverse proxy, overwriting anything the client sent) is only
 * honoured when the TCP peer is a trusted proxy; otherwise the peer address is used.
 */
export function resolveClientIp(
  peer: string | undefined,
  realIpHeader: string | undefined,
  trusted: BlockList,
): string {
  const p = normalize(peer ?? "");
  const family = isIP(p);
  if (family && trusted.check(p, family === 4 ? "ipv4" : "ipv6") && realIpHeader) {
    const candidate = normalize(realIpHeader.trim());
    if (isIP(candidate)) return candidate;
  }
  return p || "unknown";
}
