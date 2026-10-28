/**
 * Parsers for the individual virtual-classroom (AVA) sections, each reached by
 * a `formMenu` postback from the turma's left menu. See docs/SITE.md.
 */

import { parse, type HTMLElement } from "node-html-parser";
import { cleanText } from "../util/jsf.ts";
import type {
  Participant,
  Grades,
  Attendance,
  AttendanceRecord,
  Task,
  Assessment,
  ClassNews,
  TurmaForum,
} from "./turma-sections-types.ts";

const DATE = /\d{2}\/\d{2}\/\d{4}/;

/** Tables that contain no nested table — the ones holding real rows, not the
 *  layout wrappers that merely contain a data table. */
function leafTables(root: HTMLElement): HTMLElement[] {
  return root.querySelectorAll("table").filter((t) => !t.querySelector("table"));
}

const cells = (r: HTMLElement) => r.querySelectorAll("th,td").map((c) => cleanText(c.text));

/** Participantes: docentes and discentes with name/registration/email/etc. */
export function parseParticipants(html: string): Participant[] {
  const root = parse(html);
  const participants: Participant[] = [];

  for (const cell of root.querySelectorAll("td[valign=top]")) {
    const strong = cell.querySelector("strong");
    if (!strong) continue;
    const text = cleanText(cell.text);
    // Only real participant cells carry these labels (skips the NEE email form).
    if (!/(Matrícula|Usuário|E-?mail|Formaç)/i.test(text)) continue;

    const name = cleanText(strong.text);
    if (!name) continue;

    const field = (label: string) =>
      text.match(
        new RegExp(`${label}:\\s*(.*?)\\s*(?:Curso:|Matrícula:|Usuário:|E-?mail:|Formaç\\w+:|Departamento:|$)`, "i"),
      )?.[1]?.trim() || undefined;

    const registration = field("Matrícula");
    const username = field("Usuário");
    const email = field("E-mail") ?? field("E-Mail");
    const perfil = cell.querySelector("a[onclick*=idPessoa]")?.getAttribute("onclick") ?? "";
    const personId = perfil.match(/idPessoa['"]?\s*:\s*(\d+)/)?.[1];

    // A real participant has at least one identifier; this drops stray cells
    // like the "Necessidades Educacionais" email form ("Destinatário:").
    if (!registration && !username && !email && !personId) continue;
    if (/:$/.test(name)) continue;

    participants.push({
      role: registration ? "discente" : "docente",
      name,
      registration,
      username,
      email,
      course: field("Curso"),
      formation: field("Formação"),
      personId,
    });
  }

  return participants;
}

/** Ver Notas: the student's own grade row (colspan layout kept as-is). */
export function parseGrades(html: string): Grades | undefined {
  const root = parse(html);

  const table = leafTables(root).find(
    (t) => t.text.includes("Matr") && (t.text.includes("Resultado") || t.text.includes("Faltas")),
  );
  if (!table) return undefined;

  const rows = table.querySelectorAll("tr");

  // Column labels from the assessment-abbreviation row (#trAval) when present.
  const trAval = root.querySelector("#trAval");
  const columns = (trAval ? trAval.querySelectorAll("th").map((c) => cleanText(c.text)) : cells(rows[1] ?? table))
    .filter(Boolean);

  // Student data row: starts with a matrícula (6+ digits).
  const dataRow = rows.find((r) => /^\d{6,}$/.test(cells(r)[0] ?? ""));
  if (!dataRow) return undefined;
  const data = cells(dataRow).slice(2); // drop matrícula + nome

  // Grades use comma decimals ("1,5"); faltas is a bare integer; situação is text.
  const values = data.filter((v) => /^\d+,\d+$/.test(v));
  const faltasRaw = data.filter((v) => /^\d+$/.test(v)).pop();
  const last = cleanText(data[data.length - 1]);
  const situacao = last && !/^\d+$/.test(last) ? last : undefined;

  return {
    columns,
    values,
    assessments: columns.slice(0, values.length).map((label, i) => ({ label, value: values[i] ?? "" })),
    faltas: faltasRaw !== undefined ? Number(faltasRaw) : undefined,
    situacao,
  };
}

/** Frequência: per-date presence + total absences. */
export function parseAttendance(html: string): Attendance | undefined {
  const root = parse(html);

  for (const t of leafTables(root)) {
    const head = t.querySelector("tr");
    if (!head || !/Situaç/i.test(head.text) || !/Data/i.test(head.text)) continue;

    const records: AttendanceRecord[] = [];
    for (const r of t.querySelectorAll("tr")) {
      const c = r.querySelectorAll("td").map((x) => cleanText(x.text));
      if (c[0] && DATE.test(c[0]) && c[1]) records.push({ date: c[0], status: c[1] });
    }
    if (records.length) {
      return { totalFaltas: records.filter((r) => /falta/i.test(r.status)).length, records };
    }
  }
  return undefined;
}

/** Tarefas: title, delivery period, whether graded, submission count. */
export function parseTasks(html: string): Task[] {
  const root = parse(html);

  const table = leafTables(root).find((t) => /Período de Entrega|Possui Nota|Envios/i.test(t.text));
  if (!table) return [];

  const tasks: Task[] = [];
  for (const r of table.querySelectorAll("tr")) {
    if (r.querySelector("th")) continue; // header
    // Drop empty padding cells; SIGAA wraps the row with blank <td>s.
    const c = r.querySelectorAll("td").map((x) => cleanText(x.text)).filter(Boolean);
    if (c.length < 3) continue; // skip rowspan detail rows
    const title = c[0];
    if (!title) continue;
    const graded = c.find((x) => /^(Sim|Não)$/i.test(x));
    tasks.push({
      title,
      period: c.find((x) => DATE.test(x)),
      hasGrade: graded ? /sim/i.test(graded) : undefined,
      submissions: (() => {
        const n = [...c].reverse().find((x) => /^\d+$/.test(x));
        return n ? Number(n) : undefined;
      })(),
    });
  }
  return tasks;
}

/** Avaliações: scheduled assessment dates. */
export function parseAssessments(html: string): Assessment[] {
  const root = parse(html);

  const table = leafTables(root).find((t) => {
    const head = t.querySelector("tr");
    return head && /Descriç/i.test(head.text) && /Data/i.test(head.text);
  });
  if (!table) return [];

  const out: Assessment[] = [];
  for (const r of table.querySelectorAll("tr")) {
    if (r.querySelector("th")) continue;
    const c = r.querySelectorAll("td").map((x) => cleanText(x.text));
    if (c.length < 3 || !c[2]) continue;
    out.push({ date: c[0] && DATE.test(c[0]) ? c[0] : undefined, time: c[1] || undefined, description: c[2] });
  }
  return out;
}

/** Notícias (within the turma): title + date. */
export function parseClassNews(html: string): ClassNews[] {
  const root = parse(html);

  const table = leafTables(root).find((t) => {
    const head = t.querySelector("tr");
    return head && /Título/i.test(head.text) && /Data/i.test(head.text);
  });
  if (!table) return [];

  const out: ClassNews[] = [];
  for (const r of table.querySelectorAll("tr")) {
    if (r.querySelector("th")) continue;
    const c = r.querySelectorAll("td").map((x) => cleanText(x.text));
    if (!c[0]) continue;
    out.push({ title: c[0], date: c.find((x) => DATE.test(x)) });
  }
  return out;
}

/** Fóruns: list of forums (often empty). */
export function parseForums(html: string): TurmaForum[] {
  const root = parse(html);

  const table = leafTables(root).find((t) => /Autor|Tópicos|Fórum/i.test(t.text) && t.querySelector("a"));
  if (!table) return [];

  const out: TurmaForum[] = [];
  for (const r of table.querySelectorAll("tr")) {
    if (r.querySelector("th")) continue;
    const link = r.querySelector("a");
    const c = r.querySelectorAll("td").map((x) => cleanText(x.text));
    const title = cleanText(link?.text) || c[0];
    if (!title) continue;
    out.push({ title, date: c.find((x) => DATE.test(x)) });
  }
  return out;
}

/** Plano de Curso: label→value rows (Ementa, Metodologia, Avaliação, …).
 *  Rows are `<th>Label:</th><td>value</td>` inside `table.listagem`. */
export function parseCoursePlan(html: string): Record<string, string> {
  const root = parse(html);
  const plan: Record<string, string> = {};

  for (const t of leafTables(root)) {
    // Only the plano's own listings (they have a <caption>), not lesson tables.
    if (!t.querySelector("caption") && !/listagem/.test(t.getAttribute("class") ?? "")) continue;
    for (const r of t.querySelectorAll("tr")) {
      const th = r.querySelector("th");
      const td = r.querySelector("td");
      if (!th || !td) continue;
      const label = cleanText(th.text).replace(/:$/, "");
      const value = cleanText(td.text);
      if (label && value) plan[label] = value;
    }
  }

  return plan;
}
