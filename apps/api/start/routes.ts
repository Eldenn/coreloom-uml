import router from '@adonisjs/core/services/router'
import { middleware } from '#start/kernel'
import { apiTokenThrottle, authThrottle, llmThrottle, terminalThrottle } from '#start/limiter'

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
| Code maps: the structure of a project's code, and how its diagrams match it (behind `code-maps`)
|--------------------------------------------------------------------------
|
| A map belongs to one of the owner's projects; the graph is a gzipped file in Drive. Uploading
| one is a write (an API token needs `write`); `github` has the server clone and map a public
| GitHub repository in the background (in a sandbox, `ImportGithubCodeMapJob`), and
| `github/follow` is the repository the project reads again on each push. `links`
| read and replace one diagram's links, `?diagramId=` naming a diagram of the map's project.
| `processes` lists the flows from the entry points that no diagram documents. `conformance`
| weighs how every diagram of the project matches a map (its newest ready one by default), for
| `coreloom-uml check --conformance` in CI. No model is called.
*/
const codeMapsController = () => import('#app/code-maps/controllers/code-maps-controller')
const codeMapLinksController = () => import('#app/code-maps/controllers/code-map-links-controller')
const codeMapImportsController = () =>
  import('#app/code-maps/controllers/code-map-imports-controller')
const codeMapProcessesController = () =>
  import('#app/code-maps/controllers/code-map-processes-controller')
const codeMapConformanceController = () =>
  import('#app/code-maps/controllers/code-map-conformance-controller')
const codeMapSuggestionsController = () =>
  import('#app/code-maps/controllers/code-map-suggestions-controller')
router
  .group(() => {
    router
      .get('/projects/:id/code-maps', [codeMapsController, 'index'])
      .as('projects.code_maps.index')
    router
      .get('/projects/:id/code-maps/conformance', [codeMapConformanceController, 'show'])
      .as('projects.code_maps.conformance')
    router
      .post('/projects/:id/code-maps', [codeMapsController, 'store'])
      .as('projects.code_maps.store')
    router
      .post('/projects/:id/code-maps/github', [codeMapImportsController, 'store'])
      .as('projects.code_maps.github')
    router
      .get('/projects/:id/code-maps/github/follow', [codeMapImportsController, 'showFollow'])
      .as('projects.code_maps.follow.show')
    router
      .delete('/projects/:id/code-maps/github/follow', [codeMapImportsController, 'destroyFollow'])
      .as('projects.code_maps.follow.destroy')
    router.get('/code-maps/:id', [codeMapsController, 'show']).as('code_maps.show')
    router.delete('/code-maps/:id', [codeMapsController, 'destroy']).as('code_maps.destroy')
    router.get('/code-maps/:id/links', [codeMapLinksController, 'show']).as('code_maps.links.show')
    router
      .put('/code-maps/:id/links', [codeMapLinksController, 'update'])
      .as('code_maps.links.update')
    router
      .get('/code-maps/:id/processes', [codeMapProcessesController, 'index'])
      .as('code_maps.processes.index')
    router
      .get('/code-maps/:id/suggestions', [codeMapSuggestionsController, 'index'])
      .as('code_maps.suggestions.index')
    router
      .patch('/code-map-suggestions/:id', [codeMapSuggestionsController, 'update'])
      .as('code_map_suggestions.update')
  })
  .where('id', router.matchers.number())
  .use([middleware.auth({ guards: ['web', 'api'] }), middleware.tokenAbility(), apiTokenThrottle])

/*
|--------------------------------------------------------------------------
| GitHub App: private repositories for code maps (behind `code-maps`)
|--------------------------------------------------------------------------
|
| `connection` is the user's link to the App: `start` gives the GitHub page to open (install, or
| authorize), the callback page posts GitHub's `code` back, and the repositories the user reaches
| are kept (never a token). Session only. `webhook` takes the App's deliveries, signed with its
| secret: no session, and the signature is checked before anything else. `admin/github-app` is
| where the admin creates the App on GitHub from a manifest (when the environment sets none),
| sees it and removes it: its secrets are stored encrypted and never answered.
*/
const githubConnectionController = () =>
  import('#app/github/controllers/github-connection-controller')
