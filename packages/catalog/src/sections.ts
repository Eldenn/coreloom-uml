/**
 * Sections of the rendered AGENTS.md. `Project` and `Project notes` are added by the renderer;
 * the shared ones can be fed by any rule pack; a pack declares its own in `RulePack.sections`.
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

/** Sections any rule pack may feed, besides its own. */
export const SHARED_SECTIONS: readonly string[] = [
  Section.Architecture,
  Section.WorkingStyle,
  Section.Testing,
  Section.Workflow,
  Section.Tooling,
]

/** Sections only the renderer writes: no group and no pack may declare them. */
export const RESERVED_SECTIONS: readonly string[] = [Section.Project, Section.ProjectNotes]

/**
 * The sections these packs give, in render order: `Project`,
 * `Architecture`, `Working style`, the packs' own sections (in pack order, without duplicates),
 * `Testing`, `Workflow`, `Tooling`, then `Project notes`.
 */
export function sectionOrder(packs: readonly { sections: readonly string[] }[]): string[] {
  const own: string[] = []
  for (const pack of packs) {
    for (const section of pack.sections) {
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
 * The sections one of the owner's own rules may go to: every section but `Project notes`, which holds the
 * owner's notes verbatim.
 */
export function ruleSections(packs: readonly { sections: readonly string[] }[]): string[] {
  return sectionOrder(packs).filter((section) => section !== Section.ProjectNotes)
}
