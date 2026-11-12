import type { Questionnaire } from '../schemas.ts'

/**
 * A product that calls language models: the code the assistant writes integrates a model, it is
 * not about the coding assistant itself. It covers when a model is the right tool, where model
 * ids, sampling parameters and prompts live, the token and context budget, embeddings, vector
 * stores and retrieval, the calls themselves (streaming, timeouts, retries, structured output),
 * the Model Context Protocol as an integration contract, self-hosted models, evaluation,
 * observability, and the security of what the model reads and writes. Most questions record
 * facts about the repository; the `scale` ones are preferences on a 1–5 agreement scale, where 3
 * produces nothing. It feeds only its own `llm.*` slots, so it combines with any other
 * questionnaire. Agent loops, tools and agent memory belong to the `ai-agents` questionnaire.
 *
 * Bump `version` on any change to a question, an option or a fragment; never reuse a removed
 * question id; declare a removed option in `migrations`.
 */
export const aiEngineering = {
  id: 'ai-engineering',
  version: '1.0.0',
  title: { en: 'AI engineering: LLM features', fr: 'Ingénierie IA : fonctionnalités LLM' },
  description: {
    en: 'How your product calls language models: model choice, prompts, context and retrieval, the calls themselves, evaluation, observability and security.',
    fr: 'Comment votre produit appelle des modèles de langage : choix du modèle, prompts, contexte et recherche, les appels eux-mêmes, évaluation, observabilité et sécurité.',
  },
  sections: [
    'Models and prompts',
    'Context and retrieval',
    'Model calls',
    'Evaluation and observability',
    'LLM security',
  ],
  questions: [
    // D1 — the job of an AI engineer
    {
      id: 'llm-when-to-use',
      type: 'scale',
      slot: 'llm.when-to-use',
      section: 'Models and prompts',
      label: {
        en: 'A rule, a regular expression or a database query is preferred to a model call whenever it does the job.',
        fr: 'Une règle, une expression régulière ou une requête en base est préférée à un appel au modèle dès qu’elle suffit.',
      },
      required: false,
      fragments: [
        {
          when: { scaleAtLeast: 4 },
          text: 'Before adding a model call, check whether a rule, a regular expression or a database query does the job; call a model only where they cannot, and say why in the change.',
        },
        {
          when: { scaleAtMost: 2 },
          text: 'A model call is acceptable where it saves code; still use deterministic code for anything with one exact answer (parsing, arithmetic, lookups, permission checks).',
        },
      ],
    },
    {
      id: 'llm-feature-start',
      type: 'scale',
      slot: 'llm.feature-start',
      section: 'Evaluation and observability',
      label: {
        en: 'A new model feature starts with a success criterion and evaluation cases, before its prompt.',
        fr: 'Une nouvelle fonctionnalité à base de modèle commence par un critère de succès et des cas d’évaluation, avant son prompt.',
      },
      required: false,
      fragments: [
        {
          when: { scaleAtLeast: 4 },
          text: 'Before writing the prompt of a new model feature, write down the task, its success criterion and a first set of evaluation cases; a prompt that works on three examples proves nothing.',
        },
        {
          when: { scaleAtMost: 2 },
          text: 'A new model feature may start as a prototype (model and prompt); add evaluation cases before it reaches users, and say when a feature has none.',
        },
      ],
    },
    // D2 — how a language model works
    {
      id: 'llm-token-budget',
      type: 'single',
      slot: 'llm.token-budget',
      section: 'Context and retrieval',
      label: {
        en: 'Before a call, the size of the input in tokens is:',
        fr: 'Avant un appel, la taille de l’entrée en tokens est :',
      },
      options: [
        {
          value: 'counted',
          label: {
            en: 'Counted with the tokenizer and checked against a budget',
            fr: 'Comptée avec le tokenizer et comparée à un budget',
          },
        },
        {
          value: 'estimated',
          label: {
            en: 'Estimated from the character count',
            fr: 'Estimée à partir du nombre de caractères',
          },
        },
        { value: 'unchecked', label: { en: 'Not checked', fr: 'Non vérifiée' } },
      ],
      required: false,
      fragments: [
        {
          when: { equals: 'counted' },
          text: 'Count the input tokens of a call with the tokenizer helper the project uses and compare them to the budget of that call before sending; trim or refuse an input that exceeds it instead of letting the provider reject it.',
        },
        {
          when: { equals: 'estimated' },
          text: 'Estimate the input size of a call at about 4 characters per token (fewer for non-English text) and keep a margin under the context window, which holds the prompt and the answer together.',
        },
        {
          when: { equals: 'unchecked' },
          text: 'Input size is not checked before a call: bound every user-supplied text with a maximum length, and handle the context-length error of the provider as an expected case.',
        },
        {
          when: { answered: true },
          text: 'Count cost, limits and latency in tokens, not characters or requests: an output token costs more than an input token, and the duration of a call grows with the length of its answer.',
        },
      ],
    },
    {
      id: 'llm-conversation-state',
      type: 'single',
      slot: 'llm.conversation-state',
      section: 'Context and retrieval',
      label: {
        en: 'What the model remembers from one call to the next comes from:',
        fr: 'Ce dont le modèle se souvient d’un appel à l’autre vient de :',
      },
      options: [
        {
          value: 'server-store',
          label: {
            en: 'A conversation stored on our server',
            fr: 'Une conversation stockée sur notre serveur',
          },
        },
        {
          value: 'client-history',
          label: {
            en: 'The history the client sends with each request',
            fr: 'L’historique que le client envoie à chaque requête',
          },
        },
        {
          value: 'stateless',
          label: {
            en: 'Nothing: each call stands alone',
            fr: 'Rien : chaque appel est indépendant',
          },
        },
      ],
      required: false,
      fragments: [
        {
          when: { equals: 'server-store' },
          text: 'The conversation is stored on the server: rebuild the messages of each call from that store, scoped to the signed-in user, and never accept system instructions or past assistant turns from the client.',
        },
        {
          when: { equals: 'client-history' },
          text: 'The client sends the history with each request: treat all of it as untrusted input, validate its roles and size, and add the system instructions on the server only.',
        },
        {
          when: { equals: 'stateless' },
          text: 'Each model call stands alone: put everything the call needs in its own input, and do not add conversation storage unasked.',
        },
        {
          when: { answered: true },
          text: 'A model learns nothing from the requests it receives: anything it must know at the next call has to be sent again or read from storage.',
        },
      ],
    },
    // D3 — choosing a model
    {
      id: 'llm-model-config',
      type: 'single',
      slot: 'llm.model-config',
      section: 'Models and prompts',
      label: {
        en: 'Model identifiers are written:',
        fr: 'Les identifiants de modèle sont écrits :',
      },
      options: [
        {
          value: 'config-module',
          label: {
            en: 'In one configuration module, by task',
            fr: 'Dans un seul module de configuration, par tâche',
          },
        },
        {
          value: 'environment',
          label: { en: 'In environment variables', fr: 'Dans des variables d’environnement' },
        },
        {
          value: 'call-site',
          label: { en: 'Next to each call', fr: 'À côté de chaque appel' },
        },
        { value: 'other', label: { en: 'Somewhere else', fr: 'Ailleurs' }, freeText: true },
      ],
      required: false,
      fragments: [
        {
          when: { equals: 'config-module' },
          text: 'Model identifiers live in one configuration module, keyed by task: reference that entry at the call site and never write a model identifier as a string literal anywhere else.',
        },
        {
          when: { equals: 'environment' },
          text: 'Model identifiers come from environment variables: read them through the configuration layer, document a new variable in the example environment file, and never hard-code a model identifier.',
        },
        {
          when: { equals: 'call-site' },
          text: 'Model identifiers are written next to each call, as a named constant: keep the exact, dated identifier and do not use a floating alias that changes model without a code change.',
        },
        {
          when: { other: true },
          text: 'Model identifiers are configured here: {value}; never write one anywhere else.',
        },
        {
          when: { answered: true },
          text: 'Never change the model of an existing feature as a side effect of another change: a model change is its own change, decided on the project evaluation set and not on a public leaderboard.',
        },
      ],
    },
    {
      id: 'llm-provider-abstraction',
      type: 'single',
      slot: 'llm.provider-abstraction',
      section: 'Models and prompts',
      label: {
        en: 'Code that needs a model calls:',
        fr: 'Le code qui a besoin d’un modèle appelle :',
      },
      options: [
        {
          value: 'own-interface',
          label: {
            en: 'Our own interface, which hides the provider',
            fr: 'Notre propre interface, qui masque le fournisseur',
          },
        },
        {
          value: 'agnostic-library',
          label: {
            en: 'A provider-agnostic library',
            fr: 'Une bibliothèque indépendante du fournisseur',
          },
        },
        {
          value: 'provider-sdk',
          label: {
            en: 'The provider’s SDK directly',
            fr: 'Directement le SDK du fournisseur',
          },
        },
      ],
      required: false,
      fragments: [
        {
          when: { equals: 'own-interface' },
          text: 'Call a model only through the project interface that hides the provider: never import the SDK of a provider outside the module that implements it, and keep provider-specific types out of feature code.',
        },
        {
          when: { equals: 'agnostic-library' },
          text: 'Call a model through the provider-agnostic library the project already uses; do not import the SDK of a provider directly, and do not rely on an option only one provider supports without saying so.',
        },
        {
          when: { equals: 'provider-sdk' },
          text: 'The project calls the SDK of the model provider directly: keep those calls in the existing client module, and do not add a second provider or an abstraction layer unasked.',
        },
      ],
    },
    {
      id: 'llm-model-routing',
      type: 'single',
      slot: 'llm.model-routing',
      section: 'Models and prompts',
      label: {
        en: 'Which model handles a task:',
        fr: 'Quel modèle traite une tâche :',
      },
      options: [
        {
          value: 'single',
          label: { en: 'One model for everything', fr: 'Un seul modèle pour tout' },
        },
        {
          value: 'per-task',
          label: {
            en: 'A model chosen per task (small, large, reasoning)',
            fr: 'Un modèle choisi par tâche (petit, grand, raisonnement)',
          },
        },
        {
          value: 'escalation',
          label: {
            en: 'A small model by default, a larger one for hard cases',
            fr: 'Un petit modèle par défaut, un plus grand pour les cas difficiles',
          },
        },
      ],
      required: false,
      fragments: [
        {
          when: { equals: 'single' },
          text: 'One model serves every task: use the configured one for a new call and do not introduce a second model unasked.',
        },
        {
          when: { equals: 'per-task' },
          text: 'Each task has its own model: for a new task, pick the smallest configured model that passes its evaluation cases, and keep a reasoning model for hard multi-step tasks since it is slower and costs more.',
        },
        {
          when: { equals: 'escalation' },
          text: 'Send a task to the small default model first and escalate to the larger one only through the existing routing rule; never call the larger model directly from feature code.',
        },
      ],
    },
    // D4 — sampling parameters
    {
      id: 'llm-sampling',
      type: 'single',
      slot: 'llm.sampling',
      section: 'Model calls',
      label: {
        en: 'Sampling parameters (temperature, top-p, penalties) are set:',
        fr: 'Les paramètres d’échantillonnage (température, top-p, pénalités) sont réglés :',
      },
      options: [
        {
          value: 'per-task',
          label: {
            en: 'Per task, in configuration next to the model',
            fr: 'Par tâche, dans la configuration à côté du modèle',
          },
        },
        {
          value: 'inline',
          label: { en: 'At each call', fr: 'À chaque appel' },
        },
        {
          value: 'defaults',
          label: {
            en: 'Nowhere: the provider’s defaults apply',
            fr: 'Nulle part : les valeurs par défaut du fournisseur s’appliquent',
          },
        },
      ],
      required: false,
      fragments: [
        {
          when: { equals: 'per-task' },
          text: 'Sampling parameters are set per task in configuration, next to the model: add or change them there, never inline at a call site.',
        },
        {
          when: { equals: 'inline' },
          text: 'Set sampling parameters explicitly at each call: temperature 0 to 0.2 for extraction, classification, JSON, code and SQL; 0.5 to 0.8 for conversation; higher only for drafting and ideas.',
        },
        {
          when: { equals: 'defaults' },
          text: 'Leave sampling parameters at the defaults of the provider; when a task needs a predictable output, say so and propose a temperature instead of setting one silently.',
        },
        {
          when: { answered: true },
          text: 'Tune temperature or top-p, never both, and never rely on temperature 0 or a seed for identical outputs: validate each output and retry instead.',
        },
      ],
    },
    {
      id: 'llm-output-limit',
      type: 'scale',
      slot: 'llm.output-limit',
      section: 'Model calls',
      label: {
        en: 'Every call sets a maximum output length and checks why the model stopped.',
        fr: 'Chaque appel fixe une longueur maximale de sortie et vérifie pourquoi le modèle s’est arrêté.',
      },
      required: false,
      fragments: [
        {
          when: { scaleAtLeast: 4 },
          text: 'Set an explicit maximum output length on every model call, sized for the task, and check the stop reason: an answer cut by the limit is an error to handle, never a JSON document to parse or a text to show as complete.',
        },
        {
          when: { scaleAtMost: 2 },
          text: 'Leave the output length at its default unless the provider requires one; still check the stop reason before parsing a structured answer, since a truncated one is invalid.',
        },
      ],
    },
    // D5 — embeddings and vector stores
    {
      id: 'llm-vector-store',
      type: 'single',
      slot: 'llm.vector-store',
      section: 'Context and retrieval',
      label: { en: 'Embeddings are stored in:', fr: 'Les embeddings sont stockés dans :' },
      options: [
        {
          value: 'pgvector',
          label: { en: 'PostgreSQL with pgvector', fr: 'PostgreSQL avec pgvector' },
        },
        { value: 'qdrant', label: { en: 'Qdrant', fr: 'Qdrant' } },
        { value: 'weaviate', label: { en: 'Weaviate', fr: 'Weaviate' } },
        { value: 'chroma', label: { en: 'Chroma', fr: 'Chroma' } },
        { value: 'lancedb', label: { en: 'LanceDB', fr: 'LanceDB' } },
        {
          value: 'faiss',
          label: { en: 'An in-memory FAISS index', fr: 'Un index FAISS en mémoire' },
        },
        {
          value: 'managed',
          label: {
            en: 'A managed vector database service',
            fr: 'Un service managé de base vectorielle',
          },
        },
        {
          value: 'none',
          label: { en: 'Nowhere: no embeddings', fr: 'Nulle part : pas d’embeddings' },
        },
        { value: 'other', label: { en: 'Something else', fr: 'Autre chose' }, freeText: true },
      ],
      required: false,
      fragments: [
        {
          when: { equals: 'pgvector' },
          text: 'Embeddings live in PostgreSQL with pgvector: add a vector column through a migration with its approximate index (HNSW or IVFFlat), and combine similarity with ordinary SQL filters and joins in one query; do not add another vector store.',
        },
        {
          when: { equals: 'qdrant' },
          text: 'Embeddings live in Qdrant: reach it through the existing client module, store the filterable fields in the payload with their indexes, and do not add another vector store.',
        },
        {
          when: { equals: 'weaviate' },
          text: 'Embeddings live in Weaviate: reach it through the existing client module, declare a new property in the collection schema before using it as a filter, and do not add another vector store.',
        },
        {
          when: { equals: 'chroma' },
          text: 'Embeddings live in Chroma: reach it through the existing client module, store filterable fields as metadata, and do not add another vector store.',
        },
        {
          when: { equals: 'lancedb' },
          text: 'Embeddings live in LanceDB: reach it through the existing module, keep filterable fields as columns of the table, and do not add another vector store.',
        },
        {
          when: { equals: 'faiss' },
          text: 'Embeddings are searched in an in-memory FAISS index, which is a library and not a database: keep the code that rebuilds and persists it working, and keep the mapping from vector position to record and its metadata in the main database.',
        },
        {
          when: { equals: 'managed' },
          text: 'Embeddings live in a managed vector database service: reach it through the existing client module, send it only the metadata needed for filtering, and do not add another vector store.',
        },
        {
          when: { equals: 'none' },
          text: 'The project stores no embeddings: do not add an embedding model, a vector column or a vector store unasked.',
        },
        {
          when: { other: true },
          text: 'Embeddings are stored in {value}; reach it through the existing module and do not add another vector store.',
        },
      ],
    },
    {
      id: 'llm-embedding-change',
      type: 'single',
      slot: 'llm.embedding-change',
      section: 'Context and retrieval',
      label: {
        en: 'To change the embedding model or its dimension, the assistant:',
        fr: 'Pour changer le modèle d’embedding ou sa dimension, l’assistant :',
      },
      options: [
        { value: 'ask', label: { en: 'Asks me first', fr: 'Me demande d’abord' } },
        {
          value: 'reindex',
          label: {
            en: 'May do it, with a full re-index in the same change',
            fr: 'Peut le faire, avec une réindexation complète dans le même changement',
          },
        },
      ],
      required: false,
      fragments: [
        {
          when: { equals: 'ask' },
          text: 'Ask before changing the embedding model or its dimension: every stored vector has to be computed again, so say how many records that is.',
        },
        {
          when: { equals: 'reindex' },
          text: 'A change of embedding model or dimension ships with the job that computes every stored vector again and the switch to the new index; never leave vectors from two models in one searchable index.',
        },
        {
          when: { answered: true },
          text: 'Embed queries and documents with the same model and store its identifier next to the vectors: vectors from two models are not comparable.',
        },
      ],
    },
    {
      id: 'llm-retrieval-scope',
      type: 'single',
      slot: 'llm.retrieval-scope',
      section: 'Context and retrieval',
      label: {
        en: 'What a search over embeddings may return is limited:',
        fr: 'Ce qu’une recherche sur les embeddings peut renvoyer est limité :',
      },
      options: [
        {
          value: 'tenant',
          label: {
            en: 'By customer or user: access rights apply',
            fr: 'Par client ou utilisateur : des droits d’accès s’appliquent',
          },
        },
        {
          value: 'metadata',
          label: {
            en: 'By metadata only (product, language, date)',
            fr: 'Par métadonnées seulement (produit, langue, date)',
          },
        },
        {
          value: 'shared',
          label: {
            en: 'Not at all: one corpus everyone may read',
            fr: 'Pas du tout : un seul corpus que tous peuvent lire',
          },
        },
      ],
      required: false,
      fragments: [
        {
          when: { equals: 'tenant' },
          text: 'Every search over embeddings carries the tenant and access-right filter inside the query itself, taken from the authenticated session and never from the model or the request text; a search without it is a bug, and so is a test that does not cover two tenants.',
        },
        {
          when: { equals: 'metadata' },
          text: 'Apply metadata filters (product, language, date) inside the search query, never on its results: filtering afterwards can leave none of the top results.',
        },
        {
          when: { equals: 'shared' },
          text: 'The indexed corpus is readable by every user: never index a private or per-customer document into it, and stop and ask when a new source holds some.',
        },
      ],
    },
    // D6 — retrieval-augmented generation
    {
      id: 'llm-retrieval',
      type: 'single',
      slot: 'llm.retrieval',
      section: 'Context and retrieval',
      label: {
        en: 'To give the model passages of our data (RAG), the project retrieves them with:',
        fr: 'Pour donner au modèle des passages de nos données (RAG), le projet les récupère par :',
      },
      options: [
        {
          value: 'vector',
          label: { en: 'Vector search only', fr: 'La recherche vectorielle seule' },
        },
        {
          value: 'hybrid',
          label: {
            en: 'Hybrid search (vectors and keywords)',
            fr: 'La recherche hybride (vecteurs et mots-clés)',
          },
        },
        {
          value: 'hybrid-rerank',
          label: {
            en: 'Hybrid search, then re-ranking',
            fr: 'La recherche hybride, puis un reclassement',
          },
        },
        {
          value: 'full-context',
          label: {
            en: 'No retrieval: the whole corpus fits in the context',
            fr: 'Aucune recherche : tout le corpus tient dans le contexte',
          },
        },
        { value: 'none', label: { en: 'Not used', fr: 'Non utilisé' } },
      ],
      required: false,
      fragments: [
        {
          when: { equals: 'vector' },
          text: 'Retrieval is vector search only: keep the number of passages a named setting (5 to 20 in practice), and say when a query depends on exact terms (codes, names, identifiers) that vector search misses.',
        },
        {
          when: { equals: 'hybrid' },
          text: 'Retrieval is hybrid: run the vector and the keyword (BM25) search and merge them through the existing function; never drop the keyword side, which finds exact codes, names and identifiers.',
        },
        {
          when: { equals: 'hybrid-rerank' },
          text: 'Retrieval is hybrid search then re-ranking: fetch a wide candidate set (about 20), re-rank it, and pass only the best (about 5) to the model; keep both numbers named settings.',
        },
        {
          when: { equals: 'full-context' },
          text: 'The whole corpus is sent in the context, with no retrieval: keep it small and stable, place it in the cached prefix, and say when it grows past what one call should carry.',
        },
        {
          when: { equals: 'none' },
          text: 'The project does not use retrieval-augmented generation: do not add a retrieval step, an index or a vector store unasked.',
        },
        {
          when: { answered: true },
          text: 'Use retrieval to bring knowledge to the model and fine-tuning only for style or format: never propose fine-tuning to keep facts up to date.',
        },
      ],
    },
    {
      id: 'llm-chunking',
      type: 'single',
      slot: 'llm.chunking',
      section: 'Context and retrieval',
      label: {
        en: 'Before indexing, documents are split:',
        fr: 'Avant indexation, les documents sont découpés :',
      },
      options: [
        {
          value: 'structure',
          label: {
            en: 'Along their structure (headings, paragraphs)',
            fr: 'Selon leur structure (titres, paragraphes)',
          },
        },
        {
          value: 'fixed',
          label: {
            en: 'Into fixed-size passages with an overlap',
            fr: 'En passages de taille fixe avec chevauchement',
          },
        },
        {
          value: 'whole',
          label: {
            en: 'Not at all: one vector per document',
            fr: 'Pas du tout : un vecteur par document',
          },
        },
        { value: 'other', label: { en: 'Another way', fr: 'Autrement' }, freeText: true },
      ],
      required: false,
      fragments: [
        {
          when: { equals: 'structure' },
          text: 'Split documents along their structure (headings, paragraphs, list items) into passages of about 200 to 800 tokens, never in the middle of a sentence, a table or a code block.',
        },
        {
          when: { equals: 'fixed' },
          text: 'Split documents into fixed-size passages (about 200 to 800 tokens) with a 10 to 20 % overlap; keep the size and the overlap named settings, and re-index when either changes.',
        },
        {
          when: { equals: 'whole' },
          text: 'Each document is indexed whole, as one vector: keep documents short enough for the embedding model, and do not add a splitting step unasked.',
        },
        {
          when: { other: true },
          text: 'Documents are split this way before indexing: {value}; follow it for a new source.',
        },
        {
          when: { answered: true },
          text: 'Store with each indexed passage the metadata needed to filter and to cite it (source document, position, owner, date), and make indexing safe to run again without creating duplicates.',
        },
      ],
    },
    {
      id: 'llm-grounding',
      type: 'scale',
      slot: 'llm.grounding',
      section: 'Context and retrieval',
      label: {
        en: 'An answer built from retrieved passages uses only them, cites its sources, and says when the information is missing.',
        fr: 'Une réponse construite à partir de passages récupérés n’utilise qu’eux, cite ses sources, et dit quand l’information manque.',
      },
      required: false,
      fragments: [
        {
          when: { scaleAtLeast: 4 },
          text: 'A prompt that receives retrieved passages tells the model to answer from them only, to return the identifiers of the passages used, and to say so when they do not hold the answer; check in code that every returned source was among the passages sent.',
        },
        {
          when: { scaleAtMost: 2 },
          text: 'A model may complete retrieved passages with its general knowledge; keep the output able to tell which statements come from a source, and never invent a source reference.',
        },
      ],
    },
    // D7 — prompt engineering
    {
      id: 'llm-prompt-location',
      type: 'single',
      slot: 'llm.prompt-location',
      section: 'Models and prompts',
      label: { en: 'Prompts live:', fr: 'Les prompts se trouvent :' },
      options: [
        {
          value: 'prompt-files',
          label: {
            en: 'In their own files, in one folder of the repository',
            fr: 'Dans leurs propres fichiers, dans un dossier du dépôt',
          },
        },
        {
          value: 'in-code',
          label: {
            en: 'In the code, next to the call that uses them',
            fr: 'Dans le code, à côté de l’appel qui les utilise',
          },
        },
        {
          value: 'external',
          label: {
            en: 'In a prompt management tool, outside the repository',
            fr: 'Dans un outil de gestion de prompts, hors du dépôt',
          },
        },
        { value: 'other', label: { en: 'Somewhere else', fr: 'Ailleurs' }, freeText: true },
      ],
      required: false,
      fragments: [
        {
          when: { equals: 'prompt-files' },
          text: 'Prompts live in their own files in the prompts folder of the repository: add a new prompt there, load it through the existing loader, and never write prompt text inline in feature code.',
        },
        {
          when: { equals: 'in-code' },
          text: 'A prompt lives next to the call that uses it, as a named constant or a function that builds it; never assemble one from string pieces scattered across modules.',
        },
        {
          when: { equals: 'external' },
          text: 'Prompts live in a prompt management tool outside the repository: fetch one by name and pinned version, never copy its text into the code, and say which prompt and version a change expects.',
        },
        {
          when: { other: true },
          text: 'Prompts live here: {value}; add and change them there only.',
        },
        {
          when: { answered: true },
          text: 'Treat a prompt as a versioned specification: one reviewed change per prompt edit, with the reason, and no prompt edit hidden in an unrelated change.',
        },
      ],
    },
    {
      id: 'llm-prompt-structure',
      type: 'multi',
      slot: 'llm.prompt-structure',
      section: 'Models and prompts',
      label: {
        en: 'A prompt in this project always:',
        fr: 'Un prompt de ce projet, toujours :',
      },
      options: [
        {
          value: 'delimiters',
          label: {
            en: 'Wraps data in delimiters, apart from the instructions',
            fr: 'Entoure les données de délimiteurs, à part des consignes',
          },
        },
        {
          value: 'role',
          label: {
            en: 'States the role, what to refuse and when to say “I do not know”',
            fr: 'Énonce le rôle, ce qu’il faut refuser et quand dire « je ne sais pas »',
          },
        },
        {
          value: 'output-format',
          label: { en: 'States the output format', fr: 'Énonce le format de sortie' },
        },
        {
          value: 'examples',
          label: {
            en: 'Gives a few input and output examples',
            fr: 'Donne quelques exemples d’entrée et de sortie',
          },
        },
        {
          value: 'reasoning',
          label: {
            en: 'Asks for step-by-step reasoning before the answer',
            fr: 'Demande un raisonnement étape par étape avant la réponse',
          },
        },
      ],
      required: false,
      fragments: [
        {
          when: { includes: 'delimiters' },
          text: 'In a prompt, keep instructions in the system part and wrap every piece of data (user text, documents, tool results) in named delimiters such as `<docs>` and `<question>`; never concatenate user text into the instructions.',
        },
        {
          when: { includes: 'role' },
          text: 'Start a system prompt with the role of the model, what it does, what it refuses, and the instruction to say so when the information is missing.',
        },
        {
          when: { includes: 'output-format' },
          text: 'State the expected output format in every prompt (fields, types, language, length) and keep it in step with the schema the code validates the answer against.',
        },
        {
          when: { includes: 'examples' },
          text: 'Give a prompt a few varied input and output examples when the format or the tone is precise; keep them few, since they cost tokens and the model copies them too closely.',
        },
        {
          when: { includes: 'reasoning' },
          text: 'Ask for step-by-step reasoning before the final answer on calculation, logic and multi-step decisions, in a field apart from the answer; leave it out for a reasoning model, which already does it, and for simple tasks.',
        },
      ],
    },
    {
      id: 'llm-prompt-changes',
      type: 'single',
      slot: 'llm.prompt-changes',
      section: 'Models and prompts',
      label: {
        en: 'To change an existing prompt, the assistant:',
        fr: 'Pour modifier un prompt existant, l’assistant :',
      },
      options: [
        { value: 'ask', label: { en: 'Asks me first', fr: 'Me demande d’abord' } },
        {
          value: 'with-evals',
          label: {
            en: 'May do it, and replays the evaluation cases',
            fr: 'Peut le faire, et rejoue les cas d’évaluation',
          },
        },
        { value: 'never', label: { en: 'Never does', fr: 'Ne le fait jamais' } },
      ],
      required: false,
      fragments: [
        {
          when: { equals: 'ask' },
          text: 'Ask before changing an existing prompt, with the proposed wording and the case it fixes: a retouch that fixes one case often breaks others.',
        },
        {
          when: { equals: 'with-evals' },
          text: 'An existing prompt may be changed when its evaluation cases are replayed before and after; report both results, and add a case for the behaviour the change is meant to fix.',
        },
        {
          when: { equals: 'never' },
          text: 'Never change the text of an existing prompt: describe the change you would make and the case it fixes, and leave the edit to the owner.',
        },
      ],
    },
    // D8 — context engineering
    {
      id: 'llm-context-selection',
      type: 'scale',
      slot: 'llm.context-selection',
      section: 'Context and retrieval',
      label: {
        en: 'A call receives only what it needs: more context is not better.',
        fr: 'Un appel ne reçoit que ce dont il a besoin : plus de contexte n’est pas mieux.',
      },
      required: false,
      fragments: [
        {
          when: { scaleAtLeast: 4 },
          text: 'Send a call only what its task needs: select documents and fields instead of passing whole records, date or drop outdated and contradictory sources, and justify any growth of the context with an evaluation result.',
        },
        {
          when: { scaleAtMost: 2 },
          text: 'Passing generous context is accepted where it stays well under the window; still remove contradictory or outdated sources, since the model cannot tell which one is right.',
        },
      ],
    },
    {
      id: 'llm-context-order',
      type: 'scale',
      slot: 'llm.context-order',
      section: 'Context and retrieval',
      label: {
        en: 'The fixed part of the context comes first and stays identical between calls, so that prompt caching applies.',
        fr: 'La partie fixe du contexte vient en premier et reste identique d’un appel à l’autre, pour que le cache de prompt s’applique.',
      },
      required: false,
      fragments: [
        {
          when: { scaleAtLeast: 4 },
          text: 'Build the context in a stable order: fixed instructions and tool definitions first, byte-identical between calls, then documents, history and the current message; never put a date, an identifier or a per-user value in the fixed prefix.',
        },
        {
          when: { scaleAtMost: 2 },
          text: 'The project does not rely on prompt caching: order the context for clarity, and do not add cache markers or reorder a prompt for caching unasked.',
        },
      ],
    },
    {
      id: 'llm-history',
      type: 'single',
      slot: 'llm.history',
      section: 'Context and retrieval',
      label: {
        en: 'When a conversation or its inputs grow long, the project:',
        fr: 'Quand une conversation ou ses entrées deviennent longues, le projet :',
      },
      options: [
        {
          value: 'summarize',
          label: {
            en: 'Summarizes the older turns',
            fr: 'Résume les tours les plus anciens',
          },
        },
        {
          value: 'truncate',
          label: {
            en: 'Drops the oldest turns',
            fr: 'Supprime les tours les plus anciens',
          },
        },
        {
          value: 'refuse',
          label: {
            en: 'Refuses past a limit and asks to start again',
            fr: 'Refuse au-delà d’une limite et demande de recommencer',
          },
        },
        {
          value: 'not-applicable',
          label: { en: 'Has no long conversation', fr: 'N’a pas de longue conversation' },
        },
      ],
      required: false,
      fragments: [
        {
          when: { equals: 'summarize' },
          text: 'When the history nears its token budget, replace the older turns with a summary through the existing compaction step; keep the system instructions and the latest turns verbatim, and store the summary rather than computing it again at each call.',
        },
        {
          when: { equals: 'truncate' },
          text: 'When the history nears its token budget, drop the oldest turns first, never the system instructions, and never cut between a request and the answer that goes with it.',
        },
        {
          when: { equals: 'refuse' },
          text: 'Past the configured length, refuse the request with a clear message asking to start a new conversation; never trim or summarize a conversation silently.',
        },
        {
          when: { equals: 'not-applicable' },
          text: 'Calls are short and single-purpose: do not add history trimming or summarizing unasked, and bound the size of each input instead.',
        },
      ],
    },
    // D9 — integration through the provider API
    {
      id: 'llm-streaming',
      type: 'single',
      slot: 'llm.streaming',
      section: 'Model calls',
      label: {
        en: 'An answer shown to a user is:',
        fr: 'Une réponse affichée à un utilisateur est :',
      },
      options: [
        {
          value: 'stream',
          label: {
            en: 'Streamed as it is generated (server-sent events)',
            fr: 'Diffusée au fil de la génération (server-sent events)',
          },
        },
        {
          value: 'complete',
          label: { en: 'Sent once complete', fr: 'Envoyée une fois complète' },
        },
        {
          value: 'background',
          label: {
            en: 'Produced by a background job, never during a request',
            fr: 'Produite par une tâche de fond, jamais pendant une requête',
          },
        },
      ],
      required: false,
      fragments: [
        {
          when: { equals: 'stream' },
          text: 'Stream an answer shown to a user as server-sent events through the existing streaming helper: handle an error and a client disconnect in the middle of the stream, cancel the provider call when the client leaves, and validate or store the text only once it is complete.',
        },
        {
          when: { equals: 'complete' },
          text: 'Model answers are returned once complete: do not add streaming unasked, and give the request a timeout that fits the longest expected answer.',
        },
        {
          when: { equals: 'background' },
          text: 'Call a model from a background job only, never inside a request handler: the request enqueues the job and the client reads the result later; make the job safe to retry.',
        },
      ],
    },
    {
      id: 'llm-resilience',
      type: 'multi',
      slot: 'llm.resilience',
      section: 'Model calls',
      label: {
        en: 'Every call to a model has:',
        fr: 'Chaque appel à un modèle a :',
      },
      options: [
        { value: 'timeout', label: { en: 'A timeout', fr: 'Un délai maximal' } },
        {
          value: 'retries',
          label: {
            en: 'Retries with backoff on rate limits and server errors',
            fr: 'Des nouvelles tentatives avec attente croissante sur les limites de débit et les erreurs serveur',
          },
        },
        {
          value: 'fallback',
          label: { en: 'A fallback model', fr: 'Un modèle de repli' },
        },
        {
          value: 'user-quota',
          label: {
            en: 'A quota per user or customer',
            fr: 'Un quota par utilisateur ou par client',
          },
        },
        {
          value: 'degraded-mode',
          label: {
            en: 'A way for the feature to work without the model',
            fr: 'Un moyen pour la fonctionnalité de marcher sans le modèle',
          },
        },
      ],
      required: false,
      fragments: [
        {
          when: { includes: 'timeout' },
          text: 'Give every model call an explicit timeout and pass the cancellation signal of the request down to it; never rely on the default of the SDK.',
        },
        {
          when: { includes: 'retries' },
          text: 'Retry a model call only on a rate limit (429), a server error (5xx) or a network failure, with exponential backoff, jitter and a small maximum; never retry another 4xx, and do not stack your own retries on those of the SDK.',
        },
        {
          when: { includes: 'fallback' },
          text: 'When the main model stays unavailable after its retries, fall back to the configured fallback model through the existing helper, and record which model answered.',
        },
        {
          when: { includes: 'user-quota' },
          text: 'Check the token or request quota of the user or the customer before a model call and record the usage after it; a new feature that calls a model goes through the same quota.',
        },
        {
          when: { includes: 'degraded-mode' },
          text: 'A feature that calls a model keeps working when the model does not answer: return the designed fallback (a plain result, a clear message), never an unhandled error or an endless spinner.',
        },
      ],
    },
    {
      id: 'llm-structured-output',
      type: 'single',
      slot: 'llm.structured-output',
      section: 'Model calls',
      label: {
        en: 'When code reads a model answer, the answer is:',
        fr: 'Quand du code lit une réponse du modèle, cette réponse est :',
      },
      options: [
        {
          value: 'schema-constrained',
          label: {
            en: 'Constrained to a schema by the provider, then validated',
            fr: 'Contrainte à un schéma par le fournisseur, puis validée',
          },
        },
        {
          value: 'json-validated',
          label: {
            en: 'JSON asked for in the prompt, then validated',
            fr: 'Du JSON demandé dans le prompt, puis validé',
          },
        },
        {
          value: 'free-text',
          label: {
            en: 'Free text: code never reads it',
            fr: 'Du texte libre : le code ne la lit jamais',
          },
        },
      ],
      required: false,
      fragments: [
        {
          when: { equals: 'schema-constrained' },
          text: 'When code reads a model answer, request structured output with a schema defined once in the validation library of the project, derive the type from it, and still validate the parsed answer before use.',
        },
        {
          when: { equals: 'json-validated' },
          text: 'When code reads a model answer, ask for JSON in the prompt, parse it and validate it against a schema; on a failure, retry a bounded number of times with the validation error, then fail clearly.',
        },
        {
          when: { equals: 'free-text' },
          text: 'Model answers are free text shown to people: never parse one with a regular expression or branch on its wording; when code needs a value from the model, stop and ask.',
        },
        {
          when: { answered: true },
          text: 'A model answer is untrusted input to the rest of the program: never pass it unvalidated to a database query, a shell command, an HTML page or another service.',
        },
      ],
    },
    // D10 — Model Context Protocol
    {
      id: 'llm-mcp-role',
      type: 'single',
      slot: 'llm.mcp-role',
      section: 'Model calls',
      label: {
        en: 'With the Model Context Protocol (MCP), the product:',
        fr: 'Avec le Model Context Protocol (MCP), le produit :',
      },
      options: [
        {
          value: 'server',
          label: {
            en: 'Exposes an MCP server to its users’ tools',
            fr: 'Expose un serveur MCP aux outils de ses utilisateurs',
          },
        },
        {
          value: 'client',
          label: {
            en: 'Connects to MCP servers as a client',
            fr: 'Se connecte à des serveurs MCP en tant que client',
          },
        },
        { value: 'both', label: { en: 'Does both', fr: 'Fait les deux' } },
        { value: 'none', label: { en: 'Does not use it', fr: 'Ne l’utilise pas' } },
      ],
      required: false,
      fragments: [
        {
          when: { equals: 'server' },
          text: 'The product exposes an MCP server: build it on the official MCP SDK, give each tool a typed argument schema and a description written for a model, and treat tool names and arguments as a public contract that does not change shape once released.',
        },
        {
          when: { equals: 'client' },
          text: 'The product connects to MCP servers as a client: connect only to the servers listed in configuration, treat tool descriptions and results as untrusted data, and never forward the credentials of a user to a server.',
        },
        {
          when: { equals: 'both' },
          text: 'The product exposes an MCP server and connects to others: build both on the official MCP SDK, keep released tool names and arguments stable, connect only to configured servers, and treat what they return as untrusted data.',
        },
        {
          when: { equals: 'none' },
          text: 'The product does not use the Model Context Protocol: do not add an MCP server or client unasked.',
        },
        {
          when: { answered: true },
          text: 'Do not confuse MCP with function calling: function calling is how a model asks for a tool, MCP is how a host discovers and reaches tools; never re-implement the protocol by hand.',
        },
      ],
    },
    {
      id: 'llm-mcp-transport',
      type: 'single',
      slot: 'llm.mcp-transport',
      section: 'Model calls',
      label: {
        en: 'The MCP server the product exposes is reached:',
        fr: 'Le serveur MCP que le produit expose est joint :',
      },
      options: [
        {
          value: 'remote',
          label: {
            en: 'Over HTTP, by authenticated users',
            fr: 'En HTTP, par des utilisateurs authentifiés',
          },
        },
        {
          value: 'local',
          label: {
            en: 'As a local process (stdio)',
            fr: 'Comme un processus local (stdio)',
          },
        },
        {
          value: 'not-applicable',
          label: { en: 'There is none', fr: 'Il n’y en a pas' },
        },
      ],
      required: false,
      fragments: [
        {
          when: { equals: 'remote' },
          text: 'The MCP server is remote, over Streamable HTTP: authenticate every request, check the scope of the token and the ownership of the resource in each tool, log each tool call, and add a tool that writes only with its own scope: each tool is attack surface.',
        },
        {
          when: { equals: 'local' },
          text: 'The MCP server runs as a local process over stdio: write protocol messages only to standard output and logs to standard error, and read credentials from the environment, never from tool arguments.',
        },
        {
          when: { equals: 'not-applicable' },
          text: 'The product exposes no MCP server: do not add an MCP endpoint or transport unasked.',
        },
      ],
    },
    // D11 — self-hosted models and inference
    {
      id: 'llm-model-hosting',
      type: 'single',
      slot: 'llm.model-hosting',
      section: 'Models and prompts',
      label: {
        en: 'In production, models run:',
        fr: 'En production, les modèles s’exécutent :',
      },
      options: [
        {
          value: 'hosted',
          label: {
            en: 'At a model provider, through its API',
            fr: 'Chez un fournisseur de modèles, via son API',
          },
        },
        {
          value: 'self-hosted',
          label: {
            en: 'On our own servers (open-weight models)',
            fr: 'Sur nos propres serveurs (modèles à poids ouverts)',
          },
        },
        { value: 'both', label: { en: 'Both', fr: 'Les deux' } },
        {
          value: 'client-side',
          label: {
            en: 'On the user’s device (browser or app)',
            fr: 'Sur l’appareil de l’utilisateur (navigateur ou application)',
          },
        },
      ],
      required: false,
      fragments: [
        {
          when: { equals: 'hosted' },
          text: 'Models are hosted by a model provider: keep its API key on the server, never in client code or in a prompt, and do not add a self-hosted model or an inference server unasked.',
        },
        {
          when: { equals: 'self-hosted' },
          text: 'Models are self-hosted open-weight models behind an inference server: keep the model, its quantization, the maximum context length and the concurrency limit in configuration, and remember that long contexts and concurrent requests are what fill GPU memory.',
        },
        {
          when: { equals: 'both' },
          text: 'Some tasks run on a hosted model and some on a self-hosted one: follow the existing assignment for a new task, and never send to the hosted model the data that the self-hosted one exists to keep in house.',
        },
        {
          when: { equals: 'client-side' },
          text: 'Models run on the device of the user: keep them small, load them lazily with a visible progress state, and provide a path for a device that cannot run them.',
        },
        {
          when: { answered: true },
          text: 'Before adding a model or its weights, read its licence for commercial use and restrictions and say what it allows: open weights do not mean open source.',
        },
      ],
    },
    {
      id: 'llm-dev-calls',
      type: 'single',
      slot: 'llm.dev-calls',
      section: 'Testing',
      label: {
        en: 'In automated tests, a call to a model is:',
        fr: 'Dans les tests automatisés, un appel à un modèle est :',
      },
      options: [
        {
          value: 'fake',
          label: {
            en: 'Replaced by a fake or a recorded answer',
            fr: 'Remplacé par un faux ou une réponse enregistrée',
          },
        },
        {
          value: 'local-model',
          label: {
            en: 'Sent to a small model running locally',
            fr: 'Envoyé à un petit modèle exécuté en local',
          },
        },
        {
          value: 'real',
          label: {
            en: 'Sent to the real model, with a test key',
            fr: 'Envoyé au vrai modèle, avec une clé de test',
          },
        },
      ],
      required: false,
      fragments: [
        {
          when: { equals: 'fake' },
          text: 'Automated tests never call a model: swap the model client for the existing fake or a recorded answer, and test the code around the call (prompt building, parsing, validation, error paths, truncated and malformed answers).',
        },
        {
          when: { equals: 'local-model' },
          text: 'Automated tests call a small local model through the same interface as production: assert on structure and invariants, never on exact wording, and do not judge answer quality from it.',
        },
        {
          when: { equals: 'real' },
          text: 'Tests that call the real model are kept apart from unit tests, few and tagged so they can be skipped: assert on structure and invariants, never on exact wording, and cap what one run may spend.',
        },
      ],
    },
    {
      id: 'llm-fine-tuning',
      type: 'single',
      slot: 'llm.fine-tuning',
      section: 'Models and prompts',
      label: { en: 'Fine-tuning:', fr: 'Le fine-tuning :' },
      options: [
        { value: 'none', label: { en: 'Is not used', fr: 'N’est pas utilisé' } },
        {
          value: 'adapters',
          label: {
            en: 'Is used, with adapters (LoRA) loaded at deployment',
            fr: 'Est utilisé, avec des adaptateurs (LoRA) chargés au déploiement',
          },
        },
        {
          value: 'full',
          label: {
            en: 'Is used, and produces whole models',
            fr: 'Est utilisé, et produit des modèles entiers',
          },
        },
      ],
      required: false,
      fragments: [
        {
          when: { equals: 'none' },
          text: 'The project does not fine-tune models: improve a result through the prompt, the context or retrieval, and do not propose fine-tuning or add training code unasked.',
        },
        {
          when: { equals: 'adapters' },
          text: 'Fine-tuning produces adapters loaded at deployment: version an adapter with the exact base model and the dataset it came from, never commit weights to the repository, and replay the evaluation set before one replaces another.',
        },
        {
          when: { equals: 'full' },
          text: 'Fine-tuning produces whole models: version each with the dataset and the settings it came from, never commit weights to the repository, and replay the evaluation set before one replaces another.',
        },
      ],
    },
    // D12 — evaluation
    {
      id: 'llm-eval-tool',
      type: 'single',
      slot: 'llm.eval-tool',
      section: 'Evaluation and observability',
      label: {
        en: 'Evaluation cases for model features are run with:',
        fr: 'Les cas d’évaluation des fonctionnalités à base de modèle sont lancés avec :',
      },
      options: [
        {
          value: 'test-runner',
          label: {
            en: 'Our own scripts or the project’s test runner',
            fr: 'Nos propres scripts ou le lanceur de tests du projet',
          },
        },
        { value: 'deepeval', label: { en: 'DeepEval', fr: 'DeepEval' } },
        { value: 'ragas', label: { en: 'Ragas', fr: 'Ragas' } },
        {
          value: 'none',
          label: { en: 'Nothing: there are none yet', fr: 'Rien : il n’y en a pas encore' },
        },
        { value: 'other', label: { en: 'Something else', fr: 'Autre chose' }, freeText: true },
      ],
      required: false,
      fragments: [
        {
          when: { equals: 'test-runner' },
          text: 'Evaluation cases are files in the repository (input, expected result, category) run by the existing evaluation script: add cases there, and report scores per category rather than one global number.',
        },
        {
          when: { equals: 'deepeval' },
          text: 'Evaluations run with DeepEval: write a new one as a test case next to the existing ones, with the metrics the project already uses, and do not add another evaluation framework.',
        },
        {
          when: { equals: 'ragas' },
          text: 'Evaluations run with Ragas: reuse its faithfulness, answer relevancy, context precision and context recall metrics, and do not add another evaluation framework.',
        },
        {
          when: { equals: 'none' },
          text: 'The project has no evaluation set yet: say so whenever a change touches a prompt, a model or retrieval, and propose the first cases instead of claiming the change is an improvement.',
        },
        {
          when: { other: true },
          text: 'Evaluations run with {value}; add new cases there and do not add another evaluation framework.',
        },
        {
          when: { answered: true },
          text: 'When a model feature gives a wrong answer, add that input and the expected result to the evaluation cases before fixing it; never delete or weaken a case to make a score pass.',
        },
      ],
    },
    {
      id: 'llm-eval-scoring',
      type: 'multi',
      slot: 'llm.eval-scoring',
      section: 'Evaluation and observability',
      label: {
        en: 'Model outputs are scored by:',
        fr: 'Les sorties du modèle sont notées par :',
      },
      options: [
        {
          value: 'deterministic',
          label: {
            en: 'Deterministic checks (valid JSON, exact value, forbidden word)',
            fr: 'Des vérifications déterministes (JSON valide, valeur exacte, mot interdit)',
          },
        },
        {
          value: 'model-judge',
          label: {
            en: 'A model that grades against a rubric',
            fr: 'Un modèle qui note selon une grille',
          },
        },
        {
          value: 'human',
          label: {
            en: 'People who review samples',
            fr: 'Des personnes qui relisent des échantillons',
          },
        },
        {
          value: 'retrieval-metrics',
          label: {
            en: 'Retrieval metrics, apart from the answer',
            fr: 'Des métriques de recherche, à part de la réponse',
          },
        },
      ],
      required: false,
      fragments: [
        {
          when: { includes: 'deterministic' },
          text: 'Score with a deterministic check whatever has a right answer (valid JSON, exact value, expected call, forbidden word absent); do not use a model as a judge where a rule decides.',
        },
        {
          when: { includes: 'model-judge' },
          text: 'A model used as a judge grades against a written rubric with explicit criteria, at low temperature, with a structured verdict; never change its prompt or its model without comparing its grades again with human ones, and beware its bias toward long answers.',
        },
        {
          when: { includes: 'human' },
          text: 'People review samples of model outputs: keep producing the export they review when an output format changes, and flag for review the cases where automatic scores and the expected result disagree.',
        },
        {
          when: { includes: 'retrieval-metrics' },
          text: 'Evaluate retrieval apart from generation: each retrieval case names the passages that should be found, and a wrong answer is first checked for a missed passage before the prompt is touched.',
        },
      ],
    },
    {
      id: 'llm-eval-gate',
      type: 'single',
      slot: 'llm.eval-gate',
      section: 'Evaluation and observability',
      label: {
        en: 'A change to a prompt, a model or retrieval is checked against the evaluation cases:',
        fr: 'Un changement de prompt, de modèle ou de recherche est vérifié sur les cas d’évaluation :',
      },
      options: [
        {
          value: 'ci',
          label: {
            en: 'In CI, which blocks under a threshold',
            fr: 'En CI, qui bloque sous un seuil',
          },
        },
        {
          value: 'manual',
          label: {
            en: 'By hand, before the change is merged',
            fr: 'À la main, avant la fusion du changement',
          },
        },
        { value: 'none', label: { en: 'Not systematically', fr: 'Pas systématiquement' } },
      ],
      required: false,
      fragments: [
        {
          when: { equals: 'ci' },
          text: 'CI replays the evaluation cases on any change to a prompt, a model, sampling parameters or retrieval and blocks under the threshold: never lower the threshold, skip the job or remove a case to get a change through.',
        },
        {
          when: { equals: 'manual' },
          text: 'Before handing back a change to a prompt, a model, sampling parameters or retrieval, run the evaluation command and report the scores before and after; when you cannot run it, say so.',
        },
        {
          when: { equals: 'none' },
          text: 'No evaluation run gates a change: state in the summary of any change to a prompt, a model or retrieval that it is unmeasured, and list the cases you tried by hand.',
        },
      ],
    },
    // D13 — observability and production
    {
      id: 'llm-tracing',
      type: 'single',
      slot: 'llm.tracing',
      section: 'Evaluation and observability',
      label: {
        en: 'Model calls are traced with:',
        fr: 'Les appels au modèle sont tracés avec :',
      },
      options: [
        { value: 'opentelemetry', label: { en: 'OpenTelemetry', fr: 'OpenTelemetry' } },
        { value: 'langfuse', label: { en: 'Langfuse', fr: 'Langfuse' } },
        {
          value: 'structured-logs',
          label: {
            en: 'The application’s structured logs',
            fr: 'Les journaux structurés de l’application',
          },
        },
        { value: 'none', label: { en: 'Nothing', fr: 'Rien' } },
        { value: 'other', label: { en: 'Something else', fr: 'Autre chose' }, freeText: true },
      ],
      required: false,
      fragments: [
        {
          when: { equals: 'opentelemetry' },
          text: 'Trace model calls with OpenTelemetry: wrap each retrieval, model call and tool execution in a span under the trace of the request, with the model, token counts, duration and stop reason as attributes.',
        },
        {
          when: { equals: 'langfuse' },
          text: 'Trace model calls with Langfuse through the existing wrapper: every new call goes through it, named after its feature and linked to the trace of the request; do not add another tracing tool.',
        },
        {
          when: { equals: 'structured-logs' },
          text: 'Log one structured event per model call through the logger of the project: feature, model, token counts, duration, stop reason and the request identifier.',
        },
        {
          when: { equals: 'none' },
          text: 'Model calls are not traced: do not add a tracing tool unasked, but keep the request identifier, the model and the stop reason in the error raised when a call fails.',
        },
        {
          when: { other: true },
          text: 'Model calls are traced with {value}; send every new call through it and do not add another tracing tool.',
        },
        {
          when: { answered: true },
          text: 'A successful HTTP status says nothing about the quality of an answer: keep refusals, truncated answers, validation failures and user feedback visible apart from transport errors.',
        },
      ],
    },
    {
      id: 'llm-prompt-logging',
      type: 'single',
      slot: 'llm.prompt-logging',
      section: 'Evaluation and observability',
      label: {
        en: 'In logs and traces, the content of prompts and answers is:',
        fr: 'Dans les journaux et les traces, le contenu des prompts et des réponses est :',
      },
      options: [
        {
          value: 'metadata-only',
          label: {
            en: 'Never kept: metadata only',
            fr: 'Jamais conservé : métadonnées seulement',
          },
        },
        {
          value: 'masked',
          label: {
            en: 'Kept with personal data and secrets masked',
            fr: 'Conservé avec les données personnelles et les secrets masqués',
          },
        },
        { value: 'full', label: { en: 'Kept in full', fr: 'Conservé en entier' } },
      ],
      required: false,
      fragments: [
        {
          when: { equals: 'metadata-only' },
          text: 'Never write the content of a prompt or of a model answer to a log, a trace or an error message: record metadata only (feature, model, token counts, duration, stop reason, identifiers).',
        },
        {
          when: { equals: 'masked' },
          text: 'Prompts and answers are stored only after the existing masking step has removed personal data and secrets; never log them through another path, and keep their retention limited.',
        },
        {
          when: { equals: 'full' },
          text: 'Prompts and answers are stored in full in the tracing store only, never in application logs or error messages; say when a new feature would put personal data or secrets into them.',
        },
      ],
    },
    {
      id: 'llm-cost-tracking',
      type: 'scale',
      slot: 'llm.cost-tracking',
      section: 'Evaluation and observability',
      label: {
        en: 'Every model call records its token usage, attributed to a feature and a customer.',
        fr: 'Chaque appel au modèle enregistre sa consommation de tokens, attribuée à une fonctionnalité et à un client.',
      },
      required: false,
      fragments: [
        {
          when: { scaleAtLeast: 4 },
          text: 'Record for every model call the input, output and cached token counts returned by the provider, with the model, the feature and the customer; a new call that is not attributed is incomplete, and prices live in one table, never in feature code.',
        },
        {
          when: { scaleAtMost: 2 },
          text: 'Token usage is not tracked per call: do not add usage tables or cost dashboards unasked, but say when a change multiplies the number or the size of model calls.',
        },
      ],
    },
    // D14 — security and ethics
    {
      id: 'llm-prompt-injection',
      type: 'scale',
      slot: 'llm.prompt-injection',
      section: 'LLM security',
      label: {
        en: 'Any text the model reads may be hostile: safety comes from permissions and validation outside the model, never from the system prompt.',
        fr: 'Tout texte lu par le modèle peut être hostile : la sécurité vient des droits et de la validation hors du modèle, jamais du prompt système.',
      },
      required: false,
      fragments: [
        {
          when: { scaleAtLeast: 4 },
          text: 'Treat every text a model reads (user message, document, web page, file, image, transcript) as able to carry instructions: never rely on a prompt to enforce a rule, enforce permissions and limits in code, and keep secrets and other users’ data out of the context.',
        },
        {
          when: { scaleAtMost: 2 },
          text: 'The model only reads content written by trusted staff: delimit it all the same, never place a key or a token in a prompt, and say when a change lets outside content reach a model.',
        },
      ],
    },
    {
      id: 'llm-provider-data',
      type: 'single',
      slot: 'llm.provider-data',
      section: 'LLM security',
      label: {
        en: 'Personal or confidential data sent to an outside model provider:',
        fr: 'Les données personnelles ou confidentielles envoyées à un fournisseur de modèles externe :',
      },
      options: [
        {
          value: 'never',
          label: { en: 'Never leaves our systems', fr: 'Ne quittent jamais nos systèmes' },
        },
        {
          value: 'masked',
          label: {
            en: 'Is masked or pseudonymized first',
            fr: 'Sont d’abord masquées ou pseudonymisées',
          },
        },
        {
          value: 'allowed',
          label: {
            en: 'Is allowed, under our contract with the provider',
            fr: 'Sont autorisées, dans le cadre de notre contrat avec le fournisseur',
          },
        },
        {
          value: 'no-provider',
          label: {
            en: 'No outside provider is used',
            fr: 'Aucun fournisseur externe n’est utilisé',
          },
        },
      ],
      required: false,
      fragments: [
        {
          when: { equals: 'never' },
          text: 'Never put personal or confidential data in a call to an outside model provider; when a feature needs it, stop and ask instead of sending it.',
        },
        {
          when: { equals: 'masked' },
          text: 'Before a call to an outside model provider, pass the input through the existing masking step and restore the values in the answer afterwards; a new call that skips it is a bug.',
        },
        {
          when: { equals: 'allowed' },
          text: 'Personal data may be sent to the model provider under the existing contract: send the minimum fields the task needs, never a whole record, and keep the configured region and retention settings untouched.',
        },
        {
          when: { equals: 'no-provider' },
          text: 'No data goes to an outside model provider: do not add a call to a hosted model, a hosted embedding service or a hosted moderation service unasked.',
        },
        {
          when: { answered: true },
          text: 'When the model provider accepts an end-user identifier for abuse detection, send a pseudonymous one, never an e-mail address or a name.',
        },
      ],
    },
    {
      id: 'llm-guardrails',
      type: 'multi',
      slot: 'llm.guardrails',
      section: 'LLM security',
      label: {
        en: 'Around a model call that serves users, the project has:',
        fr: 'Autour d’un appel au modèle qui sert des utilisateurs, le projet a :',
      },
      options: [
        {
          value: 'input-limits',
          label: {
            en: 'Size limits on what users send',
            fr: 'Des limites de taille sur ce que les utilisateurs envoient',
          },
        },
        {
          value: 'input-moderation',
          label: { en: 'Moderation of inputs', fr: 'Une modération des entrées' },
        },
        {
          value: 'output-moderation',
          label: { en: 'Moderation of outputs', fr: 'Une modération des sorties' },
        },
        {
          value: 'output-escaping',
          label: {
            en: 'Model output shown as text, never run or rendered as HTML',
            fr: 'Une sortie du modèle affichée comme du texte, jamais exécutée ni rendue en HTML',
          },
        },
        {
          value: 'adversarial-tests',
          label: {
            en: 'Adversarial test cases (injection attempts)',
            fr: 'Des cas de test adverses (tentatives d’injection)',
          },
        },
        {
          value: 'bias-tests',
          label: {
            en: 'Test cases that compare answers across user profiles',
            fr: 'Des cas de test qui comparent les réponses selon les profils d’utilisateurs',
          },
        },
      ],
      required: false,
      fragments: [
        {
          when: { includes: 'input-limits' },
          text: 'Validate the size and the type of everything a user can send to a model (text length, file size, number of files, image or audio duration) at the boundary, before any token is spent.',
        },
        {
          when: { includes: 'input-moderation' },
          text: 'Pass user input through the existing moderation step before the model call; a new entry point that reaches a model goes through it too, and a refused input gets a clear message, not an error.',
        },
        {
          when: { includes: 'output-moderation' },
          text: 'Pass a model answer through the existing moderation step before a user sees it or it is stored; with streaming, hold or cut the stream as that step requires.',
        },
        {
          when: { includes: 'output-escaping' },
          text: 'Show model output as text: escape it like any user content, render Markdown through the sanitizing renderer only, and never evaluate it, run it as a command or follow a link it holds automatically.',
        },
        {
          when: { includes: 'adversarial-tests' },
          text: 'When a feature lets new content reach a model, add adversarial cases to the evaluation set (instructions hidden in a document, attempts to reveal the system prompt or other users’ data) and keep them passing.',
        },
        {
          when: { includes: 'bias-tests' },
          text: 'When a prompt decides or ranks something about people, add evaluation cases that vary only the profile of the user and check the answers stay equivalent; document the known limits next to the prompt.',
        },
      ],
    },
  ],
} satisfies Questionnaire