router
  .group(() => {
    router.get('/connection', [githubConnectionController, 'show']).as('connection.show')
    router.post('/connection/start', [githubConnectionController, 'start']).as('connection.start')
    router.post('/connection', [githubConnectionController, 'store']).as('connection.store')
    router.delete('/connection', [githubConnectionController, 'destroy']).as('connection.destroy')
  })
  .prefix('/github')
  .as('github')
  .use(middleware.auth())
const adminGithubAppController = () => import('#app/github/controllers/admin-github-app-controller')
router
  .group(() => {
    router.get('/', [adminGithubAppController, 'show']).as('show')
    router.post('/manifest', [adminGithubAppController, 'start']).as('start')
    router.post('/', [adminGithubAppController, 'store']).as('store')
    router.delete('/', [adminGithubAppController, 'destroy']).as('destroy')
  })
  .prefix('/admin/github-app')
  .as('admin.github_app')
  .use([middleware.auth(), middleware.admin()])
const adminWebSearchController = () =>
  import('#app/web-search/controllers/admin-web-search-controller')
router
  .group(() => {
    router.get('/', [adminWebSearchController, 'show']).as('show')
    router.put('/', [adminWebSearchController, 'update']).as('update')
    router.delete('/', [adminWebSearchController, 'destroy']).as('destroy')
  })
  .prefix('/admin/web-search')
  .as('admin.web_search')
  .use([middleware.auth(), middleware.admin()])
router
  .post('/github/webhook', [
    () => import('#app/github/controllers/github-webhook-controller'),
    'handle',
  ])
  .as('github.webhook')

/*
|--------------------------------------------------------------------------
| Requirements and decisions: why a project's architecture is what it is (behind `design-records`)
|--------------------------------------------------------------------------
|
| What the architecture has to hold, and the decisions taken to hold it, with the options weighed.
| The assistant reads both before it draws a view of the project. These routes call no model.
| Session only.
*/
const requirementsController = () => import('#app/requirements/controllers/requirements-controller')
const decisionsController = () => import('#app/decisions/controllers/decisions-controller')
const designReviewController = () => import('#app/decisions/controllers/design-review-controller')
router
  .group(() => {
    router
      .get('/projects/:id/requirements', [requirementsController, 'index'])
      .as('projects.requirements.index')
    router
      .post('/projects/:id/requirements', [requirementsController, 'store'])
      .as('projects.requirements.store')
    router.patch('/requirements/:id', [requirementsController, 'update']).as('requirements.update')
    router
      .delete('/requirements/:id', [requirementsController, 'destroy'])
      .as('requirements.destroy')
    router
      .get('/projects/:id/decisions', [decisionsController, 'index'])
      .as('projects.decisions.index')
    router
      .post('/projects/:id/decisions', [decisionsController, 'store'])
      .as('projects.decisions.store')
    router.patch('/decisions/:id', [decisionsController, 'update']).as('decisions.update')
    router.delete('/decisions/:id', [decisionsController, 'destroy']).as('decisions.destroy')
    router
      .get('/projects/:id/design-review', [designReviewController, 'show'])
      .as('projects.design_review.show')
    router
      .post('/architectures/:id/design-review', [designReviewController, 'store'])
      .as('architectures.design_review.store')
    router
      .patch('/design-findings/:id', [
        () => import('#app/decisions/controllers/design-findings-controller'),
        'update',
      ])
      .as('design_findings.update')
  })
  .where('id', router.matchers.number())
  .use(middleware.auth())

/*
|--------------------------------------------------------------------------
| Conformance reviews: diagrams checked against a code map by the user's own model (`code-maps`)
|--------------------------------------------------------------------------
|
| Starting a review calls no model. Each diagram is then one call, made by the browser in turn,
| with the provider and its key in the body (never stored or logged): it counts against the LLM
| limit. The findings are stored with the review; the project keeps its ten newest reviews.
| Session only.
*/
const codeReviewsController = () => import('#app/code-reviews/controllers/code-reviews-controller')
router
  .group(() => {
    router
      .get('/projects/:id/code-reviews', [codeReviewsController, 'index'])
      .as('projects.code_reviews.index')
    router.post('/code-reviews', [codeReviewsController, 'store']).as('code_reviews.store')
    router.get('/code-reviews/:id', [codeReviewsController, 'show']).as('code_reviews.show')
    router
      .delete('/code-reviews/:id', [codeReviewsController, 'destroy'])
      .as('code_reviews.destroy')
    router
      .patch('/code-review-findings/:id', [
        () => import('#app/code-reviews/controllers/code-review-findings-controller'),
        'update',
      ])
      .as('code_review_findings.update')
  })
  .where('id', router.matchers.number())
  .use(middleware.auth())
