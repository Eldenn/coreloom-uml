import { test } from '@japa/runner'
import { llmKeysProblem } from '#app/llm-connections/services/llm-secrets'

test.group('llmKeysProblem', () => {
  test('production needs its own keys: there is no fallback there', ({ assert }) => {
    assert.match(llmKeysProblem('production', []) ?? '', /LLM_KEYS_ENCRYPTION_KEYS/)
    assert.isNull(llmKeysProblem('production', ['a-key']))
  })

  test('development and test fall back to APP_KEY', ({ assert }) => {
    assert.isNull(llmKeysProblem('development', []))
    assert.isNull(llmKeysProblem('test', []))
  })
})
