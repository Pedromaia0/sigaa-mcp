/**
 * SIGAA web session + CAS login.
 *
 * This talks to the *web* SIGAA (the HTML interface a browser uses), not the
 * official mobile/OAuth API. Authentication is the standard CAS handshake:
 *
 *   1. GET  <auth>/sso-server/login?service=<sigaa cas callback>
 *          -> parse hidden `lt` and `execution` fields, keep auth cookies.
 *   2. POST <auth>/sso-server/login with username/password/lt/execution
 *          -> 302 whose Location carries `ticket=ST-...`.
 *   3. GET  the ticket URL on the SIGAA host (following redirects)
 *          -> SIGAA validates the ticket and sets a JSESSIONID session cookie.
 *
 * After login the same `SigaaSession` carries the cookie jar, so every later
 * page request reuses the authenticated session.
 */

import { CookieJar } from "./cookie-jar.ts";

export interface SigaaSessionConfig {
  /** SIGAA web host, e.g. https://sigaa.ufrn.br */
  baseUrl?: string;
  /** CAS auth server, e.g. https://autenticacao.ufrn.br */
  authBaseUrl?: string;
  /** Browser-like UA; some CAS/SIGAA paths behave differently otherwise. */
  userAgent?: string;
  /** Request timeout in ms. */
  timeoutMs?: number;
}

const DEFAULTS = {
  baseUrl: "https://sigaa.ufrn.br",
  authBaseUrl: "https://autenticacao.ufrn.br",
  userAgent:
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
    "(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  timeoutMs: 20_000,
} as const;

export class SigaaAuthError extends Error {
  readonly detail?: unknown;

  constructor(message: string, detail?: unknown) {
    super(message);
    this.name = "SigaaAuthError";
    this.detail = detail;
  }
}

export class SigaaSession {
  readonly baseUrl: string;
  readonly authBaseUrl: string;
  private readonly userAgent: string;
  private readonly timeoutMs: number;
  private readonly jar = new CookieJar();
  private authenticated = false;

  constructor(config: SigaaSessionConfig = {}) {
    this.baseUrl = (config.baseUrl ?? DEFAULTS.baseUrl).replace(/\/$/, "");
    this.authBaseUrl = (config.authBaseUrl ?? DEFAULTS.authBaseUrl).replace(/\/$/, "");
    this.userAgent = config.userAgent ?? DEFAULTS.userAgent;
    this.timeoutMs = config.timeoutMs ?? DEFAULTS.timeoutMs;
  }

  get isAuthenticated(): boolean {
    return this.authenticated;
  }

  /** Cookie names currently held (for status/debugging, not the values). */
  cookieNames(): string[] {
    return this.jar.names();
  }

  /**
   * Perform the full CAS login. On success the session holds a validated
   * JSESSIONID for the SIGAA host. Throws SigaaAuthError on any failed step.
   */
  async login(username: string, password: string): Promise<void> {
    if (!username || !password) {
      throw new SigaaAuthError("Username and password are required");
    }

    const service = `${this.baseUrl}/sigaa/login/cas`;
    const loginUrl = `${this.authBaseUrl}/sso-server/login?service=${encodeURIComponent(service)}`;

    // Step 1 — fetch the CAS login form, capture lt/execution + cookies.
    const formRes = await this.fetchNoRedirect(loginUrl, { method: "GET" });
    const formHtml = await formRes.text();
    if (formRes.status !== 200) {
      throw new SigaaAuthError(`CAS login form returned HTTP ${formRes.status}`);
    }
    const { lt, execution } = extractCasFormFields(formHtml);

    // Step 2 — submit credentials.
    const body = new URLSearchParams({
      username,
      password,
      lt,
      execution,
      _eventId: "submit",
    });
    const postRes = await this.fetchNoRedirect(loginUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    });

    // A successful CAS login responds 3xx with a Location containing the ticket.
    // A failed one typically re-renders the form (200) with an error message.
    const location = postRes.headers.get("location");
    if (!location || !/ticket=ST-/.test(location)) {
      if (postRes.status === 200) {
        const html = await postRes.text();
        throw new SigaaAuthError(
          "CAS rejected the credentials (no ticket issued)",
          extractCasError(html),
        );
      }
      throw new SigaaAuthError(
        `Unexpected CAS response: HTTP ${postRes.status}, no ticket in Location`,
      );
    }