router
  .post('/code-reviews/:id/diagrams/:diagramId', [
    () => import('#app/code-reviews/controllers/code-review-diagrams-controller'),
    'store',
  ])
  .as('code_reviews.diagrams.store')
  .where('id', router.matchers.number())
  .where('diagramId', router.matchers.number())
  .use([middleware.auth(), llmThrottle])

/*
| A process no diagram documents, drawn by the user's own model (provider and key in the body,
| never stored or logged) and proposed as a new view in a new assistant conversation of one of
| the project's architectures. Also behind `diagram-assistant`. Session only.
*/
router
  .post('/code-maps/:id/processes/propose', [
    () => import('#app/code-maps/controllers/code-map-process-proposals-controller'),
    'store',
  ])
  .as('code_maps.processes.propose')
  .where('id', router.matchers.number())
  .use([middleware.auth(), llmThrottle])

/*
| The diagrams worth drawing for a code map, proposed by the user's own model from an outline of
| the map, then each drawn as a new view in a new assistant conversation (drafting is also behind
| `diagram-assistant`). Provider and key in the body, never stored or logged. Session only.
*/
router
  .post('/code-maps/:id/suggestions', [codeMapSuggestionsController, 'store'])
  .as('code_maps.suggestions.store')
  .where('id', router.matchers.number())
  .use([middleware.auth(), llmThrottle])
router
  .post('/code-map-suggestions/:id/draft', [
    () => import('#app/code-maps/controllers/code-map-suggestion-drafts-controller'),
    'store',
  ])
  .as('code_map_suggestions.draft')
  .where('id', router.matchers.number())
  .use([middleware.auth(), llmThrottle])

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
    // A new configuration from several of the caller's, which stay as they are.
    router
      .post('/merge', [
        () => import('#app/agent-configs/controllers/agent-config-merges-controller'),
        'store',
      ])
      .as('agent_configs.merges.store')
    router.get('/:id', [agentConfigController, 'show']).as('agent_configs.show')
    router.patch('/:id', [agentConfigController, 'update']).as('agent_configs.update')
    router.delete('/:id', [agentConfigController, 'destroy']).as('agent_configs.destroy')
    router
      .put('/:id/ready-rules/:slot', [
        () => import('#app/agent-configs/controllers/agent-config-ready-rules-controller'),
        'update',
      ])
      .as('agent_configs.ready_rules.update')
    router
      .put('/:id/skills', [
        () => import('#app/agent-configs/controllers/agent-config-skills-controller'),
        'update',
      ])
      .as('agent_configs.skills.update')
    router.post('/:id/rules', [agentRulesController, 'store']).as('agent_configs.rules.store')
    router
      .patch('/:id/rules/:ruleId', [agentRulesController, 'update'])
      .as('agent_configs.rules.update')
    router
      .delete('/:id/rules/:ruleId', [agentRulesController, 'destroy'])
      .as('agent_configs.rules.destroy')
    // Behind the `agent-roles` flag: 404 while it is off for the caller.
    router
      .get('/:id/roles/suggestions', [agentRolesController, 'suggestions'])
      .as('agent_configs.roles.suggestions')
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
    router
      .get('/:id/generations/:generationId/skill-files', [agentGenerationsController, 'skillFiles'])
      .as('agent_configs.generations.skill_files')
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
/*
| Web research: the user's own model reads the web pages a request names, through tools that run
| in an E2B sandbox, and answers its findings (which the screen then sends to the import below).
| Behind the `web-research` flag and E2B_API_KEY (404 without either). Nothing is stored; the key
| never reaches the sandbox. Session only, one research at a time per account.
*/
router
  .post('/agent-configs/:id/research', [
    () => import('#app/agent-configs/controllers/agent-config-research-controller'),
    'store',
  ])
  .as('agent_configs.research.store')
  .where('id', router.matchers.number())
  .use([middleware.auth(), llmThrottle])
