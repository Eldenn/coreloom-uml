import router from '@adonisjs/core/services/router'
import { middleware } from '#start/kernel'
import { apiTokenThrottle, authThrottle, llmThrottle } from '#start/limiter'

/*
|--------------------------------------------------------------------------
| Health check
|--------------------------------------------------------------------------
*/
router
  .get('/health', [() => import('#app/health/controllers/health-controller'), 'handle'])
  .as('health')

/*
|--------------------------------------------------------------------------
| Authentication (session-backed, local users table)
|--------------------------------------------------------------------------
|
| Route names (`auth.*`) are what the Tuyau client tree is built from. They
| MUST be snake_case: Tuyau camelCases each segment for the client type
| (`forgot_password` -> `client.api.auth.forgotPassword`) and snake_cases the
| property back at runtime to look the route up. A camelCase name typechecks
| but resolves to nothing at runtime ("... is not a function").
*/
router
  .group(() => {
    router
      .post('/register', [() => import('#app/auth/controllers/register-controller'), 'handle'])
      .as('register')
    router
      .get('/options', [() => import('#app/auth/controllers/auth-options-controller'), 'handle'])
      .as('options')
    router
      .post('/login', [() => import('#app/auth/controllers/login-controller'), 'handle'])
      .as('login')
    router
      .post('/logout', [() => import('#app/auth/controllers/logout-controller'), 'handle'])
      .as('logout')
      .use(middleware.auth())
    router
      .get('/me', [() => import('#app/auth/controllers/me-controller'), 'handle'])
      .as('me')
      .use(middleware.auth())
    router
      .post('/forgot-password', [
        () => import('#app/auth/controllers/forgot-password-controller'),
        'handle',
      ])
      .as('forgot_password')
    router
      .post('/reset-password', [
        () => import('#app/auth/controllers/reset-password-controller'),
        'handle',
      ])
      .as('reset_password')
    router
      .get('/verify-email', [
        () => import('#app/auth/controllers/verify-email-controller'),
        'handle',
      ])
      .as('verify_email')
    router
      .post('/resend-verification', [
        () => import('#app/auth/controllers/resend-verification-controller'),
        'handle',
      ])
      .as('resend_verification')
      .use(middleware.auth())
  })
  .prefix('/auth')
  .as('auth')
  .use(authThrottle)

/*
|--------------------------------------------------------------------------
| Users
|--------------------------------------------------------------------------
*/
router
  .get('/users/:id', [() => import('#app/users/controllers/users-controller'), 'show'])
  .as('users.show')
  // `User.id` is an integer column; constrain `:id` to digits so a non-numeric
  // value is a clean route 404 instead of a Postgres `22P02` cast error → 500.
  .where('id', router.matchers.number())
  .use(middleware.auth())

/*
|--------------------------------------------------------------------------
| Projects: the top-level container of an account's design work
|--------------------------------------------------------------------------
|
| A project holds artifacts: architectures (below), listed with
| `GET /architectures?projectId=`, and agent conventions, listed with
| `GET /agent-configs?projectId=` (at most one per project). Both may also stand outside any
| project. Same guards as the architectures.
*/
const projectsController = () => import('#app/projects/controllers/projects-controller')
const agentConfigController = () => import('#app/agent-configs/controllers/agent-config-controller')
const agentRulesController = () =>
  import('#app/agent-configs/controllers/agent-config-rules-controller')
const agentRolesController = () =>
  import('#app/agent-configs/controllers/agent-config-roles-controller')
const agentGenerationsController = () =>
  import('#app/agent-configs/controllers/agent-config-generations-controller')
router
  .group(() => {
    router.get('/', [projectsController, 'index']).as('projects.index')
    router.post('/', [projectsController, 'store']).as('projects.store')
    router.get('/:id', [projectsController, 'show']).as('projects.show')
    router.patch('/:id', [projectsController, 'update']).as('projects.update')
    router.delete('/:id', [projectsController, 'destroy']).as('projects.destroy')

    // What CLIs that address a configuration by its project pull; newer ones use
    // `/agent-configs/:id/generations/latest`.
    router
      .get('/:id/agent-config/generations/latest', [agentGenerationsController, 'latestOfProject'])
      .as('projects.agent_config.generations.latest')
  })
  .prefix('/projects')
  .where('id', router.matchers.number())
  .use([middleware.auth({ guards: ['web', 'api'] }), middleware.tokenAbility(), apiTokenThrottle])

