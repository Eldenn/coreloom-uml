import { TOPIC_HEAD_TRAINING } from '#app/skills/constants/skill-topics'

export type LabelledVector = { vector: number[]; topic: string }

/** Probabilities of each tag for one vector, summing to 1. */
export type TopicHead = (vector: number[]) => Record<string, number>

function normalize(vector: Float64Array): Float64Array {
  let norm = 0
  for (const value of vector) norm += value * value
  norm = Math.sqrt(norm) || 1
  return vector.map((value) => value / norm)
}

/**
 * A softmax regression over the tags the rows hold, fitted by full-batch gradient descent with an
 * L2 penalty (`TOPIC_HEAD_TRAINING`). Vectors are centred on the rows' mean and normalized first:
 * embeddings sit in a narrow cone, and centring spreads them. Pure and deterministic: the same
 * rows give the same head. A few seconds for a few hundred rows of 1,024 dimensions.
 */
export function trainTopicHead(rows: LabelledVector[]): TopicHead {
  const topics = [...new Set(rows.map((row) => row.topic))].sort()
  const dim = rows[0]?.vector.length ?? 0
  const mean = new Float64Array(dim)
  for (const row of rows) for (let d = 0; d < dim; d++) mean[d] += row.vector[d] / rows.length
  const prepare = (vector: number[]) => normalize(Float64Array.from(vector, (v, d) => v - mean[d]))

  const inputs = rows.map((row) => prepare(row.vector))
  const targets = rows.map((row) => topics.indexOf(row.topic))
  // One weight row per tag, its bias last.
  const weights = topics.map(() => new Float64Array(dim + 1))
  const { l2, epochs, learningRate } = TOPIC_HEAD_TRAINING

  const probabilities = (x: Float64Array): number[] => {
    const scores = weights.map((w) => {
      let score = w[dim]
      for (let d = 0; d < dim; d++) score += w[d] * x[d]
      return score
    })
    const max = Math.max(...scores)
    const exps = scores.map((score) => Math.exp(score - max))
    const total = exps.reduce((sum, value) => sum + value, 0)
    return exps.map((value) => value / total)
  }

  for (let epoch = 0; epoch < epochs; epoch++) {
    const gradients = topics.map(() => new Float64Array(dim + 1))
    inputs.forEach((x, i) => {
      probabilities(x).forEach((p, k) => {
        const g = p - (k === targets[i] ? 1 : 0)
        const gradient = gradients[k]
        for (let d = 0; d < dim; d++) gradient[d] += g * x[d]
        gradient[dim] += g
      })
    })
    weights.forEach((w, k) => {
      for (let d = 0; d <= dim; d++) {
        const penalty = d < dim ? l2 * w[d] : 0
        w[d] -= learningRate * (gradients[k][d] / inputs.length + penalty)
      }
    })
  }

  return (vector) => {
    const p = probabilities(prepare(vector))
    return Object.fromEntries(topics.map((topic, k) => [topic, p[k]]))
  }
}
