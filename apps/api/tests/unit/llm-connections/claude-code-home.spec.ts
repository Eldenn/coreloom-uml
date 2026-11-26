import app from '@adonisjs/core/services/app'
import { test } from '@japa/runner'
import llmConfig from '#config/llm'

test.group('Claude code home', () => {
  test("the tests never work in the development server's folder", ({ assert }) => {
    assert.notEqual(llmConfig.claudeCodeHome, app.makePath('tmp/claude'))
    assert.equal(llmConfig.claudeCodeHome, app.makePath('tmp/claude-test'))
  })
})
