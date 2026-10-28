/**
 * High-level reads off the discente portal, built on an authenticated session.
 */

import { SigaaSession } from "../auth/session.ts";
import { parsePortal } from "./parse-portal.ts";
import { parseTurmas } from "./parse-turmas.ts";
import type { PortalData, HistoricClass } from "./types.ts";

/** Fetch and parse the discente landing page. Requires an authenticated session. */
export async function fetchPortal(session: SigaaSession): Promise<PortalData> {
  const res = await session.get("/sigaa/portais/discente/discente.jsf");
  return parsePortal(await res.text());
}

/**
 * Fetch and parse the full class history ("Ver turmas anteriores"): all
 * periods, current and past. The portal landing must be visited first to
 * establish the discente context, so this hits it before turmas.jsf.
 */
export async function fetchAllClasses(session: SigaaSession): Promise<HistoricClass[]> {
  await session.get("/sigaa/portais/discente/discente.jsf");
  const res = await session.get("/sigaa/portais/discente/turmas.jsf");
  return parseTurmas(await res.text());
}
