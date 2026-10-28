/**
 * Parser for the virtual-classroom (AVA) main page, served at
 * /sigaa/ava/index.jsf after opening a turma from the portal.
 *
 * Structure (see docs/SITE.md):
 *   header bar        -> "CODE - NAME (workload) (period)"
 *   .topico-aula      -> one lesson topic; child .titulo holds "Title (dates)",
 *                        child .conteudotopico holds the body + material links.
 *   material links    -> <a onclick="jsfcljs(... {'id':'<fileId>'} ...)">name</a>
 */

import { parse, type HTMLElement } from "node-html-parser";
import { cleanText, parseJsfLink } from "../util/jsf.ts";
import type {
  TurmaVirtual,
  TurmaVirtualHeader,
  LessonTopic,
  Material,
} from "./turma-virtual-types.ts";

const HEADER_REGEX = /([A-Z]{2,4}\d{3,4})\s*-\s*(.+?)\s*\((\d+h)\)\s*\((\d{4}\.\d)\)/;
const DATE_RANGE_REGEX = /\((\d{2}\/\d{2}\/\d{4})(?:\s*-\s*(\d{2}\/\d{2}\/\d{4}))?\)\s*$/;

export function parseTurmaVirtual(html: string): TurmaVirtual {
  const root = parse(html);
  return {
    header: parseHeader(root, html),
    topics: parseTopics(root),
  };
}

function parseHeader(root: HTMLElement, html: string): TurmaVirtualHeader {
  // The header text appears in a styled bar near the top; match it anywhere.
  const m = html.match(HEADER_REGEX);
  if (m) {
    return { code: m[1], name: (m[2] ?? "").trim(), workload: m[3], period: m[4] };
  }
  // Fallback: first heading-ish element.
  const name = cleanText(root.querySelector("#linkNomeTurma, .nomeTurma")?.text);
  return { name: name || "" };
}

function parseTopics(root: HTMLElement): LessonTopic[] {
  const topics: LessonTopic[] = [];

  for (const block of root.querySelectorAll(".topico-aula")) {
    const tituloEl = block.querySelector(".titulo");
    const rawTitle = cleanText(tituloEl?.text);
    if (!rawTitle) continue;

    let title = rawTitle;
    let startDate: string | undefined;
    let endDate: string | undefined;
    const dm = rawTitle.match(DATE_RANGE_REGEX);
    if (dm) {
      title = rawTitle.slice(0, dm.index).trim();
      startDate = dm[1];
      endDate = dm[2] ?? dm[1];
    }

    const contentEl = block.querySelector(".conteudotopico");
    const materials = contentEl ? parseMaterials(contentEl) : [];
    const content = contentEl ? extractText(contentEl) : undefined;

    topics.push({ title, startDate, endDate, content: content || undefined, materials });
  }

  return topics;
}

function parseMaterials(contentEl: HTMLElement): Material[] {
  const materials: Material[] = [];
  for (const a of contentEl.querySelectorAll("a")) {
    const onclick = a.getAttribute("onclick");
    if (!onclick || !onclick.includes("jsfcljs")) continue;
    const pb = parseJsfLink(onclick);
    const fileId = pb?.params["id"];
    if (!fileId) continue; // only real downloads carry an `id`
    const name = cleanText(a.text);
    if (!name) continue;
    materials.push({
      name,
      fileId,
      formId: pb?.formId,
      componentId: pb ? Object.keys(pb.params).find((k) => k !== "id") : undefined,
    });
  }
  return materials;
}

/** Text of an element with <script>/<style> removed and whitespace collapsed. */
function extractText(el: HTMLElement): string {
  const clone = parse(el.innerHTML);
  for (const s of clone.querySelectorAll("script, style")) s.remove();
  return cleanText(clone.text);
}
