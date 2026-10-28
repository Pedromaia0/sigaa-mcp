import type { ScheduleBlock } from "../util/schedule.ts";

/** Student identity / institutional data from the portal header panels. */
export interface StudentInfo {
  name?: string;
  center?: string;
  /** e.g. "2026.2" */
  currentSemester?: string;
  /** Matrícula number. */
  registration?: string;
  course?: string;
  status?: string;
  /** Any other labeled "Dados Institucionais" rows, label -> value. */
  extra: Record<string, string>;
}

/** A class the student is enrolled in this semester (from the portal landing). */
export interface EnrolledClass {
  name: string;
  acronym: string;
  location?: string;
  /** Raw SIGAA schedule string, e.g. "24M34 (10/08/2026 - 11/12/2026)". */
  scheduleCode?: string;
  schedule: ScheduleBlock[];
  /** The JSF component id used to open this turma's virtual classroom. */
  openComponentId?: string;
  openFormId?: string;
  /** Stable turma handle used to open the virtual classroom (JSF postback param). */
  frontEndIdTurma?: string;
}

/** An item in the per-class "Últimas Atualizações" feed. */
export interface ClassUpdate {
  /** dd/mm/yyyy */
  date?: string;
  class?: string;
  /** e.g. "Novo Tópico de Aula", "Nova tarefa", "Nova Notícia". */
  kind?: string;
  title: string;
}

/** An upcoming task/exam from "Minhas atividades". */
export interface UpcomingActivity {
  /** Due date/time text as shown, e.g. "30/10/2026 23:59". */
  due?: string;
  /** "(3 dias)" style relative hint. */
  relative?: string;
  class?: string;
  /** "Tarefa" | "Avaliação" | "Atividade" ... */
  kind?: string;
  title: string;
}

/** An institutional news item (the portal's fading news scroller). */
export interface NewsItem {
  /** SIGAA news id, e.g. "73092295" (from the `noticia_<id>` anchor). */
  id?: string;
  title: string;
  /** Teaser text; SIGAA truncates long ones with "...". */
  description?: string;
}

/** A topic row in the course forum panel. */
export interface ForumTopic {
  title: string;
  author?: string;
  replies?: number;
  /** dd/mm/yyyy hh:mm:ss */
  date?: string;
}

/** The parsed discente portal landing page. */
export interface PortalData {
  student: StudentInfo;
  enrolledClasses: EnrolledClass[];
  updates: ClassUpdate[];
  activities: UpcomingActivity[];
  news: NewsItem[];
  forum: ForumTopic[];
  /** Course-forum panel heading, e.g. "FÓRUM DO CURSO DE CIENCIA DA COMPUTACAO". */
  forumTitle?: string;
}

/** A class from the full "turmas" history page, grouped by period. */
export interface HistoricClass {
  /** e.g. "2026.2" */
  period: string;
  /** Component code, e.g. "DIM0127". */
  code?: string;
  name: string;
  acronym: string;
  /** Turma number, e.g. "01". */
  classNumber?: string;
  /** Workload text, e.g. "60h". */
  workload?: string;
  scheduleCode?: string;
  schedule: ScheduleBlock[];
}
