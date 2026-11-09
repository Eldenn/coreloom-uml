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
  'projects.agent_config.show': {
    methods: ["GET","HEAD"]
    pattern: '/projects/:id/agent-config'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#app/agent-configs/controllers/agent-config-controller').default['show']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#app/agent-configs/controllers/agent-config-controller').default['show']>>>
    }
  }
  'projects.agent_config.update': {
    methods: ["PUT"]
    pattern: '/projects/:id/agent-config'
    types: {
      body: ExtractBody<InferInput<(typeof import('#app/agent-configs/validators/agent-configs-input').upsertAgentConfigInput)>>
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: ExtractQuery<InferInput<(typeof import('#app/agent-configs/validators/agent-configs-input').upsertAgentConfigInput)>>
      response: ExtractResponse<Awaited<ReturnType<import('#app/agent-configs/controllers/agent-config-controller').default['update']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#app/agent-configs/controllers/agent-config-controller').default['update']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'projects.agent_config.destroy': {
    methods: ["DELETE"]
    pattern: '/projects/:id/agent-config'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#app/agent-configs/controllers/agent-config-controller').default['destroy']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#app/agent-configs/controllers/agent-config-controller').default['destroy']>>>
    }
  }
  'projects.agent_config.answers.update': {
    methods: ["PUT"]
    pattern: '/projects/:id/agent-config/answers'
    types: {
      body: ExtractBody<InferInput<(typeof import('#app/agent-configs/validators/agent-configs-input').updateAgentAnswersInput)>>
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: ExtractQuery<InferInput<(typeof import('#app/agent-configs/validators/agent-configs-input').updateAgentAnswersInput)>>
      response: ExtractResponse<Awaited<ReturnType<import('#app/agent-configs/controllers/agent-config-answers-controller').default['update']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#app/agent-configs/controllers/agent-config-answers-controller').default['update']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'projects.agent_config.rules.store': {
    methods: ["POST"]
    pattern: '/projects/:id/agent-config/rules'
    types: {
      body: ExtractBody<InferInput<(typeof import('#app/agent-configs/validators/agent-configs-input').createAgentRuleInput)>>
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: ExtractQuery<InferInput<(typeof import('#app/agent-configs/validators/agent-configs-input').createAgentRuleInput)>>
      response: ExtractResponse<Awaited<ReturnType<import('#app/agent-configs/controllers/agent-config-rules-controller').default['store']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#app/agent-configs/controllers/agent-config-rules-controller').default['store']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'projects.agent_config.rules.update': {
    methods: ["PATCH"]
    pattern: '/projects/:id/agent-config/rules/:ruleId'
    types: {
      body: ExtractBody<InferInput<(typeof import('#app/agent-configs/validators/agent-configs-input').updateAgentRuleInput)>>
      paramsTuple: [ParamValue, ParamValue]
      params: { id: ParamValue; ruleId: ParamValue }
      query: ExtractQuery<InferInput<(typeof import('#app/agent-configs/validators/agent-configs-input').updateAgentRuleInput)>>
      response: ExtractResponse<Awaited<ReturnType<import('#app/agent-configs/controllers/agent-config-rules-controller').default['update']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#app/agent-configs/controllers/agent-config-rules-controller').default['update']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'projects.agent_config.rules.destroy': {
    methods: ["DELETE"]
    pattern: '/projects/:id/agent-config/rules/:ruleId'
    types: {
      body: {}
      paramsTuple: [ParamValue, ParamValue]
      params: { id: ParamValue; ruleId: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#app/agent-configs/controllers/agent-config-rules-controller').default['destroy']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#app/agent-configs/controllers/agent-config-rules-controller').default['destroy']>>>
    }
  }
  'projects.agent_config.generations.store': {
    methods: ["POST"]
    pattern: '/projects/:id/agent-config/generations'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#app/agent-configs/controllers/agent-config-generations-controller').default['store']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#app/agent-configs/controllers/agent-config-generations-controller').default['store']>>>
    }
  }
  'projects.agent_config.generations.index': {
    methods: ["GET","HEAD"]
    pattern: '/projects/:id/agent-config/generations'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: ExtractQueryForGet<InferInput<(typeof import('#app/agent-configs/validators/agent-configs-input').listAgentGenerationsInput)>>
      response: ExtractResponse<Awaited<ReturnType<import('#app/agent-configs/controllers/agent-config-generations-controller').default['index']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#app/agent-configs/controllers/agent-config-generations-controller').default['index']>>> | { status: 422; response: { errors: SimpleError[] } }
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
      response: ExtractResponse<Awaited<ReturnType<import('#app/agent-configs/controllers/agent-config-generations-controller').default['latest']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#app/agent-configs/controllers/agent-config-generations-controller').default['latest']>>>
    }
  }
  'projects.agent_config.generations.show': {
    methods: ["GET","HEAD"]
    pattern: '/projects/:id/agent-config/generations/:generationId'
    types: {
      body: {}
      paramsTuple: [ParamValue, ParamValue]
      params: { id: ParamValue; generationId: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#app/agent-configs/controllers/agent-config-generations-controller').default['show']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#app/agent-configs/controllers/agent-config-generations-controller').default['show']>>>
    }
  }
  'projects.agent_config.proposals.store': {
    methods: ["POST"]
    pattern: '/projects/:id/agent-config/proposals'
    types: {
      body: ExtractBody<InferInput<(typeof import('#app/llm/validators/llm-input').llmCallInput)>>
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: ExtractQuery<InferInput<(typeof import('#app/llm/validators/llm-input').llmCallInput)>>
      response: ExtractResponse<Awaited<ReturnType<import('#app/agent-configs/controllers/agent-config-proposals-controller').default['store']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#app/agent-configs/controllers/agent-config-proposals-controller').default['store']>>> | { status: 422; response: { errors: SimpleError[] } }
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
