/**
 * Parser for the full class-history page
 * (/sigaa/portais/discente/turmas.jsf — "Ver turmas anteriores").
 *
 * One table whose rows are either a period separator (`2026.2`, spanning all
 * columns) or a class line: `CODE - NAME | turma nº | workload | schedule`.
 * Classes are attributed to the most recent period separator seen above them.
 */

import { parse } from "node-html-parser";
import { cleanText } from "../util/jsf.ts";
import { parseSchedule, getClassAcronym } from "../util/schedule.ts";
import type { HistoricClass } from "./types.ts";

const PERIOD_REGEX = /^\d{4}\.\d$/;
const CODE_NAME_REGEX = /^([A-Z]{2,4}\d{3,4})\s*-\s*(.+)$/;

export function parseTurmas(html: string): HistoricClass[] {
  const root = parse(html);
  const classes: HistoricClass[] = [];
  let currentPeriod = "";

  for (const row of root.querySelectorAll("tr")) {
    const cells = row.querySelectorAll("td");
    if (cells.length === 0) continue;

    // Period separator: a single cell that is just "YYYY.P".
    const firstText = cleanText(cells[0]?.text);
    if (cells.length === 1 && PERIOD_REGEX.test(firstText)) {
      currentPeriod = firstText;
      continue;
    }
    // Some layouts put the period in a full-width colspan cell.
    if (PERIOD_REGEX.test(firstText) && cells.length <= 2) {
      currentPeriod = firstText;
      continue;
    }

    const codeName = firstText.match(CODE_NAME_REGEX);
    if (!codeName) continue;

    const name = codeName[2]?.trim() ?? "";
    const classNumber = cleanText(cells[1]?.text) || undefined;
    const workload = cleanText(cells[2]?.text) || undefined;
    const scheduleCode = cleanText(cells[3]?.querySelector("center")?.text ?? cells[3]?.text) || undefined;

    classes.push({
      period: currentPeriod,
      code: codeName[1],
      name,
      acronym: getClassAcronym(name),
      classNumber: classNumber && /^\d+$/.test(classNumber) ? classNumber : undefined,
      workload: workload && /h$/i.test(workload) ? workload : undefined,
      scheduleCode,
      schedule: scheduleCode ? parseSchedule(scheduleCode) : [],
    });
  }

  return classes;
}