// What the running research has done so far, asked again by the screen while it waits.
router
  .get('/agent-configs/:id/research', [
    () => import('#app/agent-configs/controllers/agent-config-research-controller'),
    'show',
  ])
  .as('agent_configs.research.show')
  .where('id', router.matchers.number())
  .use(middleware.auth())
router
  .post('/agent-configs/:id/imports', [
    () => import('#app/agent-configs/controllers/agent-config-imports-controller'),
    'store',
  ])
  .as('agent_configs.imports.store')
  .where('id', router.matchers.number())
  .use([middleware.auth(), llmThrottle])
/*
| Convention tests: the owner runs the configuration's rendered files against a coding agent in
| E2B sandboxes, paid with their own provider. Behind the `convention-evals` flag and E2B_API_KEY
| (404 without either). Starting one answers 202 with the run id; the screen then polls the run.
| Session only, one test at a time per account.
*/
const conventionEvalsController = () =>
  import('#app/convention-evals/controllers/convention-evals-controller')
router
  .group(() => {
    router.get('/plan', [conventionEvalsController, 'plan']).as('agent_configs.evals.plan')
    router.get('/', [conventionEvalsController, 'index']).as('agent_configs.evals.index')
    router.get('/:runId', [conventionEvalsController, 'show']).as('agent_configs.evals.show')
  })
  .prefix('/agent-configs/:id/evals')
  .where('id', router.matchers.number())
  .where('runId', router.matchers.number())
  .use(middleware.auth())
router
  .post('/agent-configs/:id/evals', [conventionEvalsController, 'store'])
  .as('agent_configs.evals.store')
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
| Saved provider keys (`app/llm-connections/`): one key per kind, stored encrypted, used by every
| model call of the account (request handlers and workers alike). Saved only after a successful
| test call with it; the answer is the hint and the origin, never the key. The kind is in the URL
| and the account in the session, so no route takes a row id. Session only, the LLM limit.
*/
router
  .put('/llm/api-keys/:kind', [
    () => import('#app/llm-connections/controllers/llm-api-key-controller'),
    'save',
  ])
  .as('llm.api_keys.save')
  .where('kind', /^[a-z0-9-]+$/)
  .use([middleware.auth(), llmThrottle])
router
  .delete('/llm/api-keys/:kind', [
    () => import('#app/llm-connections/controllers/llm-api-key-controller'),
    'destroy',
  ])
  .as('llm.api_keys.destroy')
  .where('kind', /^[a-z0-9-]+$/)
  .use([middleware.auth(), llmThrottle])

/*
|--------------------------------------------------------------------------
| Rule packs of the agent conventions catalog (`@coreloom-uml/catalog`)
|--------------------------------------------------------------------------
|
| Served by the API so the web app always shows the server's version.
*/
router
  .get('/rule-packs', [
    () => import('#app/agent-configs/controllers/rule-packs-controller'),
    'index',
  ])
  .as('rule_packs.index')
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
    router.get('/:slug/copy', [skillsController, 'copy']).as('skills.copy')
  })
  .prefix('/skills')
  .where('slug', /^[a-z0-9]+(?:-[a-z0-9]+)*$/)
  .use([middleware.auth({ guards: ['web', 'api'] }), middleware.tokenAbility(), apiTokenThrottle])

/*
| The copies of skills' files the weekly search made: the admin reads each one (with its diff
| against the previous approved copy) and approves or rejects it. Only an approved copy is ever
| installed. Other accounts get a 404.
*/
const adminSkillVersionsController = () =>
  import('#app/skills/controllers/admin-skill-versions-controller')
router
  .group(() => {
    router.get('/', [adminSkillVersionsController, 'index']).as('index')
    router.post('/', [adminSkillVersionsController, 'store']).as('store')
    router.post('/scans', [adminSkillVersionsController, 'scans']).as('scans')
    router.post('/:id/scan', [adminSkillVersionsController, 'scan']).as('scan')
    router
      .post('/:id/model-review', [adminSkillVersionsController, 'modelReview'])
      .as('model_review')
    router.get('/:id', [adminSkillVersionsController, 'show']).as('show')
    router.patch('/:id', [adminSkillVersionsController, 'update']).as('update')
  })
  .prefix('/admin/skill-versions')
  .as('admin.skill_versions')
  .where('id', /^[0-9]+$/)
  .use([middleware.auth(), middleware.admin()])

