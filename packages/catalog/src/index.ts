export { DIAGRAM_KINDS, type DiagramKind } from './diagram-kinds.ts'
export {
  ROLE_SKILLS_MAX,
  ROLE_SUGGESTIONS_MAX,
  type RoleSuggestion,
  suggestRoles,
} from './match-roles.ts'
export {
  COMPATIBLE_SKILLS_MAX,
  CONFLICTING_SKILLS_MAX,
  heldTopics,
  matchSkills,
  type SkillMatchInput,
  type SkillReason,
  type SkillSuggestion,
  type SkillSuggestions,
} from './match-skills.ts'
export {
  MODEL_SUGGESTIONS,
  MODEL_SUGGESTIONS_VERIFIED_ON,
  PROVIDER_KINDS,
  PROVIDER_KINDS_WITH_BASE_URL,
  PROVIDER_KINDS_WITH_SUBSCRIPTION,
  ProviderAuth,
  ProviderKind,
  providerAuth,
} from './models.ts'
export {
  APPLIED_RULES,
  type AppliedSlot,
  acceptedLines,
  acceptedProblem,
  isAppliedRule,
  ruleTitle,
} from './ready-rules.ts'
export {
  DEPENDENCY_CRUISER_FILE,
  type PackageDiagramShape,
  packageFolders,
} from './render/architecture-boundaries.ts'
export {
  CI_WORKFLOW_FILE,
  CONVENTIONAL_SUBJECT_PATTERN,
  EXEMPT_SUBJECT_PREFIXES,
  HOOK_SHEBANG,
  HOOKS_DIRECTORY,
  HOOKS_PATH_COMMAND,
} from './render/gates.ts'
export {
  type BlockMarkers,
  findManagedBlock,
  HASH_MARKERS,
  hashManagedBlock,
  MANAGED_BLOCK_BEGIN,
  MANAGED_BLOCK_END,
  MARKDOWN_MARKERS,
  type ManagedBlockLocation,
  SLASH_MARKERS,
  wrapManagedBlock,
} from './render/managed-block.ts'
export { MARKER_PREFIX } from './render/markdown.ts'
export {
  type AgentContextFile,
  type AgentContextFragment,
  type AgentContextInput,
  type AgentContextOutput,
  type AgentContextProject,
  type AgentContextRole,
  NOTES_INTRO,
  renderAgentContext,
  repositoryChecks,
} from './render/render-agent-context.ts'
export { deniedRights, roleMatrix } from './roles/matrix.ts'
export {
  AGENCY_AGENTS_COMMIT,
  AGENCY_AGENTS_REPOSITORY,
  presetRole,
  READ_ONLY_PRESETS,
  ROLE_PRESETS,
  type RolePreset,
} from './roles/presets/index.ts'
export { PRESET_TOPICS } from './roles/presets/topics.ts'
export {
  RIGHTS,
  Right,
  RightStatus,
  ROLE_DESCRIPTION_MAX_LENGTH,
  ROLE_LINE_MAX_LENGTH,
  ROLE_LIST_MAX,
  ROLE_MISSION_MAX_LENGTH,
  ROLE_NAME_MAX_LENGTH,
  ROLE_SLUG,
  ROLE_SLUG_MAX_LENGTH,
  type Role,
  roleSchema,
} from './roles/role.ts'
export { findRuleGroup, RULE_PACKS } from './rule-packs/index.ts'
export {
  ACCEPTED_AUDIT_RISKS,
  type AcceptedRule,
  AuditRisk,
  acceptedRuleSchema,
  type DiagramAffinity,
  diagramAffinitySchema,
  isSlotAffinity,
  LINE_VALUE_MAX_LENGTH,
  LOCALES,
  type Localized,
  localizedSchema,
  type ReadyRule,
  RULE_VALUE_MAX_LENGTH,
  type RuleGroup,
  type RulePack,
  RulePick,
  readyRuleSchema,
  ruleGroupSchema,
  rulePackSchema,
  type Skill,
  type SkillAffinity,
  SkillOrigin,
  type SkillProvenance,
  type SlotAffinity,
  skillAffinitySchema,
  skillProvenanceSchema,
  skillSchema,
  slotAffinitySchema,
} from './schemas.ts'
export {
  RESERVED_SECTIONS,
  ruleSections,
  Section,
  SHARED_SECTIONS,
  sectionOrder,
} from './sections.ts'
export { SKILL_SEARCH_PLAN, type SkillSearchQuery } from './skill-search-plan.ts'
export {
  SKILL_FOLDERS,
  SKILL_FOLDERS_VERIFIED_ON,
  SKILL_NAME,
  SKILL_TARGET_SOURCES,
  SKILLS,
  SKILLS_MAX,
  SKILLS_VERIFIED_ON,
} from './skills.ts'
export { isSlot, SLOTS, type Slot } from './slots.ts'
export { TARGET_TEMPLATES } from './targets/index.ts'
export {
  type Recommendation,
  type RoleContext,
  type RoleRender,
  type TargetContext,
  type TargetSettings,
  type TargetTemplate,
  TEXT_POINTER,
} from './targets/types.ts'
export { AGENT_FILE_KINDS, AGENTS_FILE, AgentFileKind, TARGETS, Target } from './targets.ts'
export {
  isTopic,
  SLOT_PREFIX_TOPICS,
  SLOT_TOPICS,
  slotTopics,
  TOPICS,
  Topic,
  topicsOfSlots,
} from './topics.ts'
export { CATALOG_VERSION } from './version.ts'
