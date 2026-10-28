/** A person in the turma (docente or discente), from Participantes. */
export interface Participant {
  role: "docente" | "discente";
  name: string;
  /** Matrícula (discentes). */
  registration?: string;
  /** SIGAA login/usuário. */
  username?: string;
  email?: string;
  /** Course (discentes) or academic background/"Formação" (docentes). */
  course?: string;
  formation?: string;
  /** SIGAA person id, from the "visualizar perfil" link. */
  personId?: string;
}

/** The student's own grades (Ver Notas). The table uses a colspan layout, so
 *  labels and values are exposed directly rather than force-mapped. */
export interface Grades {
  /** Assessment/column labels, e.g. ["E1U1", "E2U1", "AV1", "Nota", …]. */
  columns: string[];
  /** The student's values in column order, e.g. ["1,5", "1,5", "4,0", "7,0"]. */
  values: string[];
  /** Best-effort pairing of columns↔values where counts allow. */
  assessments: { label: string; value: string }[];
  faltas?: number;
  /** Situação, e.g. "--", "APROVADO". */
  situacao?: string;
}

/** One attendance record (Frequência). */
export interface AttendanceRecord {
  /** dd/mm/yyyy */
  date: string;
  /** e.g. "Presente", "Falta". */
  status: string;
}

export interface Attendance {
  totalFaltas?: number;
  records: AttendanceRecord[];
}

/** A task (Tarefas). */
export interface Task {
  title: string;
  /** Delivery period text, e.g. "de 21/10/2026 às 08h50 a 31/…". */
  period?: string;
  hasGrade?: boolean;
  submissions?: number;
}

/** A scheduled assessment (Avaliações). */
export interface Assessment {
  /** dd/mm/yyyy */
  date?: string;
  /** SIGAA time code, e.g. "M34". */
  time?: string;
  description: string;
}

/** A class news item (Notícias within the turma). */
export interface ClassNews {
  title: string;
  /** dd/mm/yyyy */
  date?: string;
}

/** A forum in the turma (Fóruns). */
export interface TurmaForum {
  title: string;
  description?: string;
  /** dd/mm/yyyy hh:mm, when shown. */
  date?: string;
}

/** Everything read from one turma's virtual classroom. */
export interface TurmaFull {
  header: import("./turma-virtual-types.ts").TurmaVirtualHeader;
  topics: import("./turma-virtual-types.ts").LessonTopic[];
  participants: Participant[];
  grades?: Grades;
  attendance?: Attendance;
  tasks: Task[];
  assessments: Assessment[];
  news: ClassNews[];
  forums: TurmaForum[];
  /** Plano de Curso label→value rows (Ementa, Metodologia, Avaliação, …). */
  coursePlan: Record<string, string>;
}
