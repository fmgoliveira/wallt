/** `1.2.3` or `v1.2.3` (optionally with a `-pre` or `+build` tail) as numbers; null when it is not a release version. */
export function parseVersion(text: string): [number, number, number] | null {
  const m = /^v?(\d+)\.(\d+)\.(\d+)(?:[-+].*)?$/.exec(text.trim());
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
}

/** True when `server` is a newer release than `app`. Unknown formats (e.g. "dev", "0.0.0") never count as newer. */
export function isNewerVersion(server: string, app: string): boolean {
  const s = parseVersion(server);
  const a = parseVersion(app);
  if (!s || !a) return false;
  for (let i = 0; i < 3; i++) {
    if ((s[i] as number) !== (a[i] as number)) return (s[i] as number) > (a[i] as number);
  }
  return false;
}
