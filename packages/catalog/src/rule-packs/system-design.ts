import type { RulePack } from '../schemas.ts'

/**
 * System design: ready-made rules, one group per slot. Never reuse a removed rule id within
 * its slot, and bump `CATALOG_VERSION` on any change to a rule, a label or a line.
 */
export const systemDesign: RulePack = {
  id: 'system-design',
  title: {
    en: 'System design',
    fr: 'Conception de systèmes',
  },
  description: {
    en: 'How your system scales, stays available, stores and caches data, queues work, connects its services and is monitored: what your coding assistant must respect and never introduce.',
    fr: 'Comment votre système passe à l’échelle, reste disponible, stocke et met en cache ses données, met le travail en file, relie ses services et est surveillé : ce que votre assistant de code doit respecter et ne jamais introduire.',
  },
  sections: [
    'Scaling and availability',
    'Services and communication',
    'Data and caching',
    'Queues and messaging',
    'Reliability and performance',
    'Monitoring',
  ],
  groups: [
    {
      slot: 'system.design-clarification',
      section: 'Working style',
      label: {
        en: 'Before designing anything, the assistant writes down the requirements and the scale it works from.',
        fr: "Avant de concevoir quoi que ce soit, l'assistant écrit les exigences et l'échelle dont il part.",
      },
      pick: 'one',
      rules: [
        {
          id: 'agree',
          lines: [
            'Before proposing a design, write down what the feature must do, what is out of scope, the load at peak, the read/write ratio, and the consistency, latency and availability it needs; ask for what is missing instead of guessing.',
          ],
        },
        {
          id: 'disagree',
          lines: [
            'Start from a concrete design proposal and list the assumptions behind it in a few lines; do not open with a round of questions.',
          ],
        },
      ],
    },
    {
      slot: 'system.design-trade-offs',
      section: 'Working style',
      label: {
        en: 'A design proposal names the option it set aside and what the chosen one costs.',
        fr: 'Une proposition de conception nomme l’option écartée et ce que coûte celle qui est retenue.',
      },
      pick: 'one',
      rules: [
        {
          id: 'agree',
          lines: [
            'For every design decision, name at least one option that was set aside and why, what the chosen one costs, and the bottleneck or single point of failure that remains.',
          ],
        },
        {
          id: 'disagree',
          lines: [
            'Propose one design and keep the reasoning short; compare alternatives only when asked.',
          ],
        },
      ],
    },
    {
      slot: 'system.load-scale',
      section: 'Scaling and availability',
      label: {
        en: 'The system is sized for:',
        fr: 'Le système est dimensionné pour :',
      },
      pick: 'one',
      rules: [
        {
          id: 'small',
          label: {
            en: 'A small load (an internal tool, a few requests per second)',
            fr: 'Une petite charge (outil interne, quelques requêtes par seconde)',
          },
          lines: [
            'The load is small: prefer the simplest design that works on one database and a few instances; do not add a cache, a queue, replicas or sharding for scale unless asked.',
          ],
        },
        {
          id: 'medium',
          label: {
            en: 'Tens to hundreds of requests per second',
            fr: 'Des dizaines à des centaines de requêtes par seconde',
          },
          lines: [
            'The load is tens to hundreds of requests per second: size a new feature for the peak (3 to 10 times the average), keep every query indexed and paginated, and do not add sharding or a new data store unless asked.',
          ],
        },
        {
          id: 'large',
          label: {
            en: 'Thousands of requests per second or more',
            fr: 'Des milliers de requêtes par seconde ou plus',
          },
          lines: [
            'The load is thousands of requests per second: estimate the requests per second, the read/write ratio and the storage a new feature adds before writing it, size for the peak (3 to 10 times the average), and say which component saturates first.',
          ],
        },
      ],
    },
    {
      slot: 'system.scaling-model',
      section: 'Scaling and availability',
      label: {
        en: 'The application scales by:',
        fr: "L'application passe à l'échelle en :",
      },
      pick: 'one',
      rules: [
        {
          id: 'horizontal',
          label: {
            en: 'Adding stateless instances behind a load balancer',
            fr: 'Ajoutant des instances sans état derrière un répartiteur de charge',
          },
          lines: [
            'Several identical instances serve requests: keep no state in process memory or on local disk between two requests (sessions, counters, locks, uploads, timers); put it in the database, the shared cache or object storage.',
            'When a change adds load to the application instances, say how the data layer follows: adding instances only moves the bottleneck to a single database.',
          ],
        },
        {
          id: 'vertical',
          label: {
            en: 'Running one instance on a bigger machine',
            fr: 'Faisant tourner une seule instance sur une machine plus puissante',
          },
          lines: [
            'One instance runs the application: do not add a load balancer, clustering or distributed locks unless asked, and say so when a change keeps state in memory that a second instance would not share.',
          ],
        },
        {
          id: 'serverless',
          label: {
            en: 'Running short-lived functions (serverless)',
            fr: 'Exécutant des fonctions éphémères (serverless)',
          },
          lines: [
            'The code runs in short-lived functions: keep nothing in memory or on disk between invocations, create clients and connections once outside the handler, and keep start-up work small.',
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
            'The application scales by {value}; respect that model and do not introduce another one.',
          ],
        },
      ],
    },
    {
      slot: 'system.session-state',
      section: 'Scaling and availability',
      label: {
        en: 'State kept between two requests of a user (session, cart, progress) lives in:',
        fr: "L'état conservé entre deux requêtes d'un utilisateur (session, panier, progression) vit dans :",
      },
      pick: 'one',
      rules: [
        {
          id: 'shared-store',
          label: {
            en: 'A shared store (Redis, Memcached)',
            fr: 'Un magasin partagé (Redis, Memcached)',
          },
          lines: [
            'Per-user state between requests lives in the shared store: read and write it there with an expiry, never in a module-level variable or an in-process map.',
          ],
        },
        {
          id: 'database',
          label: {
            en: 'The database',
            fr: 'La base de données',
          },
          lines: [
            'Per-user state between requests lives in the database: never keep it in process memory, and do not add a second store for it.',
          ],
        },
        {
          id: 'client',
          label: {
            en: 'The client (signed token or cookie)',
            fr: 'Le client (jeton ou cookie signé)',
          },
          lines: [
            'Per-user state travels with the client in a signed token or cookie: keep it small, verify the signature before trusting it, never store a secret in it, and keep no server-side copy in memory.',
          ],
        },
        {
          id: 'sticky',
          label: {
            en: 'The memory of the instance, with sticky sessions',
            fr: "La mémoire de l'instance, avec des sessions collantes",
          },
          lines: [
            'Sessions live in instance memory behind sticky sessions: a restart loses them, so never keep there anything a user cannot lose, and do not make more features depend on the affinity.',
          ],
        },
      ],
    },
    {
      slot: 'system.latency-percentiles',
      section: 'Reliability and performance',
      label: {
        en: 'Latency is read as percentiles (p50, p95, p99), never as an average alone.',
        fr: 'La latence se lit en centiles (p50, p95, p99), jamais en moyenne seule.',
      },
      pick: 'one',
      rules: [
        {
          id: 'agree',
          lines: [
            'Quote latency as p50, p95 and p99 under a stated load, never as an average alone, and record durations in histograms so percentiles can be computed.',
          ],
        },
        {
          id: 'disagree',
          lines: [
            'An average response time is enough to judge performance here; do not add percentile instrumentation unless asked.',
          ],
        },
      ],
    },
    {
      slot: 'system.consistency',
      section: 'Scaling and availability',
      label: {
        en: 'When it cannot have both, the system prefers:',
        fr: 'Quand il ne peut pas avoir les deux, le système préfère :',
      },
      pick: 'one',
      rules: [
        {
          id: 'consistency',
          label: {
            en: 'Refusing a request rather than answering with stale data',
            fr: 'Refuser une requête plutôt que répondre avec des données périmées',
          },
          lines: [
            'Consistency comes first: every read that drives a decision sees the last committed write, so read from the primary inside a transaction and return an error rather than a stale or partial answer.',
          ],
        },
        {
          id: 'availability',
          label: {
            en: 'Always answering, even with data that is a little late',
            fr: 'Toujours répondre, même avec des données un peu en retard',
          },
          lines: [
            'Availability comes first: a read may return data that is a little late, so never block a response on full agreement between nodes; say in the code how late the data can be and what the user sees meanwhile.',
          ],
        },
        {
          id: 'per-data',
          label: {
            en: 'It depends on the data: exact for some, late for the rest',
            fr: 'Cela dépend de la donnée : exacte pour certaines, en retard pour le reste',
          },
          lines: [
            'Consistency depends on the data: keep balances, permissions and resource state strongly consistent on the primary; dashboards, counts and listings may be eventually consistent. Ask which one applies to a new kind of data.',
          ],
        },
      ],
    },
    {
      slot: 'system.failover',
      section: 'Scaling and availability',
      label: {
        en: 'When a node of a stateful component fails:',
        fr: "Quand un nœud d'un composant à état tombe :",
      },
      pick: 'one',
      rules: [
        {
          id: 'active-passive',
          label: {
            en: 'A standby takes over (active-passive)',
            fr: 'Un nœud de secours prend le relais (actif-passif)',
          },
          lines: [
            'Stateful components fail over to a standby in seconds to minutes: write only to the active node, reconnect on a lost connection, and retry only idempotent operations; never assume a connection outlives a fail-over.',
          ],
        },
        {
          id: 'active-active',
          label: {
            en: 'The other nodes already serve traffic (active-active)',
            fr: 'Les autres nœuds servent déjà du trafic (actif-actif)',
          },
          lines: [
            'Every node serves traffic and may accept writes: never rely on state held by one node, make concurrent writes to the same record safe (version check, idempotency key, merge rule), and assume another node changed the data meanwhile.',
          ],
        },
        {
          id: 'none',
          label: {
            en: 'Nothing takes over: it is restored by hand',
            fr: 'Rien ne prend le relais : il est restauré à la main',
          },
          lines: [
            'There is no automatic fail-over: do not add replication or clustering unless asked, and say so when a change adds a new single point of failure or a step to a manual restore.',
          ],
        },
      ],
    },
    {
      slot: 'system.synchronous-chains',
      section: 'Services and communication',
      label: {
        en: 'A request never waits on a chain of synchronous calls to other services.',
        fr: "Une requête n'attend jamais une chaîne d'appels synchrones à d'autres services.",
      },
      pick: 'one',
      rules: [
        {
          id: 'agree',
          lines: [
            'Do not add a synchronous call to another service on a request path when an event or a queued job can do the work: dependencies in series multiply availability (five at 99.9% give about 99.5%) and add up their latency.',
          ],
        },
        {
          id: 'disagree',
          lines: [
            'Synchronous calls between services are accepted; give each one a timeout and handle its failure explicitly instead of letting the request hang.',
          ],
        },
      ],
    },
    {
      slot: 'system.static-assets',
      section: 'Scaling and availability',
      label: {
        en: 'Static files (scripts, styles, images) are served by:',
        fr: 'Les fichiers statiques (scripts, styles, images) sont servis par :',
      },
      pick: 'one',
      rules: [
        {
          id: 'cdn-pull',
          label: {
            en: 'A CDN that fetches them from the origin on first access (pull)',
            fr: "Un CDN qui va les chercher à l'origine au premier accès (pull)",
          },
          lines: [
            'A pull CDN keeps a static file until its TTL: put a content hash in every asset file name, give assets a long cache lifetime, never reuse a URL for changed content, and never serve an asset from the application servers.',
          ],
        },
        {
          id: 'cdn-push',
          label: {
            en: 'Object storage or a CDN they are uploaded to at each release (push)',
            fr: 'Un stockage objet ou un CDN où ils sont téléversés à chaque livraison (push)',
          },
          lines: [
            'Static files are uploaded to object storage or the CDN at each release: add a new asset to that upload step, version its name, and never serve it from the application servers.',
          ],
        },
        {
          id: 'app-server',
          label: {
            en: 'The application or web servers themselves',
            fr: 'Les serveurs applicatifs ou web eux-mêmes',
          },
          lines: [
            'The application servers serve the static files themselves; do not add a CDN or an object storage bucket unless asked.',
          ],
        },
      ],
    },
    {
      slot: 'system.traffic-entry',
      section: 'Scaling and availability',
      label: {
        en: 'Requests reach the application through:',
        fr: "Les requêtes atteignent l'application à travers :",
      },
      pick: 'one',
      rules: [
        {
          id: 'layer-7',
          label: {
            en: 'An HTTP load balancer or reverse proxy (layer 7)',
            fr: 'Un répartiteur de charge HTTP ou un reverse proxy (couche 7)',
          },
          lines: [
            'An HTTP load balancer or reverse proxy ends TLS and routes by path: read the client address and scheme only through the trusted-proxy setting of the framework, add a new public path to its routing rules, and keep the health check it probes cheap.',
          ],
        },
        {
          id: 'layer-4',
          label: {
            en: 'A transport-level load balancer (layer 4)',
            fr: 'Un répartiteur de charge au niveau transport (couche 4)',
          },
          lines: [
            'The load balancer works at the transport level and does not read HTTP: do not rely on routing by path, header or cookie, and keep TLS, compression and redirects in the application.',
          ],
        },
        {
          id: 'direct',
          label: {
            en: 'Nothing: the application is exposed directly',
            fr: "Rien : l'application est exposée directement",
          },
          lines: [
            'The application is exposed without a load balancer or proxy: it ends TLS and sets its own timeouts and limits; do not assume forwarded headers, and say so when a change needs more than one instance.',
          ],
        },
      ],
      lines: [
        'When changing infrastructure, never leave a single load balancer, proxy or gateway as the only way in: run at least two or use a managed one.',
      ],
    },
    {
      slot: 'system.dns-ttl',
      section: 'Scaling and availability',
      label: {
        en: 'DNS records that take part in a fail-over keep a short TTL (60 to 300 seconds).',
        fr: 'Les enregistrements DNS qui servent à une bascule gardent un TTL court (60 à 300 secondes).',
      },
      pick: 'one',
      rules: [
        {
          id: 'agree',
          lines: [
            'Keep a TTL of 60 to 300 seconds on every DNS record used for fail-over or regional routing; never raise it to hours, and never hard-code or cache a resolved IP address in code or configuration.',
          ],
        },
        {
          id: 'disagree',
          lines: [
            'DNS records are stable and managed elsewhere; do not change a record or its TTL.',
          ],
        },
      ],
    },
    {
      slot: 'system.service-decomposition',
      section: 'Services and communication',
      label: {
        en: 'The back end is:',
        fr: 'Le back-end est :',
      },
      pick: 'one',
      rules: [
        {
          id: 'modular-monolith',
          label: {
            en: 'One deployment cut into modules (modular monolith)',
            fr: 'Un seul déploiement découpé en modules (monolithe modulaire)',
          },
          lines: [
            'The back end is a modular monolith: put code in the module that owns the domain, call another module only through its public interface, never read its tables directly, and never extract a new service unless asked.',
          ],
        },
        {
          id: 'microservices',
          label: {
            en: 'Several services deployed on their own (microservices)',
            fr: 'Plusieurs services déployés séparément (microservices)',
          },
          lines: [
            'Each service owns its domain and its data: never read or write the database of another service, go through its API or its events; put a feature in the service that owns the domain and do not create a new service unless asked.',
          ],
        },
        {
          id: 'single-service',
          label: {
            en: 'One small service without module boundaries',
            fr: 'Un seul petit service sans frontières de modules',
          },
          lines: [
            'The back end is one small service: follow its existing structure, and do not split it into modules or services unless asked.',
          ],
        },
      ],
    },
    {
      slot: 'system.service-discovery',
      section: 'Services and communication',
      label: {
        en: 'A service finds another one through:',
        fr: 'Un service en trouve un autre grâce à :',
      },
      pick: 'one',
      rules: [
        {
          id: 'platform-dns',
          label: {
            en: 'A stable name the platform routes (Kubernetes Service, internal DNS)',
            fr: 'Un nom stable que la plateforme route (Service Kubernetes, DNS interne)',
          },
          lines: [
            'Services call each other by the stable name the platform routes: never hard-code an IP address or an instance host name, and expose the health check the platform uses to take a failing instance out.',
          ],
        },
        {
          id: 'registry',
          label: {
            en: 'A registry the client queries (Consul, Eureka)',
            fr: 'Un registre que le client interroge (Consul, Eureka)',
          },
          lines: [
            'Services register in the registry and look each other up through the existing discovery client: never hard-code an address, and register a new service with its health check.',
          ],
        },
        {
          id: 'configuration',
          label: {
            en: 'An address given in configuration',
            fr: 'Une adresse donnée en configuration',
          },
          lines: [
            'The address of another service comes from configuration: read it there, add a new one next to the existing ones, and never hard-code a host or a port in the code.',
          ],
        },
        {
          id: 'not-applicable',
          label: {
            en: 'There is only one service',
            fr: "Il n'y a qu'un seul service",
          },
          lines: [
            'There is a single service: do not add service discovery, a registry or a service mesh unless asked.',
          ],
        },
      ],
    },
    {
      slot: 'system.new-data-store',
      section: 'Data and caching',
      label: {
        en: 'When a feature stores a new kind of data, it goes:',
        fr: 'Quand une fonctionnalité stocke un nouveau type de données, il va :',
      },
      pick: 'one',
      rules: [
        {
          id: 'existing-database',
          label: {
            en: 'In the existing relational database, by default',
            fr: 'Dans la base relationnelle existante, par défaut',
          },
          lines: [
            'Store new data in the existing relational database with a schema, constraints and transactions; never add a NoSQL store, a search engine or a second database because it would scale better.',
          ],
        },
        {
          id: 'fit-for-purpose',
          label: {
            en: 'In the store suited to how it is read and written',
            fr: 'Dans le magasin adapté à la façon dont il est lu et écrit',
          },
          lines: [
            'Choose the store of new data from its access pattern (queries, volume, consistency) among the stores already in use: relational by default, key-value for lookups by key, time series or logs outside the main database; state the queries that justify it.',
          ],
        },
        {
          id: 'ask',
          label: {
            en: 'Where I decide: the assistant asks',
            fr: "Là où je décide : l'assistant demande",
          },
          lines: [
            'Before storing a new kind of data, describe how it is read and written (queries, volume, consistency) and ask where it goes; never add a data store on your own.',
          ],
        },
      ],
    },
    {
      slot: 'system.read-replicas',
      section: 'Data and caching',
      label: {
        en: 'Database reads are served by:',
        fr: 'Les lectures en base sont servies par :',
      },
      pick: 'one',
      rules: [
        {
          id: 'primary-only',
          label: {
            en: 'The primary only',
            fr: 'Le primaire uniquement',
          },
          lines: [
            'Every read and write goes to the single primary database; do not add read replicas or a read/write split unless asked.',
          ],
        },
        {
          id: 'replicas',
          label: {
            en: 'Read replicas, which lag behind the primary',
            fr: 'Des réplicas de lecture, en retard sur le primaire',
          },
          lines: [
            'Reads may go to replicas that lag behind the primary: read from the primary whenever a request reads what it just wrote, and never base a write, a balance or a permission check on a replica read.',
          ],
        },
      ],
    },
    {
      slot: 'system.data-partitioning',
      section: 'Data and caching',
      label: {
        en: 'The data is spread:',
        fr: 'Les données sont réparties :',
      },
      pick: 'one',
      rules: [
        {
          id: 'single-database',
          label: {
            en: 'Nowhere: one database holds it all',
            fr: 'Nulle part : une seule base contient tout',
          },
          lines: [
            'One database holds all the data: do not add sharding, partitioning or a second database unless asked; reach for an index, a better query or a read replica first, and say from what volume this would stop holding.',
          ],
        },
        {
          id: 'federated',
          label: {
            en: 'Over one database per function (users, billing…)',
            fr: 'Sur une base par fonction (utilisateurs, facturation…)',
          },
          lines: [
            'There is one database per function: never join or open a transaction across two of them; fetch from each through its owner and combine in code, and put a new table in the database of the function that owns it.',
          ],
        },
        {
          id: 'sharded',
          label: {
            en: 'Over shards, by a key (tenant, hash)',
            fr: 'Sur des shards, selon une clé (locataire, hash)',
          },
          lines: [
            'The data is sharded by a key: every query carries the shard key, never join or open a transaction across shards, never change the shard key, and say so when a change concentrates load on one shard (a big tenant, a time-based key).',
          ],
        },
        {
          id: 'time-partitioned',
          label: {
            en: 'Over partitions of one database, by date or tenant',
            fr: "Sur des partitions d'une même base, par date ou par locataire",
          },
          lines: [
            'Large tables are partitioned inside one database: filter on the partition key in every query on them, create partitions through the existing mechanism, and never scan all partitions on a request path.',
          ],
        },
      ],
    },
    {
      slot: 'system.cache-layers',
      section: 'Data and caching',
      label: {
        en: 'Responses and data are cached:',
        fr: 'Les réponses et les données sont mises en cache :',
      },
      pick: 'many',
      rules: [
        {
          id: 'client',
          label: {
            en: 'In the client, with HTTP cache headers',
            fr: 'Chez le client, avec les en-têtes de cache HTTP',
          },
          lines: [
            'Clients cache responses: set `Cache-Control` and an `ETag` on every cacheable response, and `no-store` on anything personal or that must be exact.',
          ],
        },
        {
          id: 'edge',
          label: {
            en: 'At the CDN or the reverse proxy',
            fr: 'Au niveau du CDN ou du reverse proxy',
          },
          lines: [
            'The CDN or reverse proxy caches HTTP responses: mark a response that depends on the user `private` or `no-store`, set `Vary` for what changes it, and never let a response with a session cookie be cached at the edge.',
          ],
        },
        {
          id: 'shared',
          label: {
            en: 'In a shared application cache (Redis, Memcached)',
            fr: 'Dans un cache applicatif partagé (Redis, Memcached)',
          },
          lines: [
            'Computed objects and query results go to the shared application cache: give every key a namespace and a TTL, and treat a cache failure as a miss, never as a failed request.',
          ],
        },
        {
          id: 'in-process',
          label: {
            en: 'In the memory of each instance',
            fr: 'Dans la mémoire de chaque instance',
          },
          lines: [
            'Each instance caches in its own memory: bound every in-process cache in size and in time, and keep there only data that may differ between instances for the length of its TTL.',
          ],
        },
        {
          id: 'none',
          label: {
            en: 'Nowhere',
            fr: 'Nulle part',
          },
          alone: true,
          lines: [
            'Nothing is cached: do not add a cache at any level unless asked; fix the slow query or call first.',
          ],
        },
      ],
    },
    {
      slot: 'system.cache-strategy',
      section: 'Data and caching',
      label: {
        en: 'The application cache is filled:',
        fr: 'Le cache applicatif est rempli :',
      },
      pick: 'one',
      rules: [
        {
          id: 'cache-aside',
          label: {
            en: 'On a miss: read the cache, else the database, then fill (cache-aside)',
            fr: 'Sur un défaut : lire le cache, sinon la base, puis remplir (cache-aside)',
          },
          lines: [
            'Cache with cache-aside: read the cache, on a miss read the database and fill the cache with a TTL; protect a hot key against a stampede (a lock or one shared in-flight load, and jitter on the TTL).',
          ],
        },
        {
          id: 'write-through',
          label: {
            en: 'On every write, together with the database (write-through)',
            fr: 'À chaque écriture, en même temps que la base (write-through)',
          },
          lines: [
            'Cache with write-through: every write updates the database and the cache in the same code path, through the existing helper; never write one without the other, and give entries a TTL so unread data leaves.',
          ],
        },
        {
          id: 'write-behind',
          label: {
            en: 'First; the database is updated later (write-behind)',
            fr: 'En premier ; la base est mise à jour plus tard (write-behind)',
          },
          lines: [
            'Writes land in the cache and reach the database later: use it only for data that tolerates a loss if the cache fails (counters, statistics), never for money, permissions or anything that must survive.',
          ],
        },
        {
          id: 'refresh-ahead',
          label: {
            en: 'Ahead of expiry, for hot keys (refresh-ahead)',
            fr: "Avant l'expiration, pour les clés chaudes (refresh-ahead)",
          },
          lines: [
            'Hot keys are refreshed before they expire: register a new hot key in the existing refresh job instead of letting it expire under load, and only for keys that are read often and predictably.',
          ],
        },
        {
          id: 'none',
          label: {
            en: 'There is no application cache',
            fr: "Il n'y a pas de cache applicatif",
          },
          lines: [
            'There is no application cache: do not add Redis, Memcached or an in-memory cache unless asked.',
          ],
        },
      ],
    },
    {
      slot: 'system.cache-invalidation',
      section: 'Data and caching',
      label: {
        en: 'When the data behind a cached entry changes, the entry:',
        fr: "Quand la donnée derrière une entrée en cache change, l'entrée :",
      },
      pick: 'one',
      rules: [
        {
          id: 'ttl',
          label: {
            en: 'Stays until its TTL runs out',
            fr: "Reste jusqu'à la fin de son TTL",
          },
          lines: [
            'Cached entries expire by TTL only: choose a TTL as short as the staleness the feature tolerates, state it next to the key, and never cache without one.',
          ],
        },
        {
          id: 'delete-on-write',
          label: {
            en: 'Is deleted by the code that writes',
            fr: 'Est supprimée par le code qui écrit',
          },
          lines: [
            'Every write deletes the cache entries built from the data it changes, after the database commit: when adding a cached read, add its invalidation to every write path in the same change, and keep a TTL as a safety net.',
          ],
        },
        {
          id: 'versioned-key',
          label: {
            en: 'Is left behind: the key carries a version',
            fr: 'Est abandonnée : la clé porte une version',
          },
          lines: [
            'Cache keys carry a version of the data they hold: bump the version on write instead of deleting entries, build keys through the existing helper, and keep a TTL so old versions leave.',
          ],
        },
      ],
      lines: [
        'Never serve from a cache what must be exact: a balance, a permission or the state of a resource that is being changed. When adding a cache, say how the entry is invalidated when the data changes.',
      ],
    },
    {
      slot: 'system.slow-operations',
      section: 'Queues and messaging',
      label: {
        en: 'An operation too slow for a request:',
        fr: 'Une opération trop lente pour une requête :',
      },
      pick: 'one',
      rules: [
        {
          id: 'status-url',
          label: {
            en: 'Is queued; the API answers 202 with a status URL to poll',
            fr: "Est mise en file ; l'API répond 202 avec une URL de statut à interroger",
          },
          lines: [
            'Slow work never runs inside a request: enqueue a job, answer `202 Accepted` with a `Location` header to a status resource, and let the worker update that status (pending, running, done, failed).',
          ],
        },
        {
          id: 'callback',
          label: {
            en: 'Is queued; the client is told when it ends (webhook, push)',
            fr: 'Est mise en file ; le client est prévenu à la fin (webhook, push)',
          },
          lines: [
            'Slow work never runs inside a request: enqueue a job, answer at once with its identifier, and notify the client through the existing callback or push channel when it ends, with its failure included.',
          ],
        },
        {
          id: 'inline',
          label: {
            en: 'Runs inside the request anyway',
            fr: 'Tourne quand même dans la requête',
          },
          lines: [
            'Slow work runs inside the request: there is no job queue, so do not add one unless asked; set a timeout, and say so when an operation can exceed it.',
          ],
        },
      ],
    },
    {
      slot: 'system.back-pressure',
      section: 'Queues and messaging',
      label: {
        en: 'When work arrives faster than it is processed:',
        fr: "Quand le travail arrive plus vite qu'il n'est traité :",
      },
      pick: 'one',
      rules: [
        {
          id: 'reject',
          label: {
            en: 'Queues are bounded: the system refuses early (429, 503)',
            fr: 'Les files sont bornées : le système refuse tôt (429, 503)',
          },
          lines: [
            'Every queue and buffer is bounded: when one is full, refuse early with 429 or 503 and a `Retry-After` header; never add an unbounded queue, buffer or in-memory list of pending work.',
          ],
        },
        {
          id: 'level',
          label: {
            en: 'A queue absorbs the peak; workers keep a constant rate',
            fr: 'Une file absorbe le pic ; les workers gardent un débit constant',
          },
          lines: [
            'A queue absorbs peaks and workers drain it at a rate the downstream service holds: do not raise worker concurrency to drain faster without checking that service, and still give the queue a maximum length and an alert on its depth.',
          ],
        },
        {
          id: 'none',
          label: {
            en: 'Nothing is planned',
            fr: "Rien n'est prévu",
          },
          lines: [
            'Nothing limits incoming work yet: do not add an unbounded queue or in-memory buffer, which only postpones the overload until memory runs out; say so when a change can receive bursts.',
          ],
        },
      ],
    },
    {
      slot: 'system.queue-guarantees',
      section: 'Queues and messaging',
      label: {
        en: 'On the queues of this system:',
        fr: 'Sur les files de ce système :',
      },
      pick: 'many',
      rules: [
        {
          id: 'at-least-once',
          label: {
            en: 'A message can be delivered more than once',
            fr: "Un message peut être livré plus d'une fois",
          },
          lines: [
            'Delivery is at least once: make every consumer and job idempotent (a deduplication key, an upsert, a check of the current state) so that handling the same message twice changes nothing.',
          ],
        },
        {
          id: 'competing-consumers',
          label: {
            en: 'Several workers consume the same queue',
            fr: 'Plusieurs workers consomment la même file',
          },
          lines: [
            'Several workers consume the same queue: a handler must be safe to run next to another copy of itself, keep no state in the worker between messages, and never assume two messages are handled in the order they were sent.',
          ],
        },
        {
          id: 'claim-check',
          label: {
            en: 'A large payload goes to object storage; the message carries a reference',
            fr: 'Un gros contenu va au stockage objet ; le message ne porte qu’une référence',
          },
          lines: [
            'Never put a large payload in a message: store it in object storage and send only its reference; the consumer reads it from there and handles a missing object.',
          ],
        },
        {
          id: 'priorities',
          label: {
            en: 'Urgent work has its own queue or a priority',
            fr: 'Le travail urgent a sa propre file ou une priorité',
          },
          lines: [
            'Urgent work has its own queue or priority: send a new job to the queue that matches its urgency, never raise a priority to hide a slow job, and check that low-priority work is still drained.',
          ],
        },
      ],
    },
    {
      slot: 'system.service-protocol',
      section: 'Services and communication',
      label: {
        en: 'Between internal services, calls use:',
        fr: 'Entre services internes, les appels utilisent :',
      },
      pick: 'one',
      rules: [
        {
          id: 'rest',
          label: {
            en: 'REST over HTTP',
            fr: 'REST sur HTTP',
          },
          lines: [
            'Internal services call each other with REST over HTTP: reuse the shared HTTP client with keep-alive and a timeout, follow the existing contract, and do not add gRPC or GraphQL between services.',
          ],
        },
        {
          id: 'grpc',
          label: {
            en: 'gRPC',
            fr: 'gRPC',
          },
          lines: [
            'Internal services call each other with gRPC: change the `.proto` contract first, only by adding fields and never by reusing a field number, regenerate the stubs, and set a deadline on every call; do not add REST calls between services.',
          ],
        },
        {
          id: 'graphql',
          label: {
            en: 'GraphQL',
            fr: 'GraphQL',
          },
          lines: [
            'Internal services are reached through GraphQL: extend the existing schema, batch nested lookups to avoid one query per item, and keep the depth and cost limits on queries; do not add another protocol between services.',
          ],
        },
        {
          id: 'messages',
          label: {
            en: 'Messages only, no direct call',
            fr: 'Des messages uniquement, aucun appel direct',
          },
          lines: [
            'Services exchange messages only: never add a direct synchronous call from one service to another; publish an event or send a command on the existing broker.',
          ],
        },
        {
          id: 'not-applicable',
          label: {
            en: 'There is only one service',
            fr: "Il n'y a qu'un seul service",
          },
          lines: [
            'There is a single service: do not add an internal RPC layer or a message broker to split it unless asked.',
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
            'Internal services talk with {value}; use it for every call between services and do not introduce another protocol.',
          ],
        },
      ],
      lines: [
        'Keep one protocol per boundary (public API, internal calls, real-time updates); do not mix a second one into a boundary that already has its own.',
      ],
    },
    {
      slot: 'system.realtime-push',
      section: 'Services and communication',
      label: {
        en: 'Clients learn about a change on the server through:',
        fr: 'Les clients apprennent un changement côté serveur par :',
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
            'Push server changes to clients with Server-Sent Events on the existing stream; do not add WebSocket or polling, and remember that an instance holds each open stream, so events must reach every instance.',
          ],
        },
        {
          id: 'websocket',
          label: {
            en: 'WebSocket',
            fr: 'WebSocket',
          },
          lines: [
            'Push server changes to clients over the existing WebSocket connection; do not add another channel, handle reconnection, and publish events through the shared broker so every instance can deliver them.',
          ],
        },
        {
          id: 'polling',
          label: {
            en: 'Polling',
            fr: 'Du polling',
          },
          lines: [
            'Clients poll for changes: keep the polled endpoint cheap and cacheable, give it a sensible interval with backoff, and do not add WebSocket or Server-Sent Events unless asked.',
          ],
        },
        {
          id: 'none',
          label: {
            en: 'Nothing: they reload',
            fr: 'Rien : ils rechargent',
          },
          lines: [
            'There is no real-time channel: do not add WebSocket, Server-Sent Events or polling unless asked.',
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
            'Clients learn about server changes through {value}; use it and do not add another real-time channel.',
          ],
        },
      ],
    },
    {
      slot: 'system.measure-first',
      section: 'Reliability and performance',
      label: {
        en: 'A performance change starts from a measurement, never from an intuition about the code.',
        fr: "Un changement de performance part d'une mesure, jamais d'une intuition sur le code.",
      },
      pick: 'one',
      rules: [
        {
          id: 'agree',
          lines: [
            'Before optimising, name the metric that confirms the problem (a latency percentile, queries per request, database CPU), measure it under load, and measure again after the change; never add a cache to hide a chatty or oversized query.',
          ],
        },
        {
          id: 'disagree',
          lines: [
            'An obvious inefficiency may be fixed without a measurement; keep the fix small and say what it is expected to improve.',
          ],
        },
      ],
    },
    {
      slot: 'system.performance-antipatterns',
      section: 'Reliability and performance',
      label: {
        en: 'Under load, this system has to stay clear of:',
        fr: 'Sous charge, ce système doit rester à l’écart de :',
      },
      pick: 'many',
      rules: [
        {
          id: 'chatty-io',
          label: {
            en: 'Many small network or SQL calls per request',
            fr: 'Beaucoup de petits appels réseau ou SQL par requête',
          },
          lines: [
            'Never issue one network or SQL call per item of a list: batch them, join, or fetch with one wider query, and count the calls a request makes when changing a read path.',
          ],
        },
        {
          id: 'extraneous-fetching',
          label: {
            en: 'Reading more rows or columns than needed',
            fr: 'Lire plus de lignes ou de colonnes que nécessaire',
          },
          lines: [
            'Select only the columns and rows a request uses: project, filter and paginate in the database, never in application code after loading everything.',
          ],
        },
        {
          id: 'improper-instantiation',
          label: {
            en: 'A client or a connection pool created per request',
            fr: 'Un client ou un pool de connexions créé à chaque requête',
          },
          lines: [
            'Create HTTP clients, database pools and broker connections once and share them; never build one inside a request handler or a job.',
          ],
        },
        {
          id: 'busy-database',
          label: {
            en: 'Business logic running inside the database',
            fr: 'De la logique métier exécutée dans la base',
          },
          lines: [
            'Keep processing out of the database: no business logic or formatting in stored procedures, triggers or heavy SQL functions; the database stores and queries, the application computes.',
          ],
        },
        {
          id: 'busy-front-end',
          label: {
            en: 'Heavy work on the servers that answer requests',
            fr: 'Du travail lourd sur les serveurs qui répondent aux requêtes',
          },
          lines: [
            'Keep heavy work (reports, image or file processing, bulk updates) off the servers that answer requests: hand it to a background worker through the queue.',
          ],
        },
        {
          id: 'synchronous-io',
          label: {
            en: 'Blocking I/O on a request path',
            fr: "Des entrées-sorties bloquantes sur le chemin d'une requête",
          },
          lines: [
            'Never block on I/O in a request path: use the asynchronous API of every file, network and database call, and never run a long CPU-bound loop on the thread or event loop that serves requests.',
          ],
        },
      ],
    },
    {
      slot: 'system.tenant-isolation',
      section: 'Reliability and performance',
      label: {
        en: 'Several customers (tenants) share the system:',
        fr: 'Plusieurs clients (locataires) partagent le système :',
      },
      pick: 'one',
      rules: [
        {
          id: 'quotas',
          label: {
            en: 'Yes, each with quotas and rate limits',
            fr: 'Oui, chacun avec des quotas et des limites de débit',
          },
          lines: [
            'Tenants share the system under quotas: put every new endpoint, job or resource behind the existing per-tenant quota and rate limit, and never let work for one tenant use a pool, a queue or a lock that starves the others.',
          ],
        },
        {
          id: 'shared',
          label: {
            en: 'Yes, without limits per tenant yet',
            fr: 'Oui, sans limite par locataire pour l’instant',
          },
          lines: [
            'Tenants share the system without limits per tenant: say so when a change lets one tenant consume a shared resource without bound (a list without a page size, a bulk job, a fan-out), and propose a quota rather than adding one unasked.',
          ],
        },
        {
          id: 'single-tenant',
          label: {
            en: 'No',
            fr: 'Non',
          },
          lines: [
            'The system serves a single customer: do not add tenant identifiers, per-tenant quotas or tenant isolation unless asked.',
          ],
        },
      ],
    },
    {
      slot: 'system.health-probes',
      section: 'Monitoring',
      label: {
        en: 'The health of an instance is checked by:',
        fr: "La santé d'une instance est vérifiée par :",
      },
      pick: 'one',
      rules: [
        {
          id: 'liveness-readiness',
          label: {
            en: 'Two probes: liveness and readiness',
            fr: 'Deux sondes : liveness et readiness',
          },
          lines: [
            'Liveness answers without calling the database or any other dependency; readiness checks only what the instance needs to take traffic. Never add a dependency check to liveness: a slow database would get every instance restarted.',
          ],
        },
        {
          id: 'single-endpoint',
          label: {
            en: 'One health endpoint',
            fr: 'Un seul endpoint de santé',
          },
          lines: [
            'One health endpoint is probed by the load balancer or the orchestrator: keep it fast and free of calls to slow dependencies, and do not add a check that can fail on every instance at once.',
          ],
        },
        {
          id: 'none',
          label: {
            en: 'Nothing',
            fr: 'Rien',
          },
          lines: [
            'No health endpoint exists: do not add one unless asked, and say so when a change needs the platform to know that an instance is ready or stuck.',
          ],
        },
      ],
    },
    {
      slot: 'system.monitoring-scope',
      section: 'Monitoring',
      label: {
        en: 'The system is monitored for:',
        fr: 'Le système est surveillé pour :',
      },
      pick: 'many',
      rules: [
        {
          id: 'performance',
          label: {
            en: 'Performance: latency, throughput, errors, saturation',
            fr: 'La performance : latence, débit, erreurs, saturation',
          },
          lines: [
            'Instrument every new endpoint, job and outbound call with the existing metrics and traces: duration, outcome and count, with labels of bounded cardinality (never a user id or a raw URL).',
          ],
        },
        {
          id: 'availability',
          label: {
            en: 'Availability, measured from outside against an objective (SLO)',
            fr: "La disponibilité, mesurée de l'extérieur face à un objectif (SLO)",
          },
          lines: [
            'Availability is measured by an external probe against an objective: keep the journey it exercises working when changing those endpoints, and say so when a change can spend the error budget (a migration, a restart, a new dependency).',
          ],
        },
        {
          id: 'security',
          label: {
            en: 'Security: failed sign-ins, unusual access, audit trail',
            fr: "La sécurité : échecs de connexion, accès anormaux, journal d'audit",
          },
          lines: [
            'Emit an audit event through the existing mechanism for every failed sign-in, refused permission and administrative action a change adds, with who, what and when, and no secret in it.',
          ],
        },
        {
          id: 'usage',
          label: {
            en: 'Usage: who uses what and how much (quotas, billing)',
            fr: "L'usage : qui utilise quoi et combien (quotas, facturation)",
          },
          lines: [
            'Record usage per account through the existing usage counters for every new feature that is billed or limited by a quota; never derive billing from application logs.',
          ],
        },
        {
          id: 'none',
          label: {
            en: 'Nothing yet',
            fr: 'Rien pour l’instant',
          },
          alone: true,
          lines: [
            'There is no monitoring stack yet: do not add metrics, tracing or dashboards unless asked; keep logs useful enough to diagnose a failure.',
          ],
        },
      ],
    },
    {
      slot: 'system.alerting',
      section: 'Monitoring',
      label: {
        en: 'An alert fires on a symptom users feel and leads to one action.',
        fr: 'Une alerte se déclenche sur un symptôme ressenti par les utilisateurs et mène à une action.',
      },
      pick: 'one',
      rules: [
        {
          id: 'agree',
          lines: [
            'When adding or changing an alert, alert on a symptom users feel (error rate, a latency percentile, availability against its objective), not on a cause; give it one action and a runbook, and never add an alert nobody has to act on.',
          ],
        },
        {
          id: 'disagree',
          lines: [
            'Alerts and dashboards are managed outside this repository; do not add or change one, and say which signal a change would deserve.',
          ],
        },
      ],
    },
    {
      slot: 'system.workflow-coordination',
      section: 'Queues and messaging',
      label: {
        en: 'A workflow that spans several services or steps is driven by:',
        fr: 'Un workflow qui traverse plusieurs services ou étapes est piloté par :',
      },
      pick: 'one',
      rules: [
        {
          id: 'choreography',
          label: {
            en: 'Events: each service reacts to the others (choreography)',
            fr: 'Des événements : chaque service réagit aux autres (chorégraphie)',
          },
          lines: [
            'Workflows are choreographed: publish an event that states a fact in the past tense and let each service react; carry a correlation id on every event, and propose a coordinator when a flow grows beyond 4 or 5 steps.',
          ],
        },
        {
          id: 'orchestration',
          label: {
            en: 'A coordinator that calls each step and tracks the state (orchestration)',
            fr: "Un coordinateur qui appelle chaque étape et suit l'état (orchestration)",
          },
          lines: [
            'Workflows are orchestrated: add a step to the existing coordinator with its state, its retry and its failure path; never let a service trigger the next step on the side with an event or a direct call.',
          ],
        },
        {
          id: 'none',
          label: {
            en: 'Nothing: there is no such workflow',
            fr: "Rien : il n'y a pas de tel workflow",
          },
          lines: [
            'There is no workflow across services: do not add a workflow engine, a saga or an event bus unless asked.',
          ],
        },
      ],
    },
    {
      slot: 'system.message-ordering',
      section: 'Queues and messaging',
      label: {
        en: 'The order of messages is guaranteed:',
        fr: "L'ordre des messages est garanti :",
      },
      pick: 'one',
      rules: [
        {
          id: 'per-key',
          label: {
            en: 'Per key (partition or message group)',
            fr: 'Par clé (partition ou groupe de messages)',
          },
          lines: [
            'Messages are ordered per key only: give every message about one entity the same partition or group key (its id), never rely on order across keys, and keep handlers fast since a slow message holds back its whole group.',
          ],
        },
        {
          id: 'global',
          label: {
            en: 'Globally, by a single consumer',
            fr: 'Globalement, par un consommateur unique',
          },
          lines: [
            'A single consumer keeps a global order: do not add a second consumer or parallel handling to that queue, and propose ordering per key when throughput becomes the problem.',
          ],
        },
        {
          id: 'none',
          label: {
            en: 'Not at all',
            fr: 'Pas du tout',
          },
          lines: [
            'Message order is not guaranteed: never write a handler that depends on it; carry a version or a timestamp in the message and ignore one that is older than the state already applied.',
          ],
        },
      ],
    },
    {
      slot: 'system.messaging-patterns',
      section: 'Queues and messaging',
      label: {
        en: 'Messaging also follows:',
        fr: 'La messagerie suit aussi :',
      },
      pick: 'many',
      rules: [
        {
          id: 'publish-subscribe',
          label: {
            en: 'Publish-subscribe: an event is published once for all its subscribers',
            fr: 'Publication-abonnement : un événement est publié une fois pour tous ses abonnés',
          },
          lines: [
            'A fact that interests several consumers is published once on its topic: add a subscriber instead of another direct call from the publisher, never make the publisher know its subscribers, and keep published event shapes backward compatible.',
          ],
        },
        {
          id: 'pipes-and-filters',
          label: {
            en: 'Pipes and filters: processing in independent stages linked by queues',
            fr: 'Pipes and filters : un traitement en étapes indépendantes reliées par des files',
          },
          lines: [
            'Processing runs as independent stages linked by queues: add a stage rather than growing an existing one, keep each stage stateless and idempotent, and never share state between stages outside the message.',
          ],
        },
        {
          id: 'scheduler-agent-supervisor',
          label: {
            en: 'A scheduler, agents and a supervisor for long workflows with external systems',
            fr: 'Un planificateur, des agents et un superviseur pour les longs workflows avec des systèmes externes',
          },
          lines: [
            'Long workflows with external systems go through the scheduler, its agents and the supervisor: add a step with its timeout, retry and compensation, and never call the external system outside an agent.',
          ],
        },
        {
          id: 'none',
          label: {
            en: 'None of these',
            fr: 'Aucun de ceux-là',
          },
          alone: true,
          lines: [
            'Messaging stays simple here: do not add topics, processing pipelines or a workflow supervisor unless asked.',
          ],
        },
      ],
    },
    {
      slot: 'system.read-models',
      section: 'Data and caching',
      label: {
        en: 'To fit how data is read and written, the system uses:',
        fr: 'Pour coller à la façon dont les données sont lues et écrites, le système utilise :',
      },
      pick: 'many',
      rules: [
        {
          id: 'cqrs',
          label: {
            en: 'Separate write and read models (CQRS)',
            fr: "Des modèles d'écriture et de lecture séparés (CQRS)",
          },
          lines: [
            'Writes go through commands on the write model and reads through the read model, which may be a little late: never write through a read model, never read your own write from it, and keep CQRS out of plain CRUD areas.',
          ],
        },
        {
          id: 'event-sourcing',
          label: {
            en: 'Event sourcing: the events are the source of truth',
            fr: 'Event sourcing : les événements sont la source de vérité',
          },
          lines: [
            'State is the projection of an append-only event log: never update or delete a stored event, never change the meaning of an event type; add a new versioned type and keep every old version readable by the projections.',
          ],
        },
        {
          id: 'materialized-views',
          label: {
            en: 'Materialized views or precomputed tables',
            fr: 'Des vues matérialisées ou des tables précalculées',
          },
          lines: [
            'Expensive, frequent reads come from precomputed views: treat a view as late compared with its source, never write to it by hand, update its refresh or projection when the source shape changes, and keep a way to rebuild it from scratch.',
          ],
        },
        {
          id: 'index-tables',
          label: {
            en: 'Index tables kept next to a key-value store',
            fr: "Des tables d'index tenues à côté d'un magasin clé-valeur",
          },
          lines: [
            'Lookups on a non-key field go through an index table: update every index table in the same write path as the record it points to, and never scan the main store to search by another field.',
          ],
        },
        {
          id: 'none',
          label: {
            en: 'None: one model, read and written',
            fr: 'Aucun : un seul modèle, lu et écrit',
          },
          alone: true,
          lines: [
            'One model is read and written: do not introduce CQRS, event sourcing or materialized views unless asked; on simple CRUD they add complexity without gain.',
          ],
        },
      ],
    },
    {
      slot: 'system.large-transfers',
      section: 'Data and caching',
      label: {
        en: 'A large upload or download goes:',
        fr: 'Un gros envoi ou téléchargement de fichier passe :',
      },
      pick: 'one',
      rules: [
        {
          id: 'signed-url',
          label: {
            en: 'Straight to object storage, with a signed, short-lived URL',
            fr: 'Directement par le stockage objet, avec une URL signée de courte durée',
          },
          lines: [
            'Large files move straight between the client and object storage with a pre-signed URL: sign one object path and one operation, valid 15 minutes or less; never sign a whole bucket or a long-lived URL, and never stream the bytes through the API.',
          ],
        },
        {
          id: 'through-api',
          label: {
            en: 'Through the API',
            fr: "Par l'API",
          },
          lines: [
            'Files go through the API: stream them to storage without buffering a whole file in memory, enforce a size limit at the boundary, and do not hand out direct storage URLs.',
          ],
        },
        {
          id: 'not-applicable',
          label: {
            en: 'Nowhere: there is none',
            fr: "Nulle part : il n'y en a pas",
          },
          lines: [
            'The system handles no large file: do not add object storage or an upload path unless asked.',
          ],
        },
      ],
    },
    {
      slot: 'system.gateway',
      section: 'Services and communication',
      label: {
        en: 'In front of the services, there is:',
        fr: 'Devant les services, il y a :',
      },
      pick: 'one',
      rules: [
        {
          id: 'gateway',
          label: {
            en: 'An API gateway (routing, TLS, authentication)',
            fr: 'Une passerelle API (routage, TLS, authentification)',
          },
          lines: [
            'An API gateway routes, ends TLS and authenticates: declare a new public route in its configuration, and never put a business rule or a decision in it; it routes and protects, the services decide.',
          ],
        },
        {
          id: 'bff',
          label: {
            en: 'A backend per kind of client (backends for frontends)',
            fr: 'Un backend par type de client (backends for frontends)',
          },
          lines: [
            'Each kind of client has its own backend: put aggregation and shaping for a screen in the backend of that client, keep business rules in the services behind, and never copy a rule into two of these backends.',
          ],
        },
        {
          id: 'gateway-and-bff',
          label: {
            en: 'A gateway, then a backend per kind of client',
            fr: 'Une passerelle, puis un backend par type de client',
          },
          lines: [
            'A gateway routes and authenticates, then a backend per kind of client aggregates for its screens: keep business rules in the services behind both, never in the gateway and never copied into two client backends.',
          ],
        },
        {
          id: 'none',
          label: {
            en: 'Nothing: clients call the API directly',
            fr: "Rien : les clients appellent l'API directement",
          },
          lines: [
            'Clients call the API directly: do not add a gateway or a backend per client unless asked.',
          ],
        },
      ],
    },
    {
      slot: 'system.legacy-migration',
      section: 'Services and communication',
      label: {
        en: 'An older system lives next to this code:',
        fr: 'Un système plus ancien vit à côté de ce code :',
      },
      pick: 'one',
      rules: [
        {
          id: 'strangler-fig',
          label: {
            en: 'Yes, and it is replaced route by route behind a facade (strangler fig)',
            fr: 'Oui, et il est remplacé route par route derrière une façade (strangler fig)',
          },
          lines: [
            'A legacy system is replaced route by route behind a facade: migrate one route at a time and switch it in the facade, never add a feature to the legacy side, and never propose a rewrite of everything at once.',
          ],
        },
        {
          id: 'anti-corruption-layer',
          label: {
            en: 'Yes, and it stays: a translation layer isolates its model',
            fr: 'Oui, et il reste : une couche de traduction isole son modèle',
          },
          lines: [
            'Reach the older or external system only through its translation layer: never let its names, types or status codes leak into the domain model, and map a new field in that layer.',
          ],
        },
        {
          id: 'none',
          label: {
            en: 'No',
            fr: 'Non',
          },
          lines: [
            'There is no legacy system to migrate: change working code in place and in small steps; do not propose a rewrite or add a facade unless asked.',
          ],
        },
      ],
    },
    {
      slot: 'system.platform-concerns',
      section: 'Services and communication',
      label: {
        en: 'Outside the application code, the platform provides:',
        fr: 'En dehors du code applicatif, la plateforme fournit :',
      },
      pick: 'many',
      rules: [
        {
          id: 'sidecar-proxy',
          label: {
            en: 'A sidecar or mesh proxy for outgoing calls (retries, TLS, metrics)',
            fr: 'Un proxy sidecar ou un maillage pour les appels sortants (retries, TLS, métriques)',
          },
          lines: [
            'A sidecar or mesh proxy handles retries, TLS and metrics of calls between services: do not add retries or TLS for those calls in application code, since two layers of retries multiply the load on a failing service.',
          ],
        },
        {
          id: 'sidecar-logs',
          label: {
            en: 'A sidecar or agent that ships logs and metrics',
            fr: 'Un sidecar ou un agent qui expédie les logs et les métriques',
          },
          lines: [
            'A sidecar or agent ships logs and metrics: write logs to standard output and expose metrics the existing way; never add a log shipper, a file appender or a vendor client to the application.',
          ],
        },
        {
          id: 'config-store',
          label: {
            en: 'An external configuration store, changed without a deployment',
            fr: 'Un magasin de configuration externe, modifié sans déploiement',
          },
          lines: [
            'Configuration comes from the external configuration store and can change while the application runs: read a setting through the existing configuration client each time it is needed, never copy it into a constant or a file of the image.',
          ],
        },
        {
          id: 'none',
          label: {
            en: 'None of these',
            fr: 'Rien de cela',
          },
          alone: true,
          lines: [
            'The platform provides no sidecar or configuration store: configuration is set at deployment, and the application handles its own TLS, retries and log output; do not add a service mesh unless asked.',
          ],
        },
      ],
    },
    {
      slot: 'system.retries',
      section: 'Reliability and performance',
      label: {
        en: 'When a call to a dependency fails, the code:',
        fr: 'Quand un appel à une dépendance échoue, le code :',
      },
      pick: 'one',
      rules: [
        {
          id: 'retry-and-breaker',
          label: {
            en: 'Retries with backoff, behind a circuit breaker',
            fr: 'Réessaie avec un délai croissant, derrière un disjoncteur',
          },
          lines: [
            'Wrap every call to a dependency in the existing retry and circuit breaker: retry only transient errors, with exponential backoff, jitter and a capped number of attempts, and fail fast while the breaker is open.',
          ],
        },
        {
          id: 'retry-only',
          label: {
            en: 'Retries with backoff, without a circuit breaker',
            fr: 'Réessaie avec un délai croissant, sans disjoncteur',
          },
          lines: [
            'Retry only transient errors, with exponential backoff, jitter and a small cap on attempts; never retry at once or without limit, and say so when a new call would need a circuit breaker, since retries alone finish off a failing dependency.',
          ],
        },
        {
          id: 'fail-fast',
          label: {
            en: 'Does not retry: the failure goes back to the caller',
            fr: "Ne réessaie pas : l'échec remonte à l'appelant",
          },
          lines: [
            'Do not retry a failed call to a dependency in code: set a timeout, return the failure to the caller, and do not add a retry loop or a circuit breaker library unless asked.',
          ],
        },
      ],
      lines: [
        'Never retry an operation that is not idempotent unless it carries an idempotency key, and give every outbound call a timeout.',
      ],
    },
    {
      slot: 'system.cross-service-consistency',
      section: 'Reliability and performance',
      label: {
        en: 'An operation that changes several services or external systems is kept consistent by:',
        fr: 'Une opération qui modifie plusieurs services ou systèmes externes reste cohérente grâce à :',
      },
      pick: 'one',
      rules: [
        {
          id: 'compensation',
          label: {
            en: 'Compensating actions that undo the steps already done',
            fr: 'Des actions de compensation qui annulent les étapes déjà faites',
          },
          lines: [
            'Give every step of a workflow across systems a compensating action, run compensations in reverse order when a later step fails, and make each one idempotent; a compensation is not a rollback, since other readers already saw the intermediate state.',
          ],
        },
        {
          id: 'single-transaction',
          label: {
            en: 'One database transaction: an operation never spans two systems',
            fr: 'Une seule transaction en base : une opération ne traverse jamais deux systèmes',
          },
          lines: [
            'An operation changes one database inside one transaction: never call another service or an external system inside a transaction, and never split one business operation over two systems without asking.',
          ],
        },
        {
          id: 'best-effort',
          label: {
            en: 'Nothing: a failure is repaired by hand',
            fr: 'Rien : un échec est réparé à la main',
          },
          lines: [
            'Nothing undoes a workflow that fails half-way: order the steps so the one most likely to fail runs first, log enough to repair by hand, and say so when a change adds a step that can leave data inconsistent.',
          ],
        },
      ],
    },
    {
      slot: 'system.resilience-patterns',
      section: 'Reliability and performance',
      label: {
        en: 'The system also relies on:',
        fr: "Le système s'appuie aussi sur :",
      },
      pick: 'many',
      rules: [
        {
          id: 'bulkheads',
          label: {
            en: 'Separate pools per dependency or per client (bulkheads)',
            fr: 'Des pools séparés par dépendance ou par client (bulkheads)',
          },
          lines: [
            'Pools are separated per dependency or per client so a failure stays local: give a new dependency its own bounded connection pool, concurrency limit and timeout, and never route its calls through a pool shared with another one.',
          ],
        },
        {
          id: 'leader-election',
          label: {
            en: 'A leader elected among the instances for work that runs once',
            fr: 'Un leader élu parmi les instances pour le travail qui ne tourne qu’une fois',
          },
          lines: [
            'Work that must run once goes through the existing leader election: pass the fencing token (the term number) with every write the leader makes, and never assume the instance is still leader after a pause.',
          ],
        },
        {
          id: 'deployment-stamps',
          label: {
            en: 'Independent copies of the whole stack, one per group of customers (stamps, cells)',
            fr: 'Des copies indépendantes de toute la pile, une par groupe de clients (stamps, cellules)',
          },
          lines: [
            'The stack is deployed as independent stamps, each serving a group of customers: never add a call, a shared database or shared state between two stamps, and keep every change deployable one stamp at a time.',
          ],
        },
        {
          id: 'multi-region',
          label: {
            en: 'Identical back ends in several regions, each able to serve anyone',
            fr: 'Des back-ends identiques dans plusieurs régions, chacun capable de servir tout le monde',
          },
          lines: [
            'Any region can serve any user: never keep data or state that exists in one region only, never assume two requests of a user reach the same region, and say how a new kind of data is replicated.',
          ],
        },
        {
          id: 'federated-identity',
          label: {
            en: 'Sign-in delegated to an identity provider (OIDC, SAML)',
            fr: "Une connexion déléguée à un fournisseur d'identité (OIDC, SAML)",
          },
          lines: [
            'Sign-in is delegated to an identity provider: never store or check a password here, validate the signature, issuer, audience and expiry of every token, and map provider roles to local permissions in one place.',
          ],
        },
        {
          id: 'gatekeeper',
          label: {
            en: 'A dedicated host that validates requests before the trusted services (gatekeeper)',
            fr: 'Un hôte dédié qui valide les requêtes avant les services de confiance (gatekeeper)',
          },
          lines: [
            'A gatekeeper validates and filters every public request before the trusted services: never expose an internal service around it, keep it free of business logic and of credentials to the data, and still validate inputs in the services.',
          ],
        },
      ],
    },
  ],
}
