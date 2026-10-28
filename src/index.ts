export { SigaaSession, SigaaAuthError } from "./auth/session.ts";
export type { SigaaSessionConfig } from "./auth/session.ts";
export { CookieJar } from "./auth/cookie-jar.ts";

export { fetchPortal, fetchAllClasses } from "./portal/portal.ts";
export { parsePortal } from "./portal/parse-portal.ts";
export { parseTurmas } from "./portal/parse-turmas.ts";
export * from "./portal/types.ts";

export {
  parseSchedule,
  getClassTime,
  getClassAcronym,
  CLASS_TIMES,
  WEEKDAY_NAMES,
} from "./util/schedule.ts";
export type { ClassShift, ClassTime, ScheduleBlock, DateRange } from "./util/schedule.ts";