/*
|--------------------------------------------------------------------------
| Agent conventions: what AGENTS.md and its pointer files are rendered from
|--------------------------------------------------------------------------
|
| A configuration sits in one of the owner's projects or outside any; its
| generations are what the CLI pulls (`/:id/generations/latest`).
*/
router
  .group(() => {
    router.get('/', [agentConfigController, 'index']).as('agent_configs.index')
    router.post('/', [agentConfigController, 'store']).as('agent_configs.store')
    router.get('/:id', [agentConfigController, 'show']).as('agent_configs.show')
    router.patch('/:id', [agentConfigController, 'update']).as('agent_configs.update')
    router.delete('/:id', [agentConfigController, 'destroy']).as('agent_configs.destroy')
    router
      .put('/:id/answers', [
        () => import('#app/agent-configs/controllers/agent-config-answers-controller'),
        'update',
      ])
      .as('agent_configs.answers.update')
    router.post('/:id/rules', [agentRulesController, 'store']).as('agent_configs.rules.store')
    router
      .patch('/:id/rules/:ruleId', [agentRulesController, 'update'])
      .as('agent_configs.rules.update')
    router
      .delete('/:id/rules/:ruleId', [agentRulesController, 'destroy'])
      .as('agent_configs.rules.destroy')
    // Behind the `agent-roles` flag: 404 while it is off for the caller.
    router.post('/:id/roles', [agentRolesController, 'store']).as('agent_configs.roles.store')
    router
      .patch('/:id/roles/:roleId', [agentRolesController, 'update'])
      .as('agent_configs.roles.update')
    router
      .delete('/:id/roles/:roleId', [agentRolesController, 'destroy'])
      .as('agent_configs.roles.destroy')
    router
      .post('/:id/generations', [agentGenerationsController, 'store'])
      .as('agent_configs.generations.store')
    router
      .get('/:id/generations', [agentGenerationsController, 'index'])
      .as('agent_configs.generations.index')
    // What the CLI pulls. Declared before `/:generationId` so `latest` isn't read as an id.
    router
      .get('/:id/generations/latest', [agentGenerationsController, 'latest'])
      .as('agent_configs.generations.latest')
    router
      .get('/:id/generations/:generationId', [agentGenerationsController, 'show'])
      .as('agent_configs.generations.show')
  })
  .prefix('/agent-configs')
  .where('id', router.matchers.number())
  .where('ruleId', router.matchers.number())
  .where('roleId', router.matchers.number())
  .where('generationId', router.matchers.number())
  .use([middleware.auth({ guards: ['web', 'api'] }), middleware.tokenAbility(), apiTokenThrottle])

/*
|--------------------------------------------------------------------------
| Calls with the user's own LLM provider (bring your own key)
|--------------------------------------------------------------------------
|
| The key travels in the body of each request and is never stored or logged.
| Session only (an API token is refused), 10 calls a minute per user.
*/
router
  .post('/agent-configs/:id/proposals', [
    () => import('#app/agent-configs/controllers/agent-config-proposals-controller'),
    'store',
  ])
  .as('agent_configs.proposals.store')
  .where('id', router.matchers.number())
  .use([middleware.auth(), llmThrottle])
router
  .post('/agent-configs/:id/imports', [
    () => import('#app/agent-configs/controllers/agent-config-imports-controller'),
    'store',
  ])
  .as('agent_configs.imports.store')
  .where('id', router.matchers.number())
  .use([middleware.auth(), llmThrottle])
router
  .get('/llm/providers', [() => import('#app/llm/controllers/llm-providers-controller'), 'index'])
  .as('llm.providers')
  .use(middleware.auth())
router
  .post('/llm/test', [() => import('#app/llm/controllers/llm-test-controller'), 'handle'])
  .as('llm.test')
  .use([middleware.auth(), llmThrottle])

/*
| Subscriptions (`app/llm-connections/`): an account connects its own ChatGPT or Claude
| subscription instead of sending a key. Each kind sits behind its feature flag (404 while off).
| Session only; starting a sign-in counts against the LLM limit, polling it does not.
*/
router
  .group(() => {
    router
      .post('/attempts', [
        () => import('#app/llm-connections/controllers/codex-connection-controller'),
        'store',
      ])
      .as('attempts.store')
      .use(llmThrottle)
    router
      .get('/attempts/:attemptId', [
        () => import('#app/llm-connections/controllers/codex-connection-controller'),
        'show',
      ])
      .as('attempts.show')
      .where('attemptId', router.matchers.uuid())
    router
      .delete('/', [
        () => import('#app/llm-connections/controllers/codex-connection-controller'),
        'destroy',
      ])
      .as('destroy')
  })
  .prefix('/llm/connections/openai-codex')
  .as('llm.connections.openai_codex')
  .use(middleware.auth())
