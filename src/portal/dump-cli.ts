/**
 * Fetch the portal + full class history and print them as JSON.
 *
 *   npm run portal
 *
 * Credentials come from the environment (loaded via --env-file=.env).
 */

import { SigaaSession, SigaaAuthError } from "../auth/session.ts";
import { fetchPortal, fetchAllClasses, fetchTurmaFull } from "./portal.ts";

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
    await session.login(username, password);
    const portal = await fetchPortal(session);
    const allClasses = await fetchAllClasses(session);

    // Also read the first enrolled turma's full virtual classroom, if any.
    const first = portal.enrolledClasses.find((c) => c.frontEndIdTurma);
    const turma = first?.frontEndIdTurma
      ? await fetchTurmaFull(session, first.frontEndIdTurma)
      : null;

    console.log(JSON.stringify({ portal, allClasses, turma }, null, 2));
  } catch (err) {
    if (err instanceof SigaaAuthError) {
      console.error(`✗ ${err.message}`);
      if (err.detail) console.error("  detail:", err.detail);
    } else {
      console.error("✗ Unexpected error:", err);
    }
    process.exit(1);
  }
}

void main();
