/**
 * Minimal, dependency-free cookie jar.
 *
 * Enough to carry a SIGAA web session across the CAS redirect chain and
 * subsequent page requests. It is intentionally small: host-scoped storage,
 * last-write-wins per (host, name), no public-suffix or secure/path matching
 * beyond a coarse domain check. Good enough for talking to two known hosts
 * (autenticacao.ufrn.br and sigaa.ufrn.br); not a general-purpose RFC 6265 jar.
 */

interface StoredCookie {
  name: string;
  value: string;
  domain: string;
}

export class CookieJar {
  /** key: `${domain}\u0000${name}` */
  private cookies = new Map<string, StoredCookie>();

  /** Store every cookie from a response's `Set-Cookie` headers. */
  storeFromSetCookie(url: URL, setCookieHeaders: string[]): void {
    for (const header of setCookieHeaders) {
      const parsed = parseSetCookie(header, url.hostname);
      if (parsed) {
        this.cookies.set(`${parsed.domain}\u0000${parsed.name}`, parsed);
      }
    }
  }

  /** Build the `Cookie` request header value for a URL, or `undefined`. */
  cookieHeaderFor(url: URL): string | undefined {
    const host = url.hostname;
    const matches: string[] = [];
    for (const cookie of this.cookies.values()) {
      if (domainMatches(host, cookie.domain)) {
        matches.push(`${cookie.name}=${cookie.value}`);
      }
    }
    return matches.length > 0 ? matches.join("; ") : undefined;
  }

  /** Names of stored cookies (for debugging / status). */
  names(): string[] {
    return [...this.cookies.values()].map((c) => c.name);
  }
}

function parseSetCookie(header: string, requestHost: string): StoredCookie | null {
  // First segment is `name=value`; the rest are attributes we mostly ignore.
  const [pair, ...attrs] = header.split(";");
  if (!pair) return null;
  const eq = pair.indexOf("=");
  if (eq === -1) return null;

  const name = pair.slice(0, eq).trim();
  const value = pair.slice(eq + 1).trim();
  if (!name) return null;

  let domain = requestHost;
  for (const attr of attrs) {
    const [rawKey, ...rest] = attr.split("=");
    if (rawKey && rawKey.trim().toLowerCase() === "domain") {
      const d = rest.join("=").trim().replace(/^\./, "");
      if (d) domain = d.toLowerCase();
    }
  }

  return { name, value, domain };
}

function domainMatches(host: string, cookieDomain: string): boolean {
  host = host.toLowerCase();
  cookieDomain = cookieDomain.toLowerCase();
  return host === cookieDomain || host.endsWith(`.${cookieDomain}`);
}