router
  .group(() => {
    router
      .post('/login', [
        () => import('#app/llm-connections/controllers/claude-code-connection-controller'),
        'store',
      ])
      .as('login.store')
      .use(llmThrottle)
    router
      .post('/login/code', [
        () => import('#app/llm-connections/controllers/claude-code-connection-controller'),
        'code',
      ])
      .as('login.code')
    router
      .delete('/', [
        () => import('#app/llm-connections/controllers/claude-code-connection-controller'),
        'destroy',
      ])
      .as('destroy')
  })
  .prefix('/llm/connections/claude-code')
  .as('llm.connections.claude_code')
  .use(middleware.auth())

/*
|--------------------------------------------------------------------------
| Questionnaires of the agent conventions catalog (`@coreloom-uml/catalog`)
|--------------------------------------------------------------------------
|
| Served by the API so the web app always shows the server's version.
*/
const questionnairesController = () =>
  import('#app/agent-configs/controllers/questionnaires-controller')
router
  .group(() => {
    router.get('/', [questionnairesController, 'index']).as('questionnaires.index')
    router.get('/:questionnaireId', [questionnairesController, 'show']).as('questionnaires.show')
  })
  .prefix('/questionnaires')
  .use([middleware.auth({ guards: ['web', 'api'] }), middleware.tokenAbility(), apiTokenThrottle])

/*
|--------------------------------------------------------------------------
| Ready-made agent roles of the catalog (`@coreloom-uml/catalog`)
|--------------------------------------------------------------------------
|
| Behind the `agent-roles` flag: 404 while it is off for the caller.
*/
router
  .get('/role-presets', [
    () => import('#app/agent-configs/controllers/role-presets-controller'),
    'index',
  ])
  .as('role_presets.index')
  .use([middleware.auth({ guards: ['web', 'api'] }), middleware.tokenAbility(), apiTokenThrottle])

/*
|--------------------------------------------------------------------------
| Skills catalog (read-only, shared by every account)
|--------------------------------------------------------------------------
|
| Hand-picked skills and those the weekly search finds on skills.sh (see
| `app/skills`). `events` is a Server-Sent Events stream that says when the
| catalog changed. `stats` and `events` come before `/:slug`.
*/
const skillsController = () => import('#app/skills/controllers/skills-controller')
router
  .group(() => {
    router.get('/', [skillsController, 'index']).as('skills.index')
    router.get('/stats', [skillsController, 'stats']).as('skills.stats')
    router
      .get('/events', [() => import('#app/skills/controllers/skills-events-controller'), 'handle'])
      .as('skills.events')
    router.get('/:slug', [skillsController, 'show']).as('skills.show')
  })
  .prefix('/skills')
  .where('slug', /^[a-z0-9]+(?:-[a-z0-9]+)*$/)
  .use([middleware.auth({ guards: ['web', 'api'] }), middleware.tokenAbility(), apiTokenThrottle])

/*
|--------------------------------------------------------------------------
| Architectures and their diagrams (reference user-owned resource — copy this for new domains)
|--------------------------------------------------------------------------
*/
const architecturesController = () =>
  import('#app/architectures/controllers/architectures-controller')
