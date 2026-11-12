import type { Questionnaire } from '../schemas.ts'

/**
 * Back-end work on a Node.js API. Questions 1, 3, 4, 5, 6 and 8 record facts about the
 * repository; 2, 7 and 9 are preferences on a 1–5 agreement scale, where 3 produces nothing.
 * The questions that follow (ids starting with `be-`) are all optional and go down to the code
 * level of a Node.js back end: HTTP semantics, language and tooling, relational and other
 * stores, scaling the database from the code, API details, authentication and web security,
 * caching, containers and configuration, background work and real time, behaviour under load,
 * tests and observability, and the plumbing of a call to a language model. `single` and `multi`
 * ones record facts about the repository, `scale` ones are preferences.
 * It feeds only its own slots (`api.*`, `errors.*`, `database.*`, `logging.*`, `backend.*`), so
 * it combines with any other questionnaire.
 *
 * Bump `version` on any change to a question, an option or a fragment; never reuse a removed
 * question id; declare a removed option in `migrations`.
 */
export const backendNode = {
  id: 'backend-node',
  version: '1.1.0',
  title: { en: 'Back end: Node.js API', fr: 'Back : API Node.js' },
  description: {
    en: 'How your Node.js back end speaks HTTP, designs its API, authenticates callers, handles errors, uses its databases and caches, runs background work, and is tested, run and observed.',
    fr: 'Comment votre back-end Node.js parle HTTP, conçoit son API, authentifie ses appelants, gère les erreurs, utilise ses bases de données et ses caches, exécute le travail en arrière-plan, et est testé, exécuté et observé.',
  },
  sections: [
    'API',
    'Errors and logging',
    'Database',
    'HTTP and caching',
    'Authentication and web security',
    'Runtime and operations',
  ],
  questions: [
    {
      id: 'api-style',
      type: 'single',
      slot: 'api.style',
      section: 'API',
      label: { en: 'The API is:', fr: "L'API est :" },
      options: [
        { value: 'rest', label: { en: 'REST', fr: 'REST' } },
        { value: 'graphql', label: { en: 'GraphQL', fr: 'GraphQL' } },
        { value: 'rpc', label: { en: 'RPC (tRPC, gRPC…)', fr: 'RPC (tRPC, gRPC…)' } },
        { value: 'other', label: { en: 'Something else', fr: 'Autre chose' }, freeText: true },
      ],
      required: true,
      fragments: [
        {
          when: { equals: 'rest' },
          text: 'The API is REST: model resources with plural nouns, use HTTP methods and status codes for what they mean, and keep the error body shape the same everywhere.',
        },
        {
          when: { equals: 'graphql' },
          text: 'The API is GraphQL: extend the existing schema and resolvers; do not add REST endpoints next to it.',
        },
        {
          when: { equals: 'rpc' },
          text: 'The API is RPC: add a typed procedure next to the existing ones; do not add REST endpoints next to it.',
        },
        {
          when: { other: true },
          text: 'The API style is {value}; follow the existing endpoints and do not introduce another style.',
        },
      ],
    },
    {
      id: 'api-compatibility',
      type: 'scale',
      slot: 'api.compatibility',
      section: 'API',
      label: {
        en: 'A released endpoint never changes shape: a breaking change means a new version.',
        fr: 'Un endpoint publié ne change jamais de forme : un changement cassant passe par une nouvelle version.',
      },
      required: true,
      fragments: [
        {
          when: { scaleAtLeast: 4 },
          text: 'Never rename, remove or retype a field of an existing endpoint; add an optional field or a new version instead.',
        },
        {
          when: { scaleAtMost: 2 },
          text: 'An endpoint may change shape when every caller is updated in the same change.',
        },
      ],
    },
    {
      id: 'input-validation',
      type: 'single',
      slot: 'api.validation',
      section: 'API',
      label: {
        en: 'Request inputs are validated at the boundary with:',
        fr: 'Les entrées des requêtes sont validées à la frontière avec :',
      },
      options: [
        { value: 'zod', label: { en: 'Zod', fr: 'Zod' } },
        { value: 'vinejs', label: { en: 'VineJS', fr: 'VineJS' } },
        { value: 'valibot', label: { en: 'Valibot', fr: 'Valibot' } },
        { value: 'joi', label: { en: 'Joi', fr: 'Joi' } },
        { value: 'class-validator', label: { en: 'class-validator', fr: 'class-validator' } },
        { value: 'other', label: { en: 'Something else', fr: 'Autre chose' }, freeText: true },
      ],
      required: true,
      fragments: [
        {
          when: { answered: true },
          text: 'Validate every request body, query and parameter at the boundary with {value} before using it; past the boundary, rely on the validated types instead of checking again.',
        },
      ],
    },
    {
      id: 'error-handling',
      type: 'single',
      slot: 'errors.handling',
      section: 'Errors and logging',
      label: { en: 'Errors are handled:', fr: 'Les erreurs sont gérées :' },
      options: [
        {
          value: 'central-handler',
          label: {
            en: 'By throwing typed errors that one central handler turns into responses',
            fr: 'En levant des erreurs typées qu’un gestionnaire central transforme en réponses',
          },
        },
        {
          value: 'result-values',
          label: {
            en: 'By returning result values, without throwing',
            fr: 'En retournant des valeurs de résultat, sans lever d’exception',
          },
        },
        {
          value: 'local',
          label: { en: 'In each route handler', fr: 'Dans chaque gestionnaire de route' },
        },
      ],
      required: true,
      fragments: [
        {
          when: { equals: 'central-handler' },
          text: 'Throw the project’s typed errors and let the central error handler build the response; do not catch an error only to answer from a route handler.',
        },
        {
          when: { equals: 'result-values' },
          text: 'Return expected failures as result values and handle both cases at the call site; throw only for programming errors.',
        },
        {
          when: { equals: 'local' },
          text: 'Handle errors in the route handler that can answer them, with the same error body shape as the other handlers.',
        },
        {
          when: { answered: true },
          text: 'Never swallow an error: handle it, or let it propagate with its cause.',
        },
      ],
    },
    {
      id: 'log-style',
      type: 'single',
      slot: 'logging.style',
      section: 'Errors and logging',
      label: { en: 'The code logs with:', fr: 'Le code journalise avec :' },
      options: [
        {
          value: 'structured',
          label: {
            en: 'A structured logger (pino, winston…)',
            fr: 'Un logger structuré (pino, winston…)',
          },
        },
        { value: 'console', label: { en: '`console`', fr: '`console`' } },
      ],
      required: true,
      fragments: [
        {
          when: { equals: 'structured' },
          text: 'Log through the project’s logger, with a message and structured fields; never leave a `console.log` in the code.',
        },
        {
          when: { equals: 'console' },
          text: 'Log with `console`; do not add a logging library.',
        },
      ],
    },
    {
      id: 'log-sensitive-data',
      type: 'scale',
      slot: 'logging.sensitive-data',
      section: 'Errors and logging',
      label: {
        en: 'Logs never contain secrets, tokens or personal data, even while debugging.',
        fr: 'Les logs ne contiennent jamais de secrets, de jetons ni de données personnelles, même pour déboguer.',
      },
      required: true,
      fragments: [
        {
          when: { scaleAtLeast: 4 },
          text: 'Never log secrets, tokens, passwords, request bodies or personal data, at any level; log identifiers instead.',
        },
        {
          when: { scaleAtMost: 2 },
          text: 'Request payloads may be logged at debug level in development; never log credentials or tokens.',
        },
      ],
    },
    {
      id: 'db-access',
      type: 'single',
      slot: 'database.access',
      section: 'Database',
      label: {
        en: 'The database is reached through:',
        fr: 'La base de données est lue et écrite avec :',
      },
      options: [
        { value: 'orm', label: { en: 'An ORM', fr: 'Un ORM' } },
        { value: 'query-builder', label: { en: 'A query builder', fr: 'Un query builder' } },
        { value: 'raw-sql', label: { en: 'Hand-written SQL', fr: 'Du SQL écrit à la main' } },
      ],
      required: true,
      fragments: [
        {
          when: { equals: 'orm' },
          text: 'Read and write the database through the project’s ORM models; drop to raw SQL only when the ORM cannot express the query, and say so.',
        },
        {
          when: { equals: 'query-builder' },
          text: 'Write queries with the project’s query builder; do not add an ORM.',
        },
        {
          when: { equals: 'raw-sql' },
          text: 'Write SQL by hand, always with bound parameters; do not add an ORM or a query builder.',
        },
        {
          when: { answered: true },
          text: 'Never build a query by concatenating values into it.',
        },
      ],
    },
    {
      id: 'db-migrations',
      type: 'single',
      slot: 'database.migrations',
      section: 'Database',
      label: {
        en: 'When a change needs a new table or column, the assistant:',
        fr: "Quand un changement demande une nouvelle table ou colonne, l'assistant :",
      },
      options: [
        {
          value: 'write',
          label: { en: 'Writes the migration', fr: 'Écrit la migration' },
        },
        {
          value: 'ask',
          label: { en: 'Asks me first', fr: 'Me demande d’abord' },
        },
        {
          value: 'never',
          label: {
            en: 'Never touches the schema',
            fr: 'Ne touche jamais au schéma',
          },
        },
      ],
      required: true,
      fragments: [
        {
          when: { equals: 'write' },
          text: 'Change the schema only through a new migration file; never edit a migration that has already run, and never run migrations against a shared database.',
        },
        {
          when: { equals: 'ask' },
          text: 'Ask before any schema change; once agreed, write a new migration file and never edit one that has already run.',
        },
        {
          when: { equals: 'never' },
          text: 'Do not change the database schema or write migrations; describe the change that is needed and stop.',
        },
      ],
    },
    {
      id: 'db-layering',
      type: 'scale',
      slot: 'database.layering',
      section: 'Database',
      label: {
        en: 'Database queries stay out of route handlers and controllers.',
        fr: 'Les requêtes à la base de données restent hors des gestionnaires de route et des contrôleurs.',
      },
      required: true,
      fragments: [
        {
          when: { scaleAtLeast: 4 },
          text: 'Keep database queries in services or repositories; a route handler or controller never queries the database itself.',
        },
        {
          when: { scaleAtMost: 2 },
          text: 'A route handler may query the database directly for a simple read or write; do not add a layer only to wrap one query.',
        },
      ],
    },
    {
      id: 'be-outbound-http',
      type: 'single',
      slot: 'backend.outbound-http',
      section: 'HTTP and caching',
      label: {
        en: 'Outbound HTTP calls are made with:',
        fr: 'Les appels HTTP sortants sont faits avec :',
      },
      options: [
        {
          value: 'shared-client',
          label: {
            en: 'A shared client of the project (timeouts, retries, headers)',
            fr: 'Un client partagé du projet (délais, relances, en-têtes)',
          },
        },
        { value: 'fetch', label: { en: 'The built-in `fetch`', fr: 'Le `fetch` natif' } },
        {
          value: 'other',
          label: { en: 'Another library', fr: 'Une autre bibliothèque' },
          freeText: true,
        },
      ],
      required: false,
      fragments: [
        {
          when: { equals: 'shared-client' },
          text: 'Make outbound HTTP calls through the project’s shared client, which sets timeouts, keep-alive and headers; never call `fetch` or build another client next to it.',
        },
        {
          when: { equals: 'fetch' },
          text: 'Make outbound HTTP calls with the built-in `fetch`, each with `AbortSignal.timeout(...)`, and check `response.ok` before reading the body; do not add an HTTP client library.',
        },
        {
          when: { other: true },
          text: 'Make outbound HTTP calls with {value}, as the existing calls do; do not add another HTTP client.',
        },
        {
          when: { answered: true },
          text: 'Give every outbound call an explicit timeout and reuse one client per remote host so that connections stay alive; never create a client per request.',
        },
      ],
    },
    {
      id: 'be-reverse-proxy',
      type: 'single',
      slot: 'backend.reverse-proxy',
      section: 'HTTP and caching',
      label: {
        en: 'In production, the Node.js process is:',
        fr: 'En production, le processus Node.js est :',
      },
      options: [
        {
          value: 'behind-proxy',
          label: {
            en: 'Behind a reverse proxy or load balancer that ends TLS',
            fr: 'Derrière un reverse proxy ou un load balancer qui termine le TLS',
          },
        },
        {
          value: 'direct',
          label: {
            en: 'Exposed directly, and ends TLS itself',
            fr: 'Exposé directement, et termine lui-même le TLS',
          },
        },
      ],
      required: false,
      fragments: [
        {
          when: { equals: 'behind-proxy' },
          text: 'A reverse proxy ends TLS in front of the app: listen on plain HTTP, read the client address and scheme through the framework’s trusted-proxy setting, never from `X-Forwarded-*` headers by hand, and leave TLS, compression and static files to the proxy.',
        },
        {
          when: { equals: 'direct' },
          text: 'The process is exposed directly: it ends TLS itself, redirects HTTP to HTTPS, sends `Strict-Transport-Security`, and never trusts `X-Forwarded-*` headers.',
        },
      ],
    },
    {
      id: 'be-status-codes',
      type: 'scale',
      slot: 'api.status-codes',
      section: 'HTTP and caching',
      label: {
        en: 'The API answers with the precise status code, never 200 or 400 for everything.',
        fr: 'L’API répond avec le code de statut précis, jamais 200 ou 400 pour tout.',
      },
      required: false,
      fragments: [
        {
          when: { scaleAtLeast: 4 },
          text: 'Answer with the precise status: 201 for a creation, 204 for an empty success, 401 when the caller is not authenticated, 403 when authenticated but not allowed, 404 for a missing resource, 409 for a conflict; never 200 with an error in the body.',
        },
        {
          when: { scaleAtMost: 2 },
          text: 'Keep to the status codes the existing endpoints already return; do not introduce a new one without asking.',
        },
      ],
    },
    {
      id: 'be-idempotency',
      type: 'single',
      slot: 'api.idempotency',
      section: 'HTTP and caching',
      label: {
        en: 'A write that a client may retry is made safe by:',
        fr: 'Une écriture qu’un client peut rejouer est rendue sûre par :',
      },
      options: [
        {
          value: 'idempotency-key',
          label: {
            en: 'An `Idempotency-Key` header on POST',
            fr: 'Un en-tête `Idempotency-Key` sur les POST',
          },
        },
        {
          value: 'natural',
          label: {
            en: 'Idempotent methods and unique constraints only (PUT, DELETE, upsert)',
            fr: 'Des méthodes idempotentes et des contraintes d’unicité seulement (PUT, DELETE, upsert)',
          },
        },
        {
          value: 'none',
          label: {
            en: 'Nothing: a retry may repeat the effect',
            fr: 'Rien : un rejeu peut répéter l’effet',
          },
        },
      ],
      required: false,
      fragments: [
        {
          when: { equals: 'idempotency-key' },
          text: 'A POST that creates or charges something accepts an `Idempotency-Key` header: store the key with the result, and answer a repeated key with the first result instead of doing the work twice.',
        },
        {
          when: { equals: 'natural' },
          text: 'Make retried writes safe by design: PUT replaces and DELETE removes, so repeating them leaves the same state; give a creation a client-chosen id or a unique constraint rather than a store of idempotency keys.',
        },
        {
          when: { equals: 'none' },
          text: 'Writes are not protected against retries: do not add an idempotency mechanism unasked, but say when a new POST would be harmful to repeat.',
        },
        {
          when: { answered: true },
          text: 'GET, HEAD and OPTIONS never change state: never put a write behind a GET.',
        },
      ],
    },
    {
      id: 'be-cpu-work',
      type: 'single',
      slot: 'backend.cpu-work',
      section: 'Runtime and operations',
      label: {
        en: 'CPU-heavy work (image processing, large parsing, bulk hashing) runs:',
        fr: 'Le travail lourd en CPU (traitement d’images, gros parsing, hachage en masse) tourne :',
      },
      options: [
        {
          value: 'worker-threads',
          label: { en: 'In worker threads', fr: 'Dans des worker threads' },
        },
        {
          value: 'jobs',
          label: {
            en: 'In a background job, outside the API process',
            fr: 'Dans une tâche de fond, hors du processus de l’API',
          },
        },
        {
          value: 'other-service',
          label: { en: 'In another service', fr: 'Dans un autre service' },
        },
        {
          value: 'none',
          label: {
            en: 'Nowhere: the API only does I/O',
            fr: 'Nulle part : l’API ne fait que des entrées-sorties',
          },
        },
      ],
      required: false,
      fragments: [
        {
          when: { equals: 'worker-threads' },
          text: 'Run CPU-heavy work in the project’s worker threads, never on the event loop: no synchronous loop over large data, and no `*Sync` call from `fs`, `crypto` or `zlib` in a request handler.',
        },
        {
          when: { equals: 'jobs' },
          text: 'Hand CPU-heavy work to a background job: the API process never runs it on the event loop, and never calls a `*Sync` function of `fs`, `crypto` or `zlib` in a request handler.',
        },
        {
          when: { equals: 'other-service' },
          text: 'CPU-heavy work belongs to the service built for it: call that service from the API, and never run such work on the event loop here.',
        },
        {
          when: { equals: 'none' },
          text: 'The API only does I/O: when a change would add CPU-heavy work to a request, stop and say so instead of running it on the event loop.',
        },
      ],
    },
    {
      id: 'be-lockfile',
      type: 'scale',
      slot: 'backend.lockfile',
      section: 'Tooling',
      label: {
        en: 'CI and production install exactly what the committed lockfile says.',
        fr: 'La CI et la production installent exactement ce que dit le lockfile committé.',
      },
      required: false,
      fragments: [
        {
          when: { scaleAtLeast: 4 },
          text: 'Commit the lockfile with every dependency change, and install with the frozen-lockfile command (`npm ci`, `pnpm install --frozen-lockfile`) in CI and images; never delete or regenerate the lockfile to make an install pass.',
        },
        {
          when: { scaleAtMost: 2 },
          text: 'The lockfile may be regenerated when an install fails; say so, and list the versions that moved.',
        },
      ],
    },
    {
      id: 'be-module-system',
      type: 'single',
      slot: 'backend.module-system',
      section: 'Tooling',
      label: { en: 'The code runs as:', fr: 'Le code s’exécute en :' },
      options: [
        { value: 'esm', label: { en: 'ES modules', fr: 'Modules ES' } },
        { value: 'commonjs', label: { en: 'CommonJS', fr: 'CommonJS' } },
      ],
      required: false,
      fragments: [
        {
          when: { equals: 'esm' },
          text: 'The code runs as ES modules: use `import` and `export`, and `import.meta` in place of `__dirname`; never add `require` or `module.exports`.',
        },
        {
          when: { equals: 'commonjs' },
          text: 'The code runs as CommonJS: keep the existing import style, load an ESM-only package with a dynamic `import()`, do not use top-level `await`, and do not convert the project to ES modules unasked.',
        },
      ],
    },
    {
      id: 'be-transactions',
      type: 'scale',
      slot: 'database.transactions',
      section: 'Database',
      label: {
        en: 'A write that touches several rows or tables always runs in one transaction.',
        fr: 'Une écriture qui touche plusieurs lignes ou tables passe toujours par une seule transaction.',
      },
      required: false,
      fragments: [
        {
          when: { scaleAtLeast: 4 },
          text: 'Wrap every operation that writes more than one row or table in one transaction, through the project’s transaction helper; keep it short, and never await an HTTP call or any other slow outside call inside it.',
        },
        {
          when: { scaleAtMost: 2 },
          text: 'Use a transaction only where a partial write would leave wrong data; do not wrap single statements or reads.',
        },
      ],
    },
    {
      id: 'be-concurrent-writes',
      type: 'single',
      slot: 'database.concurrent-writes',
      section: 'Database',
      label: {
        en: 'When two requests may change the same row (stock, balance, quota), the code uses:',
        fr: 'Quand deux requêtes peuvent modifier la même ligne (stock, solde, quota), le code utilise :',
      },
      options: [
        {
          value: 'atomic-update',
          label: {
            en: 'One conditional `UPDATE` (`… WHERE available > 0`)',
            fr: 'Un seul `UPDATE` conditionnel (`… WHERE available > 0`)',
          },
        },
        {
          value: 'row-lock',
          label: {
            en: '`SELECT … FOR UPDATE` in a transaction',
            fr: '`SELECT … FOR UPDATE` dans une transaction',
          },
        },
        {
          value: 'version-column',
          label: {
            en: 'A version column (optimistic locking)',
            fr: 'Une colonne de version (verrouillage optimiste)',
          },
        },
        { value: 'other', label: { en: 'Something else', fr: 'Autre chose' }, freeText: true },
      ],
      required: false,
      fragments: [
        {
          when: { equals: 'atomic-update' },
          text: 'Never read a value and write it back: change it in one conditional `UPDATE ... WHERE` that states the condition, and treat zero affected rows as the refusal.',
        },
        {
          when: { equals: 'row-lock' },
          text: 'Before changing a row from a value read earlier, lock it with `SELECT ... FOR UPDATE` in the same transaction; always lock rows in the same order to avoid deadlocks.',
        },
        {
          when: { equals: 'version-column' },
          text: 'Guard concurrent changes with the version column: update `WHERE version = <the one read>`, increment it, and answer a conflict (409) when no row was changed.',
        },
        {
          when: { other: true },
          text: 'Guard concurrent changes to the same row with {value}; never read a value and write it back unguarded.',
        },
      ],
    },
    {
      id: 'be-query-rules',
      type: 'multi',
      slot: 'database.query-rules',
      section: 'Database',
      label: {
        en: 'In database code, the assistant always:',
        fr: 'Dans le code de base de données, l’assistant, toujours :',
      },
      options: [
        {
          value: 'no-n-plus-one',
          label: {
            en: 'Avoids one query per item (N+1)',
            fr: 'Évite une requête par élément (N+1)',
          },
        },
        {
          value: 'explicit-columns',
          label: {
            en: 'Selects only the columns it needs, with a limit',
            fr: 'Ne sélectionne que les colonnes utiles, avec une limite',
          },
        },
        {
          value: 'indexes',
          label: {
            en: 'Adds the index a new query needs',
            fr: 'Ajoute l’index dont une nouvelle requête a besoin',
          },
        },
        {
          value: 'constraints',
          label: {
            en: 'Enforces integrity with constraints in the schema',
            fr: 'Garantit l’intégrité par des contraintes dans le schéma',
          },
        },
        {
          value: 'online-migrations',
          label: {
            en: 'Writes migrations that run without blocking a live table',
            fr: 'Écrit des migrations qui s’exécutent sans bloquer une table en service',
          },
        },
      ],
      required: false,
      fragments: [
        {
          when: { includes: 'no-n-plus-one' },
          text: 'Never query inside a loop: load related rows with a join, an eager load or one `IN (...)` query (a batching loader in GraphQL resolvers), and check the SQL that an ORM call generates.',
        },
        {
          when: { includes: 'explicit-columns' },
          text: 'Select the columns the code uses, never `SELECT *` on a wide table, and bound every list query with a limit.',
        },
        {
          when: { includes: 'indexes' },
          text: 'When a new query filters, joins or sorts on a column of a table that can grow, add the matching index in the same change, and index every foreign key; do not add an index that no query uses.',
        },
        {
          when: { includes: 'constraints' },
          text: 'Enforce integrity in the schema, not only in code: `NOT NULL`, unique, foreign key and check constraints; store each fact once, and denormalize only where a measurement justifies it.',
        },
        {
          when: { includes: 'online-migrations' },
          text: 'Write migrations that run on a live database next to the previous code: create an index with `CONCURRENTLY`, add a column as nullable then backfill in batches, and drop a column one release after the code stops using it.',
        },
      ],
    },
    {
      id: 'be-other-stores',
      type: 'multi',
      slot: 'database.other-stores',
      section: 'Database',
      label: {
        en: 'Besides the main database, the project stores data in:',
        fr: 'En plus de la base principale, le projet stocke des données dans :',
      },
      options: [
        {
          value: 'key-value',
          label: {
            en: 'A key-value store (Redis, DynamoDB…)',
            fr: 'Une base clé-valeur (Redis, DynamoDB…)',
          },
        },
        {
          value: 'document',
          label: {
            en: 'A document database (MongoDB…)',
            fr: 'Une base de documents (MongoDB…)',
          },
        },
        {
          value: 'search',
          label: {
            en: 'A search engine (Elasticsearch, OpenSearch…)',
            fr: 'Un moteur de recherche (Elasticsearch, OpenSearch…)',
          },
        },
        {
          value: 'time-series',
          label: {
            en: 'A time series database (TimescaleDB, InfluxDB…)',
            fr: 'Une base de séries temporelles (TimescaleDB, InfluxDB…)',
          },
        },
        {
          value: 'analytics',
          label: {
            en: 'An analytical database (ClickHouse…)',
            fr: 'Une base analytique (ClickHouse…)',
          },
        },
        { value: 'none', label: { en: 'Nothing else', fr: 'Rien d’autre' }, exclusive: true },
      ],
      required: false,
      fragments: [
        {
          when: { includes: 'key-value' },
          text: 'The key-value store holds data read by key only (sessions, counters, quotas): name keys with the existing prefixes, set an expiry on anything temporary, and never scan keys (`KEYS`) in application code.',
        },
        {
          when: { includes: 'document' },
          text: 'Model documents after the queries that read them: embed what is read together, do not spread one aggregate over collections joined by id in code, and validate a document’s shape when writing it.',
        },
        {
          when: { includes: 'search' },
          text: 'The search engine is a copy, never the source of truth: write to the main database first, update the index from a job or an event, and keep reindexing from the database possible.',
        },
        {
          when: { includes: 'time-series' },
          text: 'Timestamped measurements go to the time series store: append, never update in place, always query with a time range, and rely on its retention rules to delete old data.',
        },
        {
          when: { includes: 'analytics' },
          text: 'Aggregates over large volumes run on the analytical database, fed by batches of inserts: never run such a query on the transactional database from a request, and never write single rows or transactions to the analytical one.',
        },
        {
          when: { includes: 'none' },
          text: 'The main database is the only store: do not introduce another database, a cache or a search engine unasked; first show the access pattern that the main database cannot serve.',
        },
      ],
    },
    {
      id: 'be-json-columns',
      type: 'scale',
      slot: 'database.json-columns',
      section: 'Database',
      label: {
        en: 'I prefer typed columns and tables to JSON columns.',
        fr: 'Je préfère des colonnes et des tables typées à des colonnes JSON.',
      },
      required: false,
      fragments: [
        {
          when: { scaleAtLeast: 4 },
          text: 'Model data with typed columns and tables; use a JSON column only for data that is stored and returned whole, never filtered, joined or constrained.',
        },
        {
          when: { scaleAtMost: 2 },
          text: 'A JSON column is fine for data whose shape varies; validate its shape with a schema when writing it, and index the keys that are queried.',
        },
      ],
    },
    {
      id: 'be-read-replicas',
      type: 'single',
      slot: 'database.read-replicas',
      section: 'Database',
      label: { en: 'Reads go to:', fr: 'Les lectures vont sur :' },
      options: [
        { value: 'primary', label: { en: 'The primary only', fr: 'Le primaire seulement' } },
        {
          value: 'replicas',
          label: {
            en: 'Read replicas, when a little lag is acceptable',
            fr: 'Des réplicas de lecture, quand un léger retard est acceptable',
          },
        },
      ],
      required: false,
      fragments: [
        {
          when: { equals: 'primary' },
          text: 'There is one database connection for reads and writes: do not add read/write splitting unasked.',
        },
        {
          when: { equals: 'replicas' },
          text: 'Send only reads that tolerate lag to the read replica connection; read from the primary inside a transaction and right after a write, so that a user always sees what they just changed.',
        },
      ],
    },
    {
      id: 'be-table-splitting',
      type: 'single',
      slot: 'database.table-splitting',
      section: 'Database',
      label: { en: 'Large tables are:', fr: 'Les grosses tables sont :' },
      options: [
        {
          value: 'none',
          label: {
            en: 'Neither partitioned nor sharded',
            fr: 'Ni partitionnées ni shardées',
          },
        },
        {
          value: 'partitioned',
          label: {
            en: 'Partitioned (by date, by tenant…)',
            fr: 'Partitionnées (par date, par client…)',
          },
        },
        {
          value: 'sharded',
          label: {
            en: 'Sharded across several databases',
            fr: 'Shardées sur plusieurs bases',
          },
        },
      ],
      required: false,
      fragments: [
        {
          when: { equals: 'none' },
          text: 'Tables are neither partitioned nor sharded: do not introduce either unasked; propose it with the table size and the query that needs it.',
        },
        {
          when: { equals: 'partitioned' },
          text: 'Some tables are partitioned: always filter on the partition key so that only the needed partitions are read, and remove old data by dropping a partition, never with a bulk `DELETE`.',
        },
        {
          when: { equals: 'sharded' },
          text: 'Data is sharded: every query carries the shard key, no join or transaction crosses shards, a row’s shard key never changes, and a new table states its shard key before any code is written.',
        },
      ],
    },
    {
      id: 'be-connection-pool',
      type: 'scale',
      slot: 'database.connections',
      section: 'Database',
      label: {
        en: 'Every query goes through one shared connection pool.',
        fr: 'Chaque requête SQL passe par un seul pool de connexions partagé.',
      },
      required: false,
      fragments: [
        {
          when: { scaleAtLeast: 4 },
          text: 'Take database connections from the shared pool only and release them on every path (`finally`, or the ORM’s own handling); never open a connection per request, hold one across a slow call, or raise the pool size to hide a slow query.',
        },
        {
          when: { scaleAtMost: 2 },
          text: 'Connection handling is left to the platform (serverless driver, external pooler): do not add a pool or change connection settings unasked.',
        },
      ],
    },
    {
      id: 'be-pagination',
      type: 'single',
      slot: 'api.pagination',
      section: 'API',
      label: {
        en: 'List endpoints are paginated with:',
        fr: 'Les endpoints de liste sont paginés avec :',
      },
      options: [
        {
          value: 'offset',
          label: {
            en: 'A page number and a page size',
            fr: 'Un numéro de page et une taille de page',
          },
        },
        { value: 'cursor', label: { en: 'A cursor (keyset)', fr: 'Un curseur (keyset)' } },
        {
          value: 'none',
          label: {
            en: 'Nothing: lists are returned whole',
            fr: 'Rien : les listes sont renvoyées entières',
          },
        },
      ],
      required: false,
      fragments: [
        {
          when: { equals: 'offset' },
          text: 'Paginate every list endpoint with a page number and a page size, with a default and a maximum page size, a stable sort order, and the same response envelope as the existing lists.',
        },
        {
          when: { equals: 'cursor' },
          text: 'Paginate every list endpoint with an opaque cursor over a unique, indexed sort key (keyset), with a maximum page size; never use `OFFSET` on a table that grows.',
        },
        {
          when: { equals: 'none' },
          text: 'Lists are returned whole: do not add pagination unasked, but say when a new list has no upper bound.',
        },
      ],
    },
    {
      id: 'be-api-versioning',
      type: 'single',
      slot: 'api.versioning',
      section: 'API',
      label: {
        en: 'The API version is carried by:',
        fr: 'La version de l’API est portée par :',
      },
      options: [
        { value: 'url', label: { en: 'The URL (`/v1/…`)', fr: 'L’URL (`/v1/…`)' } },
        {
          value: 'header',
          label: { en: 'A header or a media type', fr: 'Un en-tête ou un type de média' },
        },
        {
          value: 'none',
          label: {
            en: 'Nothing: there is one version',
            fr: 'Rien : il n’y a qu’une version',
          },
        },
      ],
      required: false,
      fragments: [
        {
          when: { equals: 'url' },
          text: 'Put every new route under the current version prefix (`/v1/...`); a breaking change goes under a new prefix, and the old one keeps working until its removal is announced.',
        },
        {
          when: { equals: 'header' },
          text: 'The API version comes from a request header: read it through the existing helper, treat a missing one as the existing routes do, and never put a version in a URL.',
        },
        {
          when: { equals: 'none' },
          text: 'The API has one version: do not add a version prefix or header unasked.',
        },
      ],
    },
    {
      id: 'be-api-contract',
      type: 'single',
      slot: 'api.contract',
      section: 'API',
      label: { en: 'The API is described by:', fr: 'L’API est décrite par :' },
      options: [
        {
          value: 'design-first',
          label: {
            en: 'An OpenAPI (or schema) file written before the code',
            fr: 'Un fichier OpenAPI (ou un schéma) écrit avant le code',
          },
        },
        {
          value: 'generated',
          label: {
            en: 'A description generated from the code',
            fr: 'Une description générée depuis le code',
          },
        },
        {
          value: 'none',
          label: { en: 'No formal description', fr: 'Aucune description formelle' },
        },
      ],
      required: false,
      fragments: [
        {
          when: { equals: 'design-first' },
          text: 'The API description is written first: change the OpenAPI or schema file before the code, then make the code match it, with every status code and error shape the endpoint can return.',
        },
        {
          when: { equals: 'generated' },
          text: 'The API description is generated from the code: keep the route schemas and types it reads complete, regenerate it with the project’s command after any change to a route, and never edit the generated file by hand.',
        },
        {
          when: { equals: 'none' },
          text: 'There is no formal API description: do not add one unasked; document a new or changed endpoint where the existing ones are documented.',
        },
      ],
    },
    {
      id: 'be-auth-strategy',
      type: 'single',
      slot: 'backend.auth-strategy',
      section: 'Authentication and web security',
      label: { en: 'Callers are authenticated with:', fr: 'Les appelants sont authentifiés par :' },
      options: [
        {
          value: 'session',
          label: {
            en: 'A server-side session behind a cookie',
            fr: 'Une session côté serveur derrière un cookie',
          },
        },
        { value: 'jwt', label: { en: 'JWT access tokens', fr: 'Des jetons d’accès JWT' } },
        {
          value: 'api-token',
          label: { en: 'Opaque tokens or API keys', fr: 'Des jetons opaques ou des clés d’API' },
        },
        {
          value: 'identity-provider',
          label: {
            en: 'An external identity provider (OpenID Connect, SAML)',
            fr: 'Un fournisseur d’identité externe (OpenID Connect, SAML)',
          },
        },
        { value: 'other', label: { en: 'Something else', fr: 'Autre chose' }, freeText: true },
      ],
      required: false,
      fragments: [
        {
          when: { equals: 'session' },
          text: 'Sessions live on the server behind a cookie set `HttpOnly; Secure; SameSite=Lax` or stricter: never put a session id or a token in `localStorage` or a URL, renew the session id at login, and protect state-changing routes against CSRF.',
        },
        {
          when: { equals: 'jwt' },
          text: 'Access tokens are JWTs: verify signature, expected algorithm, issuer, audience and expiry on every request with the project’s helper, keep their lifetime short (5 to 15 minutes) next to a revocable refresh token, and never put a secret in the payload.',
        },
        {
          when: { equals: 'api-token' },
          text: 'Callers send an opaque token in `Authorization: Bearer`: store only its hash, show the value once at creation, give each token scopes and an expiry, and never accept one from a query string.',
        },
        {
          when: { equals: 'identity-provider' },
          text: 'Sign-in is delegated to an identity provider: use the authorization code flow with PKCE, validate `state` and the ID token (signature, issuer, audience, expiry), take the identity from the ID token, and never add a password login next to it.',
        },
        {
          when: { other: true },
          text: 'Callers are authenticated with {value}: reuse the existing mechanism, and never add a second one next to it.',
        },
        {
          when: { answered: true },
          text: 'Authenticate through the existing middleware or guard only; never read credentials by hand in a route handler.',
        },
      ],
    },
    {
      id: 'be-authorization',
      type: 'scale',
      slot: 'backend.authorization',
      section: 'Authentication and web security',
      label: {
        en: 'Every route checks, on the server, that the caller may act on that exact resource.',
        fr: 'Chaque route vérifie, côté serveur, que l’appelant a le droit d’agir sur cette ressource précise.',
      },
      required: false,
      fragments: [
        {
          when: { scaleAtLeast: 4 },
          text: 'On every route that reads or changes a resource, check through the project’s authorization helper that it belongs to the caller; never trust an id from the URL or the body, and add a test that tries another user’s resource.',
        },
        {
          when: { scaleAtMost: 2 },
          text: 'Access is checked by a layer above the handlers (gateway, global guard): do not repeat the check in each handler, but say when a new route is not covered by it.',
        },
      ],
    },
    {
      id: 'be-password-hashing',
      type: 'single',
      slot: 'backend.password-hashing',
      section: 'Authentication and web security',
      label: { en: 'Passwords are hashed with:', fr: 'Les mots de passe sont hachés avec :' },
      options: [
        { value: 'argon2id', label: { en: 'Argon2id', fr: 'Argon2id' } },
        { value: 'bcrypt', label: { en: 'bcrypt', fr: 'bcrypt' } },
        { value: 'scrypt', label: { en: 'scrypt', fr: 'scrypt' } },
        {
          value: 'none',
          label: {
            en: 'Nothing: the application stores no password',
            fr: 'Rien : l’application ne stocke aucun mot de passe',
          },
        },
      ],
      required: false,
      fragments: [
        {
          when: { equals: 'argon2id' },
          text: 'Hash passwords with Argon2id through the project’s helper, with a salt per password and a cost tuned to about 100 to 300 ms; never use MD5, SHA-1 or SHA-256 for a password, even salted.',
        },
        {
          when: { equals: 'bcrypt' },
          text: 'Hash passwords with bcrypt through the project’s helper; bcrypt ignores what comes after 72 bytes, so cap the accepted length, and never use MD5, SHA-1 or SHA-256 for a password, even salted.',
        },
        {
          when: { equals: 'scrypt' },
          text: 'Hash passwords with scrypt through the project’s helper, with a salt per password; never use MD5, SHA-1 or SHA-256 for a password, even salted.',
        },
        {
          when: { equals: 'none' },
          text: 'The application stores no password: never add a password column, a password login or a reset flow; sign-in stays with the existing provider.',
        },
        {
          when: { answered: true },
          text: 'Compare secrets and tokens in constant time (`crypto.timingSafeEqual`), and answer a failed sign-in the same way whether the account exists or not.',
        },
      ],
    },
    {
      id: 'be-cors',
      type: 'single',
      slot: 'api.cors',
      section: 'Authentication and web security',
      label: {
        en: 'Cross-origin requests from browsers (CORS) are:',
        fr: 'Les requêtes de navigateurs venant d’une autre origine (CORS) sont :',
      },
      options: [
        {
          value: 'allowlist',
          label: {
            en: 'Allowed for a list of known origins',
            fr: 'Autorisées pour une liste d’origines connues',
          },
        },
        {
          value: 'same-origin',
          label: {
            en: 'Not allowed: the front end is on the same origin',
            fr: 'Refusées : le front est sur la même origine',
          },
        },
        {
          value: 'open',
          label: {
            en: 'Allowed for any origin, without credentials (public API)',
            fr: 'Autorisées pour toute origine, sans identifiants (API publique)',
          },
        },
      ],
      required: false,
      fragments: [
        {
          when: { equals: 'allowlist' },
          text: 'CORS allows the origins of the configured list only: add an origin to that list, never answer `*` or reflect the `Origin` header, and never combine a wildcard with credentials.',
        },
        {
          when: { equals: 'same-origin' },
          text: 'The API sends no CORS headers because the front end is on the same origin: do not enable CORS to make a call pass.',
        },
        {
          when: { equals: 'open' },
          text: 'CORS is open to any origin because the API is public: keep it without credentials (no cookies), and authenticate with a token in a header.',
        },
        {
          when: { answered: true },
          text: 'CORS only restrains browsers: it never replaces authentication or an authorization check.',
        },
      ],
    },
    {
      id: 'be-security-headers',
      type: 'single',
      slot: 'backend.security-headers',
      section: 'Authentication and web security',
      label: {
        en: 'Security headers (HSTS, Content-Security-Policy, `X-Content-Type-Options`…) are set by:',
        fr: 'Les en-têtes de sécurité (HSTS, Content-Security-Policy, `X-Content-Type-Options`…) sont posés par :',
      },
      options: [
        {
          value: 'app',
          label: {
            en: 'The application (helmet or the framework’s equivalent)',
            fr: 'L’application (helmet ou l’équivalent du framework)',
          },
        },
        {
          value: 'proxy',
          label: { en: 'The reverse proxy or the CDN', fr: 'Le reverse proxy ou le CDN' },
        },
        { value: 'none', label: { en: 'Nobody yet', fr: 'Personne pour l’instant' } },
      ],
      required: false,
      fragments: [
        {
          when: { equals: 'app' },
          text: 'Security headers are set in one place in the application (HSTS, `X-Content-Type-Options: nosniff`, frame and content security policies): change them there, never per route, and never loosen a policy (`unsafe-inline`, `*`) without asking.',
        },
        {
          when: { equals: 'proxy' },
          text: 'Security headers are set by the reverse proxy or the CDN: do not set them again in application code; when a change needs a header or a looser policy, say which one and where.',
        },
        {
          when: { equals: 'none' },
          text: 'No security headers are set yet: do not add a library for them unasked, but say so when a change serves HTML or sets a cookie.',
        },
      ],
    },
    {
      id: 'be-attack-surface',
      type: 'multi',
      slot: 'backend.attack-surface',
      section: 'Authentication and web security',
      label: { en: 'The back end also:', fr: 'Le back-end, en plus :' },
      options: [
        {
          value: 'renders-html',
          label: {
            en: 'Renders HTML or emails that contain user content',
            fr: 'Produit du HTML ou des e-mails contenant du contenu utilisateur',
          },
        },
        {
          value: 'fetches-urls',
          label: {
            en: 'Fetches URLs given by users (webhooks, imports, previews)',
            fr: 'Appelle des URL fournies par les utilisateurs (webhooks, imports, aperçus)',
          },
        },
        {
          value: 'uploads',
          label: { en: 'Accepts file uploads', fr: 'Accepte des envois de fichiers' },
        },
        {
          value: 'runs-commands',
          label: {
            en: 'Runs commands or opens paths built from input',
            fr: 'Lance des commandes ou ouvre des chemins construits à partir d’entrées',
          },
        },
        {
          value: 'none',
          label: { en: 'None of these', fr: 'Rien de tout cela' },
          exclusive: true,
        },
      ],
      required: false,
      fragments: [
        {
          when: { includes: 'renders-html' },
          text: 'Escape user content by default wherever it reaches HTML or an email, through the template engine’s auto-escaping; never build markup by string concatenation, and never mark user content as safe.',
        },
        {
          when: { includes: 'fetches-urls' },
          text: 'Before fetching a URL given by a user, allow only `http` and `https`, resolve the host and refuse private, loopback, link-local and cloud metadata addresses, do not follow redirects unchecked, and set a timeout and a size limit.',
        },
        {
          when: { includes: 'uploads' },
          text: 'For an upload, check type and size at the boundary, never trust the client’s file name or content type, store it outside the web root under a generated name, and serve it back with an explicit `Content-Type`.',
        },
        {
          when: { includes: 'runs-commands' },
          text: 'Never pass input to a shell: use `execFile` or `spawn` with an argument array and no `shell` option, and resolve any path built from input against a fixed base folder, refusing what escapes it.',
        },
        {
          when: { includes: 'none' },
          text: 'The back end renders no HTML, fetches no user-given URL, takes no upload and runs no command: when a change would start doing one of these, say so first.',
        },
      ],
    },
    {
      id: 'be-http-caching',
      type: 'scale',
      slot: 'api.http-caching',
      section: 'HTTP and caching',
      label: {
        en: 'GET responses state how they may be cached (`Cache-Control`, `ETag`).',
        fr: 'Les réponses aux GET disent comment elles peuvent être mises en cache (`Cache-Control`, `ETag`).',
      },
      required: false,
      fragments: [
        {
          when: { scaleAtLeast: 4 },
          text: 'Set `Cache-Control` on every GET response: `public, max-age` only when the answer is the same for every caller, `private` or `no-store` for anything tied to a user or a token, and an `ETag` answered with 304 where clients revalidate.',
        },
        {
          when: { scaleAtMost: 2 },
          text: 'Do not add caching headers or ETags unasked: responses are not meant to be cached by clients or by a CDN.',
        },
      ],
    },
    {
      id: 'be-cache-store',
      type: 'single',
      slot: 'backend.cache-store',
      section: 'HTTP and caching',
      label: {
        en: 'On the server, computed or fetched data is cached in:',
        fr: 'Côté serveur, les données calculées ou récupérées sont mises en cache dans :',
      },
      options: [
        {
          value: 'shared',
          label: {
            en: 'A shared cache (Redis, Memcached…)',
            fr: 'Un cache partagé (Redis, Memcached…)',
          },
        },
        {
          value: 'memory',
          label: { en: 'The memory of each process', fr: 'La mémoire de chaque processus' },
        },
        { value: 'none', label: { en: 'Nothing', fr: 'Rien' } },
      ],
      required: false,
      fragments: [
        {
          when: { equals: 'shared' },
          text: 'Cache through the project’s cache helper on the shared store: a namespaced key that includes everything the value depends on (tenant, user, locale, version), a TTL on every entry, and a working path when the cache is down.',
        },
        {
          when: { equals: 'memory' },
          text: 'Cache in process memory only small, nearly static data, with a size bound and a TTL: each instance has its own copy, so never cache there what must be the same on every instance.',
        },
        {
          when: { equals: 'none' },
          text: 'There is no server-side cache: do not add one unasked; fix the slow query or call first, and propose a cache together with its invalidation rule.',
        },
      ],
    },
    {
      id: 'be-cache-invalidation',
      type: 'single',
      slot: 'backend.cache-invalidation',
      section: 'HTTP and caching',
      label: {
        en: 'A cached value is refreshed by:',
        fr: 'Une valeur en cache est rafraîchie par :',
      },
      options: [
        {
          value: 'ttl',
          label: { en: 'Expiry only (TTL)', fr: 'L’expiration seulement (TTL)' },
        },
        {
          value: 'purge',
          label: {
            en: 'Deleting the key when the data is written',
            fr: 'La suppression de la clé à l’écriture de la donnée',
          },
        },
        {
          value: 'versioned',
          label: { en: 'A version in the key', fr: 'Une version dans la clé' },
        },
      ],
      required: false,
      fragments: [
        {
          when: { equals: 'ttl' },
          text: 'Cached values expire by TTL only: choose the TTL from how stale the value may be, add 10 to 20 % of random jitter so that keys do not expire together, and never cache what must be exact (permissions, balances).',
        },
        {
          when: { equals: 'purge' },
          text: 'Delete the cache key in the code path that writes the data, after the write is committed, and keep a TTL as a safety net; a new cached read comes with the list of writes that purge it.',
        },
        {
          when: { equals: 'versioned' },
          text: 'Put the data’s version in the cache key and bump it on write, so that stale entries are never read and simply expire; keep a TTL on every entry.',
        },
        {
          when: { answered: true },
          text: 'When a hot key is missing, let one caller recompute it while the others wait or get the stale value; never let every request recompute it at once.',
        },
      ],
    },
    {
      id: 'be-container-image',
      type: 'single',
      slot: 'backend.container-image',
      section: 'Runtime and operations',
      label: {
        en: 'The service is built into a container image:',
        fr: 'Le service est construit en image de conteneur :',
      },
      options: [
        {
          value: 'dockerfile',
          label: {
            en: 'From a Dockerfile in this repository',
            fr: 'À partir d’un Dockerfile de ce dépôt',
          },
        },
        {
          value: 'none',
          label: {
            en: 'No: the platform builds or runs it',
            fr: 'Non : la plateforme le construit ou l’exécute',
          },
        },
      ],
      required: false,
      fragments: [
        {
          when: { equals: 'dockerfile' },
          text: 'Keep the Dockerfile multi-stage, on a base image pinned to an exact version: install from the lockfile, copy only the build output and production dependencies into the last stage, run as a non-root user, and keep secrets out of every layer.',
        },
        {
          when: { equals: 'dockerfile' },
          text: 'Run one process per container, and do not let Node.js be PID 1 without an init process (`--init`, tini): it must receive `SIGTERM` and reap child processes.',
        },
        {
          when: { equals: 'none' },
          text: 'No container image is built here: do not add a Dockerfile or a Compose file unasked.',
        },
      ],
    },
    {
      id: 'be-configuration',
      type: 'scale',
      slot: 'backend.configuration',
      section: 'Runtime and operations',
      label: {
        en: 'All configuration comes from environment variables, validated at startup.',
        fr: 'Toute la configuration vient de variables d’environnement, validées au démarrage.',
      },
      required: false,
      fragments: [
        {
          when: { scaleAtLeast: 4 },
          text: 'Read configuration from environment variables only, through the one module that validates them at startup; never read `process.env` elsewhere, never hard-code a URL, a port or a credential, and add each new variable to the example env file.',
        },
        {
          when: { scaleAtMost: 2 },
          text: 'Configuration lives in the project’s configuration files: follow them, and do not move settings to environment variables unasked.',
        },
      ],
    },
    {
      id: 'be-graceful-shutdown',
      type: 'scale',
      slot: 'backend.graceful-shutdown',
      section: 'Runtime and operations',
      label: {
        en: 'On `SIGTERM`, the process finishes what is in flight before it exits.',
        fr: 'Sur `SIGTERM`, le processus termine ce qui est en cours avant de s’arrêter.',
      },
      required: false,
      fragments: [
        {
          when: { scaleAtLeast: 4 },
          text: 'Keep shutdown clean: on `SIGTERM`, stop accepting connections, finish in-flight requests and jobs within the grace period, then close pools and exit; register every new long-lived resource (server, worker, timer, connection) in that shutdown path.',
        },
        {
          when: { scaleAtMost: 2 },
          text: 'Do not add signal handling: the process may be stopped at any time, so keep every operation safe to interrupt and to run again.',
        },
      ],
    },
    {
      id: 'be-service-shape',
      type: 'single',
      slot: 'backend.service-shape',
      section: 'Architecture',
      label: { en: 'The back end is:', fr: 'Le back-end est :' },
      options: [
        {
          value: 'monolith',
          label: {
            en: 'One application (a modular monolith)',
            fr: 'Une seule application (un monolithe modulaire)',
          },
        },
        {
          value: 'microservices',
          label: {
            en: 'Several services, each with its own data',
            fr: 'Plusieurs services, chacun avec ses données',
          },
        },
        {
          value: 'serverless',
          label: {
            en: 'Functions run on demand (serverless)',
            fr: 'Des fonctions exécutées à la demande (serverless)',
          },
        },
      ],
      required: false,
      fragments: [
        {
          when: { equals: 'monolith' },
          text: 'The back end is one modular monolith: add code to the module that owns the domain, call another module only through its public interface, and never propose a new service or a message bus for what a function call does.',
        },
        {
          when: { equals: 'microservices' },
          text: 'Each service owns its data: never read or write another service’s tables, go through its API or its events, treat every such call as able to fail or time out, and do not add a new service unasked.',
        },
        {
          when: { equals: 'serverless' },
          text: 'Code runs as short-lived functions: keep startup light, create clients outside the handler, hold no state in memory between invocations, and hand to a queue any work that may pass the time limit.',
        },
      ],
    },
    {
      id: 'be-stateless',
      type: 'scale',
      slot: 'backend.stateless',
      section: 'Architecture',
      label: {
        en: 'A process keeps nothing in memory or on its disk that another instance would need.',
        fr: 'Un processus ne garde rien en mémoire ni sur son disque dont une autre instance aurait besoin.',
      },
      required: false,
      fragments: [
        {
          when: { scaleAtLeast: 4 },
          text: 'Keep processes stateless: no session, counter, lock, scheduled timer or uploaded file in process memory or on the local disk that another instance would need; put shared state in the database, the shared cache or object storage.',
        },
        {
          when: { scaleAtMost: 2 },
          text: 'A single instance runs, so state in process memory is acceptable; mark it with a comment so that it can be moved when a second instance is added.',
        },
      ],
    },
    {
      id: 'be-background-jobs',
      type: 'single',
      slot: 'backend.background-jobs',
      section: 'Runtime and operations',
      label: {
        en: 'Work that does not fit in a request runs on:',
        fr: 'Le travail qui ne tient pas dans une requête passe par :',
      },
      options: [
        {
          value: 'job-queue',
          label: {
            en: 'A job queue (BullMQ, pg-boss…)',
            fr: 'Une file de tâches (BullMQ, pg-boss…)',
          },
        },
        {
          value: 'broker',
          label: {
            en: 'A message broker (RabbitMQ, SQS…)',
            fr: 'Un broker de messages (RabbitMQ, SQS…)',
          },
        },
        {
          value: 'event-log',
          label: { en: 'An event log (Kafka…)', fr: 'Un journal d’événements (Kafka…)' },
        },
        {
          value: 'none',
          label: {
            en: 'Nothing: everything runs in the request',
            fr: 'Rien : tout s’exécute dans la requête',
          },
        },
        { value: 'other', label: { en: 'Something else', fr: 'Autre chose' }, freeText: true },
      ],
      required: false,
      fragments: [
        {
          when: { equals: 'job-queue' },
          text: 'Slow work runs on the job queue: enqueue from the request with a small payload of ids, make each handler safe to run twice, set a number of attempts with backoff, and never do slow work in the request itself.',
        },
        {
          when: { equals: 'broker' },
          text: 'Work goes through the message broker: acknowledge a message only after its work is committed, make every consumer safe to run twice, and send repeated failures to a dead-letter queue instead of requeueing forever.',
        },
        {
          when: { equals: 'event-log' },
          text: 'Events go through a partitioned log: pick the key whose events must stay ordered, since order holds within a partition only, make consumers safe to replay, and change an event’s schema by adding fields only.',
        },
        {
          when: { equals: 'none' },
          text: 'There is no queue: do not add a broker or a job library unasked; keep work in the request short, and say when a change needs work that cannot fit in it.',
        },
        {
          when: { other: true },
          text: 'Work outside the request runs on {value}: follow the existing producers and consumers, and make every handler safe to run twice.',
        },
      ],
    },
    {
      id: 'be-realtime',
      type: 'single',
      slot: 'backend.realtime',
      section: 'Runtime and operations',
      label: {
        en: 'Updates are pushed to clients with:',
        fr: 'Les mises à jour sont poussées aux clients par :',
      },
      options: [
        { value: 'sse', label: { en: 'Server-Sent Events', fr: 'Server-Sent Events' } },
        { value: 'websockets', label: { en: 'WebSockets', fr: 'WebSockets' } },
        {
          value: 'polling',
          label: { en: 'Polling by the client', fr: 'Une interrogation régulière par le client' },
        },
        {
          value: 'none',
          label: {
            en: 'Nothing: there is no live update',
            fr: 'Rien : pas de mise à jour en direct',
          },
        },
      ],
      required: false,
      fragments: [
        {
          when: { equals: 'sse' },
          text: 'Push updates with Server-Sent Events: send an `id` with each event so that a client resumes with `Last-Event-ID`, send a heartbeat comment, free the listener when the connection closes, and do not add WebSockets for a one-way stream.',
        },
        {
          when: { equals: 'websockets' },
          text: 'Push updates over the existing WebSocket layer: authenticate at the handshake, validate every incoming message, free listeners on close, and publish through the shared channel, not process memory, so that every instance reaches its clients.',
        },
        {
          when: { equals: 'polling' },
          text: 'Clients poll for updates: keep the polled endpoint cheap (an ETag and 304, or a `since` parameter), and do not add Server-Sent Events or WebSockets unasked.',
        },
        {
          when: { equals: 'none' },
          text: 'There is no live update channel: do not add Server-Sent Events, WebSockets or polling unasked.',
        },
      ],
    },
    {
      id: 'be-webhooks',
      type: 'multi',
      slot: 'api.webhooks',
      section: 'API',
      label: { en: 'Webhooks: the back end', fr: 'Webhooks : le back-end' },
      options: [
        {
          value: 'sends',
          label: { en: 'Sends some to its users', fr: 'En envoie à ses utilisateurs' },
        },
        {
          value: 'receives',
          label: {
            en: 'Receives some from other services',
            fr: 'En reçoit d’autres services',
          },
        },
        {
          value: 'none',
          label: { en: 'Neither sends nor receives any', fr: 'N’en envoie ni n’en reçoit' },
          exclusive: true,
        },
      ],
      required: false,
      fragments: [
        {
          when: { includes: 'sends' },
          text: 'Send a webhook from a background job, never inside the request: sign the payload, retry with backoff, and include an event id so that the receiver can ignore a duplicate.',
        },
        {
          when: { includes: 'receives' },
          text: 'On an incoming webhook, verify the signature over the raw body before parsing it, answer 2xx fast and do the work in a job, and ignore an event id that was already handled.',
        },
        {
          when: { includes: 'none' },
          text: 'The back end neither sends nor receives webhooks: do not add any unasked.',
        },
      ],
    },
    {
      id: 'be-rate-limiting',
      type: 'single',
      slot: 'api.rate-limiting',
      section: 'Authentication and web security',
      label: { en: 'Request rates are limited:', fr: 'Le débit des requêtes est limité :' },
      options: [
        {
          value: 'app',
          label: {
            en: 'In the application, with a shared counter',
            fr: 'Dans l’application, avec un compteur partagé',
          },
        },
        {
          value: 'proxy',
          label: {
            en: 'At the reverse proxy or the API gateway',
            fr: 'Au niveau du reverse proxy ou de la passerelle d’API',
          },
        },
        { value: 'none', label: { en: 'Nowhere', fr: 'Nulle part' } },
      ],
      required: false,
      fragments: [
        {
          when: { equals: 'app' },
          text: 'Rate limits live in the application, with counters in the shared store, never in process memory: put every new public or costly route (sign-in, password reset, search, export) behind the limiter, keyed by account or by IP, and answer 429 with `Retry-After`.',
        },
        {
          when: { equals: 'proxy' },
          text: 'Rate limits are set at the reverse proxy or the gateway: do not add a limiter in application code; say when a new route is costly or sensitive enough to need its own limit there.',
        },
        {
          when: { equals: 'none' },
          text: 'No rate limit exists: do not add a limiter unasked, but say when a new route (sign-in, password reset, costly query) is open to abuse without one.',
        },
      ],
    },
    {
      id: 'be-load-protections',
      type: 'multi',
      slot: 'backend.load-protections',
      section: 'Runtime and operations',
      label: {
        en: 'Under load, or when a dependency fails, the code:',
        fr: 'Sous la charge, ou quand une dépendance tombe, le code :',
      },
      options: [
        {
          value: 'retries',
          label: {
            en: 'Retries with backoff, idempotent calls only',
            fr: 'Relance avec un délai croissant, les appels idempotents seulement',
          },
        },
        {
          value: 'circuit-breaker',
          label: {
            en: 'Cuts calls to a failing dependency (circuit breaker)',
            fr: 'Coupe les appels vers une dépendance en échec (circuit breaker)',
          },
        },
        {
          value: 'bounded',
          label: {
            en: 'Bounds queues and concurrency, and refuses the rest',
            fr: 'Borne les files et la concurrence, et refuse le reste',
          },
        },
        {
          value: 'degraded',
          label: {
            en: 'Serves a degraded answer rather than an error',
            fr: 'Sert une réponse dégradée plutôt qu’une erreur',
          },
        },
      ],
      required: false,
      fragments: [
        {
          when: { includes: 'retries' },
          text: 'Retry a failed call to a dependency only when it is idempotent, with exponential backoff, jitter and a small cap on attempts; honor `Retry-After`, and never retry a 4xx other than 429.',
        },
        {
          when: { includes: 'circuit-breaker' },
          text: 'Call unreliable dependencies through the project’s circuit breaker, with a short timeout, so that a slow dependency fails fast instead of holding connections; do not write a second breaker.',
        },
        {
          when: { includes: 'bounded' },
          text: 'Bound everything that can pile up: a maximum length on queues and buffers, a concurrency limit on parallel work (no unbounded `Promise.all` over input-sized lists), a request body limit, and a 429 or 503 with `Retry-After` when full.',
        },
        {
          when: { includes: 'degraded' },
          text: 'When a secondary dependency fails, keep the main path working: serve the cached or partial answer and mark it as such, and never let an optional feature fail the whole request.',
        },
      ],
    },
    {
      id: 'be-performance-work',
      type: 'scale',
      slot: 'backend.performance-work',
      section: 'Working style',
      label: {
        en: 'A performance change starts from a measurement, never from intuition.',
        fr: 'Un changement de performance part d’une mesure, jamais d’une intuition.',
      },
      required: false,
      fragments: [
        {
          when: { scaleAtLeast: 4 },
          text: 'Do not optimise by intuition: measure first (CPU profile, event loop lag, query plan, p99 latency rather than the average), change one thing, and report the numbers before and after.',
        },
        {
          when: { scaleAtMost: 2 },
          text: 'Write the faster version directly when the cost is obvious; a measurement is only needed before a change that makes the code harder to read.',
        },
      ],
    },
    {
      id: 'be-database-tests',
      type: 'single',
      slot: 'backend.database-tests',
      section: 'Testing',
      label: {
        en: 'Tests that touch the database run against:',
        fr: 'Les tests qui touchent la base de données tournent sur :',
      },
      options: [
        {
          value: 'real',
          label: {
            en: 'A real database (container or test instance)',
            fr: 'Une vraie base (conteneur ou instance de test)',
          },
        },
        {
          value: 'substitute',
          label: {
            en: 'An in-memory substitute (SQLite, pg-mem…)',
            fr: 'Un substitut en mémoire (SQLite, pg-mem…)',
          },
        },
        {
          value: 'mocks',
          label: { en: 'Mocks of the data layer', fr: 'Des mocks de la couche de données' },
        },
      ],
      required: false,
      fragments: [
        {
          when: { equals: 'real' },
          text: 'Test database code against the real test database, never a mock: run the migrations, isolate each test (transaction rollback or truncation), and create the rows a test needs in the test itself.',
        },
        {
          when: { equals: 'substitute' },
          text: 'Tests run on an in-memory substitute of the database: keep queries within what it supports, and say when a query uses a feature only the real database has, since the tests cannot prove it.',
        },
        {
          when: { equals: 'mocks' },
          text: 'Tests mock the data layer: mock at the repository or service boundary, never the driver, and say that SQL and migrations are not covered when a change touches them.',
        },
      ],
    },
    {
      id: 'be-endpoint-tests',
      type: 'scale',
      slot: 'backend.endpoint-tests',
      section: 'Testing',
      label: {
        en: 'Every new endpoint comes with a test that calls it over HTTP.',
        fr: 'Chaque nouvel endpoint arrive avec un test qui l’appelle en HTTP.',
      },
      required: false,
      fragments: [
        {
          when: { scaleAtLeast: 4 },
          text: 'Give every new or changed endpoint a test that calls it over HTTP: the success case, an invalid input, a call without credentials and a call on another user’s resource, each checking the status code and the body.',
        },
        {
          when: { scaleAtMost: 2 },
          text: 'Test the services and business rules directly, in fast tests without network; do not add HTTP-level tests unasked.',
        },
      ],
    },
    {
      id: 'be-observability',
      type: 'multi',
      slot: 'backend.observability',
      section: 'Runtime and operations',
      label: { en: 'The service emits:', fr: 'Le service émet :' },
      options: [
        { value: 'metrics', label: { en: 'Metrics', fr: 'Des métriques' } },
        {
          value: 'traces',
          label: { en: 'Traces (OpenTelemetry…)', fr: 'Des traces (OpenTelemetry…)' },
        },
        {
          value: 'correlation',
          label: {
            en: 'A request or trace id in every log line',
            fr: 'Un identifiant de requête ou de trace dans chaque ligne de log',
          },
        },
        {
          value: 'health',
          label: {
            en: 'Health endpoints for the platform',
            fr: 'Des endpoints de santé pour la plateforme',
          },
        },
        {
          value: 'none',
          label: { en: 'None of these', fr: 'Rien de tout cela' },
          exclusive: true,
        },
      ],
      required: false,
      fragments: [
        {
          when: { includes: 'metrics' },
          text: 'Instrument new endpoints, jobs and outbound calls with the existing metrics helpers (count, errors, duration as a histogram), and keep label values few and bounded: never a user id, an email or a raw URL as a label.',
        },
        {
          when: { includes: 'traces' },
          text: 'Let the existing tracing setup create spans: add one only around a significant unit of work, pass the context through queues and outbound calls, and never put a secret or personal data in an attribute.',
        },
        {
          when: { includes: 'correlation' },
          text: 'Carry the request or trace id through every log line, job payload and outbound call of a request, with the existing context helper rather than a parameter threaded by hand.',
        },
        {
          when: { includes: 'health' },
          text: 'Keep the liveness endpoint free of dependencies and let the readiness endpoint check the ones a request needs: wire any new required dependency into readiness, and keep both cheap and unauthenticated.',
        },
        {
          when: { includes: 'none' },
          text: 'The service has no metrics, traces or health endpoints: do not add an observability library unasked.',
        },
      ],
    },
    {
      id: 'be-model-calls',
      type: 'single',
      slot: 'backend.model-calls',
      section: 'Runtime and operations',
      label: {
        en: 'A call to a language model from the back end runs:',
        fr: 'Un appel à un modèle de langage depuis le back-end s’exécute :',
      },
      options: [
        {
          value: 'job',
          label: {
            en: 'In a background job; the client is told when it is done',
            fr: 'Dans une tâche de fond ; le client est prévenu quand c’est fini',
          },
        },
        {
          value: 'stream',
          label: {
            en: 'In the request, streamed to the client',
            fr: 'Dans la requête, en flux vers le client',
          },
        },
        {
          value: 'sync',
          label: {
            en: 'In the request, the client waits for the whole answer',
            fr: 'Dans la requête, le client attend la réponse entière',
          },
        },
        {
          value: 'none',
          label: {
            en: 'Nowhere: the back end calls no model',
            fr: 'Nulle part : le back-end n’appelle aucun modèle',
          },
        },
      ],
      required: false,
      fragments: [
        {
          when: { equals: 'job' },
          text: 'Call the model from a background job, never in a request handler: the request stores the task and answers at once, and the job saves the result and can be retried without repeating a side effect.',
        },
        {
          when: { equals: 'stream' },
          text: 'Call the model in the request and stream the answer to the client as it arrives: stop the provider call when the client disconnects, and save what must be kept only once the stream has ended.',
        },
        {
          when: { equals: 'sync' },
          text: 'The model is called in the request and the client waits: set a strict timeout and a small output limit, keep the call out of any database transaction, and say when a call may last long enough to need a job.',
        },
        {
          when: { equals: 'none' },
          text: 'The back end calls no language model: do not add a provider SDK or a model call unasked.',
        },
      ],
    },
    {
      id: 'be-model-call-guards',
      type: 'multi',
      slot: 'backend.model-call-guards',
      section: 'Runtime and operations',
      label: {
        en: 'Around every call to a model, the code:',
        fr: 'Autour de chaque appel à un modèle, le code :',
      },
      options: [
        {
          value: 'single-client',
          label: {
            en: 'Goes through one client module, on the server',
            fr: 'Passe par un seul module client, côté serveur',
          },
        },
        {
          value: 'timeouts',
          label: {
            en: 'Sets a timeout, capped retries and a fallback',
            fr: 'Pose un délai maximal, des relances plafonnées et un repli',
          },
        },
        {
          value: 'usage',
          label: {
            en: 'Bounds and records token usage',
            fr: 'Borne et enregistre la consommation de tokens',
          },
        },
        {
          value: 'untrusted-output',
          label: {
            en: 'Treats the answer as untrusted input',
            fr: 'Traite la réponse comme une entrée non fiable',
          },
        },
      ],
      required: false,
      fragments: [
        {
          when: { includes: 'single-client' },
          text: 'Call the model provider through the project’s one client module, on the server only, with the key read from configuration: never call the provider from a handler directly, and never send the key to a client.',
        },
        {
          when: { includes: 'timeouts' },
          text: 'Treat the model provider as a slow dependency that fails: a timeout on every call, retries with backoff on rate limits and 5xx only, capped, and a fallback or a clear error for the user.',
        },
        {
          when: { includes: 'usage' },
          text: 'Cap the output tokens and the size of the context on every model call, record token usage per account or feature, reuse a cached answer for an identical request, and check the account’s limit before calling.',
        },
        {
          when: { includes: 'untrusted-output' },
          text: 'Treat a model’s answer as untrusted input: validate it against a schema before using it, never run a query, a command or a paid or destructive action from it without a server-side permission check, and escape it before display.',
        },
      ],
    },
  ],
} satisfies Questionnaire
