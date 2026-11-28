import { CONVENTION_EVAL_LIMITS } from '#app/convention-evals/constants/convention-evals'
import ConventionEvalSetting from '#app/convention-evals/models/convention-eval-setting'

/** The one row of `convention_eval_settings`, which only this module reads or writes. */
const SETTING_ID = 1

/**
 * The hard cap of a new run, in US dollars: the admin's, else `CONVENTION_EVAL_LIMITS.capUsd`. A
 * run keeps the cap it started with (`convention_eval_runs.cap_usd`).
 */
export async function evalCapUsd(): Promise<number> {
  const row = await ConventionEvalSetting.find(SETTING_ID)
  return row?.capUsd ?? CONVENTION_EVAL_LIMITS.capUsd
}

/** Stores the cap for the whole instance. The caller has checked its bounds. */
export async function saveEvalCapUsd(capUsd: number): Promise<number> {
  const row = await ConventionEvalSetting.updateOrCreate({ id: SETTING_ID }, { capUsd })
  return row.capUsd
}
