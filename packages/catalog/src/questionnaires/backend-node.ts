import type { Questionnaire } from '../schemas.ts'

/**
 * Back-end work on a Node.js API. Questions 1, 3, 4, 5, 6 and 8 record facts about the
 * repository; 2, 7 and 9 are preferences on a 1–5 agreement scale, where 3 produces nothing.
 * It feeds only its own slots (`api.*`, `errors.*`, `database.*`, `logging.*`), so it combines
 * with any other questionnaire.
 *
 * Bump `version` on any change to a question, an option or a fragment; never reuse a removed
 * question id; declare a removed option in `migrations`.
 */
export const backendNode = {
  id: 'backend-node',
  version: '1.0.0',
  title: { en: 'Back end: Node.js API', fr: 'Back : API Node.js' },
  description: {
    en: 'How your Node.js API is designed, validates its inputs, handles errors, reaches the database and logs.',
    fr: 'Comment votre API Node.js est conçue, valide ses entrées, gère les erreurs, accède à la base de données et journalise.',
  },
  sections: ['API', 'Errors and logging', 'Database'],
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
  ],
} satisfies Questionnaire
