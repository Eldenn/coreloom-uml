// Coreloom UML — the diagram model and its text formats, shared by the web app and the API.
// A diagram is stored as JSON (`UmlSpec`, checked by `validateDiagram`) and can be read from or
// written to Mermaid and PlantUML text. Plain functions with zod as the only dependency: nothing
// here renders or touches the DOM, so it runs the same in the browser and in Node.
import { parseUmlJson, parseUmlValue, toUmlJson, type UmlParseResult, type UmlSpec } from './uml.ts'
import { parseMermaid, toMermaid } from './uml-mermaid.ts'
import { isPlantUml, parsePlantUml, toPlantUml } from './uml-plantuml.ts'

/** The text formats a diagram is read from and written to. */
const DIAGRAM_TEXT_FORMATS = ['json', 'mermaid', 'plantuml'] as const

type DiagramTextFormat = (typeof DIAGRAM_TEXT_FORMATS)[number]

/** Reads a diagram from its text in the given format, with what couldn't be read as problems. */
function parseDiagramText(text: string, format: DiagramTextFormat): UmlParseResult {
  switch (format) {
    case 'json':
      return parseUmlJson(text)
    case 'mermaid':
      return parseMermaid(text)
    case 'plantuml':
      return parsePlantUml(text)
  }
}

/** Writes a diagram as text in the given format. */
function formatDiagramText(diagram: UmlSpec, format: DiagramTextFormat): string {
  switch (format) {
    case 'json':
      return toUmlJson(diagram)
    case 'mermaid':
      return toMermaid(diagram)
    case 'plantuml':
      return toPlantUml(diagram)
  }
}

/**
 * The format a text is written in, when it clearly says: `@startuml`, a JSON object, or a Mermaid
 * header. `null` when it doesn't.
 */
function detectDiagramTextFormat(text: string): DiagramTextFormat | null {
  if (isPlantUml(text)) return 'plantuml'
  if (/^\s*[{[]/.test(text)) return 'json'
  const first = text.trimStart().split(/\s/)[0] ?? ''
  return /^(classDiagram|sequenceDiagram|stateDiagram|erDiagram|flowchart|graph|C4\w+|---)/.test(
    first,
  )
    ? 'mermaid'
    : null
}

/**
 * Checks a value already out of JSON (a request body, a tool call) against the diagram schema:
 * the typed diagram when it matches, otherwise `diagram: null` and one problem per mismatch.
 */
function validateDiagram(value: unknown): UmlParseResult {
  return parseUmlValue(value)
}

export type {
  C4Boundary,
  C4Diagram,
  C4Element,
  C4ElementKind,
  C4Level,
  C4Relation,
  ClassDiagram,
  ClassMember,
  ClassRelation,
  ClassRelationKind,
  ClassVisibility,
  ErAttribute,
  ErCardinality,
  ErDiagram,
  ErEntity,
  ErKey,
  ErRelation,
  SequenceArrow,
  SequenceBlockKind,
  SequenceDiagram,
  SequenceParticipant,
  SequenceStep,
  StateDiagram,
  StateKind,
  StateTransition,
  UmlClass,
  UmlDiagramKind,
  UmlDirection,
  UmlLayout,
  UmlNote,
  UmlParseResult,
  UmlPoint,
  UmlProblem,
  UmlSpec,
  UmlState,
} from './uml.ts'
export { parseUmlJson, parseUmlValue, toUmlJson, umlElementIds } from './uml.ts'
export type {
  ActivityDiagram,
  ActivityFlow,
  ActivityNode,
  ActivityNodeKind,
  ComponentDiagram,
  ComponentElement,
  ComponentElementKind,
  ComponentRelation,
  ComponentRelationKind,
  DeploymentDiagram,
  DeploymentNode,
  DeploymentNodeKind,
  DeploymentRelation,
  DeploymentRelationKind,
  PackageDiagram,
  PackageElement,
  PackageElementKind,
  PackageRelation,
  PackageRelationKind,
  UseCaseDiagram,
  UseCaseElement,
  UseCaseElementKind,
  UseCaseRelation,
  UseCaseRelationKind,
} from './uml-elements.ts'
export { keepLayout, withoutLayout } from './uml-layout-merge.ts'
export { isMermaidSpec, type MermaidSpec, parseMermaid, toMermaid } from './uml-mermaid.ts'
export { isPlantUml, parsePlantUml, toPlantUml } from './uml-plantuml.ts'
export {
  stateToXState,
  XSTATE_PROBLEM_CODES,
  type XStateConfig,
  type XStateExport,
  type XStateNode,
  type XStateProblem,
  type XStateProblemCode,
  type XStateTransition,
  type XStateTransitions,
} from './uml-xstate.ts'
export {
  DIAGRAM_TEXT_FORMATS,
  type DiagramTextFormat,
  detectDiagramTextFormat,
  formatDiagramText,
  parseDiagramText,
  validateDiagram,
}
