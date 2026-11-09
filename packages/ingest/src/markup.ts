/** Minimal tolerant tree for XML (CAMT) and SGML-style OFX. Namespaces and prefixes are dropped. */
export interface Node {
  name: string;
  attrs: Record<string, string>;
  children: Node[];
  text: string;
}

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };

export function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-fA-F]+|#\d+|[a-zA-Z]+);/g, (m, e: string) => {
    if (e.startsWith("#x")) return String.fromCodePoint(Number.parseInt(e.slice(2), 16));
    if (e.startsWith("#")) return String.fromCodePoint(Number(e.slice(1)));
    return ENTITIES[e] ?? m;
  });
}

const node = (name: string, attrs: Record<string, string> = {}): Node => ({
  name,
  attrs,
  children: [],
  text: "",
});

const localName = (n: string) => n.slice(n.indexOf(":") + 1);

/** Parse well-formed XML into a tree (comments, declarations, CDATA, entities, self-closing tags). */
export function parseXml(xml: string): Node {
  const root = node("#root");
  const stack: Node[] = [root];
  const re =
    /<!--[\s\S]*?-->|<\?[\s\S]*?\?>|<!\[CDATA\[([\s\S]*?)\]\]>|<!DOCTYPE[^>]*>|<(\/?)([^\s/>]+)((?:\s+[^\s=>/]+\s*=\s*(?:"[^"]*"|'[^']*'))*)\s*(\/?)>|([^<]+)/g;
  let m: RegExpExecArray | null = re.exec(xml);
  while (m !== null) {
    const top = stack[stack.length - 1] as Node;
    if (m[1] !== undefined) top.text += m[1];
    else if (m[3] !== undefined) {
      const name = localName(m[3]);
      if (m[2] === "/") {
        if (stack.length > 1) stack.pop();
      } else {
        const attrs: Record<string, string> = {};
        for (const a of (m[4] ?? "").matchAll(/([^\s=]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)) {
          attrs[localName(a[1] as string)] = decodeEntities((a[2] ?? a[3]) as string);
        }
        const child = node(name, attrs);
        top.children.push(child);
        if (m[5] !== "/") stack.push(child);
      }
    } else if (m[6] !== undefined) top.text += decodeEntities(m[6]);
    m = re.exec(xml);
  }
  return root;
}

/**
 * Parse OFX 1.x (SGML: leaf tags are not closed) and 2.x (XML) into the same tree. A tag with text is a leaf;
 * a tag without is an aggregate that stays open until its closing tag.
 */
export function parseOfxTree(body: string): Node {
  const root = node("#root");
  const stack: Node[] = [root];
  const re = /<(\/?)([A-Za-z0-9_.]+)\s*>([^<]*)/g;
  let m: RegExpExecArray | null = re.exec(body);
  while (m !== null) {
    const closing = m[1] === "/";
    const name = (m[2] as string).toUpperCase();
    const value = decodeEntities((m[3] as string).trim());
    if (closing) {
      const top = stack[stack.length - 1] as Node;
      if (stack.length > 1 && top.name === name) stack.pop();
    } else {
      const child = node(name);
      (stack[stack.length - 1] as Node).children.push(child);
      if (value === "") stack.push(child);
      else child.text = value;
    }
    m = re.exec(body);
  }
  return root;
}

/** First descendant reached by following `path` through direct children. */
export function child(n: Node | undefined, ...path: string[]): Node | undefined {
  let cur = n;
  for (const name of path) {
    cur = cur?.children.find((c) => c.name === name);
    if (!cur) return undefined;
  }
  return cur;
}

export function children(n: Node | undefined, name: string): Node[] {
  return n?.children.filter((c) => c.name === name) ?? [];
}

/** Trimmed text of the node at `path`, or null. */
export function textAt(n: Node | undefined, ...path: string[]): string | null {
  const t = child(n, ...path)?.text.trim();
  return t ? t : null;
}

/** Depth-first search for the first descendant (or self) named `name`. */
export function findDeep(n: Node | undefined, name: string): Node | undefined {
  if (!n) return undefined;
  if (n.name === name) return n;
  for (const c of n.children) {
    const hit = findDeep(c, name);
    if (hit) return hit;
  }
  return undefined;
}

export function findAll(n: Node | undefined, name: string, out: Node[] = []): Node[] {
  if (!n) return out;
  if (n.name === name) out.push(n);
  for (const c of n.children) findAll(c, name, out);
  return out;
}
