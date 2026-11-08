/* eslint-disable prettier/prettier */
import type { AdonisEndpoint } from '@tuyau/core/types'
import type { Registry } from './schema.d.ts'
import type { ApiDefinition } from './tree.d.ts'

const placeholder: any = {}

const routes = {
  'health': {
    methods: ["GET","HEAD"],
    pattern: '/health',
    tokens: [{"old":"/health","type":0,"val":"health","end":""}],
    types: placeholder as Registry['health']['types'],
  },
  'auth.register': {
    methods: ["POST"],
    pattern: '/auth/register',
    tokens: [{"old":"/auth/register","type":0,"val":"auth","end":""},{"old":"/auth/register","type":0,"val":"register","end":""}],
    types: placeholder as Registry['auth.register']['types'],
  },
  'auth.options': {
    methods: ["GET","HEAD"],
    pattern: '/auth/options',
    tokens: [{"old":"/auth/options","type":0,"val":"auth","end":""},{"old":"/auth/options","type":0,"val":"options","end":""}],
    types: placeholder as Registry['auth.options']['types'],
  },
  'auth.login': {
    methods: ["POST"],
    pattern: '/auth/login',
    tokens: [{"old":"/auth/login","type":0,"val":"auth","end":""},{"old":"/auth/login","type":0,"val":"login","end":""}],
    types: placeholder as Registry['auth.login']['types'],
  },
  'auth.logout': {
    methods: ["POST"],
    pattern: '/auth/logout',
    tokens: [{"old":"/auth/logout","type":0,"val":"auth","end":""},{"old":"/auth/logout","type":0,"val":"logout","end":""}],
    types: placeholder as Registry['auth.logout']['types'],
  },
  'auth.me': {
    methods: ["GET","HEAD"],
    pattern: '/auth/me',
    tokens: [{"old":"/auth/me","type":0,"val":"auth","end":""},{"old":"/auth/me","type":0,"val":"me","end":""}],
    types: placeholder as Registry['auth.me']['types'],
  },
  'auth.forgot_password': {
    methods: ["POST"],
    pattern: '/auth/forgot-password',
    tokens: [{"old":"/auth/forgot-password","type":0,"val":"auth","end":""},{"old":"/auth/forgot-password","type":0,"val":"forgot-password","end":""}],
    types: placeholder as Registry['auth.forgot_password']['types'],
  },
  'auth.reset_password': {
    methods: ["POST"],
    pattern: '/auth/reset-password',
    tokens: [{"old":"/auth/reset-password","type":0,"val":"auth","end":""},{"old":"/auth/reset-password","type":0,"val":"reset-password","end":""}],
    types: placeholder as Registry['auth.reset_password']['types'],
  },
  'auth.verify_email': {
    methods: ["GET","HEAD"],
    pattern: '/auth/verify-email',
    tokens: [{"old":"/auth/verify-email","type":0,"val":"auth","end":""},{"old":"/auth/verify-email","type":0,"val":"verify-email","end":""}],
    types: placeholder as Registry['auth.verify_email']['types'],
  },
  'auth.resend_verification': {
    methods: ["POST"],
    pattern: '/auth/resend-verification',
    tokens: [{"old":"/auth/resend-verification","type":0,"val":"auth","end":""},{"old":"/auth/resend-verification","type":0,"val":"resend-verification","end":""}],
    types: placeholder as Registry['auth.resend_verification']['types'],
  },
  'users.show': {
    methods: ["GET","HEAD"],
    pattern: '/users/:id',
    tokens: [{"old":"/users/:id","type":0,"val":"users","end":""},{"old":"/users/:id","type":1,"val":"id","end":""}],
    types: placeholder as Registry['users.show']['types'],
  },
  'projects.index': {
    methods: ["GET","HEAD"],
    pattern: '/projects',
    tokens: [{"old":"/projects","type":0,"val":"projects","end":""}],
    types: placeholder as Registry['projects.index']['types'],
  },
  'projects.store': {
    methods: ["POST"],
    pattern: '/projects',
    tokens: [{"old":"/projects","type":0,"val":"projects","end":""}],
    types: placeholder as Registry['projects.store']['types'],
  },
  'projects.show': {
    methods: ["GET","HEAD"],
    pattern: '/projects/:id',
    tokens: [{"old":"/projects/:id","type":0,"val":"projects","end":""},{"old":"/projects/:id","type":1,"val":"id","end":""}],
    types: placeholder as Registry['projects.show']['types'],
  },
  'projects.update': {
    methods: ["PATCH"],
    pattern: '/projects/:id',
    tokens: [{"old":"/projects/:id","type":0,"val":"projects","end":""},{"old":"/projects/:id","type":1,"val":"id","end":""}],
    types: placeholder as Registry['projects.update']['types'],
  },
  'projects.destroy': {
    methods: ["DELETE"],
    pattern: '/projects/:id',
    tokens: [{"old":"/projects/:id","type":0,"val":"projects","end":""},{"old":"/projects/:id","type":1,"val":"id","end":""}],
    types: placeholder as Registry['projects.destroy']['types'],
  },
  'projects.agent_config.show': {
    methods: ["GET","HEAD"],
    pattern: '/projects/:id/agent-config',
    tokens: [{"old":"/projects/:id/agent-config","type":0,"val":"projects","end":""},{"old":"/projects/:id/agent-config","type":1,"val":"id","end":""},{"old":"/projects/:id/agent-config","type":0,"val":"agent-config","end":""}],
    types: placeholder as Registry['projects.agent_config.show']['types'],
  },
  'projects.agent_config.update': {
    methods: ["PUT"],
    pattern: '/projects/:id/agent-config',
    tokens: [{"old":"/projects/:id/agent-config","type":0,"val":"projects","end":""},{"old":"/projects/:id/agent-config","type":1,"val":"id","end":""},{"old":"/projects/:id/agent-config","type":0,"val":"agent-config","end":""}],
    types: placeholder as Registry['projects.agent_config.update']['types'],
  },
  'projects.agent_config.destroy': {
    methods: ["DELETE"],
    pattern: '/projects/:id/agent-config',
    tokens: [{"old":"/projects/:id/agent-config","type":0,"val":"projects","end":""},{"old":"/projects/:id/agent-config","type":1,"val":"id","end":""},{"old":"/projects/:id/agent-config","type":0,"val":"agent-config","end":""}],
    types: placeholder as Registry['projects.agent_config.destroy']['types'],
  },
  'projects.agent_config.answers.update': {
    methods: ["PUT"],
    pattern: '/projects/:id/agent-config/answers',
    tokens: [{"old":"/projects/:id/agent-config/answers","type":0,"val":"projects","end":""},{"old":"/projects/:id/agent-config/answers","type":1,"val":"id","end":""},{"old":"/projects/:id/agent-config/answers","type":0,"val":"agent-config","end":""},{"old":"/projects/:id/agent-config/answers","type":0,"val":"answers","end":""}],
    types: placeholder as Registry['projects.agent_config.answers.update']['types'],
  },
  'projects.agent_config.rules.store': {
    methods: ["POST"],
    pattern: '/projects/:id/agent-config/rules',
    tokens: [{"old":"/projects/:id/agent-config/rules","type":0,"val":"projects","end":""},{"old":"/projects/:id/agent-config/rules","type":1,"val":"id","end":""},{"old":"/projects/:id/agent-config/rules","type":0,"val":"agent-config","end":""},{"old":"/projects/:id/agent-config/rules","type":0,"val":"rules","end":""}],
    types: placeholder as Registry['projects.agent_config.rules.store']['types'],
  },
  'projects.agent_config.rules.update': {
    methods: ["PATCH"],
    pattern: '/projects/:id/agent-config/rules/:ruleId',
    tokens: [{"old":"/projects/:id/agent-config/rules/:ruleId","type":0,"val":"projects","end":""},{"old":"/projects/:id/agent-config/rules/:ruleId","type":1,"val":"id","end":""},{"old":"/projects/:id/agent-config/rules/:ruleId","type":0,"val":"agent-config","end":""},{"old":"/projects/:id/agent-config/rules/:ruleId","type":0,"val":"rules","end":""},{"old":"/projects/:id/agent-config/rules/:ruleId","type":1,"val":"ruleId","end":""}],
    types: placeholder as Registry['projects.agent_config.rules.update']['types'],
  },
  'projects.agent_config.rules.destroy': {
    methods: ["DELETE"],
    pattern: '/projects/:id/agent-config/rules/:ruleId',
    tokens: [{"old":"/projects/:id/agent-config/rules/:ruleId","type":0,"val":"projects","end":""},{"old":"/projects/:id/agent-config/rules/:ruleId","type":1,"val":"id","end":""},{"old":"/projects/:id/agent-config/rules/:ruleId","type":0,"val":"agent-config","end":""},{"old":"/projects/:id/agent-config/rules/:ruleId","type":0,"val":"rules","end":""},{"old":"/projects/:id/agent-config/rules/:ruleId","type":1,"val":"ruleId","end":""}],
    types: placeholder as Registry['projects.agent_config.rules.destroy']['types'],
  },
  'projects.agent_config.generations.store': {
    methods: ["POST"],
    pattern: '/projects/:id/agent-config/generations',
    tokens: [{"old":"/projects/:id/agent-config/generations","type":0,"val":"projects","end":""},{"old":"/projects/:id/agent-config/generations","type":1,"val":"id","end":""},{"old":"/projects/:id/agent-config/generations","type":0,"val":"agent-config","end":""},{"old":"/projects/:id/agent-config/generations","type":0,"val":"generations","end":""}],
    types: placeholder as Registry['projects.agent_config.generations.store']['types'],
  },
  'projects.agent_config.generations.index': {
    methods: ["GET","HEAD"],
    pattern: '/projects/:id/agent-config/generations',
    tokens: [{"old":"/projects/:id/agent-config/generations","type":0,"val":"projects","end":""},{"old":"/projects/:id/agent-config/generations","type":1,"val":"id","end":""},{"old":"/projects/:id/agent-config/generations","type":0,"val":"agent-config","end":""},{"old":"/projects/:id/agent-config/generations","type":0,"val":"generations","end":""}],
    types: placeholder as Registry['projects.agent_config.generations.index']['types'],
  },
  'projects.agent_config.generations.latest': {
    methods: ["GET","HEAD"],
    pattern: '/projects/:id/agent-config/generations/latest',
    tokens: [{"old":"/projects/:id/agent-config/generations/latest","type":0,"val":"projects","end":""},{"old":"/projects/:id/agent-config/generations/latest","type":1,"val":"id","end":""},{"old":"/projects/:id/agent-config/generations/latest","type":0,"val":"agent-config","end":""},{"old":"/projects/:id/agent-config/generations/latest","type":0,"val":"generations","end":""},{"old":"/projects/:id/agent-config/generations/latest","type":0,"val":"latest","end":""}],
    types: placeholder as Registry['projects.agent_config.generations.latest']['types'],
  },
  'projects.agent_config.generations.show': {
    methods: ["GET","HEAD"],
    pattern: '/projects/:id/agent-config/generations/:generationId',
    tokens: [{"old":"/projects/:id/agent-config/generations/:generationId","type":0,"val":"projects","end":""},{"old":"/projects/:id/agent-config/generations/:generationId","type":1,"val":"id","end":""},{"old":"/projects/:id/agent-config/generations/:generationId","type":0,"val":"agent-config","end":""},{"old":"/projects/:id/agent-config/generations/:generationId","type":0,"val":"generations","end":""},{"old":"/projects/:id/agent-config/generations/:generationId","type":1,"val":"generationId","end":""}],
    types: placeholder as Registry['projects.agent_config.generations.show']['types'],
  },
  'questionnaires.index': {
    methods: ["GET","HEAD"],
    pattern: '/questionnaires',
    tokens: [{"old":"/questionnaires","type":0,"val":"questionnaires","end":""}],
    types: placeholder as Registry['questionnaires.index']['types'],
  },
  'questionnaires.show': {
    methods: ["GET","HEAD"],
    pattern: '/questionnaires/:questionnaireId',
    tokens: [{"old":"/questionnaires/:questionnaireId","type":0,"val":"questionnaires","end":""},{"old":"/questionnaires/:questionnaireId","type":1,"val":"questionnaireId","end":""}],
    types: placeholder as Registry['questionnaires.show']['types'],
  },
  'architectures.index': {
    methods: ["GET","HEAD"],
    pattern: '/architectures',
    tokens: [{"old":"/architectures","type":0,"val":"architectures","end":""}],
    types: placeholder as Registry['architectures.index']['types'],
  },
  'architectures.store': {
    methods: ["POST"],
    pattern: '/architectures',
    tokens: [{"old":"/architectures","type":0,"val":"architectures","end":""}],
    types: placeholder as Registry['architectures.store']['types'],
  },
  'architectures.show': {
    methods: ["GET","HEAD"],
    pattern: '/architectures/:id',
    tokens: [{"old":"/architectures/:id","type":0,"val":"architectures","end":""},{"old":"/architectures/:id","type":1,"val":"id","end":""}],
    types: placeholder as Registry['architectures.show']['types'],
  },
  'architectures.update': {
    methods: ["PATCH"],
    pattern: '/architectures/:id',
    tokens: [{"old":"/architectures/:id","type":0,"val":"architectures","end":""},{"old":"/architectures/:id","type":1,"val":"id","end":""}],
    types: placeholder as Registry['architectures.update']['types'],
  },
  'architectures.destroy': {
    methods: ["DELETE"],
    pattern: '/architectures/:id',
    tokens: [{"old":"/architectures/:id","type":0,"val":"architectures","end":""},{"old":"/architectures/:id","type":1,"val":"id","end":""}],
    types: placeholder as Registry['architectures.destroy']['types'],
  },
  'architectures.duplicate': {
    methods: ["POST"],
    pattern: '/architectures/:id/duplicate',
    tokens: [{"old":"/architectures/:id/duplicate","type":0,"val":"architectures","end":""},{"old":"/architectures/:id/duplicate","type":1,"val":"id","end":""},{"old":"/architectures/:id/duplicate","type":0,"val":"duplicate","end":""}],
    types: placeholder as Registry['architectures.duplicate']['types'],
  },
  'architectures.diagrams.store': {
    methods: ["POST"],
    pattern: '/architectures/:id/diagrams',
    tokens: [{"old":"/architectures/:id/diagrams","type":0,"val":"architectures","end":""},{"old":"/architectures/:id/diagrams","type":1,"val":"id","end":""},{"old":"/architectures/:id/diagrams","type":0,"val":"diagrams","end":""}],
    types: placeholder as Registry['architectures.diagrams.store']['types'],
  },
  'architectures.diagrams.reorder': {
    methods: ["PUT"],
    pattern: '/architectures/:id/diagrams/order',
    tokens: [{"old":"/architectures/:id/diagrams/order","type":0,"val":"architectures","end":""},{"old":"/architectures/:id/diagrams/order","type":1,"val":"id","end":""},{"old":"/architectures/:id/diagrams/order","type":0,"val":"diagrams","end":""},{"old":"/architectures/:id/diagrams/order","type":0,"val":"order","end":""}],
    types: placeholder as Registry['architectures.diagrams.reorder']['types'],
  },
  'architectures.diagrams.update': {
    methods: ["PATCH"],
    pattern: '/architectures/:id/diagrams/:diagramId',
    tokens: [{"old":"/architectures/:id/diagrams/:diagramId","type":0,"val":"architectures","end":""},{"old":"/architectures/:id/diagrams/:diagramId","type":1,"val":"id","end":""},{"old":"/architectures/:id/diagrams/:diagramId","type":0,"val":"diagrams","end":""},{"old":"/architectures/:id/diagrams/:diagramId","type":1,"val":"diagramId","end":""}],
    types: placeholder as Registry['architectures.diagrams.update']['types'],
  },
  'architectures.diagrams.destroy': {
    methods: ["DELETE"],
    pattern: '/architectures/:id/diagrams/:diagramId',
    tokens: [{"old":"/architectures/:id/diagrams/:diagramId","type":0,"val":"architectures","end":""},{"old":"/architectures/:id/diagrams/:diagramId","type":1,"val":"id","end":""},{"old":"/architectures/:id/diagrams/:diagramId","type":0,"val":"diagrams","end":""},{"old":"/architectures/:id/diagrams/:diagramId","type":1,"val":"diagramId","end":""}],
    types: placeholder as Registry['architectures.diagrams.destroy']['types'],
  },
  'architectures.diagrams.source_show': {
    methods: ["GET","HEAD"],
    pattern: '/architectures/:id/diagrams/:diagramId/source',
    tokens: [{"old":"/architectures/:id/diagrams/:diagramId/source","type":0,"val":"architectures","end":""},{"old":"/architectures/:id/diagrams/:diagramId/source","type":1,"val":"id","end":""},{"old":"/architectures/:id/diagrams/:diagramId/source","type":0,"val":"diagrams","end":""},{"old":"/architectures/:id/diagrams/:diagramId/source","type":1,"val":"diagramId","end":""},{"old":"/architectures/:id/diagrams/:diagramId/source","type":0,"val":"source","end":""}],
    types: placeholder as Registry['architectures.diagrams.source_show']['types'],
  },
  'architectures.diagrams.source_update': {
    methods: ["PUT"],
    pattern: '/architectures/:id/diagrams/:diagramId/source',
    tokens: [{"old":"/architectures/:id/diagrams/:diagramId/source","type":0,"val":"architectures","end":""},{"old":"/architectures/:id/diagrams/:diagramId/source","type":1,"val":"id","end":""},{"old":"/architectures/:id/diagrams/:diagramId/source","type":0,"val":"diagrams","end":""},{"old":"/architectures/:id/diagrams/:diagramId/source","type":1,"val":"diagramId","end":""},{"old":"/architectures/:id/diagrams/:diagramId/source","type":0,"val":"source","end":""}],
    types: placeholder as Registry['architectures.diagrams.source_update']['types'],
  },
  'architectures.sharing.show': {
    methods: ["GET","HEAD"],
    pattern: '/architectures/:id/sharing',
    tokens: [{"old":"/architectures/:id/sharing","type":0,"val":"architectures","end":""},{"old":"/architectures/:id/sharing","type":1,"val":"id","end":""},{"old":"/architectures/:id/sharing","type":0,"val":"sharing","end":""}],
    types: placeholder as Registry['architectures.sharing.show']['types'],
  },
  'architectures.sharing.update': {
    methods: ["PUT"],
    pattern: '/architectures/:id/sharing',
    tokens: [{"old":"/architectures/:id/sharing","type":0,"val":"architectures","end":""},{"old":"/architectures/:id/sharing","type":1,"val":"id","end":""},{"old":"/architectures/:id/sharing","type":0,"val":"sharing","end":""}],
    types: placeholder as Registry['architectures.sharing.update']['types'],
  },
  'architectures.sharing.regenerate_link': {
    methods: ["POST"],
    pattern: '/architectures/:id/sharing/regenerate-link',
    tokens: [{"old":"/architectures/:id/sharing/regenerate-link","type":0,"val":"architectures","end":""},{"old":"/architectures/:id/sharing/regenerate-link","type":1,"val":"id","end":""},{"old":"/architectures/:id/sharing/regenerate-link","type":0,"val":"sharing","end":""},{"old":"/architectures/:id/sharing/regenerate-link","type":0,"val":"regenerate-link","end":""}],
    types: placeholder as Registry['architectures.sharing.regenerate_link']['types'],
  },
  'architectures.sharing.regenerate_code': {
    methods: ["POST"],
    pattern: '/architectures/:id/sharing/regenerate-code',
    tokens: [{"old":"/architectures/:id/sharing/regenerate-code","type":0,"val":"architectures","end":""},{"old":"/architectures/:id/sharing/regenerate-code","type":1,"val":"id","end":""},{"old":"/architectures/:id/sharing/regenerate-code","type":0,"val":"sharing","end":""},{"old":"/architectures/:id/sharing/regenerate-code","type":0,"val":"regenerate-code","end":""}],
    types: placeholder as Registry['architectures.sharing.regenerate_code']['types'],
  },
  'uml.validate': {
    methods: ["POST"],
    pattern: '/uml/validate',
    tokens: [{"old":"/uml/validate","type":0,"val":"uml","end":""},{"old":"/uml/validate","type":0,"val":"validate","end":""}],
    types: placeholder as Registry['uml.validate']['types'],
  },
  'shared.show': {
    methods: ["GET","HEAD"],
    pattern: '/shared/:token',
    tokens: [{"old":"/shared/:token","type":0,"val":"shared","end":""},{"old":"/shared/:token","type":1,"val":"token","end":""}],
    types: placeholder as Registry['shared.show']['types'],
  },
  'shared.unlock': {
    methods: ["POST"],
    pattern: '/shared/:token/unlock',
    tokens: [{"old":"/shared/:token/unlock","type":0,"val":"shared","end":""},{"old":"/shared/:token/unlock","type":1,"val":"token","end":""},{"old":"/shared/:token/unlock","type":0,"val":"unlock","end":""}],
    types: placeholder as Registry['shared.unlock']['types'],
  },
  'account.update_profile': {
    methods: ["PATCH"],
    pattern: '/account',
    tokens: [{"old":"/account","type":0,"val":"account","end":""}],
    types: placeholder as Registry['account.update_profile']['types'],
  },
  'account.change_password': {
    methods: ["PUT"],
    pattern: '/account/password',
    tokens: [{"old":"/account/password","type":0,"val":"account","end":""},{"old":"/account/password","type":0,"val":"password","end":""}],
    types: placeholder as Registry['account.change_password']['types'],
  },
  'account.destroy': {
    methods: ["DELETE"],
    pattern: '/account',
    tokens: [{"old":"/account","type":0,"val":"account","end":""}],
    types: placeholder as Registry['account.destroy']['types'],
  },
  'account.avatar_show': {
    methods: ["GET","HEAD"],
    pattern: '/account/avatar',
    tokens: [{"old":"/account/avatar","type":0,"val":"account","end":""},{"old":"/account/avatar","type":0,"val":"avatar","end":""}],
    types: placeholder as Registry['account.avatar_show']['types'],
  },
  'account.avatar_update': {
    methods: ["POST"],
    pattern: '/account/avatar',
    tokens: [{"old":"/account/avatar","type":0,"val":"account","end":""},{"old":"/account/avatar","type":0,"val":"avatar","end":""}],
    types: placeholder as Registry['account.avatar_update']['types'],
  },
  'account.avatar_destroy': {
    methods: ["DELETE"],
    pattern: '/account/avatar',
    tokens: [{"old":"/account/avatar","type":0,"val":"account","end":""},{"old":"/account/avatar","type":0,"val":"avatar","end":""}],
    types: placeholder as Registry['account.avatar_destroy']['types'],
  },
  'account.api_tokens.index': {
    methods: ["GET","HEAD"],
    pattern: '/account/api-tokens',
    tokens: [{"old":"/account/api-tokens","type":0,"val":"account","end":""},{"old":"/account/api-tokens","type":0,"val":"api-tokens","end":""}],
    types: placeholder as Registry['account.api_tokens.index']['types'],
  },
  'account.api_tokens.store': {
    methods: ["POST"],
    pattern: '/account/api-tokens',
    tokens: [{"old":"/account/api-tokens","type":0,"val":"account","end":""},{"old":"/account/api-tokens","type":0,"val":"api-tokens","end":""}],
    types: placeholder as Registry['account.api_tokens.store']['types'],
  },
  'account.api_tokens.destroy': {
    methods: ["DELETE"],
    pattern: '/account/api-tokens/:id',
    tokens: [{"old":"/account/api-tokens/:id","type":0,"val":"account","end":""},{"old":"/account/api-tokens/:id","type":0,"val":"api-tokens","end":""},{"old":"/account/api-tokens/:id","type":1,"val":"id","end":""}],
    types: placeholder as Registry['account.api_tokens.destroy']['types'],
  },
} as const satisfies Record<string, AdonisEndpoint>

export { routes }

export const registry = {
  routes,
  $tree: {} as ApiDefinition,
}

declare module '@tuyau/core/types' {
  export interface UserRegistry {
    routes: typeof routes
    $tree: ApiDefinition
  }
}