const diagramsController = () => import('#app/diagrams/controllers/diagrams-controller')
const diagramSourceController = () => import('#app/diagrams/controllers/diagram-source-controller')
const sharingController = () => import('#app/sharing/controllers/sharing-controller')
router
  .group(() => {
    router.get('/', [architecturesController, 'index']).as('architectures.index')
    router.post('/', [architecturesController, 'store']).as('architectures.store')
    router.get('/:id', [architecturesController, 'show']).as('architectures.show')
    router.patch('/:id', [architecturesController, 'update']).as('architectures.update')
    router.delete('/:id', [architecturesController, 'destroy']).as('architectures.destroy')
    router
      .post('/:id/duplicate', [
        () => import('#app/architectures/controllers/duplicate-architecture-controller'),
        'handle',
      ])
      .as('architectures.duplicate')

    router.post('/:id/diagrams', [diagramsController, 'store']).as('architectures.diagrams.store')
    // Declared before `/:id/diagrams/:diagramId` so `order` isn't read as an id.
    router
      .put('/:id/diagrams/order', [
        () => import('#app/diagrams/controllers/reorder-diagrams-controller'),
        'handle',
      ])
      .as('architectures.diagrams.reorder')
    router
      .patch('/:id/diagrams/:diagramId', [diagramsController, 'update'])
      .as('architectures.diagrams.update')
    router
      .delete('/:id/diagrams/:diagramId', [diagramsController, 'destroy'])
      .as('architectures.diagrams.destroy')
    // The diagram as Mermaid, PlantUML or JSON text (`?format=`), converted on the way in and out.
    router
      .get('/:id/diagrams/:diagramId/source', [diagramSourceController, 'show'])
      .as('architectures.diagrams.source_show')
    router
      .put('/:id/diagrams/:diagramId/source', [diagramSourceController, 'update'])
      .as('architectures.diagrams.source_update')

    // Sharing: the owner's settings (RM-20 to RM-24).
    router.get('/:id/sharing', [sharingController, 'show']).as('architectures.sharing.show')
    router.put('/:id/sharing', [sharingController, 'update']).as('architectures.sharing.update')
    router
      .post('/:id/sharing/regenerate-link', [sharingController, 'regenerateLink'])
      .as('architectures.sharing.regenerate_link')
    router
      .post('/:id/sharing/regenerate-code', [sharingController, 'regenerateCode'])
      .as('architectures.sharing.regenerate_code')
  })
  .prefix('/architectures')
  .where('id', router.matchers.number())
  .where('diagramId', router.matchers.number())
  // The session or an API token (see `app/api-tokens`).
  .use([middleware.auth({ guards: ['web', 'api'] }), middleware.tokenAbility(), apiTokenThrottle])

/*
|--------------------------------------------------------------------------
| MCP server: what coding agents read projects, diagrams and conventions through (behind `mcp-server`)
|--------------------------------------------------------------------------
| API tokens only (`read` is enough, checked by the controller: every MCP call is a POST).
| GET and DELETE are routed too, so they get the 405 the protocol asks for.
*/
router
  .route(
    '/mcp',
    ['GET', 'POST', 'DELETE'],
    [() => import('#app/mcp/controllers/mcp-controller'), 'handle'],
  )
  .as('mcp')
  .use([middleware.auth({ guards: ['api'] }), apiTokenThrottle])

/*
|--------------------------------------------------------------------------
| Workspace assistant: conversations about an architecture (behind `diagram-assistant`)
|--------------------------------------------------------------------------
| Session only, unlike the architectures group: an API token never reaches the assistant.
*/
const assistantConversationsController = () =>
  import('#app/assistant/controllers/assistant-conversations-controller')
const assistantMessagesController = () =>
  import('#app/assistant/controllers/assistant-messages-controller')
const assistantChangesController = () =>
  import('#app/assistant/controllers/assistant-changes-controller')
router
  .group(() => {
    router
      .get('/conversations', [assistantConversationsController, 'index'])
      .as('architectures.assistant.conversations.index')
    router
      .post('/conversations', [assistantConversationsController, 'store'])
      .as('architectures.assistant.conversations.store')
    router
      .get('/conversations/:conversationId', [assistantConversationsController, 'show'])
      .as('architectures.assistant.conversations.show')
    router
      .patch('/conversations/:conversationId', [assistantConversationsController, 'update'])
      .as('architectures.assistant.conversations.update')
    router
      .delete('/conversations/:conversationId', [assistantConversationsController, 'destroy'])
      .as('architectures.assistant.conversations.destroy')
    router
      .post('/conversations/:conversationId/continue', [
        assistantConversationsController,
        'continue',
      ])
      .as('architectures.assistant.conversations.continue')
      .use(llmThrottle)
    router
      .post('/conversations/:conversationId/messages', [assistantMessagesController, 'store'])
      .as('architectures.assistant.messages.store')
      .use(llmThrottle)
    router
      .post('/conversations/:conversationId/context', [assistantMessagesController, 'context'])
      .as('architectures.assistant.context')
    router
      .delete('/conversations/:conversationId/messages/:messageId', [
        assistantMessagesController,
        'destroy',
      ])
      .as('architectures.assistant.messages.destroy')
    router
      .post('/conversations/:conversationId/messages/:messageId/changes/:index/accept', [
        assistantChangesController,
        'accept',
      ])
      .as('architectures.assistant.changes.accept')
    router
      .post('/conversations/:conversationId/messages/:messageId/changes/:index/reject', [
        assistantChangesController,
        'reject',
      ])
      .as('architectures.assistant.changes.reject')
    router
      .post('/conversations/:conversationId/messages/:messageId/changes/:index/undo', [
        assistantChangesController,
        'undo',
      ])
      .as('architectures.assistant.changes.undo')
  })
  .prefix('/architectures/:id/assistant')
  .where('id', router.matchers.number())
  .where('conversationId', router.matchers.number())
  .where('messageId', router.matchers.number())
  .where('index', router.matchers.number())
  .use(middleware.auth())

