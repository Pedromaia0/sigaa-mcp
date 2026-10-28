/**
 * Smoke test for the CAS web login.
 *
 *   cp .env.example .env    # fill in SIGAA_USERNAME / SIGAA_PASSWORD
 *   npm run login
 *
 * Reads credentials from the environment (loaded via --env-file=.env), logs in,
 * and reports whether a SIGAA session cookie was obtained. No credentials are
 * printed.
 */

import { SigaaSession, SigaaAuthError } from "./session.ts";

async function main(): Promise<void> {
  const username = process.env.SIGAA_USERNAME;
  const password = process.env.SIGAA_PASSWORD;

  if (!username || !password) {
    console.error("Missing SIGAA_USERNAME / SIGAA_PASSWORD (set them in .env).");
    process.exit(2);
  }

  const session = new SigaaSession({
    baseUrl: process.env.SIGAA_BASE_URL,
    authBaseUrl: process.env.SIGAA_AUTH_BASE_URL,
  });

  try {
    console.log(`Logging in as ${username} …`);
    await session.login(username, password);
    console.log("✓ Login succeeded.");
    console.log(`  Session cookies: ${session.cookieNames().join(", ")}`);
  } catch (err) {
    if (err instanceof SigaaAuthError) {
      console.error(`✗ Login failed: ${err.message}`);
      if (err.detail) console.error("  detail:", err.detail);
    } else {
      console.error("✗ Unexpected error:", err);
    }
    process.exit(1);
  }
}

void main();
