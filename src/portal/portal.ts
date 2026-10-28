/**
 * High-level reads off the discente portal, built on an authenticated session.
 */

import { parse } from "node-html-parser";
import { SigaaSession } from "../auth/session.ts";
import { parsePortal } from "./parse-portal.ts";
import { parseTurmas } from "./parse-turmas.ts";
import { parseTurmaVirtual } from "./parse-turma-virtual.ts";
import { parseJsfLink, buildFormBody } from "../util/jsf.ts";
import type { PortalData, HistoricClass } from "./types.ts";
import type { TurmaVirtual } from "./turma-virtual-types.ts";

const PORTAL_PATH = "/sigaa/portais/discente/discente.jsf";

/** Fetch and parse the discente landing page. Requires an authenticated session. */
export async function fetchPortal(session: SigaaSession): Promise<PortalData> {
  const res = await session.get(PORTAL_PATH);
  return parsePortal(await res.text());
}

/**
 * Open a turma's virtual classroom (AVA) and parse its main page.
 *
 * Opening is a JSF postback on the portal, so this re-fetches the portal to get
 * a fresh ViewState, finds the "open" command link whose `frontEndIdTurma`
 * matches, replays it, and parses the resulting /sigaa/ava/index.jsf page.
 *
 * `frontEndIdTurma` comes from an `EnrolledClass` returned by `fetchPortal`.
 */
export async function openTurmaVirtual(
  session: SigaaSession,
  frontEndIdTurma: string,
): Promise<TurmaVirtual> {
  const portalHtml = await (await session.get(PORTAL_PATH)).text();
  const root = parse(portalHtml);

  for (const a of root.querySelectorAll("a")) {
    const onclick = a.getAttribute("onclick") ?? "";
    if (!onclick.includes("frontEndIdTurma")) continue;
    const pb = parseJsfLink(onclick);
    if (pb?.params["frontEndIdTurma"] !== frontEndIdTurma) continue;

    const body = buildFormBody(root, pb.formId, pb.params);
    const res = await session.post(PORTAL_PATH, body);
    return parseTurmaVirtual(await res.text());
  }

  throw new Error(`No turma with frontEndIdTurma=${frontEndIdTurma} on the portal`);
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
