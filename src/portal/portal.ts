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
  parseReferences,
  parseArquivos,
  parseQuestionnaires,
  parsePolls,
  parseCoursePlan,
  parseNewsDetail,
  parseParticipantProfile,
} from "./parse-turma-sections.ts";
import { parseJsfLink, buildFormBody, cleanText, cssEscape } from "../util/jsf.ts";
import type { PortalData, HistoricClass } from "./types.ts";
import type { TurmaVirtual } from "./turma-virtual-types.ts";
import type {
  TurmaFull,
  DownloadedFile,
  NewsDetail,
  ParticipantProfile,
} from "./turma-sections-types.ts";

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
  const referencesHtml = await section("Referências");
  const arquivosHtml = await section("Arquivos");
  const questionnairesHtml = await section("Questionários");
  const pollsHtml = await section("Enquetes");
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
    references: referencesHtml ? parseReferences(referencesHtml) : [],
    files: arquivosHtml ? parseArquivos(arquivosHtml) : [],
    questionnaires: questionnairesHtml ? parseQuestionnaires(questionnairesHtml) : [],
    polls: pollsHtml ? parsePolls(pollsHtml) : [],
    coursePlan: planHtml ? parseCoursePlan(planHtml) : {},
  };
}

/**
 * Download a file published in a turma (a lesson-topic material or an Arquivos
 * entry) by its `fileId`. Opens the turma for a fresh ViewState, finds the
 * download link on the classroom page (falling back to the Arquivos listing),
 * replays the postback, and returns the bytes + server filename/content-type.
 */
export async function downloadTurmaFile(
  session: SigaaSession,
  frontEndIdTurma: string,
  fileId: string,
): Promise<DownloadedFile> {
  const portalRoot = parse(await (await session.get(PORTAL_PATH)).text());
  const open = findOpenLink(portalRoot, frontEndIdTurma);
  if (!open) throw new Error(`No turma with frontEndIdTurma=${frontEndIdTurma} on the portal`);
  const avaHtml = await (await session.post(PORTAL_PATH, buildFormBody(portalRoot, open.formId, open.params))).text();

  // Try the classroom page (topic materials) first.
  let hit = findFileLink(parse(avaHtml), fileId);
  if (hit) return fetchDownload(session, avaHtml, hit);

  // Fall back to the Arquivos listing (different id space for the same files).
  const arquivosHtml = await navigateSection(session, avaHtml, "Arquivos");
  if (arquivosHtml) {
    hit = findFileLink(parse(arquivosHtml), fileId);
    if (hit) return fetchDownload(session, arquivosHtml, hit);
  }

  throw new Error(`No downloadable file with id=${fileId} in turma ${frontEndIdTurma}`);
}

/** Open a turma's virtual classroom and return the raw AVA page HTML. */
async function openAva(session: SigaaSession, frontEndIdTurma: string): Promise<string> {
  const portalRoot = parse(await (await session.get(PORTAL_PATH)).text());
  const open = findOpenLink(portalRoot, frontEndIdTurma);
  if (!open) throw new Error(`No turma with frontEndIdTurma=${frontEndIdTurma} on the portal`);
  return (await session.post(PORTAL_PATH, buildFormBody(portalRoot, open.formId, open.params))).text();
}

/**
 * Full text of one class news item (Notícias → Visualizar), by its idNoticia
 * (the `id` field on a `ClassNews` from fetchTurmaFull / get_turma).
 */
export async function fetchNewsDetail(
  session: SigaaSession,
  frontEndIdTurma: string,
  newsId: string,
): Promise<NewsDetail> {
  const avaHtml = await openAva(session, frontEndIdTurma);
  const listHtml = await navigateSection(session, avaHtml, "Notícias");
  if (!listHtml) throw new Error("Could not open Notícias");
  return drillNewsDetail(session, listHtml, newsId);
}

async function drillNewsDetail(
  session: SigaaSession,
  listHtml: string,
  newsId: string,
): Promise<NewsDetail> {
  const root = parse(listHtml);
  for (const a of root.querySelectorAll("a[onclick*=jsfcljs]")) {
    const pb = parseJsfLink(a.getAttribute("onclick"));
    if (pb?.params["id"] !== newsId) continue;
    const action = root.querySelector(`#${cssEscape(pb.formId)}`)?.getAttribute("action") ?? AVA_PATH;
    const detail = await (await session.post(action, buildFormBody(root, pb.formId, pb.params))).text();
    return parseNewsDetail(detail);
  }
  throw new Error(`No news item with id=${newsId}`);
}

