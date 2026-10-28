/** A downloadable material attached to a lesson topic. */
export interface Material {
  /** File name / label as shown, e.g. "portas_logicas.pdf". */
  name: string;
  /** SIGAA file id (the `id` param of the download postback), if present. */
  fileId?: string;
  /** JSF form + component needed to trigger the download. */
  formId?: string;
  componentId?: string;
}

/** A "Tópico de Aula" (lesson topic) in the virtual classroom. */
export interface LessonTopic {
  /** Topic title without the trailing date range. */
  title: string;
  /** dd/mm/yyyy */
  startDate?: string;
  /** dd/mm/yyyy (same as start for single-day topics) */
  endDate?: string;
  /** Plain-text body (scripts stripped). */
  content?: string;
  materials: Material[];
}

/** Header of the virtual-classroom page. */
export interface TurmaVirtualHeader {
  /** Component code, e.g. "DIM0127". */
  code?: string;
  name: string;
  /** Workload text, e.g. "60h". */
  workload?: string;
  /** e.g. "2026.2" */
  period?: string;
}

/** Parsed virtual-classroom (AVA) main page. */
export interface TurmaVirtual {
  header: TurmaVirtualHeader;
  topics: LessonTopic[];
}
