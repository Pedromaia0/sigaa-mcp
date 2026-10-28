/**
 * SIGAA schedule-code logic.
 *
 * Decodes the compact codes SIGAA uses for class times, e.g. `246M12`:
 *   - `246`  -> weekdays (SIGAA numbering: 1=Sun … 2=Mon … 7=Sat)
 *   - `M`    -> shift (M = manhã/morning, T = tarde/afternoon, N = noite/night)
 *   - `12`   -> slot numbers within that shift
 * optionally followed by a date range `(dd/mm/yyyy - dd/mm/yyyy)`.
 *
 * The slot->clock-time table and the decoding/expansion logic are ported from
 * the Campus app (UFRN student app). They are pure, web-facing academic rules
 * with no dependency on any SIGAA API.
 */

export type ClassShift = "M" | "T" | "N";

export interface ClassTime {
  start: string;
  end: string;
}

/** Clock times for each shift+slot at UFRN. */
export const CLASS_TIMES = {
  M1: { start: "07:00", end: "07:50" },
  M2: { start: "07:50", end: "08:40" },
  M3: { start: "08:55", end: "09:45" },
  M4: { start: "09:45", end: "10:35" },
  M5: { start: "10:50", end: "11:40" },
  M6: { start: "11:40", end: "12:30" },
  T1: { start: "13:00", end: "13:50" },
  T2: { start: "13:50", end: "14:40" },
  T3: { start: "14:55", end: "15:45" },
  T4: { start: "15:45", end: "16:35" },
  T5: { start: "16:50", end: "17:40" },
  T6: { start: "17:40", end: "18:30" },
  N1: { start: "18:45", end: "19:35" },
  N2: { start: "19:35", end: "20:25" },
  N3: { start: "20:35", end: "21:25" },
  N4: { start: "21:25", end: "22:15" },
} as const satisfies Record<string, ClassTime>;

export type ClassSlotKey = keyof typeof CLASS_TIMES;

export function getClassTime(shift: string, slot: number): ClassTime | undefined {
  return CLASS_TIMES[`${shift}${slot}` as ClassSlotKey];
}

/** SIGAA weekday number (1=Sun … 7=Sat) -> ISO name (pt-BR). */
export const WEEKDAY_NAMES: Record<number, string> = {
  1: "Domingo",
  2: "Segunda",
  3: "Terça",
  4: "Quarta",
  5: "Quinta",
  6: "Sexta",
  7: "Sábado",
};

export interface DateRange {
  /** `dd/mm/yyyy` as given by SIGAA. */
  start: string;
  endInclusive: string;
}

export interface ScheduleBlock {
  /** SIGAA weekday numbers (1=Sun … 7=Sat). */
  weekdays: number[];
  shift: ClassShift;
  /** Slot numbers within the shift. */
  slots: number[];
  /** First and last slot rendered as clock times, when known. */
  startTime?: string;
  endTime?: string;
  /** Date range if the code carried one. */
  range?: DateRange;
  /** Human label, e.g. "Seg, Qua 08:55–10:35". */
  label: string;
}

/**
 * A calendar block: `246M12`, optionally followed by `(dd/mm/yyyy - dd/mm/yyyy)`.
 *
 * Scanned (not split on ",") because SIGAA separates blocks with commas, with
 * spaces, or not at all, and many turmas omit the date range entirely (`35M34`).
 */
const CALENDAR_BLOCK_REGEX =
  /([2-7]+)([MTN])([1-6]+)(?:\s*\((\d{2}\/\d{2}\/\d{4})\s*-\s*(\d{2}\/\d{2}\/\d{4})\))?/g;

/** Parse a full SIGAA schedule string into one or more blocks. */
export function parseSchedule(code: string): ScheduleBlock[] {
  const blocks: ScheduleBlock[] = [];

  for (const match of code.matchAll(CALENDAR_BLOCK_REGEX)) {
    const [, weekdaysRaw, shiftRaw, slotsRaw, startDate, endDate] = match;
    if (!weekdaysRaw || !shiftRaw || !slotsRaw) continue;

    const weekdays = weekdaysRaw.split("").map(Number);
    const shift = shiftRaw as ClassShift;
    const slots = slotsRaw.split("").map(Number);

    const firstSlot = slots[0];
    const lastSlot = slots[slots.length - 1];
    const startTime = firstSlot !== undefined ? getClassTime(shift, firstSlot)?.start : undefined;
    const endTime = lastSlot !== undefined ? getClassTime(shift, lastSlot)?.end : undefined;

    const days = weekdays.map((d) => WEEKDAY_NAMES[d]?.slice(0, 3) ?? String(d)).join(", ");
    const time = startTime && endTime ? ` ${startTime}–${endTime}` : "";

    blocks.push({
      weekdays,
      shift,
      slots,
      startTime,
      endTime,
      range: startDate && endDate ? { start: startDate, endInclusive: endDate } : undefined,
      label: `${days}${time}`.trim(),
    });
  }

  return blocks;
}

const ROMAN_REGEX = /^(I|II|III|IV|V|VI|VII|VIII|IX|X)$/i;
const ACRONYM_STOPWORDS = new Set([
  "de", "da", "do", "das", "dos",
  "e", "a", "o", "as", "os",
  "no", "na", "nos", "nas",
  "em", "um", "uma", "uns", "umas",
  "para", "por", "com", "à", "ao",
]);

/** Build a short acronym for a subject name, e.g. "Estrutura de Dados" -> "ED". */
export function getClassAcronym(subjectName: string): string {
  if (!subjectName) return "";

  const words = stripAccents(subjectName).trim().toUpperCase().split(/\s+/);
  let romanSuffix = "";
  let effective = words;

  const last = words[words.length - 1];
  if (last && ROMAN_REGEX.test(last)) {
    romanSuffix = "-" + last;
    effective = words.slice(0, -1);
  }

  const acronym = effective
    .filter((w) => !ACRONYM_STOPWORDS.has(w.toLowerCase()))
    .map((w) => w[0] ?? "")
    .join("");

  return acronym + romanSuffix;
}

function stripAccents(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "");
}
