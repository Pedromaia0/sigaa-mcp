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
  /** SIGAA person id, from the "visualizar perfil" link; pass to fetchParticipantProfile. */
  personId?: string;
  /** Profile-photo URL, when the person has one (absent = default avatar). */
  photoUrl?: string;
}

/** Extra profile fields for a participant (from the "Visualizar Perfil" dialog). */
export interface ParticipantProfile {
  name?: string;
  registration?: string;
  username?: string;
  email?: string;
  course?: string;
  formation?: string;
  description?: string;
  lattes?: string;
  /** Any other labeled rows, label -> value. */
  extra: Record<string, string>;
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
  /** idNoticia; pass to fetchNewsDetail for the full text. */
  id?: string;
}

/** The full text of a class news item (Notícias → Visualizar). */
export interface NewsDetail {
  title: string;
  /** dd/mm/yyyy hh:mm */
  date?: string;
  /** Full body text. */
  text?: string;
}

/** A forum in the turma (Fóruns). */
export interface TurmaForum {
  title: string;
  description?: string;
  /** dd/mm/yyyy hh:mm, when shown. */
  date?: string;
}

/** A bibliographic/web reference (Referências). */
export interface Reference {
  name: string;
  /** e.g. "Livro", "Artigo", "Site". */
  type?: string;
  /** External URL, when the reference is a link. */
  url?: string;
  /** Associated lesson topic, when shown. */
  topic?: string;
}

/** A downloadable handle for a file published in the turma. Pass the `fileId`
 *  to `downloadTurmaFile` to fetch the bytes. */
export interface TurmaFile {
  name: string;
  /** Lesson topic the file belongs to (Arquivos lists this). */
  topic?: string;
  /** File id for the download postback. */
  fileId: string;
}

/** A questionnaire (Questionários). Shape is best-effort; the sampled turmas
 *  had none, so populated parsing is unverified. */
export interface Questionnaire {
  title: string;
  period?: string;
  status?: string;
}

/** A poll (Enquetes). Same caveat as Questionnaire. */
export interface Poll {
  title: string;
  status?: string;
}

/** Bytes of a downloaded file plus its server-provided metadata. */
export interface DownloadedFile {
  filename: string;
  contentType?: string;
  bytes: Uint8Array;
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
  references: Reference[];
  /** Every file published in the turma (Arquivos), with download handles. */
  files: TurmaFile[];
  questionnaires: Questionnaire[];
  polls: Poll[];
  /** Plano de Curso label→value rows (Ementa, Metodologia, Avaliação, …). */
  coursePlan: Record<string, string>;
}