/*
|--------------------------------------------------------------------------
| UML: check a diagram (text or JSON) the way a save would, without storing it
|--------------------------------------------------------------------------
*/
router
  .post('/uml/validate', [
    () => import('#app/diagrams/controllers/validate-diagram-controller'),
    'handle',
  ])
  .as('uml.validate')
  .use(middleware.auth())

/*
|--------------------------------------------------------------------------
| Share links (public: no session; RM-25 to RM-29)
|--------------------------------------------------------------------------
*/
const sharedController = () => import('#app/sharing/controllers/shared-architecture-controller')
router.get('/shared/:token', [sharedController, 'show']).as('shared.show')
router.post('/shared/:token/unlock', [sharedController, 'unlock']).as('shared.unlock')

/*
|--------------------------------------------------------------------------
| Account (self-service management of the signed-in user)
|--------------------------------------------------------------------------
|
| Route names (`account.*`) drive the Tuyau client tree, e.g.
| `client.api.account.changePassword({ body: { ... } })`.
|
| `middleware.verified()` is available (see `start/kernel.ts`) for routes that
| must sit behind a verified email — none do yet.
*/
router
  .group(() => {
    router
      .patch('/account', [
        () => import('#app/account/controllers/update-profile-controller'),
        'handle',
      ])
      .as('account.update_profile')
    router
      .put('/account/password', [
        () => import('#app/account/controllers/change-password-controller'),
        'handle',
      ])
      .as('account.change_password')
      // Verifies the current password — throttle it like the auth endpoints.
      .use(authThrottle)
    router
      .delete('/account', [
        () => import('#app/account/controllers/delete-account-controller'),
        'handle',
      ])
      .as('account.destroy')
      .use(authThrottle)

    // Avatar: drive-backed, private disk. `avatar_show` streams the bytes back
    // through this authenticated route (own avatar only).
    const avatarController = () => import('#app/account/controllers/avatar-controller')
    router.get('/account/avatar', [avatarController, 'show']).as('account.avatar_show')
    router.post('/account/avatar', [avatarController, 'update']).as('account.avatar_update')
    router.delete('/account/avatar', [avatarController, 'destroy']).as('account.avatar_destroy')

    // API tokens: managed with the session only (a token cannot mint tokens).
    const apiTokensController = () => import('#app/api-tokens/controllers/api-tokens-controller')
    router.get('/account/api-tokens', [apiTokensController, 'index']).as('account.api_tokens.index')
    router
      .post('/account/api-tokens', [apiTokensController, 'store'])
      .as('account.api_tokens.store')
    router
      .delete('/account/api-tokens/:id', [apiTokensController, 'destroy'])
      .as('account.api_tokens.destroy')
      .where('id', router.matchers.number())
  })
  .use(middleware.auth())

/*
|--------------------------------------------------------------------------
| Feature flags (`@coreloom-uml/feature-flags`)
|--------------------------------------------------------------------------
|
| Everyone reads the flags evaluated for them; only the admin (the default account) reads and
| changes their states. Other accounts get a 404 on the admin routes.
*/
router
  .get('/features', [() => import('#app/feature-flags/controllers/features-controller'), 'index'])
  .as('features.index')
  .use(middleware.auth())
router
  .group(() => {
    router
      .get('/', [
        () => import('#app/feature-flags/controllers/admin-feature-flags-controller'),
        'index',
      ])
      .as('index')
    router
      .put('/:key', [
        () => import('#app/feature-flags/controllers/admin-feature-flags-controller'),
        'update',
      ])
      .as('update')
  })
  .prefix('/admin/feature-flags')
  .as('admin.feature_flags')
  .use([middleware.auth(), middleware.admin()])
