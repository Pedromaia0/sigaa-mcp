/**
 * High-level reads off the discente portal, built on an authenticated session.
 */

import { parse, type HTMLElement } from "node-html-parser";
import { SigaaSession } from "../auth/session.ts";
import { parsePortal } from "./parse-portal.ts";
import { parseTurmas } from "./parse-turmas.ts";
import { parseTurmaVirtual } from "./parse-turma-virtual.ts";
import {
  parseParticipants,
  parseGrades,
  parseAttendance,
  parseTasks,
  parseAssessments,
  parseClassNews,
  parseForums,
  parseCoursePlan,
} from "./parse-turma-sections.ts";
import { parseJsfLink, buildFormBody, cleanText } from "../util/jsf.ts";
import type { PortalData, HistoricClass } from "./types.ts";
import type { TurmaVirtual } from "./turma-virtual-types.ts";
import type { TurmaFull } from "./turma-sections-types.ts";

const PORTAL_PATH = "/sigaa/portais/discente/discente.jsf";
const AVA_PATH = "/sigaa/ava/index.jsf";

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
 * Open a turma's virtual classroom and read every section we can parse:
 * lesson topics, participants, grades, attendance, tasks, assessments, class
 * news, forums and the course plan.
 *
 * The AVA left menu is reached by `formMenu` postbacks; each returns a page
 * that still carries the menu, so sections are navigated in sequence from the
 * freshly-opened classroom. A section that errors is skipped (left empty)
 * rather than failing the whole read.
 */
export async function fetchTurmaFull(
  session: SigaaSession,
  frontEndIdTurma: string,
): Promise<TurmaFull> {
  // Open the classroom and keep the raw HTML (it carries the menu).
  const portalHtml = await (await session.get(PORTAL_PATH)).text();
  const portalRoot = parse(portalHtml);
  const open = findOpenLink(portalRoot, frontEndIdTurma);
  if (!open) throw new Error(`No turma with frontEndIdTurma=${frontEndIdTurma} on the portal`);

  const avaHtml = await (await session.post(PORTAL_PATH, buildFormBody(portalRoot, open.formId, open.params))).text();
  const main = parseTurmaVirtual(avaHtml);

  // Navigate every section from the freshly-opened classroom page. Its view
  // stays valid for repeated menu postbacks within the session; chaining from
  // each returned page instead proved unreliable (stale ViewState / ids).
  const section = (label: string) => navigateSection(session, avaHtml, label);

  const participants = await section("Participantes");
  const gradesHtml = await section("Ver Notas");
  const attendanceHtml = await section("Frequência");
  const tasksHtml = await section("Tarefas");
  const assessmentsHtml = await section("Avaliações");
  const newsHtml = await section("Notícias");
  const forumsHtml = await section("Fóruns");
  const planHtml = await section("Plano de Curso");

  return {
    header: main.header,
    topics: main.topics,
    participants: participants ? parseParticipants(participants) : [],
    grades: gradesHtml ? parseGrades(gradesHtml) : undefined,
    attendance: attendanceHtml ? parseAttendance(attendanceHtml) : undefined,
    tasks: tasksHtml ? parseTasks(tasksHtml) : [],
    assessments: assessmentsHtml ? parseAssessments(assessmentsHtml) : [],
    news: newsHtml ? parseClassNews(newsHtml) : [],
    forums: forumsHtml ? parseForums(forumsHtml) : [],
    coursePlan: planHtml ? parseCoursePlan(planHtml) : {},
  };
}

function findOpenLink(
  root: HTMLElement,
  frontEndIdTurma: string,
): { formId: string; params: Record<string, string> } | null {
  for (const a of root.querySelectorAll("a")) {
    const onclick = a.getAttribute("onclick") ?? "";
    if (!onclick.includes("frontEndIdTurma")) continue;
    const pb = parseJsfLink(onclick);
    if (pb?.params["frontEndIdTurma"] === frontEndIdTurma) return pb;
  }
  return null;
}

/** POST the `formMenu` command link whose label matches, return its HTML. */
async function navigateSection(
  session: SigaaSession,
  avaHtml: string,
  label: string,
): Promise<string | null> {
  const root = parse(avaHtml);
  for (const a of root.querySelectorAll("a")) {
    if (cleanText(a.text) !== label) continue;
    const pb = parseJsfLink(a.getAttribute("onclick"));
    if (!pb || pb.formId !== "formMenu") continue;
    try {
      const res = await session.post(AVA_PATH, buildFormBody(root, pb.formId, pb.params));
      return await res.text();
    } catch {
      return null;
    }
  }
  return null;
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
