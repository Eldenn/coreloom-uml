/**
 * Sections of the rendered AGENTS.md. `Project` and `Project notes` are added by the renderer;
 * the shared ones can be fed by any questionnaire; a questionnaire declares its own in
 * `Questionnaire.sections`.
 */
export const Section = {
  Project: 'Project',
  /** Rules drawn from the project's diagrams: layers, dependencies, names. */
  Architecture: 'Architecture',
  WorkingStyle: 'Working style',
  Testing: 'Testing',
  Workflow: 'Workflow',
  Tooling: 'Tooling',
  ProjectNotes: 'Project notes',
} as const

export type SharedSection = (typeof Section)[keyof typeof Section]

/** Sections any questionnaire may feed, besides its own. */
export const SHARED_SECTIONS: readonly string[] = [
  Section.Architecture,
  Section.WorkingStyle,
  Section.Testing,
  Section.Workflow,
  Section.Tooling,
]

/** Sections only the renderer writes: no question and no questionnaire may declare them. */
export const RESERVED_SECTIONS: readonly string[] = [Section.Project, Section.ProjectNotes]

/**
 * The sections of a configuration made of these questionnaires, in render order: `Project`,
 * `Architecture`, `Working style`, the questionnaires' own sections (in questionnaire order, without duplicates),
 * `Testing`, `Workflow`, `Tooling`, then `Project notes`.
 */
export function sectionOrder(questionnaires: readonly { sections: readonly string[] }[]): string[] {
  const own: string[] = []
  for (const questionnaire of questionnaires) {
    for (const section of questionnaire.sections) {
      if (!own.includes(section)) own.push(section)
    }
  }
  return [
    Section.Project,
    Section.Architecture,
    Section.WorkingStyle,
    ...own,
    Section.Testing,
    Section.Workflow,
    Section.Tooling,
    Section.ProjectNotes,
  ]
}

/**
 * The sections an accepted rule may go to: every section but `Project notes`, which holds the
 * owner's notes verbatim.
 */
export function ruleSections(questionnaires: readonly { sections: readonly string[] }[]): string[] {
  return sectionOrder(questionnaires).filter((section) => section !== Section.ProjectNotes)
}
