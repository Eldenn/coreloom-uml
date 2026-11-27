import type { RulePack } from '../schemas.ts'

/**
 * Back end: Node.js API: ready-made rules, one group per slot. Never reuse a removed rule id within
 * its slot, and bump `CATALOG_VERSION` on any change to a rule, a label or a line.
 */
export const backendNode: RulePack = {
  id: 'backend-node',
  title: {
    en: 'Back end: Node.js API',
    fr: 'Back : API Node.js',
  },
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
  groups: [
    {
      slot: 'api.style',
      section: 'API',
      label: {
        en: 'The API is:',
        fr: "L'API est :",
      },
      pick: 'one',
      rules: [
        {
          id: 'rest',
          label: {
            en: 'REST',
            fr: 'REST',
          },
          lines: [
            'The API is REST: model resources with plural nouns, use HTTP methods and status codes for what they mean, and keep the error body shape the same everywhere.',
          ],
        },
        {
          id: 'graphql',
          label: {
            en: 'GraphQL',
            fr: 'GraphQL',
          },
          lines: [
            'The API is GraphQL: extend the existing schema and resolvers; do not add REST endpoints next to it.',
          ],
        },
        {
          id: 'rpc',
          label: {
            en: 'RPC (tRPC, gRPC…)',
            fr: 'RPC (tRPC, gRPC…)',
          },
          lines: [
            'The API is RPC: add a typed procedure next to the existing ones; do not add REST endpoints next to it.',
          ],
        },
        {
          id: 'other',
          label: {
            en: 'Something else',
            fr: 'Autre chose',
          },
          input: true,
          lines: [
            'The API style is {value}; follow the existing endpoints and do not introduce another style.',
          ],
        },
      ],
    },
    {
      slot: 'api.compatibility',
      section: 'API',
      label: {
        en: 'A released endpoint never changes shape: a breaking change means a new version.',
        fr: 'Un endpoint publié ne change jamais de forme : un changement cassant passe par une nouvelle version.',
      },
      pick: 'one',
      rules: [
        {
          id: 'agree',
          lines: [
            'Never rename, remove or retype a field of an existing endpoint; add an optional field or a new version instead.',
          ],
        },
        {
          id: 'disagree',
          lines: ['An endpoint may change shape when every caller is updated in the same change.'],
        },
      ],
    },
    {
      slot: 'api.validation',
      section: 'API',
      label: {
        en: 'Request inputs are validated at the boundary with:',
        fr: 'Les entrées des requêtes sont validées à la frontière avec :',
      },
      pick: 'one',
      rules: [
        {
          id: 'zod',
          label: {
            en: 'Zod',
            fr: 'Zod',
          },
          lines: [],
        },
        {
          id: 'vinejs',
          label: {
            en: 'VineJS',
            fr: 'VineJS',
          },
          lines: [],
        },
        {
          id: 'valibot',
          label: {
            en: 'Valibot',
            fr: 'Valibot',
          },
          lines: [],
        },
        {
          id: 'joi',
          label: {
            en: 'Joi',
            fr: 'Joi',
          },
          lines: [],
        },
        {
          id: 'class-validator',
          label: {
            en: 'class-validator',
            fr: 'class-validator',
          },
          lines: [],
        },
        {
          id: 'other',
          label: {
            en: 'Something else',
            fr: 'Autre chose',
          },
          input: true,
          lines: [],
        },
      ],
      lines: [
        'Validate every request body, query and parameter at the boundary with {value} before using it; past the boundary, rely on the validated types instead of checking again.',
      ],
    },
    {
      slot: 'errors.handling',
      section: 'Errors and logging',
      label: {
        en: 'Errors are handled:',
        fr: 'Les erreurs sont gérées :',
      },
      pick: 'one',
      rules: [
        {
          id: 'central-handler',
          label: {
            en: 'By throwing typed errors that one central handler turns into responses',
            fr: 'En levant des erreurs typées qu’un gestionnaire central transforme en réponses',
          },
          lines: [
            'Throw the project’s typed errors and let the central error handler build the response; do not catch an error only to answer from a route handler.',
          ],
        },
        {
          id: 'result-values',
          label: {
            en: 'By returning result values, without throwing',
            fr: 'En retournant des valeurs de résultat, sans lever d’exception',
          },
          lines: [
            'Return expected failures as result values and handle both cases at the call site; throw only for programming errors.',
          ],
        },
        {
          id: 'local',
          label: {
            en: 'In each route handler',
            fr: 'Dans chaque gestionnaire de route',
          },
          lines: [
            'Handle errors in the route handler that can answer them, with the same error body shape as the other handlers.',
          ],
        },
      ],
      lines: ['Never swallow an error: handle it, or let it propagate with its cause.'],
    },
    {
      slot: 'logging.style',
      section: 'Errors and logging',
      label: {
        en: 'The code logs with:',
        fr: 'Le code journalise avec :',
      },
      pick: 'one',
      rules: [
        {
          id: 'structured',
          label: {
            en: 'A structured logger (pino, winston…)',
            fr: 'Un logger structuré (pino, winston…)',
          },
          lines: [
            'Log through the project’s logger, with a message and structured fields; never leave a `console.log` in the code.',
          ],
        },
        {
          id: 'console',
          label: {
            en: '`console`',
            fr: '`console`',
          },
          lines: ['Log with `console`; do not add a logging library.'],
        },
      ],
    },
    {
      slot: 'logging.sensitive-data',
      section: 'Errors and logging',
      label: {
        en: 'Logs never contain secrets, tokens or personal data, even while debugging.',
        fr: 'Les logs ne contiennent jamais de secrets, de jetons ni de données personnelles, même pour déboguer.',
      },
      pick: 'one',
      rules: [
        {
          id: 'agree',
          lines: [
            'Never log secrets, tokens, passwords, request bodies or personal data, at any level; log identifiers instead.',
          ],
        },
        {
          id: 'disagree',
          lines: [
            'Request payloads may be logged at debug level in development; never log credentials or tokens.',
          ],
        },
      ],
    },
    {
      slot: 'database.access',
      section: 'Database',
      label: {
        en: 'The database is reached through:',
        fr: 'La base de données est lue et écrite avec :',
      },
      pick: 'one',
      rules: [
        {
          id: 'orm',
          label: {
            en: 'An ORM',
            fr: 'Un ORM',
          },
          lines: [
            'Read and write the database through the project’s ORM models; drop to raw SQL only when the ORM cannot express the query, and say so.',
          ],
        },
        {
          id: 'query-builder',
          label: {
            en: 'A query builder',
            fr: 'Un query builder',
          },
          lines: ['Write queries with the project’s query builder; do not add an ORM.'],
        },
        {
          id: 'raw-sql',
          label: {
            en: 'Hand-written SQL',
            fr: 'Du SQL écrit à la main',
          },
          lines: [
            'Write SQL by hand, always with bound parameters; do not add an ORM or a query builder.',
          ],
        },
      ],
      lines: ['Never build a query by concatenating values into it.'],
    },
    {
      slot: 'database.migrations',
      section: 'Database',
      label: {
        en: 'When a change needs a new table or column, the assistant:',
        fr: "Quand un changement demande une nouvelle table ou colonne, l'assistant :",
      },
      pick: 'one',
      rules: [
        {
          id: 'write',
          label: {
            en: 'Writes the migration',
            fr: 'Écrit la migration',
          },
          lines: [
            'Change the schema only through a new migration file; never edit a migration that has already run, and never run migrations against a shared database.',
          ],
        },
        {
          id: 'ask',
          label: {
            en: 'Asks me first',
            fr: 'Me demande d’abord',
          },
          lines: [
            'Ask before any schema change; once agreed, write a new migration file and never edit one that has already run.',
          ],
        },
        {
          id: 'never',
          noAutomaticSuggestion: true,
          label: {
            en: 'Never touches the schema',
            fr: 'Ne touche jamais au schéma',
          },
          lines: [
            'Do not change the database schema or write migrations; describe the change that is needed and stop.',
          ],
        },
      ],
    },
    {
      slot: 'database.layering',
      section: 'Database',
      label: {
        en: 'Database queries stay out of route handlers and controllers.',
        fr: 'Les requêtes à la base de données restent hors des gestionnaires de route et des contrôleurs.',
      },
      pick: 'one',
      rules: [
        {
          id: 'agree',
          lines: [
            'Keep database queries in services or repositories; a route handler or controller never queries the database itself.',
          ],
        },
        {
          id: 'disagree',
          lines: [
            'A route handler may query the database directly for a simple read or write; do not add a layer only to wrap one query.',
          ],
        },
      ],
    },
    {
      slot: 'backend.outbound-http',
      section: 'HTTP and caching',
      label: {
        en: 'Outbound HTTP calls are made with:',
        fr: 'Les appels HTTP sortants sont faits avec :',
      },
      pick: 'one',
      rules: [
        {
          id: 'shared-client',
          label: {
            en: 'A shared client of the project (timeouts, retries, headers)',
            fr: 'Un client partagé du projet (délais, relances, en-têtes)',
          },
          lines: [
            'Make outbound HTTP calls through the project’s shared client, which sets timeouts, keep-alive and headers; never call `fetch` or build another client next to it.',
          ],
        },
        {
          id: 'fetch',
          label: {
            en: 'The built-in `fetch`',
            fr: 'Le `fetch` natif',
          },
          lines: [
            'Make outbound HTTP calls with the built-in `fetch`, each with `AbortSignal.timeout(...)`, and check `response.ok` before reading the body; do not add an HTTP client library.',
          ],
        },
        {
          id: 'other',
          label: {
            en: 'Another library',
            fr: 'Une autre bibliothèque',
          },
          input: true,
          lines: [
            'Make outbound HTTP calls with {value}, as the existing calls do; do not add another HTTP client.',
          ],
        },
      ],
      lines: [
        'Give every outbound call an explicit timeout and reuse one client per remote host so that connections stay alive; never create a client per request.',
      ],
    },
    {
      slot: 'backend.reverse-proxy',
      section: 'HTTP and caching',
      label: {
        en: 'In production, the Node.js process is:',
        fr: 'En production, le processus Node.js est :',
      },
      pick: 'one',
      rules: [
        {
          id: 'behind-proxy',
          label: {
            en: 'Behind a reverse proxy or load balancer that ends TLS',
            fr: 'Derrière un reverse proxy ou un load balancer qui termine le TLS',
          },
          lines: [
            'A reverse proxy ends TLS in front of the app: listen on plain HTTP, read the client address and scheme through the framework’s trusted-proxy setting, never from `X-Forwarded-*` headers by hand, and leave TLS, compression and static files to the proxy.',
          ],
        },
        {
          id: 'direct',
          label: {
            en: 'Exposed directly, and ends TLS itself',
            fr: 'Exposé directement, et termine lui-même le TLS',
          },
          lines: [
            'The process is exposed directly: it ends TLS itself, redirects HTTP to HTTPS, sends `Strict-Transport-Security`, and never trusts `X-Forwarded-*` headers.',
          ],
        },
      ],
    },
    {
      slot: 'api.status-codes',
      section: 'HTTP and caching',
      label: {
        en: 'The API answers with the precise status code, never 200 or 400 for everything.',
        fr: 'L’API répond avec le code de statut précis, jamais 200 ou 400 pour tout.',
      },
      pick: 'one',
      rules: [
        {
          id: 'agree',
          lines: [
            'Answer with the precise status: 201 for a creation, 204 for an empty success, 401 when the caller is not authenticated, 403 when authenticated but not allowed, 404 for a missing resource, 409 for a conflict; never 200 with an error in the body.',
          ],
        },
        {
          id: 'disagree',
          lines: [
            'Keep to the status codes the existing endpoints already return; do not introduce a new one without asking.',
          ],
        },
      ],
    },
    {
      slot: 'api.idempotency',
      section: 'HTTP and caching',
      label: {
        en: 'A write that a client may retry is made safe by:',
        fr: 'Une écriture qu’un client peut rejouer est rendue sûre par :',
      },
      pick: 'one',
      rules: [
        {
          id: 'idempotency-key',
          label: {
            en: 'An `Idempotency-Key` header on POST',
            fr: 'Un en-tête `Idempotency-Key` sur les POST',
          },
          lines: [
            'A POST that creates or charges something accepts an `Idempotency-Key` header: store the key with the result, and answer a repeated key with the first result instead of doing the work twice.',
          ],
        },
        {
          id: 'natural',
          label: {
            en: 'Idempotent methods and unique constraints only (PUT, DELETE, upsert)',
            fr: 'Des méthodes idempotentes et des contraintes d’unicité seulement (PUT, DELETE, upsert)',
          },
          lines: [
            'Make retried writes safe by design: PUT replaces and DELETE removes, so repeating them leaves the same state; give a creation a client-chosen id or a unique constraint rather than a store of idempotency keys.',
          ],
        },
        {
          id: 'none',
          noAutomaticSuggestion: true,
          label: {
            en: 'Nothing: a retry may repeat the effect',
            fr: 'Rien : un rejeu peut répéter l’effet',
          },
          lines: [
            'Writes are not protected against retries: do not add an idempotency mechanism unasked, but say when a new POST would be harmful to repeat.',
          ],
        },
      ],
      lines: ['GET, HEAD and OPTIONS never change state: never put a write behind a GET.'],
    },
    {
      slot: 'backend.cpu-work',
      section: 'Runtime and operations',
      label: {
        en: 'CPU-heavy work (image processing, large parsing, bulk hashing) runs:',
        fr: 'Le travail lourd en CPU (traitement d’images, gros parsing, hachage en masse) tourne :',
      },
      pick: 'one',
      rules: [
        {
          id: 'worker-threads',
          label: {
            en: 'In worker threads',
            fr: 'Dans des worker threads',
          },
          lines: [
            'Run CPU-heavy work in the project’s worker threads, never on the event loop: no synchronous loop over large data, and no `*Sync` call from `fs`, `crypto` or `zlib` in a request handler.',
          ],
        },
        {
          id: 'jobs',
          label: {
            en: 'In a background job, outside the API process',
            fr: 'Dans une tâche de fond, hors du processus de l’API',
          },
          lines: [
            'Hand CPU-heavy work to a background job: the API process never runs it on the event loop, and never calls a `*Sync` function of `fs`, `crypto` or `zlib` in a request handler.',
          ],
        },
        {
          id: 'other-service',
          label: {
            en: 'In another service',
            fr: 'Dans un autre service',
          },
          lines: [
            'CPU-heavy work belongs to the service built for it: call that service from the API, and never run such work on the event loop here.',
          ],
        },
        {
          id: 'none',
          noAutomaticSuggestion: true,
          label: {
            en: 'Nowhere: the API only does I/O',
            fr: 'Nulle part : l’API ne fait que des entrées-sorties',
          },
          lines: [
            'The API only does I/O: when a change would add CPU-heavy work to a request, stop and say so instead of running it on the event loop.',
          ],
        },
      ],
    },
    {
      slot: 'backend.lockfile',
      section: 'Tooling',
      label: {
        en: 'CI and production install exactly what the committed lockfile says.',
        fr: 'La CI et la production installent exactement ce que dit le lockfile committé.',
      },
      pick: 'one',
      rules: [
        {
          id: 'agree',
          lines: [
            'Commit the lockfile with every dependency change, and install with the frozen-lockfile command (`npm ci`, `pnpm install --frozen-lockfile`) in CI and images; never delete or regenerate the lockfile to make an install pass.',
          ],
        },
        {
          id: 'disagree',
          lines: [
            'The lockfile may be regenerated when an install fails; say so, and list the versions that moved.',
          ],
        },
      ],
    },
    {
      slot: 'backend.module-system',
      section: 'Tooling',
      label: {
        en: 'The code runs as:',
        fr: 'Le code s’exécute en :',
      },
      pick: 'one',
      rules: [
        {
          id: 'esm',
          label: {
            en: 'ES modules',
            fr: 'Modules ES',
          },
          lines: [
            'The code runs as ES modules: use `import` and `export`, and `import.meta` in place of `__dirname`; never add `require` or `module.exports`.',
          ],
        },
        {
          id: 'commonjs',
          label: {
            en: 'CommonJS',
            fr: 'CommonJS',
          },
          lines: [
            'The code runs as CommonJS: keep the existing import style, load an ESM-only package with a dynamic `import()`, do not use top-level `await`, and do not convert the project to ES modules unasked.',
          ],
        },
      ],
    },
    {
      slot: 'database.transactions',
      section: 'Database',
      label: {
        en: 'A write that touches several rows or tables always runs in one transaction.',
        fr: 'Une écriture qui touche plusieurs lignes ou tables passe toujours par une seule transaction.',
      },
      pick: 'one',
      rules: [
        {
          id: 'agree',
          lines: [
            'Wrap every operation that writes more than one row or table in one transaction, through the project’s transaction helper; keep it short, and never await an HTTP call or any other slow outside call inside it.',
          ],
        },
        {
          id: 'disagree',
          lines: [
            'Use a transaction only where a partial write would leave wrong data; do not wrap single statements or reads.',
          ],
        },
      ],
    },
    {
      slot: 'database.concurrent-writes',
      section: 'Database',
      label: {
        en: 'When two requests may change the same row (stock, balance, quota), the code uses:',
        fr: 'Quand deux requêtes peuvent modifier la même ligne (stock, solde, quota), le code utilise :',
      },
      pick: 'one',
      rules: [
        {
          id: 'atomic-update',
          label: {
            en: 'One conditional `UPDATE` (`… WHERE available > 0`)',
            fr: 'Un seul `UPDATE` conditionnel (`… WHERE available > 0`)',
          },
          lines: [
            'Never read a value and write it back: change it in one conditional `UPDATE ... WHERE` that states the condition, and treat zero affected rows as the refusal.',
          ],
        },
        {
          id: 'row-lock',
          label: {
            en: '`SELECT … FOR UPDATE` in a transaction',
            fr: '`SELECT … FOR UPDATE` dans une transaction',
          },
          lines: [
            'Before changing a row from a value read earlier, lock it with `SELECT ... FOR UPDATE` in the same transaction; always lock rows in the same order to avoid deadlocks.',
          ],
        },
        {
          id: 'version-column',
          label: {
            en: 'A version column (optimistic locking)',
            fr: 'Une colonne de version (verrouillage optimiste)',
          },
          lines: [
            'Guard concurrent changes with the version column: update `WHERE version = <the one read>`, increment it, and answer a conflict (409) when no row was changed.',
          ],
        },
        {
          id: 'other',
          label: {
            en: 'Something else',
            fr: 'Autre chose',
          },
          input: true,
          lines: [
            'Guard concurrent changes to the same row with {value}; never read a value and write it back unguarded.',
          ],
        },
      ],
    },
    {
      slot: 'database.query-rules',
      section: 'Database',
      label: {
        en: 'In database code, the assistant always:',
        fr: 'Dans le code de base de données, l’assistant, toujours :',
      },
      pick: 'many',
      rules: [
        {
          id: 'no-n-plus-one',
          label: {
            en: 'Avoids one query per item (N+1)',
            fr: 'Évite une requête par élément (N+1)',
          },
          lines: [
            'Never query inside a loop: load related rows with a join, an eager load or one `IN (...)` query (a batching loader in GraphQL resolvers), and check the SQL that an ORM call generates.',
          ],
        },
        {
          id: 'explicit-columns',
          label: {
            en: 'Selects only the columns it needs, with a limit',
            fr: 'Ne sélectionne que les colonnes utiles, avec une limite',
          },
          lines: [
            'Select the columns the code uses, never `SELECT *` on a wide table, and bound every list query with a limit.',
          ],
        },
        {
          id: 'indexes',
          label: {
            en: 'Adds the index a new query needs',
            fr: 'Ajoute l’index dont une nouvelle requête a besoin',
          },
          lines: [
            'When a new query filters, joins or sorts on a column of a table that can grow, add the matching index in the same change, and index every foreign key; do not add an index that no query uses.',
          ],
        },
        {
          id: 'constraints',
          label: {
            en: 'Enforces integrity with constraints in the schema',
            fr: 'Garantit l’intégrité par des contraintes dans le schéma',
          },
          lines: [
            'Enforce integrity in the schema, not only in code: `NOT NULL`, unique, foreign key and check constraints; store each fact once, and denormalize only where a measurement justifies it.',
          ],
        },
        {
          id: 'online-migrations',
          label: {
            en: 'Writes migrations that run without blocking a live table',
            fr: 'Écrit des migrations qui s’exécutent sans bloquer une table en service',
          },
          lines: [
            'Write migrations that run on a live database next to the previous code: create an index with `CONCURRENTLY`, add a column as nullable then backfill in batches, and drop a column one release after the code stops using it.',
          ],
        },
      ],
    },
    {
      slot: 'database.other-stores',
      section: 'Database',
      label: {
        en: 'Besides the main database, the project stores data in:',
        fr: 'En plus de la base principale, le projet stocke des données dans :',
      },
      pick: 'many',
      rules: [
        {
          id: 'key-value',
          label: {
            en: 'A key-value store (Redis, DynamoDB…)',
            fr: 'Une base clé-valeur (Redis, DynamoDB…)',
          },
          lines: [
            'The key-value store holds data read by key only (sessions, counters, quotas): name keys with the existing prefixes, set an expiry on anything temporary, and never scan keys (`KEYS`) in application code.',
          ],
        },
        {
          id: 'document',
          label: {
            en: 'A document database (MongoDB…)',
            fr: 'Une base de documents (MongoDB…)',
          },
          lines: [
            'Model documents after the queries that read them: embed what is read together, do not spread one aggregate over collections joined by id in code, and validate a document’s shape when writing it.',
          ],
        },
        {
          id: 'search',
          label: {
            en: 'A search engine (Elasticsearch, OpenSearch…)',
            fr: 'Un moteur de recherche (Elasticsearch, OpenSearch…)',
          },
          lines: [
            'The search engine is a copy, never the source of truth: write to the main database first, update the index from a job or an event, and keep reindexing from the database possible.',
          ],
        },
        {
          id: 'time-series',
          label: {
            en: 'A time series database (TimescaleDB, InfluxDB…)',
            fr: 'Une base de séries temporelles (TimescaleDB, InfluxDB…)',
          },
          lines: [
            'Timestamped measurements go to the time series store: append, never update in place, always query with a time range, and rely on its retention rules to delete old data.',
          ],
        },
        {
          id: 'analytics',
          label: {
            en: 'An analytical database (ClickHouse…)',
            fr: 'Une base analytique (ClickHouse…)',
          },
          lines: [
            'Aggregates over large volumes run on the analytical database, fed by batches of inserts: never run such a query on the transactional database from a request, and never write single rows or transactions to the analytical one.',
          ],
        },
        {
          id: 'none',
          noAutomaticSuggestion: true,
          label: {
            en: 'Nothing else',
            fr: 'Rien d’autre',
          },
          alone: true,
          lines: [
            'The main database is the only store: do not introduce another database, a cache or a search engine unasked; first show the access pattern that the main database cannot serve.',
          ],
        },
      ],
    },
    {
      slot: 'database.json-columns',
      section: 'Database',
      label: {
        en: 'I prefer typed columns and tables to JSON columns.',
        fr: 'Je préfère des colonnes et des tables typées à des colonnes JSON.',
      },
      pick: 'one',
      rules: [
        {
          id: 'agree',
          lines: [
            'Model data with typed columns and tables; use a JSON column only for data that is stored and returned whole, never filtered, joined or constrained.',
          ],
        },
        {
          id: 'disagree',
          lines: [
            'A JSON column is fine for data whose shape varies; validate its shape with a schema when writing it, and index the keys that are queried.',
          ],
        },
      ],
    },
    {
      slot: 'database.read-replicas',
      section: 'Database',
      label: {
        en: 'Reads go to:',
        fr: 'Les lectures vont sur :',
      },
      pick: 'one',
      rules: [
        {
          id: 'primary',
          noAutomaticSuggestion: true,
          label: {
            en: 'The primary only',
            fr: 'Le primaire seulement',
          },
          lines: [
            'There is one database connection for reads and writes: do not add read/write splitting unasked.',
          ],
        },
        {
          id: 'replicas',
          label: {
            en: 'Read replicas, when a little lag is acceptable',
            fr: 'Des réplicas de lecture, quand un léger retard est acceptable',
          },
          lines: [
            'Send only reads that tolerate lag to the read replica connection; read from the primary inside a transaction and right after a write, so that a user always sees what they just changed.',
          ],
        },
      ],
    },
    {
      slot: 'database.table-splitting',
      section: 'Database',
      label: {
        en: 'Large tables are:',
        fr: 'Les grosses tables sont :',
      },
      pick: 'one',
      rules: [
        {
          id: 'none',
          noAutomaticSuggestion: true,
          label: {
            en: 'Neither partitioned nor sharded',
            fr: 'Ni partitionnées ni shardées',
          },
          lines: [
            'Tables are neither partitioned nor sharded: do not introduce either unasked; propose it with the table size and the query that needs it.',
          ],
        },
        {
          id: 'partitioned',
          label: {
            en: 'Partitioned (by date, by tenant…)',
            fr: 'Partitionnées (par date, par client…)',
          },
          lines: [
            'Some tables are partitioned: always filter on the partition key so that only the needed partitions are read, and remove old data by dropping a partition, never with a bulk `DELETE`.',
          ],
        },
        {
          id: 'sharded',
          label: {
            en: 'Sharded across several databases',
            fr: 'Shardées sur plusieurs bases',
          },
          lines: [
            'Data is sharded: every query carries the shard key, no join or transaction crosses shards, a row’s shard key never changes, and a new table states its shard key before any code is written.',
          ],
        },
      ],
    },
    {
      slot: 'database.connections',
      section: 'Database',
      label: {
        en: 'Every query goes through one shared connection pool.',
        fr: 'Chaque requête SQL passe par un seul pool de connexions partagé.',
      },
      pick: 'one',
      rules: [
        {
          id: 'agree',
          lines: [
            'Take database connections from the shared pool only and release them on every path (`finally`, or the ORM’s own handling); never open a connection per request, hold one across a slow call, or raise the pool size to hide a slow query.',
          ],
        },
        {
          id: 'disagree',
          noAutomaticSuggestion: true,
          lines: [
            'Connection handling is left to the platform (serverless driver, external pooler): do not add a pool or change connection settings unasked.',
          ],
        },
      ],
    },
    {
      slot: 'api.pagination',
      section: 'API',
      label: {
        en: 'List endpoints are paginated with:',
        fr: 'Les endpoints de liste sont paginés avec :',
      },
      pick: 'one',
      rules: [
        {
          id: 'offset',
          label: {
            en: 'A page number and a page size',
            fr: 'Un numéro de page et une taille de page',
          },
          lines: [
            'Paginate every list endpoint with a page number and a page size, with a default and a maximum page size, a stable sort order, and the same response envelope as the existing lists.',
          ],
        },
        {
          id: 'cursor',
          label: {
            en: 'A cursor (keyset)',
            fr: 'Un curseur (keyset)',
          },
          lines: [
            'Paginate every list endpoint with an opaque cursor over a unique, indexed sort key (keyset), with a maximum page size; never use `OFFSET` on a table that grows.',
          ],
        },
        {
          id: 'none',
          noAutomaticSuggestion: true,
          label: {
            en: 'Nothing: lists are returned whole',
            fr: 'Rien : les listes sont renvoyées entières',
          },
          lines: [
            'Lists are returned whole: do not add pagination unasked, but say when a new list has no upper bound.',
          ],
        },
      ],
    },
    {
      slot: 'api.versioning',
      section: 'API',
      label: {
        en: 'The API version is carried by:',
        fr: 'La version de l’API est portée par :',
      },
      pick: 'one',
      rules: [
        {
          id: 'url',
          label: {
            en: 'The URL (`/v1/…`)',
            fr: 'L’URL (`/v1/…`)',
          },
          lines: [
            'Put every new route under the current version prefix (`/v1/...`); a breaking change goes under a new prefix, and the old one keeps working until its removal is announced.',
          ],
        },
        {
          id: 'header',
          label: {
            en: 'A header or a media type',
            fr: 'Un en-tête ou un type de média',
          },
          lines: [
            'The API version comes from a request header: read it through the existing helper, treat a missing one as the existing routes do, and never put a version in a URL.',
          ],
        },
        {
          id: 'none',
          noAutomaticSuggestion: true,
          label: {
            en: 'Nothing: there is one version',
            fr: 'Rien : il n’y a qu’une version',
          },
          lines: ['The API has one version: do not add a version prefix or header unasked.'],
        },
      ],
    },
    {
      slot: 'api.contract',
      section: 'API',
      label: {
        en: 'The API is described by:',
        fr: 'L’API est décrite par :',
      },
      pick: 'one',
      rules: [
        {
          id: 'design-first',
          label: {
            en: 'An OpenAPI (or schema) file written before the code',
            fr: 'Un fichier OpenAPI (ou un schéma) écrit avant le code',
          },
          lines: [
            'The API description is written first: change the OpenAPI or schema file before the code, then make the code match it, with every status code and error shape the endpoint can return.',
          ],
        },
        {
          id: 'generated',
          label: {
            en: 'A description generated from the code',
            fr: 'Une description générée depuis le code',
          },
          lines: [
            'The API description is generated from the code: keep the route schemas and types it reads complete, regenerate it with the project’s command after any change to a route, and never edit the generated file by hand.',
          ],
        },
        {
          id: 'none',
          noAutomaticSuggestion: true,
          label: {
            en: 'No formal description',
            fr: 'Aucune description formelle',
          },
          lines: [
            'There is no formal API description: do not add one unasked; document a new or changed endpoint where the existing ones are documented.',
          ],
        },
      ],
    },
    {
      slot: 'backend.auth-strategy',
      section: 'Authentication and web security',
      label: {
        en: 'Callers are authenticated with:',
        fr: 'Les appelants sont authentifiés par :',
      },
      pick: 'one',
      rules: [
        {
          id: 'session',
          label: {
            en: 'A server-side session behind a cookie',
            fr: 'Une session côté serveur derrière un cookie',
          },
          lines: [
            'Sessions live on the server behind a cookie set `HttpOnly; Secure; SameSite=Lax` or stricter: never put a session id or a token in `localStorage` or a URL, renew the session id at login, and protect state-changing routes against CSRF.',
          ],
        },
        {
          id: 'jwt',
          label: {
            en: 'JWT access tokens',
            fr: 'Des jetons d’accès JWT',
          },
          lines: [
            'Access tokens are JWTs: verify signature, expected algorithm, issuer, audience and expiry on every request with the project’s helper, keep their lifetime short (5 to 15 minutes) next to a revocable refresh token, and never put a secret in the payload.',
          ],
        },
        {
          id: 'api-token',
          label: {
            en: 'Opaque tokens or API keys',
            fr: 'Des jetons opaques ou des clés d’API',
          },
          lines: [
            'Callers send an opaque token in `Authorization: Bearer`: store only its hash, show the value once at creation, give each token scopes and an expiry, and never accept one from a query string.',
          ],
        },
        {
          id: 'identity-provider',
          label: {
            en: 'An external identity provider (OpenID Connect, SAML)',
            fr: 'Un fournisseur d’identité externe (OpenID Connect, SAML)',
          },
          lines: [
            'Sign-in is delegated to an identity provider: use the authorization code flow with PKCE, validate `state` and the ID token (signature, issuer, audience, expiry), take the identity from the ID token, and never add a password login next to it.',
          ],
        },
        {
          id: 'other',
          label: {
            en: 'Something else',
            fr: 'Autre chose',
          },
          input: true,
          lines: [
            'Callers are authenticated with {value}: reuse the existing mechanism, and never add a second one next to it.',
          ],
        },
      ],
      lines: [
        'Authenticate through the existing middleware or guard only; never read credentials by hand in a route handler.',
      ],
    },
    {
      slot: 'backend.authorization',
      section: 'Authentication and web security',
      label: {
        en: 'Every route checks, on the server, that the caller may act on that exact resource.',
        fr: 'Chaque route vérifie, côté serveur, que l’appelant a le droit d’agir sur cette ressource précise.',
      },
      pick: 'one',
      rules: [
        {
          id: 'agree',
          lines: [
            'On every route that reads or changes a resource, check through the project’s authorization helper that it belongs to the caller; never trust an id from the URL or the body, and add a test that tries another user’s resource.',
          ],
        },
        {
          id: 'disagree',
          noAutomaticSuggestion: true,
          lines: [
            'Access is checked by a layer above the handlers (gateway, global guard): do not repeat the check in each handler, but say when a new route is not covered by it.',
          ],
        },
      ],
    },
    {
      slot: 'backend.password-hashing',
      section: 'Authentication and web security',
      label: {
        en: 'Passwords are hashed with:',
        fr: 'Les mots de passe sont hachés avec :',
      },
      pick: 'one',
      rules: [
        {
          id: 'argon2id',
          label: {
            en: 'Argon2id',
            fr: 'Argon2id',
          },
          lines: [
            'Hash passwords with Argon2id through the project’s helper, with a salt per password and a cost tuned to about 100 to 300 ms; never use MD5, SHA-1 or SHA-256 for a password, even salted.',
          ],
        },
        {
          id: 'bcrypt',
          label: {
            en: 'bcrypt',
            fr: 'bcrypt',
          },
          lines: [
            'Hash passwords with bcrypt through the project’s helper; bcrypt ignores what comes after 72 bytes, so cap the accepted length, and never use MD5, SHA-1 or SHA-256 for a password, even salted.',
          ],
        },
        {
          id: 'scrypt',
          label: {
            en: 'scrypt',
            fr: 'scrypt',
          },
          lines: [
            'Hash passwords with scrypt through the project’s helper, with a salt per password; never use MD5, SHA-1 or SHA-256 for a password, even salted.',
          ],
        },
        {
          id: 'none',
          noAutomaticSuggestion: true,
          label: {
            en: 'Nothing: the application stores no password',
            fr: 'Rien : l’application ne stocke aucun mot de passe',
          },
          lines: [
            'The application stores no password: never add a password column, a password login or a reset flow; sign-in stays with the existing provider.',
          ],
        },
      ],
      lines: [
        'Compare secrets and tokens in constant time (`crypto.timingSafeEqual`), and answer a failed sign-in the same way whether the account exists or not.',
      ],
    },
    {
      slot: 'api.cors',
      section: 'Authentication and web security',
      label: {
        en: 'Cross-origin requests from browsers (CORS) are:',
        fr: 'Les requêtes de navigateurs venant d’une autre origine (CORS) sont :',
      },
      pick: 'one',
      rules: [
        {
          id: 'allowlist',
          label: {
            en: 'Allowed for a list of known origins',
            fr: 'Autorisées pour une liste d’origines connues',
          },
          lines: [
            'CORS allows the origins of the configured list only: add an origin to that list, never answer `*` or reflect the `Origin` header, and never combine a wildcard with credentials.',
          ],
        },
        {
          id: 'same-origin',
          noAutomaticSuggestion: true,
          label: {
            en: 'Not allowed: the front end is on the same origin',
            fr: 'Refusées : le front est sur la même origine',
          },
          lines: [
            'The API sends no CORS headers because the front end is on the same origin: do not enable CORS to make a call pass.',
          ],
        },
        {
          id: 'open',
          label: {
            en: 'Allowed for any origin, without credentials (public API)',
            fr: 'Autorisées pour toute origine, sans identifiants (API publique)',
          },
          lines: [
            'CORS is open to any origin because the API is public: keep it without credentials (no cookies), and authenticate with a token in a header.',
          ],
        },
      ],
      lines: [
        'CORS only restrains browsers: it never replaces authentication or an authorization check.',
      ],
    },
    {
      slot: 'backend.security-headers',
      section: 'Authentication and web security',
      label: {
        en: 'Security headers (HSTS, Content-Security-Policy, `X-Content-Type-Options`…) are set by:',
        fr: 'Les en-têtes de sécurité (HSTS, Content-Security-Policy, `X-Content-Type-Options`…) sont posés par :',
      },
      pick: 'one',
      rules: [
        {
          id: 'app',
          label: {
            en: 'The application (helmet or the framework’s equivalent)',
            fr: 'L’application (helmet ou l’équivalent du framework)',
          },
          lines: [
            'Security headers are set in one place in the application (HSTS, `X-Content-Type-Options: nosniff`, frame and content security policies): change them there, never per route, and never loosen a policy (`unsafe-inline`, `*`) without asking.',
          ],
        },
        {
          id: 'proxy',
          noAutomaticSuggestion: true,
          label: {
            en: 'The reverse proxy or the CDN',
            fr: 'Le reverse proxy ou le CDN',
          },
          lines: [
            'Security headers are set by the reverse proxy or the CDN: do not set them again in application code; when a change needs a header or a looser policy, say which one and where.',
          ],
        },
        {
          id: 'none',
          noAutomaticSuggestion: true,
          label: {
            en: 'Nobody yet',
            fr: 'Personne pour l’instant',
          },
          lines: [
            'No security headers are set yet: do not add a library for them unasked, but say so when a change serves HTML or sets a cookie.',
          ],
        },
      ],
    },
    {
      slot: 'backend.attack-surface',
      section: 'Authentication and web security',
      label: {
        en: 'The back end also:',
        fr: 'Le back-end, en plus :',
      },
      pick: 'many',
      rules: [
        {
          id: 'renders-html',
          label: {
            en: 'Renders HTML or emails that contain user content',
            fr: 'Produit du HTML ou des e-mails contenant du contenu utilisateur',
          },
          lines: [
            'Escape user content by default wherever it reaches HTML or an email, through the template engine’s auto-escaping; never build markup by string concatenation, and never mark user content as safe.',
          ],
        },
        {
          id: 'fetches-urls',
          label: {
            en: 'Fetches URLs given by users (webhooks, imports, previews)',
            fr: 'Appelle des URL fournies par les utilisateurs (webhooks, imports, aperçus)',
          },
          lines: [
            'Before fetching a URL given by a user, allow only `http` and `https`, resolve the host and refuse private, loopback, link-local and cloud metadata addresses, do not follow redirects unchecked, and set a timeout and a size limit.',
          ],
        },
        {
          id: 'uploads',
          label: {
            en: 'Accepts file uploads',
            fr: 'Accepte des envois de fichiers',
          },
          lines: [
            'For an upload, check type and size at the boundary, never trust the client’s file name or content type, store it outside the web root under a generated name, and serve it back with an explicit `Content-Type`.',
          ],
        },
        {
          id: 'runs-commands',
          label: {
            en: 'Runs commands or opens paths built from input',
            fr: 'Lance des commandes ou ouvre des chemins construits à partir d’entrées',
          },
          lines: [
            'Never pass input to a shell: use `execFile` or `spawn` with an argument array and no `shell` option, and resolve any path built from input against a fixed base folder, refusing what escapes it.',
          ],
        },
        {
          id: 'none',
          noAutomaticSuggestion: true,
          label: {
            en: 'None of these',
            fr: 'Rien de tout cela',
          },
          alone: true,
          lines: [
            'The back end renders no HTML, fetches no user-given URL, takes no upload and runs no command: when a change would start doing one of these, say so first.',
          ],
        },
      ],
    },
    {
      slot: 'api.http-caching',
      section: 'HTTP and caching',
      label: {
        en: 'GET responses state how they may be cached (`Cache-Control`, `ETag`).',
        fr: 'Les réponses aux GET disent comment elles peuvent être mises en cache (`Cache-Control`, `ETag`).',
      },
      pick: 'one',
      rules: [
        {
          id: 'agree',
          lines: [
            'Set `Cache-Control` on every GET response: `public, max-age` only when the answer is the same for every caller, `private` or `no-store` for anything tied to a user or a token, and an `ETag` answered with 304 where clients revalidate.',
          ],
        },
        {
          id: 'disagree',
          noAutomaticSuggestion: true,
          lines: [
            'Do not add caching headers or ETags unasked: responses are not meant to be cached by clients or by a CDN.',
          ],
        },
      ],
    },
    {
      slot: 'backend.cache-store',
      section: 'HTTP and caching',
      label: {
        en: 'On the server, computed or fetched data is cached in:',
        fr: 'Côté serveur, les données calculées ou récupérées sont mises en cache dans :',
      },
      pick: 'one',
      rules: [
        {
          id: 'shared',
          label: {
            en: 'A shared cache (Redis, Memcached…)',
            fr: 'Un cache partagé (Redis, Memcached…)',
          },
          lines: [
            'Cache through the project’s cache helper on the shared store: a namespaced key that includes everything the value depends on (tenant, user, locale, version), a TTL on every entry, and a working path when the cache is down.',
          ],
        },
        {
          id: 'memory',
          label: {
            en: 'The memory of each process',
            fr: 'La mémoire de chaque processus',
          },
          lines: [
            'Cache in process memory only small, nearly static data, with a size bound and a TTL: each instance has its own copy, so never cache there what must be the same on every instance.',
          ],
        },
        {
          id: 'none',
          noAutomaticSuggestion: true,
          label: {
            en: 'Nothing',
            fr: 'Rien',
          },
          lines: [
            'There is no server-side cache: do not add one unasked; fix the slow query or call first, and propose a cache together with its invalidation rule.',
          ],
        },
      ],
    },
    {
      slot: 'backend.cache-invalidation',
      section: 'HTTP and caching',
      label: {
        en: 'A cached value is refreshed by:',
        fr: 'Une valeur en cache est rafraîchie par :',
      },
      pick: 'one',
      rules: [
        {
          id: 'ttl',
          label: {
            en: 'Expiry only (TTL)',
            fr: 'L’expiration seulement (TTL)',
          },
          lines: [
            'Cached values expire by TTL only: choose the TTL from how stale the value may be, add 10 to 20 % of random jitter so that keys do not expire together, and never cache what must be exact (permissions, balances).',
          ],
        },
        {
          id: 'purge',
          label: {
            en: 'Deleting the key when the data is written',
            fr: 'La suppression de la clé à l’écriture de la donnée',
          },
          lines: [
            'Delete the cache key in the code path that writes the data, after the write is committed, and keep a TTL as a safety net; a new cached read comes with the list of writes that purge it.',
          ],
        },
        {
          id: 'versioned',
          label: {
            en: 'A version in the key',
            fr: 'Une version dans la clé',
          },
          lines: [
            'Put the data’s version in the cache key and bump it on write, so that stale entries are never read and simply expire; keep a TTL on every entry.',
          ],
        },
      ],
      lines: [
        'When a hot key is missing, let one caller recompute it while the others wait or get the stale value; never let every request recompute it at once.',
      ],
    },
    {
      slot: 'backend.container-image',
      section: 'Runtime and operations',
      label: {
        en: 'The service is built into a container image:',
        fr: 'Le service est construit en image de conteneur :',
      },
      pick: 'one',
      rules: [
        {
          id: 'dockerfile',
          label: {
            en: 'From a Dockerfile in this repository',
            fr: 'À partir d’un Dockerfile de ce dépôt',
          },
          lines: [
            'Keep the Dockerfile multi-stage, on a base image pinned to an exact version: install from the lockfile, copy only the build output and production dependencies into the last stage, run as a non-root user, and keep secrets out of every layer.',
            'Run one process per container, and do not let Node.js be PID 1 without an init process (`--init`, tini): it must receive `SIGTERM` and reap child processes.',
          ],
        },
        {
          id: 'none',
          noAutomaticSuggestion: true,
          label: {
            en: 'No: the platform builds or runs it',
            fr: 'Non : la plateforme le construit ou l’exécute',
          },
          lines: [
            'No container image is built here: do not add a Dockerfile or a Compose file unasked.',
          ],
        },
      ],
    },
    {
      slot: 'backend.configuration',
      section: 'Runtime and operations',
      label: {
        en: 'All configuration comes from environment variables, validated at startup.',
        fr: 'Toute la configuration vient de variables d’environnement, validées au démarrage.',
      },
      pick: 'one',
      rules: [
        {
          id: 'agree',
          lines: [
            'Read configuration from environment variables only, through the one module that validates them at startup; never read `process.env` elsewhere, never hard-code a URL, a port or a credential, and add each new variable to the example env file.',
          ],
        },
        {
          id: 'disagree',
          noAutomaticSuggestion: true,
          lines: [
            'Configuration lives in the project’s configuration files: follow them, and do not move settings to environment variables unasked.',
          ],
        },
      ],
    },
    {
      slot: 'backend.graceful-shutdown',
      section: 'Runtime and operations',
      label: {
        en: 'On `SIGTERM`, the process finishes what is in flight before it exits.',
        fr: 'Sur `SIGTERM`, le processus termine ce qui est en cours avant de s’arrêter.',
      },
      pick: 'one',
      rules: [
        {
          id: 'agree',
          lines: [
            'Keep shutdown clean: on `SIGTERM`, stop accepting connections, finish in-flight requests and jobs within the grace period, then close pools and exit; register every new long-lived resource (server, worker, timer, connection) in that shutdown path.',
          ],
        },
        {
          id: 'disagree',
          noAutomaticSuggestion: true,
          lines: [
            'Do not add signal handling: the process may be stopped at any time, so keep every operation safe to interrupt and to run again.',
          ],
        },
      ],
    },
    {
      slot: 'backend.service-shape',
      section: 'Architecture',
      label: {
        en: 'The back end is:',
        fr: 'Le back-end est :',
      },
      pick: 'one',
      rules: [
        {
          id: 'monolith',
          label: {
            en: 'One application (a modular monolith)',
            fr: 'Une seule application (un monolithe modulaire)',
          },
          lines: [
            'The back end is one modular monolith: add code to the module that owns the domain, call another module only through its public interface, and never propose a new service or a message bus for what a function call does.',
          ],
        },
        {
          id: 'microservices',
          label: {
            en: 'Several services, each with its own data',
            fr: 'Plusieurs services, chacun avec ses données',
          },
          lines: [
            'Each service owns its data: never read or write another service’s tables, go through its API or its events, treat every such call as able to fail or time out, and do not add a new service unasked.',
          ],
        },
        {
          id: 'serverless',
          label: {
            en: 'Functions run on demand (serverless)',
            fr: 'Des fonctions exécutées à la demande (serverless)',
          },
          lines: [
            'Code runs as short-lived functions: keep startup light, create clients outside the handler, hold no state in memory between invocations, and hand to a queue any work that may pass the time limit.',
          ],
        },
      ],
    },
    {
      slot: 'backend.stateless',
      section: 'Architecture',
      label: {
        en: 'A process keeps nothing in memory or on its disk that another instance would need.',
        fr: 'Un processus ne garde rien en mémoire ni sur son disque dont une autre instance aurait besoin.',
      },
      pick: 'one',
      rules: [
        {
          id: 'agree',
          lines: [
            'Keep processes stateless: no session, counter, lock, scheduled timer or uploaded file in process memory or on the local disk that another instance would need; put shared state in the database, the shared cache or object storage.',
          ],
        },
        {
          id: 'disagree',
          lines: [
            'A single instance runs, so state in process memory is acceptable; mark it with a comment so that it can be moved when a second instance is added.',
          ],
        },
      ],
    },
    {
      slot: 'backend.background-jobs',
      section: 'Runtime and operations',
      label: {
        en: 'Work that does not fit in a request runs on:',
        fr: 'Le travail qui ne tient pas dans une requête passe par :',
      },
      pick: 'one',
      rules: [
        {
          id: 'job-queue',
          label: {
            en: 'A job queue (BullMQ, pg-boss…)',
            fr: 'Une file de tâches (BullMQ, pg-boss…)',
          },
          lines: [
            'Slow work runs on the job queue: enqueue from the request with a small payload of ids, make each handler safe to run twice, set a number of attempts with backoff, and never do slow work in the request itself.',
          ],
        },
        {
          id: 'broker',
          label: {
            en: 'A message broker (RabbitMQ, SQS…)',
            fr: 'Un broker de messages (RabbitMQ, SQS…)',
          },
          lines: [
            'Work goes through the message broker: acknowledge a message only after its work is committed, make every consumer safe to run twice, and send repeated failures to a dead-letter queue instead of requeueing forever.',
          ],
        },
        {
          id: 'event-log',
          label: {
            en: 'An event log (Kafka…)',
            fr: 'Un journal d’événements (Kafka…)',
          },
          lines: [
            'Events go through a partitioned log: pick the key whose events must stay ordered, since order holds within a partition only, make consumers safe to replay, and change an event’s schema by adding fields only.',
          ],
        },
        {
          id: 'none',
          noAutomaticSuggestion: true,
          label: {
            en: 'Nothing: everything runs in the request',
            fr: 'Rien : tout s’exécute dans la requête',
          },
          lines: [
            'There is no queue: do not add a broker or a job library unasked; keep work in the request short, and say when a change needs work that cannot fit in it.',
          ],
        },
        {
          id: 'other',
          label: {
            en: 'Something else',
            fr: 'Autre chose',
          },
          input: true,
          lines: [
            'Work outside the request runs on {value}: follow the existing producers and consumers, and make every handler safe to run twice.',
          ],
        },
      ],
    },
    {
      slot: 'backend.realtime',
      section: 'Runtime and operations',
      label: {
        en: 'Updates are pushed to clients with:',
        fr: 'Les mises à jour sont poussées aux clients par :',
      },
      pick: 'one',
      rules: [
        {
          id: 'sse',
          label: {
            en: 'Server-Sent Events',
            fr: 'Server-Sent Events',
          },
          lines: [
            'Push updates with Server-Sent Events: send an `id` with each event so that a client resumes with `Last-Event-ID`, send a heartbeat comment, free the listener when the connection closes, and do not add WebSockets for a one-way stream.',
          ],
        },
        {
          id: 'websockets',
          label: {
            en: 'WebSockets',
            fr: 'WebSockets',
          },
          lines: [
            'Push updates over the existing WebSocket layer: authenticate at the handshake, validate every incoming message, free listeners on close, and publish through the shared channel, not process memory, so that every instance reaches its clients.',
          ],
        },
        {
          id: 'polling',
          label: {
            en: 'Polling by the client',
            fr: 'Une interrogation régulière par le client',
          },
          lines: [
            'Clients poll for updates: keep the polled endpoint cheap (an ETag and 304, or a `since` parameter), and do not add Server-Sent Events or WebSockets unasked.',
          ],
        },
        {
          id: 'none',
          noAutomaticSuggestion: true,
          label: {
            en: 'Nothing: there is no live update',
            fr: 'Rien : pas de mise à jour en direct',
          },
          lines: [
            'There is no live update channel: do not add Server-Sent Events, WebSockets or polling unasked.',
          ],
        },
      ],
    },
    {
      slot: 'api.webhooks',
      section: 'API',
      label: {
        en: 'Webhooks: the back end',
        fr: 'Webhooks : le back-end',
      },
      pick: 'many',
      rules: [
        {
          id: 'sends',
          label: {
            en: 'Sends some to its users',
            fr: 'En envoie à ses utilisateurs',
          },
          lines: [
            'Send a webhook from a background job, never inside the request: sign the payload, retry with backoff, and include an event id so that the receiver can ignore a duplicate.',
          ],
        },
        {
          id: 'receives',
          label: {
            en: 'Receives some from other services',
            fr: 'En reçoit d’autres services',
          },
          lines: [
            'On an incoming webhook, verify the signature over the raw body before parsing it, answer 2xx fast and do the work in a job, and ignore an event id that was already handled.',
          ],
        },
        {
          id: 'none',
          noAutomaticSuggestion: true,
          label: {
            en: 'Neither sends nor receives any',
            fr: 'N’en envoie ni n’en reçoit',
          },
          alone: true,
          lines: ['The back end neither sends nor receives webhooks: do not add any unasked.'],
        },
      ],
    },
    {
      slot: 'api.rate-limiting',
      section: 'Authentication and web security',
      label: {
        en: 'Request rates are limited:',
        fr: 'Le débit des requêtes est limité :',
      },
      pick: 'one',
      rules: [
        {
          id: 'app',
          label: {
            en: 'In the application, with a shared counter',
            fr: 'Dans l’application, avec un compteur partagé',
          },
          lines: [
            'Rate limits live in the application, with counters in the shared store, never in process memory: put every new public or costly route (sign-in, password reset, search, export) behind the limiter, keyed by account or by IP, and answer 429 with `Retry-After`.',
          ],
        },
        {
          id: 'proxy',
          noAutomaticSuggestion: true,
          label: {
            en: 'At the reverse proxy or the API gateway',
            fr: 'Au niveau du reverse proxy ou de la passerelle d’API',
          },
          lines: [
            'Rate limits are set at the reverse proxy or the gateway: do not add a limiter in application code; say when a new route is costly or sensitive enough to need its own limit there.',
          ],
        },
        {
          id: 'none',
          noAutomaticSuggestion: true,
          label: {
            en: 'Nowhere',
            fr: 'Nulle part',
          },
          lines: [
            'No rate limit exists: do not add a limiter unasked, but say when a new route (sign-in, password reset, costly query) is open to abuse without one.',
          ],
        },
      ],
    },
    {
      slot: 'backend.load-protections',
      section: 'Runtime and operations',
      label: {
        en: 'Under load, or when a dependency fails, the code:',
        fr: 'Sous la charge, ou quand une dépendance tombe, le code :',
      },
      pick: 'many',
      rules: [
        {
          id: 'retries',
          label: {
            en: 'Retries with backoff, idempotent calls only',
            fr: 'Relance avec un délai croissant, les appels idempotents seulement',
          },
          lines: [
            'Retry a failed call to a dependency only when it is idempotent, with exponential backoff, jitter and a small cap on attempts; honor `Retry-After`, and never retry a 4xx other than 429.',
          ],
        },
        {
          id: 'circuit-breaker',
          label: {
            en: 'Cuts calls to a failing dependency (circuit breaker)',
            fr: 'Coupe les appels vers une dépendance en échec (circuit breaker)',
          },
          lines: [
            'Call unreliable dependencies through the project’s circuit breaker, with a short timeout, so that a slow dependency fails fast instead of holding connections; do not write a second breaker.',
          ],
        },
        {
          id: 'bounded',
          label: {
            en: 'Bounds queues and concurrency, and refuses the rest',
            fr: 'Borne les files et la concurrence, et refuse le reste',
          },
          lines: [
            'Bound everything that can pile up: a maximum length on queues and buffers, a concurrency limit on parallel work (no unbounded `Promise.all` over input-sized lists), a request body limit, and a 429 or 503 with `Retry-After` when full.',
          ],
        },
        {
          id: 'degraded',
          label: {
            en: 'Serves a degraded answer rather than an error',
            fr: 'Sert une réponse dégradée plutôt qu’une erreur',
          },
          lines: [
            'When a secondary dependency fails, keep the main path working: serve the cached or partial answer and mark it as such, and never let an optional feature fail the whole request.',
          ],
        },
      ],
    },
    {
      slot: 'backend.performance-work',
      section: 'Working style',
      label: {
        en: 'A performance change starts from a measurement, never from intuition.',
        fr: 'Un changement de performance part d’une mesure, jamais d’une intuition.',
      },
      pick: 'one',
      rules: [
        {
          id: 'agree',
          lines: [
            'Do not optimise by intuition: measure first (CPU profile, event loop lag, query plan, p99 latency rather than the average), change one thing, and report the numbers before and after.',
          ],
        },
        {
          id: 'disagree',
          lines: [
            'Write the faster version directly when the cost is obvious; a measurement is only needed before a change that makes the code harder to read.',
          ],
        },
      ],
    },
    {
      slot: 'backend.database-tests',
      section: 'Testing',
      label: {
        en: 'Tests that touch the database run against:',
        fr: 'Les tests qui touchent la base de données tournent sur :',
      },
      pick: 'one',
      rules: [
        {
          id: 'real',
          label: {
            en: 'A real database (container or test instance)',
            fr: 'Une vraie base (conteneur ou instance de test)',
          },
          lines: [
            'Test database code against the real test database, never a mock: run the migrations, isolate each test (transaction rollback or truncation), and create the rows a test needs in the test itself.',
          ],
        },
        {
          id: 'substitute',
          label: {
            en: 'An in-memory substitute (SQLite, pg-mem…)',
            fr: 'Un substitut en mémoire (SQLite, pg-mem…)',
          },
          lines: [
            'Tests run on an in-memory substitute of the database: keep queries within what it supports, and say when a query uses a feature only the real database has, since the tests cannot prove it.',
          ],
        },
        {
          id: 'mocks',
          label: {
            en: 'Mocks of the data layer',
            fr: 'Des mocks de la couche de données',
          },
          lines: [
            'Tests mock the data layer: mock at the repository or service boundary, never the driver, and say that SQL and migrations are not covered when a change touches them.',
          ],
        },
      ],
    },
    {
      slot: 'backend.endpoint-tests',
      section: 'Testing',
      label: {
        en: 'Every new endpoint comes with a test that calls it over HTTP.',
        fr: 'Chaque nouvel endpoint arrive avec un test qui l’appelle en HTTP.',
      },
      pick: 'one',
      rules: [
        {
          id: 'agree',
          lines: [
            'Give every new or changed endpoint a test that calls it over HTTP: the success case, an invalid input, a call without credentials and a call on another user’s resource, each checking the status code and the body.',
          ],
        },
        {
          id: 'disagree',
          noAutomaticSuggestion: true,
          lines: [
            'Test the services and business rules directly, in fast tests without network; do not add HTTP-level tests unasked.',
          ],
        },
      ],
    },
    {
      slot: 'backend.observability',
      section: 'Runtime and operations',
      label: {
        en: 'The service emits:',
        fr: 'Le service émet :',
      },
      pick: 'many',
      rules: [
        {
          id: 'metrics',
          label: {
            en: 'Metrics',
            fr: 'Des métriques',
          },
          lines: [
            'Instrument new endpoints, jobs and outbound calls with the existing metrics helpers (count, errors, duration as a histogram), and keep label values few and bounded: never a user id, an email or a raw URL as a label.',
          ],
        },
        {
          id: 'traces',
          label: {
            en: 'Traces (OpenTelemetry…)',
            fr: 'Des traces (OpenTelemetry…)',
          },
          lines: [
            'Let the existing tracing setup create spans: add one only around a significant unit of work, pass the context through queues and outbound calls, and never put a secret or personal data in an attribute.',
          ],
        },
        {
          id: 'correlation',
          label: {
            en: 'A request or trace id in every log line',
            fr: 'Un identifiant de requête ou de trace dans chaque ligne de log',
          },
          lines: [
            'Carry the request or trace id through every log line, job payload and outbound call of a request, with the existing context helper rather than a parameter threaded by hand.',
          ],
        },
        {
          id: 'health',
          label: {
            en: 'Health endpoints for the platform',
            fr: 'Des endpoints de santé pour la plateforme',
          },
          lines: [
            'Keep the liveness endpoint free of dependencies and let the readiness endpoint check the ones a request needs: wire any new required dependency into readiness, and keep both cheap and unauthenticated.',
          ],
        },
        {
          id: 'none',
          noAutomaticSuggestion: true,
          label: {
            en: 'None of these',
            fr: 'Rien de tout cela',
          },
          alone: true,
          lines: [
            'The service has no metrics, traces or health endpoints: do not add an observability library unasked.',
          ],
        },
      ],
    },
    {
      slot: 'backend.model-calls',
      section: 'Runtime and operations',
      label: {
        en: 'A call to a language model from the back end runs:',
        fr: 'Un appel à un modèle de langage depuis le back-end s’exécute :',
      },
      pick: 'one',
      rules: [
        {
          id: 'job',
          label: {
            en: 'In a background job; the client is told when it is done',
            fr: 'Dans une tâche de fond ; le client est prévenu quand c’est fini',
          },
          lines: [
            'Call the model from a background job, never in a request handler: the request stores the task and answers at once, and the job saves the result and can be retried without repeating a side effect.',
          ],
        },
        {
          id: 'stream',
          label: {
            en: 'In the request, streamed to the client',
            fr: 'Dans la requête, en flux vers le client',
          },
          lines: [
            'Call the model in the request and stream the answer to the client as it arrives: stop the provider call when the client disconnects, and save what must be kept only once the stream has ended.',
          ],
        },
        {
          id: 'sync',
          label: {
            en: 'In the request, the client waits for the whole answer',
            fr: 'Dans la requête, le client attend la réponse entière',
          },
          lines: [
            'The model is called in the request and the client waits: set a strict timeout and a small output limit, keep the call out of any database transaction, and say when a call may last long enough to need a job.',
          ],
        },
        {
          id: 'none',
          noAutomaticSuggestion: true,
          label: {
            en: 'Nowhere: the back end calls no model',
            fr: 'Nulle part : le back-end n’appelle aucun modèle',
          },
          lines: [
            'The back end calls no language model: do not add a provider SDK or a model call unasked.',
          ],
        },
      ],
    },
    {
      slot: 'backend.model-call-guards',
      section: 'Runtime and operations',
      label: {
        en: 'Around every call to a model, the code:',
        fr: 'Autour de chaque appel à un modèle, le code :',
      },
      pick: 'many',
      rules: [
        {
          id: 'single-client',
          label: {
            en: 'Goes through one client module, on the server',
            fr: 'Passe par un seul module client, côté serveur',
          },
          lines: [
            'Call the model provider through the project’s one client module, on the server only, with the key read from configuration: never call the provider from a handler directly, and never send the key to a client.',
          ],
        },
        {
          id: 'timeouts',
          label: {
            en: 'Sets a timeout, capped retries and a fallback',
            fr: 'Pose un délai maximal, des relances plafonnées et un repli',
          },
          lines: [
            'Treat the model provider as a slow dependency that fails: a timeout on every call, retries with backoff on rate limits and 5xx only, capped, and a fallback or a clear error for the user.',
          ],
        },
        {
          id: 'usage',
          label: {
            en: 'Bounds and records token usage',
            fr: 'Borne et enregistre la consommation de tokens',
          },
          lines: [
            'Cap the output tokens and the size of the context on every model call, record token usage per account or feature, reuse a cached answer for an identical request, and check the account’s limit before calling.',
          ],
        },
        {
          id: 'untrusted-output',
          label: {
            en: 'Treats the answer as untrusted input',
            fr: 'Traite la réponse comme une entrée non fiable',
          },
          lines: [
            'Treat a model’s answer as untrusted input: validate it against a schema before using it, never run a query, a command or a paid or destructive action from it without a server-side permission check, and escape it before display.',
          ],
        },
      ],
    },
  ],
}
