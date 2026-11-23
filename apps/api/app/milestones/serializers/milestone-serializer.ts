import type Milestone from '#app/milestones/models/milestone'
import type {
  MilestoneDetailOutput,
  MilestoneOutput,
} from '#app/milestones/validators/milestones-output'

export function serializeMilestone(milestone: Milestone): MilestoneOutput {
  return {
    id: milestone.id,
    architectureId: milestone.architectureId,
    name: milestone.name,
    diagramCount: milestone.diagramCount,
    createdAt: milestone.createdAt.toISO() ?? '',
  }
}

export function serializeMilestoneDetail(milestone: Milestone): MilestoneDetailOutput {
  return { ...serializeMilestone(milestone), diagrams: milestone.diagrams }
}