/*
| What the admin does to the catalog itself: run the search of every source now, and stop suggesting a
| skill or suggest it again. Other accounts get a 404. `refresh` comes before `/:slug`.
*/
const adminSkillsController = () => import('#app/skills/controllers/admin-skills-controller')
router
  .group(() => {
    router.post('/refresh', [adminSkillsController, 'refresh']).as('refresh')
    router.patch('/:slug', [adminSkillsController, 'update']).as('update')
  })
  .prefix('/admin/skills')
  .as('admin.skills')
  .where('slug', /^[a-z0-9]+(?:-[a-z0-9]+)*$/)
  .use([middleware.auth(), middleware.admin()])

/*
| The background jobs that run, wait or just ended, for the admin's header: names, states and times,
| never a job's data. Other accounts get a 404.
*/
const adminQueueJobsController = () =>
  import('#app/queue-jobs/controllers/admin-queue-jobs-controller')
router
  .get('/admin/jobs', [adminQueueJobsController, 'index'])
  .as('admin.jobs.index')
  .use([middleware.auth(), middleware.admin()])

/*
| Where the weekly search looks for skills: skills.sh (disabled, never deleted) and the GitHub
| repositories the admin trusts. Writes rows only; the next run reads them. Other accounts get a 404.
*/
const adminSkillSourcesController = () =>
  import('#app/skills/controllers/admin-skill-sources-controller')
router
  .group(() => {
    router.get('/', [adminSkillSourcesController, 'index']).as('index')
    router.post('/', [adminSkillSourcesController, 'store']).as('store')
    router.patch('/:id', [adminSkillSourcesController, 'update']).as('update')
    router.delete('/:id', [adminSkillSourcesController, 'destroy']).as('destroy')
  })
  .prefix('/admin/skill-sources')
  .as('admin.skill_sources')
  .where('id', /^[0-9]+$/)
  .use([middleware.auth(), middleware.admin()])

/*
| The admin sets a skill's tags, which replace the tagger's and teach it at its next run
| (`app/skills/services/skill-topics.ts`). Other accounts get a 404.
*/
router
  .patch('/admin/skills/:slug/topics', [
    () => import('#app/skills/controllers/admin-skill-topics-controller'),
    'update',
  ])
  .as('admin.skills.topics')
  .where('slug', /^[a-z0-9]+(?:-[a-z0-9]+)*$/)
  .use([middleware.auth(), middleware.admin()])

/*
|--------------------------------------------------------------------------
| Tech watch (shared by the whole instance, behind `tech-watch`)
|--------------------------------------------------------------------------
|
| Articles from the RSS feeds the admin picks (see `app/watch`). The admin's routes write rows or
| queue the run; none fetches a feed. Other accounts get a 404 on them.
*/
router
  .get('/watch/articles', [
    () => import('#app/watch/controllers/watch-articles-controller'),
    'index',
  ])
  .as('watch.articles.index')
  .use(middleware.auth())

const adminWatchController = () => import('#app/watch/controllers/admin-watch-controller')
router
  .group(() => {
    router.get('/sources', [adminWatchController, 'sources']).as('sources.index')
    router.post('/sources', [adminWatchController, 'storeSource']).as('sources.store')
    router.patch('/sources/:id', [adminWatchController, 'updateSource']).as('sources.update')
    router.delete('/sources/:id', [adminWatchController, 'destroySource']).as('sources.destroy')
    router.post('/refresh', [adminWatchController, 'refresh']).as('refresh')
    router.patch('/articles/:id', [adminWatchController, 'updateArticle']).as('articles.update')
    router.get('/blocked-sites', [adminWatchController, 'blockedSites']).as('blocked_sites.index')
    router.post('/blocked-sites', [adminWatchController, 'blockSite']).as('blocked_sites.store')
    router
      .delete('/blocked-sites/:id', [adminWatchController, 'unblockSite'])
      .as('blocked_sites.destroy')
  })
  .prefix('/admin/watch')
  .as('admin.watch')
  .where('id', /^[0-9]+$/)
  .use([middleware.auth(), middleware.admin()])

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
const milestonesController = () => import('#app/milestones/controllers/milestones-controller')
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

    // Milestones: named states of all the views, to compare with and to go back to.
    router
      .get('/:id/milestones', [milestonesController, 'index'])
      .as('architectures.milestones.index')
    router
      .post('/:id/milestones', [milestonesController, 'store'])
      .as('architectures.milestones.store')
    router
      .get('/:id/milestones/:milestoneId', [milestonesController, 'show'])
      .as('architectures.milestones.show')
    router
      .delete('/:id/milestones/:milestoneId', [milestonesController, 'destroy'])
      .as('architectures.milestones.destroy')
    router
      .post('/:id/milestones/:milestoneId/restore', [
        () => import('#app/milestones/controllers/restore-milestone-controller'),
        'handle',
      ])
      .as('architectures.milestones.restore')
  })
  .prefix('/architectures')
  .where('id', router.matchers.number())
  .where('diagramId', router.matchers.number())
  .where('milestoneId', router.matchers.number())
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
| Workspace assistant (behind `diagram-assistant`)
|--------------------------------------------------------------------------
| A conversation is the account's; a message about an architecture goes through that
| architecture's routes, and a change applies only through the architecture its message is about.
| Session only, unlike the architectures group: an API token never reaches the assistant.
*/
const assistantConversationsController = () =>
  import('#app/assistant/controllers/assistant-conversations-controller')
