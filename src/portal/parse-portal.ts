/**
 * Parser for the discente portal landing page
 * (/sigaa/portais/discente/discente.jsf).
 *
 * Structure reverse-engineered from the live page (see docs/SITE.md):
 *   #info-usuario            -> name / center / current semester
 *   "Dados Institucionais"   -> Matrícula / Curso / Status / Entrada (label:value)
 *   td.descricao list        -> enrolled classes (name, location, schedule)
 *   #atualizacoes-turma       -> per-class "Últimas Atualizações" feed (paired rows)
 *   #formAtividades           -> "Minhas atividades" upcoming tasks/exams
 *   #forum-portal             -> course forum topics
 */

import { parse, type HTMLElement } from "node-html-parser";
import { cleanText, parseJsfLink } from "../util/jsf.ts";
import { parseSchedule, getClassAcronym } from "../util/schedule.ts";
import type {
  PortalData,
  StudentInfo,
  EnrolledClass,
  ClassUpdate,
  UpcomingActivity,
  ForumTopic,
} from "./types.ts";

export function parsePortal(html: string): PortalData {
  const root = parse(html);
  return {
    student: parseStudent(root),
    enrolledClasses: parseEnrolledClasses(root),
    updates: parseUpdates(root),
    activities: parseActivities(root),
    forum: parseForum(root),
    forumTitle: cleanText(root.querySelector("#forum-portal h4")?.text) || undefined,
  };
}

function parseStudent(root: HTMLElement): StudentInfo {
  const info = root.querySelector("#info-usuario");
  const name = cleanText(info?.querySelector(".usuario span")?.text) || undefined;
  const semester = cleanText(info?.querySelector(".periodo-atual strong")?.text) || undefined;
  const center = cleanText(info?.querySelector(".unidade")?.text) || undefined;

  const extra: Record<string, string> = {};
  // "Dados Institucionais": two-cell rows of the form `<td>Label:</td><td>Value</td>`.
  for (const row of root.querySelectorAll("tr")) {
    const cells = row.querySelectorAll("td");
    if (cells.length < 2) continue;
    const label = cleanText(cells[0]?.text).replace(/:$/, "");
    const value = cleanText(cells[1]?.text);
    if (/^(Matrícula|Curso|Status|Entrada)$/i.test(label) && value) {
      extra[label] = value;
    }
  }

  return {
    name,
    center,
    currentSemester: semester,
    registration: extra["Matrícula"],
    course: extra["Curso"],
    status: extra["Status"],
    extra,
  };
}

function parseEnrolledClasses(root: HTMLElement): EnrolledClass[] {
  const classes: EnrolledClass[] = [];

  for (const row of root.querySelectorAll("tr")) {
    const descricao = row.querySelector("td.descricao");
    const link = descricao?.querySelector("a");
    if (!descricao || !link) continue;

    const name = cleanText(link.text);
    if (!name) continue;

    const infoCells = row.querySelectorAll("td.info");
    const location = cleanText(infoCells[0]?.text) || undefined;
    const scheduleCode =
      cleanText(infoCells[1]?.querySelector("center")?.text ?? infoCells[1]?.text) || undefined;

    const postback = parseJsfLink(link.getAttribute("onclick"));

    classes.push({
      name,
      acronym: getClassAcronym(name),
      location,
      scheduleCode,
      schedule: scheduleCode ? parseSchedule(scheduleCode) : [],
      openFormId: postback?.formId,
      openComponentId: postback ? Object.keys(postback.params)[0] : undefined,
    });
  }

  return classes;
}

function parseUpdates(root: HTMLElement): ClassUpdate[] {
  const container = root.querySelector("#atualizacoes-turma");
  if (!container) return [];

  const updates: ClassUpdate[] = [];
  const rows = container.querySelectorAll("tr");

  // Entries come as pairs: a "dd/mm/yyyy - CLASS (period)" row, then a title row.
  for (let i = 0; i < rows.length; i++) {
    const headText = cleanText(rows[i]?.text);
    const head = headText.match(/^(\d{2}\/\d{2}\/\d{4})\s*-\s*(.+?)\s*\((\d{4}\.\d)\)$/);
    if (!head) continue;

    const title = cleanText(rows[i + 1]?.text);
    const kindMatch = title.match(/^([^:]+):\s*(.*)$/);
    updates.push({
      date: head[1],
      class: head[2],
      kind: kindMatch?.[1]?.trim(),
      title: kindMatch?.[2]?.trim() || title,
    });
    i++; // consume the title row
  }

  return updates;
}

function parseActivities(root: HTMLElement): UpcomingActivity[] {
  const form = root.querySelector("#formAtividades");
  if (!form) return [];

  const activities: UpcomingActivity[] = [];
  for (const row of form.querySelectorAll("tr")) {
    const cells = row.querySelectorAll("td");
    if (cells.length < 3) continue; // skip headers and the period separator row

    const whenText = cleanText(cells[1]?.text);
    const when = whenText.match(/^(.*?)(?:\s*\((.+?)\))?$/);

    const descCell = cells[2];
    if (!descCell) continue;
    // Shape: `<small>CLASS<br><strong>Kind:</strong> <a>Title</a></small>`
    const small = descCell.querySelector("small") ?? descCell;
    const beforeBr = small.innerHTML.split(/<br/i)[0] ?? "";
    const className = cleanText(parse(beforeBr).text) || undefined;
    const kind = cleanText(descCell.querySelector("strong")?.text).replace(/:$/, "") || undefined;
    // Title is usually an <a>; for exams ("Avaliação") it's plain text after "Kind:".
    let title = cleanText(descCell.querySelector("a")?.text);
    if (!title) {
      const afterKind = cleanText(small.text).split(/:\s*/).slice(1).join(": ");
      title = cleanText(afterKind);
    }
    if (!title && !className) continue;

    activities.push({
      due: when?.[1]?.trim() || whenText || undefined,
      relative: when?.[2]?.trim(),
      class: className,
      kind,
      title: title || "",
    });
  }

  return activities;
}

function parseForum(root: HTMLElement): ForumTopic[] {
  const form = root.querySelector("#forum-portal");
  if (!form) return [];

  const topics: ForumTopic[] = [];
  for (const row of form.querySelectorAll("tr")) {
    if (row.querySelector("th")) continue; // header row
    const link = row.querySelector("a[id*=mostrarForumMensagem]");
    if (!link) continue;

    const cells = row.querySelectorAll("td");
    const author = cleanText(cells[1]?.text) || undefined;
    const repliesText = cleanText(cells[2]?.text);
    const date = cleanText(cells[3]?.text) || undefined;

    topics.push({
      title: cleanText(link.text),
      author,
      replies: /^\d+$/.test(repliesText) ? Number(repliesText) : undefined,
      date,
    });
  }

  return topics;
}