/**
 * Extra profile detail for a participant (Participantes → Visualizar Perfil),
 * by `personId` (the `personId` on a `Participant`). Replays the RichFaces A4J
 * request that fills the profile dialog and parses the partial response.
 */
export async function fetchParticipantProfile(
  session: SigaaSession,
  frontEndIdTurma: string,
  personId: string,
): Promise<ParticipantProfile> {
  const avaHtml = await openAva(session, frontEndIdTurma);
  const listHtml = await navigateSection(session, avaHtml, "Participantes");
  if (!listHtml) throw new Error("Could not open Participantes");
  return drillProfile(session, listHtml, personId);
}

async function drillProfile(
  session: SigaaSession,
  listHtml: string,
  personId: string,
): Promise<ParticipantProfile> {
  const root = parse(listHtml);
  for (const a of root.querySelectorAll("a[onclick*=idPessoa]")) {
    const onclick = a.getAttribute("onclick") ?? "";
    if (onclick.match(/idPessoa['"]?\s*:\s*(\d+)/)?.[1] !== personId) continue;

    const formId = onclick.match(/A4J\.AJAX\.Submit\('([^']+)'/)?.[1];
    const comp = onclick.match(/parameters':\{[^}]*'([^']+)':'\1'/)?.[1];
    const containerId = onclick.match(/containerId':'([^']+)'/)?.[1];
    if (!formId || !comp || !containerId) break;

    const action = root.querySelector(`#${cssEscape(formId)}`)?.getAttribute("action") ?? AVA_PATH;
    const body = buildFormBody(root, formId, {
      AJAXREQUEST: containerId,
      idPessoa: personId,
      [comp]: comp,
    });
    const resp = await (await session.post(action, body)).text();
    return parseParticipantProfile(resp);
  }
  throw new Error(`No participant with personId=${personId}`);
}

/**
 * Download a participant's profile photo by `personId`. The photo URL is a
 * short-lived signed link, so this re-opens Participantes, reads the current
 * URL for that person and fetches it immediately. Throws if they have no photo
 * (default avatar).
 */
export async function downloadParticipantPhoto(
  session: SigaaSession,
  frontEndIdTurma: string,
  personId: string,
): Promise<DownloadedFile> {
  const avaHtml = await openAva(session, frontEndIdTurma);
  const listHtml = await navigateSection(session, avaHtml, "Participantes");
  if (!listHtml) throw new Error("Could not open Participantes");

  const participant = parseParticipants(listHtml).find((p) => p.personId === personId);
  if (!participant) throw new Error(`No participant with personId=${personId}`);
  if (!participant.photoUrl) throw new Error(`Participant ${personId} has no photo`);

  const res = await session.get(participant.photoUrl);
  const contentType = res.headers.get("content-type") ?? undefined;
  const bytes = new Uint8Array(await res.arrayBuffer());
  if (bytes.length < 200) throw new Error(`Photo fetch failed (${bytes.length} bytes): the signed URL may have expired`);
  // The bytes are the real image; trust the magic over the server's content-type.
  const ext = bytes[0] === 0x89 ? "png" : "jpg";
  return { filename: `foto-${personId}.${ext}`, contentType, bytes };
}

function findFileLink(
  root: HTMLElement,
  fileId: string,
): { formId: string; params: Record<string, string> } | null {
  for (const a of root.querySelectorAll("a[onclick*=jsfcljs]")) {
    const pb = parseJsfLink(a.getAttribute("onclick"));
    if (pb?.params["id"] === fileId) return pb;
  }
  return null;
}

async function fetchDownload(
  session: SigaaSession,
  sourceHtml: string,
  link: { formId: string; params: Record<string, string> },
): Promise<DownloadedFile> {
  const root = parse(sourceHtml);
  const body = buildFormBody(root, link.formId, link.params);
  // Post to the form's own action (topic materials use index.jsf; the Arquivos
  // listing uses ArquivoTurma/listar_discente.jsf).
  const action = root.querySelector(`#${cssEscape(link.formId)}`)?.getAttribute("action") ?? AVA_PATH;
  const res = await session.post(action, body);
  const disposition = res.headers.get("content-disposition") ?? "";
  const filename = disposition.match(/filename="?([^"]+)"?/)?.[1] ?? `file-${link.params["id"]}`;
  return {
    filename,
    contentType: res.headers.get("content-type") ?? undefined,
    bytes: new Uint8Array(await res.arrayBuffer()),
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
