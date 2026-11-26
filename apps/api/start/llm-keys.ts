/*
|--------------------------------------------------------------------------
| LLM secrets: the API refuses to start without their keys in production
|--------------------------------------------------------------------------
|
| Every request that saves or uses an LLM secret needs `LLM_KEYS_ENCRYPTION_KEYS`; the API stops
| here rather than failing on the first of them. Loaded for the web server only: a worker that
| never touches an LLM secret runs without the keys (see `config/encryption.ts`).
*/
import { llmKeysProblem } from '#app/llm-connections/services/llm-secrets'
import { llmKeysList } from '#config/encryption'
import env from '#start/env'

const problem = llmKeysProblem(env.get('NODE_ENV'), llmKeysList)
if (problem) throw new Error(problem)