const assistantMessagesController = () =>
  import('#app/assistant/controllers/assistant-messages-controller')
const assistantChangesController = () =>
  import('#app/assistant/controllers/assistant-changes-controller')
const assistantProposalsController = () =>
  import('#app/assistant/controllers/assistant-proposals-controller')
const assistantActionsController = () =>
  import('#app/assistant/controllers/assistant-actions-controller')
router
  .group(() => {
    router.get('/', [assistantConversationsController, 'index']).as('assistant.conversations.index')
    router
      .post('/', [assistantConversationsController, 'store'])
      .as('assistant.conversations.store')
    router
      .get('/:conversationId', [assistantConversationsController, 'show'])
      .as('assistant.conversations.show')
    router
      .patch('/:conversationId', [assistantConversationsController, 'update'])
      .as('assistant.conversations.update')
    router
      .delete('/:conversationId', [assistantConversationsController, 'destroy'])
      .as('assistant.conversations.destroy')
    router
      .post('/:conversationId/continue', [assistantConversationsController, 'continue'])
      .as('assistant.conversations.continue')
      .use(llmThrottle)
    router
      .post('/:conversationId/files', [
        () => import('#app/assistant/controllers/assistant-files-controller'),
        'store',
      ])
      .as('assistant.files.store')
      .use(llmThrottle)
    router
      .post('/:conversationId/sandbox/commands', [
        () => import('#app/assistant/controllers/assistant-sandbox-controller'),
        'run',
      ])
      .as('assistant.sandbox.commands.run')
      .use(terminalThrottle)
    router
      .post('/:conversationId/messages', [assistantMessagesController, 'chat'])
      .as('assistant.messages.store')
      .use(llmThrottle)
    router
      .delete('/:conversationId/messages/:messageId', [assistantMessagesController, 'destroy'])
      .as('assistant.messages.destroy')
    router
      .post('/:conversationId/messages/:messageId/proposals/settle', [
        assistantProposalsController,
        'settle',
      ])
      .as('assistant.proposals.settle')
    router
      .post('/:conversationId/messages/:messageId/actions/:index/accept', [
        assistantActionsController,
        'accept',
      ])
      .as('assistant.actions.accept')
    router
      .post('/:conversationId/messages/:messageId/actions/:index/reject', [
        assistantActionsController,
        'reject',
      ])
      .as('assistant.actions.reject')
  })
  .prefix('/assistant/conversations')
  .where('conversationId', router.matchers.number())
  .where('messageId', router.matchers.number())
  .where('index', router.matchers.number())
  .use(middleware.auth())

router
  .group(() => {
    router
      .post('/conversations/:conversationId/messages', [assistantMessagesController, 'store'])
      .as('architectures.assistant.messages.store')
      .use(llmThrottle)
    router
      .post('/conversations/:conversationId/readings', [assistantMessagesController, 'read'])
      .as('architectures.assistant.readings.store')
      .use(llmThrottle)
    router
      .post('/conversations/:conversationId/context', [assistantMessagesController, 'context'])
      .as('architectures.assistant.context')
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
