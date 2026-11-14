/* eslint-disable prettier/prettier */
/// <reference path="../manifest.d.ts" />

import type { ExtractBody, ExtractErrorResponse, ExtractQuery, ExtractQueryForGet, ExtractResponse } from '@tuyau/core/types'
import type { InferInput, SimpleError } from '@vinejs/vine/types'

export type ParamValue = string | number | bigint | boolean

export interface Registry {
  'health': {
    methods: ["GET","HEAD"]
    pattern: '/health'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#app/health/controllers/health-controller').default['handle']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#app/health/controllers/health-controller').default['handle']>>>
    }
  }
  'auth.register': {
    methods: ["POST"]
    pattern: '/auth/register'
    types: {
      body: ExtractBody<InferInput<(typeof import('#app/auth/validators/auth-input').registerInput)>>
      paramsTuple: []
      params: {}
      query: ExtractQuery<InferInput<(typeof import('#app/auth/validators/auth-input').registerInput)>>
      response: ExtractResponse<Awaited<ReturnType<import('#app/auth/controllers/register-controller').default['handle']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#app/auth/controllers/register-controller').default['handle']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'auth.options': {
    methods: ["GET","HEAD"]
    pattern: '/auth/options'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#app/auth/controllers/auth-options-controller').default['handle']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#app/auth/controllers/auth-options-controller').default['handle']>>>
    }
  }
  'auth.login': {
    methods: ["POST"]
    pattern: '/auth/login'
    types: {
      body: ExtractBody<InferInput<(typeof import('#app/auth/validators/auth-input').loginInput)>>
      paramsTuple: []
      params: {}
      query: ExtractQuery<InferInput<(typeof import('#app/auth/validators/auth-input').loginInput)>>
      response: ExtractResponse<Awaited<ReturnType<import('#app/auth/controllers/login-controller').default['handle']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#app/auth/controllers/login-controller').default['handle']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'auth.logout': {
    methods: ["POST"]
    pattern: '/auth/logout'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#app/auth/controllers/logout-controller').default['handle']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#app/auth/controllers/logout-controller').default['handle']>>>
    }
  }
  'auth.me': {
    methods: ["GET","HEAD"]
    pattern: '/auth/me'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#app/auth/controllers/me-controller').default['handle']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#app/auth/controllers/me-controller').default['handle']>>>
    }
  }
  'auth.forgot_password': {
    methods: ["POST"]
    pattern: '/auth/forgot-password'
    types: {
      body: ExtractBody<InferInput<(typeof import('#app/auth/validators/auth-input').forgotPasswordInput)>>
      paramsTuple: []
      params: {}
      query: ExtractQuery<InferInput<(typeof import('#app/auth/validators/auth-input').forgotPasswordInput)>>
      response: ExtractResponse<Awaited<ReturnType<import('#app/auth/controllers/forgot-password-controller').default['handle']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#app/auth/controllers/forgot-password-controller').default['handle']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'auth.reset_password': {
    methods: ["POST"]
    pattern: '/auth/reset-password'
    types: {
      body: ExtractBody<InferInput<(typeof import('#app/auth/validators/auth-input').resetPasswordInput)>>
      paramsTuple: []
      params: {}
      query: ExtractQuery<InferInput<(typeof import('#app/auth/validators/auth-input').resetPasswordInput)>>
      response: ExtractResponse<Awaited<ReturnType<import('#app/auth/controllers/reset-password-controller').default['handle']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#app/auth/controllers/reset-password-controller').default['handle']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'auth.verify_email': {
    methods: ["GET","HEAD"]
    pattern: '/auth/verify-email'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: ExtractQueryForGet<InferInput<(typeof import('#app/auth/validators/auth-input').verifyEmailInput)>>
      response: ExtractResponse<Awaited<ReturnType<import('#app/auth/controllers/verify-email-controller').default['handle']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#app/auth/controllers/verify-email-controller').default['handle']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'auth.resend_verification': {
    methods: ["POST"]
    pattern: '/auth/resend-verification'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#app/auth/controllers/resend-verification-controller').default['handle']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#app/auth/controllers/resend-verification-controller').default['handle']>>>
    }
  }
  'users.show': {
    methods: ["GET","HEAD"]
    pattern: '/users/:id'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#app/users/controllers/users-controller').default['show']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#app/users/controllers/users-controller').default['show']>>>
    }
  }
  'projects.index': {
    methods: ["GET","HEAD"]
    pattern: '/projects'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: ExtractQueryForGet<InferInput<(typeof import('#app/projects/validators/projects-input').listProjectsInput)>>
      response: ExtractResponse<Awaited<ReturnType<import('#app/projects/controllers/projects-controller').default['index']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#app/projects/controllers/projects-controller').default['index']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'projects.store': {
    methods: ["POST"]
    pattern: '/projects'
    types: {
      body: ExtractBody<InferInput<(typeof import('#app/projects/validators/projects-input').createProjectInput)>>
      paramsTuple: []
      params: {}
      query: ExtractQuery<InferInput<(typeof import('#app/projects/validators/projects-input').createProjectInput)>>
      response: ExtractResponse<Awaited<ReturnType<import('#app/projects/controllers/projects-controller').default['store']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#app/projects/controllers/projects-controller').default['store']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'projects.show': {
    methods: ["GET","HEAD"]
    pattern: '/projects/:id'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#app/projects/controllers/projects-controller').default['show']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#app/projects/controllers/projects-controller').default['show']>>>
    }
  }
  'projects.update': {
    methods: ["PATCH"]
    pattern: '/projects/:id'
    types: {
      body: ExtractBody<InferInput<(typeof import('#app/projects/validators/projects-input').updateProjectInput)>>
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: ExtractQuery<InferInput<(typeof import('#app/projects/validators/projects-input').updateProjectInput)>>
      response: ExtractResponse<Awaited<ReturnType<import('#app/projects/controllers/projects-controller').default['update']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#app/projects/controllers/projects-controller').default['update']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'projects.destroy': {
    methods: ["DELETE"]
    pattern: '/projects/:id'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#app/projects/controllers/projects-controller').default['destroy']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#app/projects/controllers/projects-controller').default['destroy']>>>
    }
  }
  'projects.agent_config.generations.latest': {
    methods: ["GET","HEAD"]
    pattern: '/projects/:id/agent-config/generations/latest'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#app/agent-configs/controllers/agent-config-generations-controller').default['latestOfProject']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#app/agent-configs/controllers/agent-config-generations-controller').default['latestOfProject']>>>
    }
  }
  'projects.code_maps.index': {
    methods: ["GET","HEAD"]
    pattern: '/projects/:id/code-maps'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: ExtractQueryForGet<InferInput<(typeof import('#app/code-maps/validators/code-maps-input').listCodeMapsInput)>>
      response: ExtractResponse<Awaited<ReturnType<import('#app/code-maps/controllers/code-maps-controller').default['index']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#app/code-maps/controllers/code-maps-controller').default['index']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'projects.code_maps.store': {
    methods: ["POST"]
    pattern: '/projects/:id/code-maps'
    types: {
      body: ExtractBody<InferInput<(typeof import('#app/code-maps/validators/code-maps-input').createCodeMapInput)>>
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: ExtractQuery<InferInput<(typeof import('#app/code-maps/validators/code-maps-input').createCodeMapInput)>>
      response: ExtractResponse<Awaited<ReturnType<import('#app/code-maps/controllers/code-maps-controller').default['store']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#app/code-maps/controllers/code-maps-controller').default['store']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'code_maps.show': {
    methods: ["GET","HEAD"]
    pattern: '/code-maps/:id'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#app/code-maps/controllers/code-maps-controller').default['show']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#app/code-maps/controllers/code-maps-controller').default['show']>>>
    }
  }
  'code_maps.destroy': {
    methods: ["DELETE"]
    pattern: '/code-maps/:id'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#app/code-maps/controllers/code-maps-controller').default['destroy']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#app/code-maps/controllers/code-maps-controller').default['destroy']>>>
    }
  }
  'code_maps.links.show': {
    methods: ["GET","HEAD"]
    pattern: '/code-maps/:id/links'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: ExtractQueryForGet<InferInput<(typeof import('#app/code-maps/validators/code-maps-input').showCodeMapLinksInput)>>
      response: ExtractResponse<Awaited<ReturnType<import('#app/code-maps/controllers/code-map-links-controller').default['show']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#app/code-maps/controllers/code-map-links-controller').default['show']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'code_maps.links.update': {
    methods: ["PUT"]
    pattern: '/code-maps/:id/links'
    types: {
      body: ExtractBody<InferInput<(typeof import('#app/code-maps/validators/code-maps-input').updateCodeMapLinksInput)>>
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: ExtractQuery<InferInput<(typeof import('#app/code-maps/validators/code-maps-input').updateCodeMapLinksInput)>>
      response: ExtractResponse<Awaited<ReturnType<import('#app/code-maps/controllers/code-map-links-controller').default['update']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#app/code-maps/controllers/code-map-links-controller').default['update']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'agent_configs.index': {
    methods: ["GET","HEAD"]
    pattern: '/agent-configs'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: ExtractQueryForGet<InferInput<(typeof import('#app/agent-configs/validators/agent-configs-input').listAgentConfigsInput)>>
      response: ExtractResponse<Awaited<ReturnType<import('#app/agent-configs/controllers/agent-config-controller').default['index']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#app/agent-configs/controllers/agent-config-controller').default['index']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'agent_configs.store': {
    methods: ["POST"]
    pattern: '/agent-configs'
    types: {
      body: ExtractBody<InferInput<(typeof import('#app/agent-configs/validators/agent-configs-input').createAgentConfigInput)>>
      paramsTuple: []
      params: {}
      query: ExtractQuery<InferInput<(typeof import('#app/agent-configs/validators/agent-configs-input').createAgentConfigInput)>>
      response: ExtractResponse<Awaited<ReturnType<import('#app/agent-configs/controllers/agent-config-controller').default['store']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#app/agent-configs/controllers/agent-config-controller').default['store']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'agent_configs.show': {
    methods: ["GET","HEAD"]
    pattern: '/agent-configs/:id'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#app/agent-configs/controllers/agent-config-controller').default['show']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#app/agent-configs/controllers/agent-config-controller').default['show']>>>
    }
  }
  'agent_configs.update': {
    methods: ["PATCH"]
    pattern: '/agent-configs/:id'
    types: {
      body: ExtractBody<InferInput<(typeof import('#app/agent-configs/validators/agent-configs-input').updateAgentConfigInput)>>
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: ExtractQuery<InferInput<(typeof import('#app/agent-configs/validators/agent-configs-input').updateAgentConfigInput)>>
      response: ExtractResponse<Awaited<ReturnType<import('#app/agent-configs/controllers/agent-config-controller').default['update']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#app/agent-configs/controllers/agent-config-controller').default['update']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'agent_configs.destroy': {
    methods: ["DELETE"]
    pattern: '/agent-configs/:id'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#app/agent-configs/controllers/agent-config-controller').default['destroy']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#app/agent-configs/controllers/agent-config-controller').default['destroy']>>>
    }
  }
  'agent_configs.answers.update': {
    methods: ["PUT"]
    pattern: '/agent-configs/:id/answers'
    types: {
      body: ExtractBody<InferInput<(typeof import('#app/agent-configs/validators/agent-configs-input').updateAgentAnswersInput)>>
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: ExtractQuery<InferInput<(typeof import('#app/agent-configs/validators/agent-configs-input').updateAgentAnswersInput)>>
      response: ExtractResponse<Awaited<ReturnType<import('#app/agent-configs/controllers/agent-config-answers-controller').default['update']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#app/agent-configs/controllers/agent-config-answers-controller').default['update']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'agent_configs.rules.store': {
    methods: ["POST"]
    pattern: '/agent-configs/:id/rules'
    types: {
      body: ExtractBody<InferInput<(typeof import('#app/agent-configs/validators/agent-configs-input').createAgentRuleInput)>>
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: ExtractQuery<InferInput<(typeof import('#app/agent-configs/validators/agent-configs-input').createAgentRuleInput)>>
      response: ExtractResponse<Awaited<ReturnType<import('#app/agent-configs/controllers/agent-config-rules-controller').default['store']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#app/agent-configs/controllers/agent-config-rules-controller').default['store']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'agent_configs.rules.update': {
    methods: ["PATCH"]
    pattern: '/agent-configs/:id/rules/:ruleId'
    types: {
      body: ExtractBody<InferInput<(typeof import('#app/agent-configs/validators/agent-configs-input').updateAgentRuleInput)>>
      paramsTuple: [ParamValue, ParamValue]
      params: { id: ParamValue; ruleId: ParamValue }
      query: ExtractQuery<InferInput<(typeof import('#app/agent-configs/validators/agent-configs-input').updateAgentRuleInput)>>
      response: ExtractResponse<Awaited<ReturnType<import('#app/agent-configs/controllers/agent-config-rules-controller').default['update']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#app/agent-configs/controllers/agent-config-rules-controller').default['update']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'agent_configs.rules.destroy': {
    methods: ["DELETE"]
    pattern: '/agent-configs/:id/rules/:ruleId'
    types: {
      body: {}
      paramsTuple: [ParamValue, ParamValue]
      params: { id: ParamValue; ruleId: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#app/agent-configs/controllers/agent-config-rules-controller').default['destroy']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#app/agent-configs/controllers/agent-config-rules-controller').default['destroy']>>>
    }
  }
  'agent_configs.generations.store': {
    methods: ["POST"]
    pattern: '/agent-configs/:id/generations'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#app/agent-configs/controllers/agent-config-generations-controller').default['store']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#app/agent-configs/controllers/agent-config-generations-controller').default['store']>>>
    }
  }
  'agent_configs.generations.index': {
    methods: ["GET","HEAD"]
    pattern: '/agent-configs/:id/generations'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: ExtractQueryForGet<InferInput<(typeof import('#app/agent-configs/validators/agent-configs-input').listAgentGenerationsInput)>>
      response: ExtractResponse<Awaited<ReturnType<import('#app/agent-configs/controllers/agent-config-generations-controller').default['index']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#app/agent-configs/controllers/agent-config-generations-controller').default['index']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'agent_configs.generations.latest': {
    methods: ["GET","HEAD"]
    pattern: '/agent-configs/:id/generations/latest'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#app/agent-configs/controllers/agent-config-generations-controller').default['latest']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#app/agent-configs/controllers/agent-config-generations-controller').default['latest']>>>
    }
  }
  'agent_configs.generations.show': {
    methods: ["GET","HEAD"]
    pattern: '/agent-configs/:id/generations/:generationId'
    types: {
      body: {}
      paramsTuple: [ParamValue, ParamValue]
      params: { id: ParamValue; generationId: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#app/agent-configs/controllers/agent-config-generations-controller').default['show']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#app/agent-configs/controllers/agent-config-generations-controller').default['show']>>>
    }
  }
  'agent_configs.proposals.store': {
    methods: ["POST"]
    pattern: '/agent-configs/:id/proposals'
    types: {
      body: ExtractBody<InferInput<(typeof import('#app/agent-configs/validators/agent-configs-input').agentProposalsInput)>>
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: ExtractQuery<InferInput<(typeof import('#app/agent-configs/validators/agent-configs-input').agentProposalsInput)>>
      response: ExtractResponse<Awaited<ReturnType<import('#app/agent-configs/controllers/agent-config-proposals-controller').default['store']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#app/agent-configs/controllers/agent-config-proposals-controller').default['store']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'agent_configs.imports.store': {
    methods: ["POST"]
    pattern: '/agent-configs/:id/imports'
    types: {
      body: ExtractBody<InferInput<(typeof import('#app/agent-configs/validators/agent-configs-input').agentImportInput)>>
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: ExtractQuery<InferInput<(typeof import('#app/agent-configs/validators/agent-configs-input').agentImportInput)>>
      response: ExtractResponse<Awaited<ReturnType<import('#app/agent-configs/controllers/agent-config-imports-controller').default['store']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#app/agent-configs/controllers/agent-config-imports-controller').default['store']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'llm.providers': {
    methods: ["GET","HEAD"]
    pattern: '/llm/providers'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#app/llm/controllers/llm-providers-controller').default['index']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#app/llm/controllers/llm-providers-controller').default['index']>>>
    }
  }
  'llm.test': {
    methods: ["POST"]
    pattern: '/llm/test'
    types: {
      body: ExtractBody<InferInput<(typeof import('#app/llm/validators/llm-input').llmCallInput)>>
      paramsTuple: []
      params: {}
      query: ExtractQuery<InferInput<(typeof import('#app/llm/validators/llm-input').llmCallInput)>>
      response: ExtractResponse<Awaited<ReturnType<import('#app/llm/controllers/llm-test-controller').default['handle']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#app/llm/controllers/llm-test-controller').default['handle']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'llm.connections.openai_codex.attempts.store': {
    methods: ["POST"]
    pattern: '/llm/connections/openai-codex/attempts'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#app/llm-connections/controllers/codex-connection-controller').default['store']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#app/llm-connections/controllers/codex-connection-controller').default['store']>>>
    }
  }
  'llm.connections.openai_codex.attempts.show': {
    methods: ["GET","HEAD"]
    pattern: '/llm/connections/openai-codex/attempts/:attemptId'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { attemptId: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#app/llm-connections/controllers/codex-connection-controller').default['show']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#app/llm-connections/controllers/codex-connection-controller').default['show']>>>
    }
  }
  'llm.connections.openai_codex.destroy': {
    methods: ["DELETE"]
    pattern: '/llm/connections/openai-codex'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#app/llm-connections/controllers/codex-connection-controller').default['destroy']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#app/llm-connections/controllers/codex-connection-controller').default['destroy']>>>
    }
  }
  'llm.connections.claude_code.login.store': {
    methods: ["POST"]
    pattern: '/llm/connections/claude-code/login'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#app/llm-connections/controllers/claude-code-connection-controller').default['store']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#app/llm-connections/controllers/claude-code-connection-controller').default['store']>>>
    }
  }
  'llm.connections.claude_code.login.code': {
    methods: ["POST"]
    pattern: '/llm/connections/claude-code/login/code'
    types: {
      body: ExtractBody<InferInput<(typeof import('#app/llm-connections/validators/llm-connections-input').claudeCodeInput)>>
      paramsTuple: []
      params: {}
      query: ExtractQuery<InferInput<(typeof import('#app/llm-connections/validators/llm-connections-input').claudeCodeInput)>>
      response: ExtractResponse<Awaited<ReturnType<import('#app/llm-connections/controllers/claude-code-connection-controller').default['code']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#app/llm-connections/controllers/claude-code-connection-controller').default['code']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'llm.connections.claude_code.destroy': {
    methods: ["DELETE"]
    pattern: '/llm/connections/claude-code'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#app/llm-connections/controllers/claude-code-connection-controller').default['destroy']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#app/llm-connections/controllers/claude-code-connection-controller').default['destroy']>>>
    }
  }
  'questionnaires.index': {
    methods: ["GET","HEAD"]
    pattern: '/questionnaires'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#app/agent-configs/controllers/questionnaires-controller').default['index']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#app/agent-configs/controllers/questionnaires-controller').default['index']>>>
    }
  }
  'questionnaires.show': {
    methods: ["GET","HEAD"]
    pattern: '/questionnaires/:questionnaireId'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { questionnaireId: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#app/agent-configs/controllers/questionnaires-controller').default['show']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#app/agent-configs/controllers/questionnaires-controller').default['show']>>>
    }
  }
  'skills.index': {
    methods: ["GET","HEAD"]
    pattern: '/skills'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: ExtractQueryForGet<InferInput<(typeof import('#app/skills/validators/skills-input').listSkillsInput)>>
      response: ExtractResponse<Awaited<ReturnType<import('#app/skills/controllers/skills-controller').default['index']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#app/skills/controllers/skills-controller').default['index']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'skills.stats': {
    methods: ["GET","HEAD"]
    pattern: '/skills/stats'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#app/skills/controllers/skills-controller').default['stats']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#app/skills/controllers/skills-controller').default['stats']>>>
    }
  }
  'skills.events': {
    methods: ["GET","HEAD"]
    pattern: '/skills/events'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#app/skills/controllers/skills-events-controller').default['handle']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#app/skills/controllers/skills-events-controller').default['handle']>>>
    }
  }
  'skills.show': {
    methods: ["GET","HEAD"]
    pattern: '/skills/:slug'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { slug: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#app/skills/controllers/skills-controller').default['show']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#app/skills/controllers/skills-controller').default['show']>>>
    }
  }
  'architectures.index': {
    methods: ["GET","HEAD"]
    pattern: '/architectures'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: ExtractQueryForGet<InferInput<(typeof import('#app/architectures/validators/architectures-input').listArchitecturesInput)>>
      response: ExtractResponse<Awaited<ReturnType<import('#app/architectures/controllers/architectures-controller').default['index']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#app/architectures/controllers/architectures-controller').default['index']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'architectures.store': {
    methods: ["POST"]
    pattern: '/architectures'
    types: {
      body: ExtractBody<InferInput<(typeof import('#app/architectures/validators/architectures-input').createArchitectureInput)>>
      paramsTuple: []
      params: {}
      query: ExtractQuery<InferInput<(typeof import('#app/architectures/validators/architectures-input').createArchitectureInput)>>
      response: ExtractResponse<Awaited<ReturnType<import('#app/architectures/controllers/architectures-controller').default['store']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#app/architectures/controllers/architectures-controller').default['store']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'architectures.show': {
    methods: ["GET","HEAD"]
    pattern: '/architectures/:id'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#app/architectures/controllers/architectures-controller').default['show']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#app/architectures/controllers/architectures-controller').default['show']>>>
    }
  }
  'architectures.update': {
    methods: ["PATCH"]
    pattern: '/architectures/:id'
    types: {
      body: ExtractBody<InferInput<(typeof import('#app/architectures/validators/architectures-input').updateArchitectureInput)>>
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: ExtractQuery<InferInput<(typeof import('#app/architectures/validators/architectures-input').updateArchitectureInput)>>
      response: ExtractResponse<Awaited<ReturnType<import('#app/architectures/controllers/architectures-controller').default['update']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#app/architectures/controllers/architectures-controller').default['update']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'architectures.destroy': {
    methods: ["DELETE"]
    pattern: '/architectures/:id'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#app/architectures/controllers/architectures-controller').default['destroy']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#app/architectures/controllers/architectures-controller').default['destroy']>>>
    }
  }
  'architectures.duplicate': {
    methods: ["POST"]
    pattern: '/architectures/:id/duplicate'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#app/architectures/controllers/duplicate-architecture-controller').default['handle']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#app/architectures/controllers/duplicate-architecture-controller').default['handle']>>>
    }
  }
  'architectures.diagrams.store': {
    methods: ["POST"]
    pattern: '/architectures/:id/diagrams'
    types: {
      body: ExtractBody<InferInput<(typeof import('#app/diagrams/validators/diagrams-input').createDiagramInput)>>
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: ExtractQuery<InferInput<(typeof import('#app/diagrams/validators/diagrams-input').createDiagramInput)>>
      response: ExtractResponse<Awaited<ReturnType<import('#app/diagrams/controllers/diagrams-controller').default['store']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#app/diagrams/controllers/diagrams-controller').default['store']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'architectures.diagrams.reorder': {
    methods: ["PUT"]
    pattern: '/architectures/:id/diagrams/order'
    types: {
      body: ExtractBody<InferInput<(typeof import('#app/diagrams/validators/diagrams-input').reorderDiagramsInput)>>
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: ExtractQuery<InferInput<(typeof import('#app/diagrams/validators/diagrams-input').reorderDiagramsInput)>>
      response: ExtractResponse<Awaited<ReturnType<import('#app/diagrams/controllers/reorder-diagrams-controller').default['handle']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#app/diagrams/controllers/reorder-diagrams-controller').default['handle']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'architectures.diagrams.update': {
    methods: ["PATCH"]
    pattern: '/architectures/:id/diagrams/:diagramId'
    types: {
      body: ExtractBody<InferInput<(typeof import('#app/diagrams/validators/diagrams-input').updateDiagramInput)>>
      paramsTuple: [ParamValue, ParamValue]
      params: { id: ParamValue; diagramId: ParamValue }
      query: ExtractQuery<InferInput<(typeof import('#app/diagrams/validators/diagrams-input').updateDiagramInput)>>
      response: ExtractResponse<Awaited<ReturnType<import('#app/diagrams/controllers/diagrams-controller').default['update']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#app/diagrams/controllers/diagrams-controller').default['update']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'architectures.diagrams.destroy': {
    methods: ["DELETE"]
    pattern: '/architectures/:id/diagrams/:diagramId'
    types: {
      body: {}
      paramsTuple: [ParamValue, ParamValue]
      params: { id: ParamValue; diagramId: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#app/diagrams/controllers/diagrams-controller').default['destroy']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#app/diagrams/controllers/diagrams-controller').default['destroy']>>>
    }
  }
  'architectures.diagrams.source_show': {
    methods: ["GET","HEAD"]
    pattern: '/architectures/:id/diagrams/:diagramId/source'
    types: {
      body: {}
      paramsTuple: [ParamValue, ParamValue]
      params: { id: ParamValue; diagramId: ParamValue }
      query: ExtractQueryForGet<InferInput<(typeof import('#app/diagrams/validators/diagrams-input').showDiagramSourceInput)>>
      response: ExtractResponse<Awaited<ReturnType<import('#app/diagrams/controllers/diagram-source-controller').default['show']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#app/diagrams/controllers/diagram-source-controller').default['show']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'architectures.diagrams.source_update': {
    methods: ["PUT"]
    pattern: '/architectures/:id/diagrams/:diagramId/source'
    types: {
      body: ExtractBody<InferInput<(typeof import('#app/diagrams/validators/diagrams-input').updateDiagramSourceInput)>>
      paramsTuple: [ParamValue, ParamValue]
      params: { id: ParamValue; diagramId: ParamValue }
      query: ExtractQuery<InferInput<(typeof import('#app/diagrams/validators/diagrams-input').updateDiagramSourceInput)>>
      response: ExtractResponse<Awaited<ReturnType<import('#app/diagrams/controllers/diagram-source-controller').default['update']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#app/diagrams/controllers/diagram-source-controller').default['update']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'architectures.sharing.show': {
    methods: ["GET","HEAD"]
    pattern: '/architectures/:id/sharing'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#app/sharing/controllers/sharing-controller').default['show']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#app/sharing/controllers/sharing-controller').default['show']>>>
    }
  }
  'architectures.sharing.update': {
    methods: ["PUT"]
    pattern: '/architectures/:id/sharing'
    types: {
      body: ExtractBody<InferInput<(typeof import('#app/sharing/validators/sharing-input').updateSharingInput)>>
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: ExtractQuery<InferInput<(typeof import('#app/sharing/validators/sharing-input').updateSharingInput)>>
      response: ExtractResponse<Awaited<ReturnType<import('#app/sharing/controllers/sharing-controller').default['update']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#app/sharing/controllers/sharing-controller').default['update']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'architectures.sharing.regenerate_link': {
    methods: ["POST"]
    pattern: '/architectures/:id/sharing/regenerate-link'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#app/sharing/controllers/sharing-controller').default['regenerateLink']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#app/sharing/controllers/sharing-controller').default['regenerateLink']>>>
    }
  }
  'architectures.sharing.regenerate_code': {
    methods: ["POST"]
    pattern: '/architectures/:id/sharing/regenerate-code'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#app/sharing/controllers/sharing-controller').default['regenerateCode']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#app/sharing/controllers/sharing-controller').default['regenerateCode']>>>
    }
  }
  'mcp': {
    methods: ["GET","POST","DELETE"]
    pattern: '/mcp'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#app/mcp/controllers/mcp-controller').default['handle']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#app/mcp/controllers/mcp-controller').default['handle']>>>
    }
  }
  'architectures.assistant.conversations.index': {
    methods: ["GET","HEAD"]
    pattern: '/architectures/:id/assistant/conversations'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: ExtractQueryForGet<InferInput<(typeof import('#app/assistant/validators/assistant-input').listConversationsInput)>>
      response: ExtractResponse<Awaited<ReturnType<import('#app/assistant/controllers/assistant-conversations-controller').default['index']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#app/assistant/controllers/assistant-conversations-controller').default['index']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'architectures.assistant.conversations.store': {
    methods: ["POST"]
    pattern: '/architectures/:id/assistant/conversations'
    types: {
      body: ExtractBody<InferInput<(typeof import('#app/assistant/validators/assistant-input').createConversationInput)>>
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: ExtractQuery<InferInput<(typeof import('#app/assistant/validators/assistant-input').createConversationInput)>>
      response: ExtractResponse<Awaited<ReturnType<import('#app/assistant/controllers/assistant-conversations-controller').default['store']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#app/assistant/controllers/assistant-conversations-controller').default['store']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'architectures.assistant.conversations.show': {
    methods: ["GET","HEAD"]
    pattern: '/architectures/:id/assistant/conversations/:conversationId'
    types: {
      body: {}
      paramsTuple: [ParamValue, ParamValue]
      params: { id: ParamValue; conversationId: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#app/assistant/controllers/assistant-conversations-controller').default['show']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#app/assistant/controllers/assistant-conversations-controller').default['show']>>>
    }
  }
  'architectures.assistant.conversations.update': {
    methods: ["PATCH"]
    pattern: '/architectures/:id/assistant/conversations/:conversationId'
    types: {
      body: ExtractBody<InferInput<(typeof import('#app/assistant/validators/assistant-input').renameConversationInput)>>
      paramsTuple: [ParamValue, ParamValue]
      params: { id: ParamValue; conversationId: ParamValue }
      query: ExtractQuery<InferInput<(typeof import('#app/assistant/validators/assistant-input').renameConversationInput)>>
      response: ExtractResponse<Awaited<ReturnType<import('#app/assistant/controllers/assistant-conversations-controller').default['update']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#app/assistant/controllers/assistant-conversations-controller').default['update']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'architectures.assistant.conversations.destroy': {
    methods: ["DELETE"]
    pattern: '/architectures/:id/assistant/conversations/:conversationId'
    types: {
      body: {}
      paramsTuple: [ParamValue, ParamValue]
      params: { id: ParamValue; conversationId: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#app/assistant/controllers/assistant-conversations-controller').default['destroy']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#app/assistant/controllers/assistant-conversations-controller').default['destroy']>>>
    }
  }
  'architectures.assistant.conversations.continue': {
    methods: ["POST"]
    pattern: '/architectures/:id/assistant/conversations/:conversationId/continue'
    types: {
      body: ExtractBody<InferInput<(typeof import('#app/assistant/validators/assistant-input').continueConversationInput)>>
      paramsTuple: [ParamValue, ParamValue]
      params: { id: ParamValue; conversationId: ParamValue }
      query: ExtractQuery<InferInput<(typeof import('#app/assistant/validators/assistant-input').continueConversationInput)>>
      response: ExtractResponse<Awaited<ReturnType<import('#app/assistant/controllers/assistant-conversations-controller').default['continue']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#app/assistant/controllers/assistant-conversations-controller').default['continue']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'architectures.assistant.messages.store': {
    methods: ["POST"]
    pattern: '/architectures/:id/assistant/conversations/:conversationId/messages'
    types: {
      body: ExtractBody<InferInput<(typeof import('#app/assistant/validators/assistant-input').askAssistantInput)>>
      paramsTuple: [ParamValue, ParamValue]
      params: { id: ParamValue; conversationId: ParamValue }
      query: ExtractQuery<InferInput<(typeof import('#app/assistant/validators/assistant-input').askAssistantInput)>>
      response: ExtractResponse<Awaited<ReturnType<import('#app/assistant/controllers/assistant-messages-controller').default['store']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#app/assistant/controllers/assistant-messages-controller').default['store']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'architectures.assistant.context': {
    methods: ["POST"]
    pattern: '/architectures/:id/assistant/conversations/:conversationId/context'
    types: {
      body: ExtractBody<InferInput<(typeof import('#app/assistant/validators/assistant-input').assistantContextInput)>>
      paramsTuple: [ParamValue, ParamValue]
      params: { id: ParamValue; conversationId: ParamValue }
      query: ExtractQuery<InferInput<(typeof import('#app/assistant/validators/assistant-input').assistantContextInput)>>
      response: ExtractResponse<Awaited<ReturnType<import('#app/assistant/controllers/assistant-messages-controller').default['context']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#app/assistant/controllers/assistant-messages-controller').default['context']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'architectures.assistant.messages.destroy': {
    methods: ["DELETE"]
    pattern: '/architectures/:id/assistant/conversations/:conversationId/messages/:messageId'
    types: {
      body: {}
      paramsTuple: [ParamValue, ParamValue, ParamValue]
      params: { id: ParamValue; conversationId: ParamValue; messageId: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#app/assistant/controllers/assistant-messages-controller').default['destroy']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#app/assistant/controllers/assistant-messages-controller').default['destroy']>>>
    }
  }
  'architectures.assistant.changes.accept': {
    methods: ["POST"]
    pattern: '/architectures/:id/assistant/conversations/:conversationId/messages/:messageId/changes/:index/accept'
    types: {
      body: {}
      paramsTuple: [ParamValue, ParamValue, ParamValue, ParamValue]
      params: { id: ParamValue; conversationId: ParamValue; messageId: ParamValue; index: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#app/assistant/controllers/assistant-changes-controller').default['accept']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#app/assistant/controllers/assistant-changes-controller').default['accept']>>>
    }
  }
  'architectures.assistant.changes.reject': {
    methods: ["POST"]
    pattern: '/architectures/:id/assistant/conversations/:conversationId/messages/:messageId/changes/:index/reject'
    types: {
      body: {}
      paramsTuple: [ParamValue, ParamValue, ParamValue, ParamValue]
      params: { id: ParamValue; conversationId: ParamValue; messageId: ParamValue; index: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#app/assistant/controllers/assistant-changes-controller').default['reject']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#app/assistant/controllers/assistant-changes-controller').default['reject']>>>
    }
  }
  'architectures.assistant.changes.undo': {
    methods: ["POST"]
    pattern: '/architectures/:id/assistant/conversations/:conversationId/messages/:messageId/changes/:index/undo'
    types: {
      body: {}
      paramsTuple: [ParamValue, ParamValue, ParamValue, ParamValue]
      params: { id: ParamValue; conversationId: ParamValue; messageId: ParamValue; index: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#app/assistant/controllers/assistant-changes-controller').default['undo']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#app/assistant/controllers/assistant-changes-controller').default['undo']>>>
    }
  }
  'uml.validate': {
    methods: ["POST"]
    pattern: '/uml/validate'
    types: {
      body: ExtractBody<InferInput<(typeof import('#app/diagrams/validators/diagrams-input').validateDiagramInput)>>
      paramsTuple: []
      params: {}
      query: ExtractQuery<InferInput<(typeof import('#app/diagrams/validators/diagrams-input').validateDiagramInput)>>
      response: ExtractResponse<Awaited<ReturnType<import('#app/diagrams/controllers/validate-diagram-controller').default['handle']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#app/diagrams/controllers/validate-diagram-controller').default['handle']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'shared.show': {
    methods: ["GET","HEAD"]
    pattern: '/shared/:token'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { token: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#app/sharing/controllers/shared-architecture-controller').default['show']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#app/sharing/controllers/shared-architecture-controller').default['show']>>>
    }
  }
  'shared.unlock': {
    methods: ["POST"]
    pattern: '/shared/:token/unlock'
    types: {
      body: ExtractBody<InferInput<(typeof import('#app/sharing/validators/sharing-input').unlockSharedInput)>>
      paramsTuple: [ParamValue]
      params: { token: ParamValue }
      query: ExtractQuery<InferInput<(typeof import('#app/sharing/validators/sharing-input').unlockSharedInput)>>
      response: ExtractResponse<Awaited<ReturnType<import('#app/sharing/controllers/shared-architecture-controller').default['unlock']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#app/sharing/controllers/shared-architecture-controller').default['unlock']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'account.update_profile': {
    methods: ["PATCH"]
    pattern: '/account'
    types: {
      body: ExtractBody<InferInput<(typeof import('#app/account/validators/account-input').updateProfileInput)>>
      paramsTuple: []
      params: {}
      query: ExtractQuery<InferInput<(typeof import('#app/account/validators/account-input').updateProfileInput)>>
      response: ExtractResponse<Awaited<ReturnType<import('#app/account/controllers/update-profile-controller').default['handle']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#app/account/controllers/update-profile-controller').default['handle']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'account.change_password': {
    methods: ["PUT"]
    pattern: '/account/password'
    types: {
      body: ExtractBody<InferInput<(typeof import('#app/account/validators/account-input').changePasswordInput)>>
      paramsTuple: []
      params: {}
      query: ExtractQuery<InferInput<(typeof import('#app/account/validators/account-input').changePasswordInput)>>
      response: ExtractResponse<Awaited<ReturnType<import('#app/account/controllers/change-password-controller').default['handle']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#app/account/controllers/change-password-controller').default['handle']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'account.destroy': {
    methods: ["DELETE"]
    pattern: '/account'
    types: {
      body: ExtractBody<InferInput<(typeof import('#app/account/validators/account-input').deleteAccountInput)>>
      paramsTuple: []
      params: {}
      query: ExtractQuery<InferInput<(typeof import('#app/account/validators/account-input').deleteAccountInput)>>
      response: ExtractResponse<Awaited<ReturnType<import('#app/account/controllers/delete-account-controller').default['handle']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#app/account/controllers/delete-account-controller').default['handle']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'account.avatar_show': {
    methods: ["GET","HEAD"]
    pattern: '/account/avatar'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#app/account/controllers/avatar-controller').default['show']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#app/account/controllers/avatar-controller').default['show']>>>
    }
  }
  'account.avatar_update': {
    methods: ["POST"]
    pattern: '/account/avatar'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#app/account/controllers/avatar-controller').default['update']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#app/account/controllers/avatar-controller').default['update']>>>
    }
  }
  'account.avatar_destroy': {
    methods: ["DELETE"]
    pattern: '/account/avatar'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#app/account/controllers/avatar-controller').default['destroy']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#app/account/controllers/avatar-controller').default['destroy']>>>
    }
  }
  'account.api_tokens.index': {
    methods: ["GET","HEAD"]
    pattern: '/account/api-tokens'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#app/api-tokens/controllers/api-tokens-controller').default['index']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#app/api-tokens/controllers/api-tokens-controller').default['index']>>>
    }
  }
  'account.api_tokens.store': {
    methods: ["POST"]
    pattern: '/account/api-tokens'
    types: {
      body: ExtractBody<InferInput<(typeof import('#app/api-tokens/validators/api-tokens-input').createApiTokenInput)>>
      paramsTuple: []
      params: {}
      query: ExtractQuery<InferInput<(typeof import('#app/api-tokens/validators/api-tokens-input').createApiTokenInput)>>
      response: ExtractResponse<Awaited<ReturnType<import('#app/api-tokens/controllers/api-tokens-controller').default['store']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#app/api-tokens/controllers/api-tokens-controller').default['store']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'account.api_tokens.destroy': {
    methods: ["DELETE"]
    pattern: '/account/api-tokens/:id'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#app/api-tokens/controllers/api-tokens-controller').default['destroy']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#app/api-tokens/controllers/api-tokens-controller').default['destroy']>>>
    }
  }
  'features.index': {
    methods: ["GET","HEAD"]
    pattern: '/features'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#app/feature-flags/controllers/features-controller').default['index']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#app/feature-flags/controllers/features-controller').default['index']>>>
    }
  }
  'admin.feature_flags.index': {
    methods: ["GET","HEAD"]
    pattern: '/admin/feature-flags'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#app/feature-flags/controllers/admin-feature-flags-controller').default['index']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#app/feature-flags/controllers/admin-feature-flags-controller').default['index']>>>
    }
  }
  'admin.feature_flags.update': {
    methods: ["PUT"]
    pattern: '/admin/feature-flags/:key'
    types: {
      body: ExtractBody<InferInput<(typeof import('#app/feature-flags/validators/feature-flags-input').updateFeatureFlagInput)>>
      paramsTuple: [ParamValue]
      params: { key: ParamValue }
      query: ExtractQuery<InferInput<(typeof import('#app/feature-flags/validators/feature-flags-input').updateFeatureFlagInput)>>
      response: ExtractResponse<Awaited<ReturnType<import('#app/feature-flags/controllers/admin-feature-flags-controller').default['update']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#app/feature-flags/controllers/admin-feature-flags-controller').default['update']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
}