    // Step 3 — follow the ticket to SIGAA so it validates and sets JSESSIONID.
    await this.followRedirects(location, 5);

    const sigaaHost = new URL(this.baseUrl);
    const hasSession = this.jar.cookieHeaderFor(sigaaHost)?.includes("JSESSIONID");
    if (!hasSession) {
      throw new SigaaAuthError(
        "Ticket followed but no SIGAA session cookie (JSESSIONID) was set",
      );
    }

    this.authenticated = true;
  }

  /**
   * Authenticated GET of a SIGAA path (absolute URL or path relative to
   * baseUrl). Returns the raw Response after following redirects. Does not
   * require login() first, but you'll get the public/login page if unauthenticated.
   */
  async get(pathOrUrl: string): Promise<Response> {
    const url = pathOrUrl.startsWith("http")
      ? pathOrUrl
      : `${this.baseUrl}${pathOrUrl.startsWith("/") ? "" : "/"}${pathOrUrl}`;
    return this.followRedirects(url, 10);
  }

  // --- internals -----------------------------------------------------------

  /** Single request, cookies attached/stored, redirects NOT followed. */
  private async fetchNoRedirect(url: string, init: RequestInit): Promise<Response> {
    const target = new URL(url);
    const headers = new Headers(init.headers);
    headers.set("User-Agent", this.userAgent);
    headers.set("Accept", "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8");
    const cookie = this.jar.cookieHeaderFor(target);
    if (cookie) headers.set("Cookie", cookie);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const res = await fetch(target, {
        ...init,
        headers,
        redirect: "manual",
        signal: controller.signal,
      });
      this.jar.storeFromSetCookie(target, res.headers.getSetCookie());
      return res;
    } catch (err) {
      throw new SigaaAuthError(`Request to ${target.hostname} failed`, err);
    } finally {
      clearTimeout(timer);
    }
  }

  /** GET following 3xx redirects manually so cookies are captured each hop. */
  private async followRedirects(startUrl: string, maxHops: number): Promise<Response> {
    let current = startUrl;
    for (let hop = 0; hop <= maxHops; hop++) {
      const res = await this.fetchNoRedirect(current, { method: "GET" });
      if (res.status >= 300 && res.status < 400) {
        const next = res.headers.get("location");
        if (!next) return res;
        current = new URL(next, current).toString();
        continue;
      }
      return res;
    }
    throw new SigaaAuthError(`Too many redirects (>${maxHops}) from ${startUrl}`);
  }
}

/** Pull the hidden `lt` and `execution` inputs out of the CAS login form. */
function extractCasFormFields(html: string): { lt: string; execution: string } {
  const lt = matchInputValue(html, "lt");
  const execution = matchInputValue(html, "execution");
  if (!lt) {
    throw new SigaaAuthError("Could not find the 'lt' field in the CAS login form");
  }
  return { lt, execution: execution ?? "e1s1" };
}

function matchInputValue(html: string, name: string): string | null {
  // Match <input ... name="<name>" ... value="..."> in either attribute order.
  const patterns = [
    new RegExp(`name=["']${name}["'][^>]*value=["']([^"']*)["']`, "i"),
    new RegExp(`value=["']([^"']*)["'][^>]*name=["']${name}["']`, "i"),
  ];
  for (const re of patterns) {
    const m = html.match(re);
    if (m && m[1] !== undefined) return m[1];
  }
  return null;
}

/** Best-effort extraction of a CAS error message for diagnostics. */
function extractCasError(html: string): string | undefined {
  const m =
    html.match(/<div[^>]*class=["'][^"']*errors?[^"']*["'][^>]*>([\s\S]*?)<\/div>/i) ||
    html.match(/<span[^>]*id=["']status["'][^>]*>([\s\S]*?)<\/span>/i);
  if (!m || m[1] === undefined) return undefined;
  return m[1].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim() || undefined;
}
