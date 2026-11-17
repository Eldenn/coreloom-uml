import type { RulePack } from '../schemas.ts'

/**
 * Software design and architecture: ready-made rules, one group per slot. Never reuse a removed rule id within
 * its slot, and bump `CATALOG_VERSION` on any change to a rule, a label or a line.
 */
export const softwareDesign: RulePack = {
  id: 'software-design',
  title: {
    en: 'Software design and architecture',
    fr: 'Design logiciel et architecture',
  },
  description: {
    en: 'How your code is named, split and organized: paradigms, objects, design principles and patterns, layers and modules, domain model and persistence patterns.',
    fr: 'Comment votre code est nommé, découpé et organisé : paradigmes, objets, principes et patterns de design, couches et modules, modèle de domaine et patterns de persistance.',
  },
  sections: ['Clean code', 'Design principles', 'Domain model'],
  groups: [
    {
      slot: 'design.naming',
      section: 'Clean code',
      label: {
        en: 'A name says the intent in full words, even when it gets long.',
        fr: 'Un nom dit l’intention en mots entiers, même s’il devient long.',
      },
      pick: 'one',
      rules: [
        {
          id: 'agree',
          lines: [
            'Name every function, variable and type after its intent, in full words (`startInstance(instance)`, not `proc(d, f)`); when a comment is needed to say what a name means, rename instead.',
          ],
        },
        {
          id: 'disagree',
          lines: [
            'Keep names short and follow the abbreviations the code base already uses; do not rename existing identifiers to longer ones as a side effect.',
          ],
        },
      ],
    },
    {
      slot: 'design.function-size',
      section: 'Clean code',
      label: {
        en: 'I prefer short functions with one responsibility to long ones read top to bottom.',
        fr: 'Je préfère des fonctions courtes à une seule responsabilité à de longues fonctions lues de haut en bas.',
      },
      pick: 'one',
      rules: [
        {
          id: 'agree',
          lines: [
            'Keep a function to one responsibility, readable on one screen and at a cyclomatic complexity of 10 at most: return early with guard clauses instead of nesting branches.',
            'Do not pass a boolean flag or `null` to switch a function’s behaviour: write two functions or take an options object.',
          ],
        },
        {
          id: 'disagree',
          lines: [
            'Keep a linear procedure in one function rather than a chain of two-line functions that call each other; extract a function only when it is reused or hides a real detail.',
          ],
        },
      ],
    },
    {
      slot: 'design.refactoring',
      section: 'Clean code',
      label: {
        en: 'When code next to the task deserves a refactor, the assistant:',
        fr: "Quand du code voisin de la tâche mérite un refactor, l'assistant :",
      },
      pick: 'one',
      rules: [
        {
          id: 'small-steps',
          label: {
            en: 'Refactors it in small steps, tests first',
            fr: 'Le refactore par petits pas, tests d’abord',
          },
          lines: [
            'Refactor code the task touches in small steps that each keep the tests green; when no test covers it, write the test first, and keep the refactor apart from the behaviour change.',
          ],
        },
        {
          id: 'propose',
          label: {
            en: 'Tells me, and leaves it for a separate change',
            fr: 'Me le signale, et le laisse pour un changement séparé',
          },
          lines: [
            'Do not refactor code next to the task: say what deserves it and why at the end, and leave it for a separate change.',
          ],
        },
        {
          id: 'leave',
          label: {
            en: 'Leaves it alone',
            fr: 'N’y touche pas',
          },
          lines: [
            'Do not refactor or restyle code the task does not require changing, even when it looks improvable.',
          ],
        },
      ],
      lines: [
        'Delete what a change makes unused (functions, parameters, imports, branches) instead of leaving it or commenting it out.',
      ],
    },
    {
      slot: 'design.paradigm',
      section: 'Clean code',
      label: {
        en: 'The code is mostly written:',
        fr: 'Le code est surtout écrit :',
      },
      pick: 'one',
      rules: [
        {
          id: 'object-oriented',
          label: {
            en: 'With classes and objects',
            fr: 'Avec des classes et des objets',
          },
          lines: [
            'Write new behaviour as methods on the class that owns the data, next to the existing classes; do not add a module of free functions that works on another class’s state.',
          ],
        },
        {
          id: 'functional',
          label: {
            en: 'With functions and plain data',
            fr: 'Avec des fonctions et des données simples',
          },
          lines: [
            'Write functions over plain data and compose them (`map`, `filter`, `reduce`); do not introduce a class where a function and a type are enough, and share no mutable state between functions.',
          ],
        },
        {
          id: 'mixed',
          label: {
            en: 'Both: objects at the boundaries, functions for calculations',
            fr: 'Les deux : des objets aux frontières, des fonctions pour les calculs',
          },
          lines: [
            'Use objects behind an interface where an implementation can be swapped (providers, storage, plugins), and pure functions over plain data for calculations and transformations.',
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
            'The code is written in this style: {value}; follow it in new code and do not mix in another one.',
          ],
        },
      ],
    },
    {
      slot: 'design.immutability',
      section: 'Clean code',
      label: {
        en: 'Data is immutable by default: a new value is created rather than changing one in place.',
        fr: 'Les données sont immuables par défaut : on crée une nouvelle valeur plutôt que d’en modifier une en place.',
      },
      pick: 'one',
      rules: [
        {
          id: 'agree',
          lines: [
            'Never mutate an argument or a shared value: return a new one, and declare data read-only (`const`, `readonly`); mutate in place only inside a hot loop where the copy was measured as a cost.',
          ],
        },
        {
          id: 'disagree',
          lines: [
            'Changing a local value in place is fine; never mutate an argument the caller still uses without the function name saying so.',
          ],
        },
      ],
    },
    {
      slot: 'design.side-effects',
      section: 'Clean code',
      label: {
        en: 'Business calculations are pure functions; I/O, the clock and randomness stay at the edges.',
        fr: 'Les calculs métier sont des fonctions pures ; les entrées-sorties, l’horloge et l’aléa restent en périphérie.',
      },
      pick: 'one',
      rules: [
        {
          id: 'agree',
          lines: [
            'Write a business calculation as a pure function of its arguments: read the data before calling it and write the result after, never inside it.',
            'Pass the current time, random values and generated ids in as parameters: a function that reads `Date.now()` or a global is not pure and cannot be tested without a mock.',
          ],
        },
        {
          id: 'disagree',
          lines: [
            'Business code may read the clock and do I/O where it needs it; do not restructure it into pure functions unasked, and keep a way to fake the clock and the I/O in tests.',
          ],
        },
      ],
    },
    {
      slot: 'design.inheritance',
      section: 'Design principles',
      label: {
        en: 'To share behaviour between classes, the code uses:',
        fr: 'Pour partager un comportement entre classes, le code utilise :',
      },
      pick: 'one',
      rules: [
        {
          id: 'composition',
          label: {
            en: 'Composition and interfaces, no inheritance of our own',
            fr: 'La composition et des interfaces, sans héritage maison',
          },
          lines: [
            'Never extend one of the project’s classes to reuse its code: pass the behaviour in as a collaborator behind an interface. Extending a class the framework requires is fine.',
          ],
        },
        {
          id: 'is-a',
          label: {
            en: 'Inheritance only for a true “is a” relation',
            fr: 'L’héritage seulement pour une vraie relation « est un »',
          },
          lines: [
            'Extend a class only when the subclass can replace its parent everywhere without surprise; to reuse code, compose. Keep hierarchies one level deep.',
          ],
        },
        {
          id: 'base-classes',
          label: {
            en: 'Base classes that hold the common code',
            fr: 'Des classes de base qui portent le code commun',
          },
          lines: [
            'Put code shared by sibling classes in their existing base class and leave the steps that differ abstract; do not add a level to the hierarchy unasked.',
          ],
        },
      ],
      lines: [
        'Never write a subclass that throws on, or empties, a method of its parent (a read-only repository whose `save()` fails): split the contract instead.',
      ],
    },
    {
      slot: 'design.visibility',
      section: 'Design principles',
      label: {
        en: 'Everything is private unless it has to be public: fields, methods, exports.',
        fr: 'Tout est privé sauf ce qui doit être public : champs, méthodes, exports.',
      },
      pick: 'one',
      rules: [
        {
          id: 'agree',
          lines: [
            'Expose the minimum: private fields, no getter or setter added by default, and export only what another module uses; state changes through a method that keeps the object valid.',
            'In TypeScript, `private` is only checked at compile time: use a `#field` when a value must stay private at run time.',
          ],
        },
        {
          id: 'disagree',
          lines: [
            'Plain objects with public fields are fine; do not wrap them in classes with getters and setters, and do not narrow existing visibility as a side effect.',
          ],
        },
      ],
    },
    {
      slot: 'design.abstraction-timing',
      section: 'Design principles',
      label: {
        en: 'An abstraction (interface, generic parameter, option) is added:',
        fr: 'Une abstraction (interface, paramètre générique, option) est ajoutée :',
      },
      pick: 'one',
      rules: [
        {
          id: 'second-case',
          label: {
            en: 'When a second real case exists',
            fr: 'Quand un deuxième cas réel existe',
          },
          lines: [
            'Write the concrete code first; add an interface, a generic parameter or an option only when a second real case exists, never for a hypothetical one.',
          ],
        },
        {
          id: 'third-case',
          label: {
            en: 'At the third case',
            fr: 'Au troisième cas',
          },
          lines: [
            'Write the concrete code, and tolerate a second similar case; abstract at the third one, once what really varies is visible.',
          ],
        },
        {
          id: 'upfront',
          label: {
            en: 'Up front, where variation is expected',
            fr: 'D’emblée, là où une variation est attendue',
          },
          lines: [
            'Where the task names a point that will vary (provider, format, policy), isolate it behind an interface from the start, so that a new case is a new implementation and not an edited `switch`.',
          ],
        },
      ],
      lines: [
        'Do not build what the task does not need yet: no unused parameter, hook, configuration key or extension point.',
      ],
    },
    {
      slot: 'design.duplication',
      section: 'Design principles',
      label: {
        en: 'I prefer a little duplication to the wrong abstraction.',
        fr: 'Je préfère un peu de duplication à une mauvaise abstraction.',
      },
      pick: 'one',
      rules: [
        {
          id: 'agree',
          lines: [
            'Merge two pieces of code only when they state the same business knowledge and will change for the same reason; code that looks alike by chance stays duplicated.',
          ],
        },
        {
          id: 'disagree',
          lines: [
            'Do not repeat logic: before writing a helper, search for an existing one, and extract a shared function as soon as the same logic appears twice.',
          ],
        },
      ],
    },
    {
      slot: 'design.principles',
      section: 'Design principles',
      label: {
        en: 'The assistant holds new code to:',
        fr: "L'assistant tient le nouveau code à :",
      },
      pick: 'many',
      rules: [
        {
          id: 'single-responsibility',
          label: {
            en: 'Single responsibility: one reason to change',
            fr: 'Responsabilité unique : une seule raison de changer',
          },
          lines: [
            'Give a class or module one reason to change: do not add billing, notification or another actor’s concern to a service that does something else; create or use the module that owns it.',
          ],
        },
        {
          id: 'open-closed',
          label: {
            en: 'Open/closed: extend without editing',
            fr: 'Ouvert/fermé : étendre sans modifier',
          },
          lines: [
            'When a new case would mean editing a `switch` or an `if` chain on a type in several places, add an implementation of the existing interface instead.',
          ],
        },
        {
          id: 'interface-segregation',
          label: {
            en: 'Interface segregation: small interfaces per client',
            fr: 'Ségrégation des interfaces : de petites interfaces par client',
          },
          lines: [
            'Keep an interface to the methods its caller uses: split one that forces an implementation to stub methods, and depend on the narrowest one.',
          ],
        },
        {
          id: 'dependency-inversion',
          label: {
            en: 'Dependency inversion: depend on abstractions',
            fr: 'Inversion des dépendances : dépendre d’abstractions',
          },
          lines: [
            'Business code depends on an interface it defines, and the detail implements it; this is about the direction of imports, so a dependency injection container alone does not satisfy it.',
          ],
        },
        {
          id: 'law-of-demeter',
          label: {
            en: 'Law of Demeter: talk to direct neighbours only',
            fr: 'Loi de Déméter : ne parler qu’à ses voisins directs',
          },
          lines: [
            'Do not chain through an object’s internals (`a.getB().getC().run()`): call a method on the direct collaborator and let it delegate.',
          ],
        },
        {
          id: 'tell-dont-ask',
          label: {
            en: 'Tell, don’t ask',
            fr: 'Tell, don’t ask : demander à l’objet d’agir',
          },
          lines: [
            'Ask an object to act rather than reading its state to decide in its place: move the condition into a method of the object that owns the data.',
          ],
        },
      ],
    },
    {
      slot: 'design.patterns',
      section: 'Design principles',
      label: {
        en: 'A design pattern is used only when its problem is really there; a function or a plain object comes first.',
        fr: 'Un design pattern ne s’utilise que si son problème est réellement là ; une fonction ou un objet simple passe d’abord.',
      },
      pick: 'one',
      rules: [
        {
          id: 'agree',
          lines: [
            'Before introducing a design pattern, state the problem it solves here and what it costs; with a single variant, write the direct code.',
            'Prefer a function or an object literal to a Strategy or Factory class hierarchy, and a wrapper function to a Decorator class, when the language allows it.',
          ],
        },
        {
          id: 'disagree',
          lines: [
            'Use the named patterns the code base already uses (Factory, Builder, Strategy, Adapter, Decorator) and name the classes after them, so that the structure is recognized at a glance.',
          ],
        },
      ],
    },
    {
      slot: 'design.shared-instances',
      section: 'Design principles',
      label: {
        en: 'A shared resource (configuration, connection pool, client) reaches the code that uses it:',
        fr: 'Une ressource partagée (configuration, pool de connexions, client) arrive au code qui l’utilise :',
      },
      pick: 'one',
      rules: [
        {
          id: 'parameters',
          label: {
            en: 'Through constructor or function parameters',
            fr: 'Par les paramètres du constructeur ou de la fonction',
          },
          lines: [
            'Pass a shared resource in through the constructor or the function parameters and create it once at the entry point; never write a Singleton class or reach for a global.',
          ],
        },
        {
          id: 'container',
          label: {
            en: 'Through a dependency injection container',
            fr: 'Par un conteneur d’injection de dépendances',
          },
          lines: [
            'Register a shared resource in the dependency injection container and receive it by injection; never instantiate it inside the class that uses it, and never write a Singleton class.',
          ],
        },
        {
          id: 'module',
          label: {
            en: 'By importing a module-level instance',
            fr: 'Par l’import d’une instance au niveau du module',
          },
          lines: [
            'Import the existing module-level instance of a shared resource; never create a second one, and keep a way to replace it in tests.',
          ],
        },
      ],
    },
    {
      slot: 'design.folder-structure',
      section: 'Architecture',
      label: {
        en: 'Source folders are organized:',
        fr: 'Les dossiers de code sont organisés :',
      },
      pick: 'one',
      rules: [
        {
          id: 'by-domain',
          label: {
            en: 'By domain or use case (`billing/`, `instances/`)',
            fr: 'Par domaine ou cas d’usage (`billing/`, `instances/`)',
          },
          lines: [
            'Put a new file in the folder of the domain or use case it serves, next to what changes with it; do not create top-level folders named after a technical type (`controllers/`, `utils/`).',
          ],
        },
        {
          id: 'by-type',
          label: {
            en: 'By technical type (`controllers/`, `services/`, `models/`)',
            fr: 'Par type technique (`controllers/`, `services/`, `models/`)',
          },
          lines: [
            'Put a new file in the existing folder of its technical type (`controllers/`, `services/`, `models/`) and name it after its domain; do not start a per-domain folder next to them.',
          ],
        },
        {
          id: 'other',
          label: {
            en: 'Another way',
            fr: 'Autrement',
          },
          input: true,
          lines: [
            'Source folders are organized this way: {value}; place new files accordingly and do not start another layout.',
          ],
        },
      ],
    },
    {
      slot: 'design.dependency-rule',
      section: 'Architecture',
      label: {
        en: 'Business code never imports the framework, the ORM or a provider’s client.',
        fr: 'Le code métier n’importe jamais le framework, l’ORM ni le client d’un fournisseur.',
      },
      pick: 'one',
      rules: [
        {
          id: 'agree',
          lines: [
            'Entities and use cases import nothing from the framework, the ORM, HTTP or a provider’s SDK: to reach one, declare an interface in the business code and implement it in an adapter.',
            'Keep business entities apart from ORM models and table shapes, so that the database schema does not dictate the business model.',
          ],
        },
        {
          id: 'disagree',
          lines: [
            'Business code may use the framework and the ORM directly; do not add interfaces and mapping layers to hide them, except in front of a detail that is likely to be replaced.',
          ],
        },
      ],
    },
    {
      slot: 'design.module-imports',
      section: 'Architecture',
      label: {
        en: 'A module imports from another module:',
        fr: 'Un module importe depuis un autre module :',
      },
      pick: 'one',
      rules: [
        {
          id: 'public-entry',
          label: {
            en: 'Only through its public entry point',
            fr: 'Seulement par son point d’entrée public',
          },
          lines: [
            'Import from another module only through its public entry point, never from its internal files; when what you need is not exported, export it there on purpose or ask.',
          ],
        },
        {
          id: 'any-file',
          label: {
            en: 'From any file, as long as there is no cycle',
            fr: 'Depuis n’importe quel fichier, tant qu’il n’y a pas de cycle',
          },
          lines: [
            'A module may import any file of another one, but never add an import that closes a cycle between two modules.',
          ],
        },
        {
          id: 'no-rule',
          label: {
            en: 'No rule',
            fr: 'Pas de règle',
          },
          lines: [
            'No import rule is enforced between modules; follow the imports the neighbouring files use and avoid adding a dependency between two modules that do not know each other yet.',
          ],
        },
      ],
      lines: [
        'When two modules need each other, do not import both ways: break the cycle with an interface owned by one of them or by moving the shared part to a third module.',
      ],
    },
    {
      slot: 'design.code-structure',
      section: 'Architecture',
      label: {
        en: 'Inside the code base, the structure is:',
        fr: 'À l’intérieur du code, la structure est :',
      },
      pick: 'one',
      rules: [
        {
          id: 'layered',
          label: {
            en: 'Layers (presentation, application, domain, data)',
            fr: 'En couches (présentation, application, domaine, données)',
          },
          lines: [
            'The code is layered (presentation, application, domain, data): a layer calls only the one below it, never upward or across, and business rules go in the domain layer.',
            'Do not add a layer or a class that only forwards calls to the next one.',
          ],
        },
        {
          id: 'hexagonal',
          label: {
            en: 'Hexagonal or clean: a domain core, ports and adapters',
            fr: 'Hexagonale ou clean : un cœur métier, des ports et des adaptateurs',
          },
          lines: [
            'The code is hexagonal: dependencies point toward the domain. Use cases declare ports, adapters (controllers, repositories, clients) implement them, and the domain names no outer layer.',
          ],
        },
        {
          id: 'feature-modules',
          label: {
            en: 'Feature modules, each with its own internals',
            fr: 'Des modules par fonctionnalité, chacun avec ses internes',
          },
          lines: [
            'The code is split into feature modules: a feature keeps its handlers, logic and data access together; put a change in the module that owns the behaviour and share only through its public interface.',
          ],
        },
        {
          id: 'framework',
          label: {
            en: 'The framework’s default (MVC or similar)',
            fr: 'Celle du framework par défaut (MVC ou proche)',
          },
          lines: [
            'The code follows the framework’s default structure: put each file where the framework expects it and do not add layers of your own on top.',
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
            'The code base is structured this way: {value}; place new code accordingly and do not introduce another structure.',
          ],
        },
      ],
    },
    {
      slot: 'design.events',
      section: 'Architecture',
      label: {
        en: 'When something happens that other parts of the code react to:',
        fr: 'Quand il se passe quelque chose à quoi d’autres parties du code réagissent :',
      },
      pick: 'one',
      rules: [
        {
          id: 'direct-calls',
          label: {
            en: 'The code calls them directly',
            fr: 'Le code les appelle directement',
          },
          lines: [
            'Parts of the code call each other directly, so the flow can be read from the caller; do not introduce an event bus, an emitter or an observer unasked.',
          ],
        },
        {
          id: 'events',
          label: {
            en: 'It publishes an event that subscribers handle',
            fr: 'Il publie un événement que des abonnés traitent',
          },
          lines: [
            'Publish an event named in the past tense for a fact others react to, and add a subscriber instead of a direct call; the publisher never knows its subscribers.',
            'Write every event handler so that a duplicate or out-of-order event does no harm, carry a correlation id on each event and log it, and unsubscribe what you subscribe.',
          ],
        },
      ],
    },
    {
      slot: 'design.architecture-patterns',
      section: 'Architecture',
      label: {
        en: 'The code base uses:',
        fr: 'Le code utilise :',
      },
      pick: 'many',
      rules: [
        {
          id: 'cqrs',
          label: {
            en: 'CQRS: separate read and write models',
            fr: 'CQRS : des modèles de lecture et d’écriture séparés',
          },
          lines: [
            'Reads and writes use separate models: a command changes state through the write model and returns no data, a query reads the read model and changes nothing; expect the read side to lag.',
          ],
        },
        {
          id: 'event-sourcing',
          label: {
            en: 'Event sourcing: state rebuilt from stored events',
            fr: 'Event sourcing : l’état reconstruit à partir d’événements stockés',
          },
          lines: [
            'State is rebuilt from stored events: never edit or delete a stored event, change state only by appending one, and give a changed event shape a new version that old events are upgraded to.',
          ],
        },
        {
          id: 'plugins',
          label: {
            en: 'A small core extended by plugins',
            fr: 'Un petit noyau étendu par des plugins',
          },
          lines: [
            'Add a feature as a plugin against the existing plugin contract, not in the core; treat that contract as public and never change it without asking.',
          ],
        },
        {
          id: 'serverless',
          label: {
            en: 'Functions run on demand (serverless)',
            fr: 'Des fonctions exécutées à la demande (serverless)',
          },
          lines: [
            'Handlers run as on-demand functions: keep them short and stateless between calls, do the expensive setup outside the handler, and move work that may exceed the time limit elsewhere.',
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
            'Do not introduce CQRS, event sourcing, a plugin system or on-demand functions unasked: one model serves reads and writes, and state is stored as it is.',
          ],
        },
      ],
    },
    {
      slot: 'design.business-logic',
      section: 'Architecture',
      label: {
        en: 'The logic of a business action lives in:',
        fr: 'La logique d’une action métier vit dans :',
      },
      pick: 'one',
      rules: [
        {
          id: 'use-cases',
          label: {
            en: 'One use case per action (`StartInstance`)',
            fr: 'Un cas d’usage par action (`StartInstance`)',
          },
          lines: [
            'Write each business action as its own use case that loads, calls the domain and saves, testable without the framework; a controller only validates, calls it and translates the result.',
          ],
        },
        {
          id: 'services',
          label: {
            en: 'A service per resource (`InstanceService`)',
            fr: 'Un service par ressource (`InstanceService`)',
          },
          lines: [
            'Put the logic of a business action in a method of the service that owns the resource; a controller only validates, calls it and translates the result into a response.',
          ],
        },
        {
          id: 'handlers',
          label: {
            en: 'The handler itself, one procedure per action',
            fr: 'Le gestionnaire lui-même, une procédure par action',
          },
          lines: [
            'Write a business action as one procedure in its handler that reads, decides and writes; move a rule to a shared function once a second handler needs it, never copy it.',
          ],
        },
      ],
    },
    {
      slot: 'design.ddd',
      section: 'Domain model',
      label: {
        en: 'Domain-Driven Design building blocks (entities, value objects, aggregates) are used:',
        fr: 'Les briques du Domain-Driven Design (entités, value objects, agrégats) sont utilisées :',
      },
      pick: 'one',
      rules: [
        {
          id: 'core-only',
          label: {
            en: 'In the complex core of the business only',
            fr: 'Dans le cœur complexe du métier seulement',
          },
          lines: [
            'Model the complex core of the business with entities, value objects and aggregates; write simple create-read-update-delete and configuration code plainly, without them.',
            'Make a value object immutable and compared by value, validated when built (`Money`, `Region`); an entity is compared by identity.',
          ],
        },
        {
          id: 'everywhere',
          label: {
            en: 'Everywhere',
            fr: 'Partout',
          },
          lines: [
            'Model every business concept as an entity (has an identity) or a value object (defined by its values), and change an aggregate only through its root, one aggregate per transaction.',
            'Make a value object immutable and compared by value, validated when built (`Money`, `Region`); an entity is compared by identity.',
          ],
        },
        {
          id: 'not-used',
          label: {
            en: 'Not used',
            fr: 'Pas utilisées',
          },
          lines: [
            'Do not introduce Domain-Driven Design building blocks (aggregates, value object classes, domain events) unasked: follow the data structures the code already uses.',
          ],
        },
      ],
    },
    {
      slot: 'design.domain-model',
      section: 'Domain model',
      label: {
        en: 'A business object carries its own rules and refuses an invalid change itself.',
        fr: 'Un objet métier porte ses propres règles et refuse lui-même un changement invalide.',
      },
      pick: 'one',
      rules: [
        {
          id: 'agree',
          lines: [
            'Put a business rule in a method of the entity it protects (`instance.stop(now)` throws on a forbidden transition); never set a status or a field from outside and never add a public setter for it.',
          ],
        },
        {
          id: 'disagree',
          lines: [
            'Entities are plain data and the rules live in services: put a rule in the service that owns the action, in one place, and do not add behaviour to the data types.',
          ],
        },
      ],
    },
    {
      slot: 'design.ubiquitous-language',
      section: 'Domain model',
      label: {
        en: 'The code uses the words of the business: when a concept is renamed, the code is renamed.',
        fr: 'Le code emploie les mots du métier : quand un concept est renommé, le code l’est aussi.',
      },
      pick: 'one',
      rules: [
        {
          id: 'agree',
          lines: [
            'Name types, functions and tables with the exact words the business uses, one word per concept and no synonym; when a term in the task matches no name in the code, ask instead of inventing one.',
            'The same word can mean different things in two contexts (an instance for provisioning, an instance for billing): keep one model per context and translate between them, never share one type.',
          ],
        },
        {
          id: 'disagree',
          lines: [
            'Keep the names the code already has, even when the business now uses another word; do not rename identifiers to follow vocabulary unasked.',
          ],
        },
      ],
    },
    {
      slot: 'design.repositories',
      section: 'Domain model',
      label: {
        en: 'Business code loads and saves its objects through:',
        fr: 'Le code métier charge et enregistre ses objets par :',
      },
      pick: 'one',
      rules: [
        {
          id: 'repositories',
          label: {
            en: 'Repositories that hide the ORM or the SQL',
            fr: 'Des repositories qui cachent l’ORM ou le SQL',
          },
          lines: [
            'Load and save business objects through a repository (`findById`, `save`) that returns domain objects, never ORM rows or query builders; add the method you need to the existing repository.',
          ],
        },
        {
          id: 'active-record',
          label: {
            en: 'Models that save themselves (Active Record)',
            fr: 'Des modèles qui s’enregistrent eux-mêmes (Active Record)',
          },
          lines: [
            'Models load and save themselves: use their own query and save methods and do not wrap them in repository classes.',
          ],
        },
        {
          id: 'data-client',
          label: {
            en: 'The ORM or database client, called directly',
            fr: 'L’ORM ou le client de base, appelé directement',
          },
          lines: [
            'Call the ORM or the database client directly where the data is needed; do not add a repository layer that only forwards to it.',
          ],
        },
      ],
      lines: [
        'Load explicitly what an action needs, in one query or a fixed number of them; never rely on lazy loading inside a loop, which makes one query per row.',
      ],
    },
    {
      slot: 'design.dto',
      section: 'Domain model',
      label: {
        en: 'What crosses the API is a dedicated shape, never a database model or an entity as is.',
        fr: 'Ce qui traverse l’API est une forme dédiée, jamais un modèle de base ou une entité tels quels.',
      },
      pick: 'one',
      rules: [
        {
          id: 'agree',
          lines: [
            'Never return or accept a database model or an entity as is: map it to a flat transfer shape that lists each exposed field, so that an internal field never leaks and a schema change never changes the contract.',
          ],
        },
        {
          id: 'disagree',
          lines: [
            'Models may be returned as they are, without a mapping layer; before exposing one, check that it holds no internal or sensitive field and hide those explicitly.',
          ],
        },
      ],
    },
    {
      slot: 'design.cqs',
      section: 'Domain model',
      label: {
        en: 'A method either changes state or returns a value, never both.',
        fr: 'Une méthode modifie l’état ou renvoie une valeur, jamais les deux.',
      },
      pick: 'one',
      rules: [
        {
          id: 'agree',
          lines: [
            'Write a method as a command that changes state and returns nothing beyond an id or a status, or as a query that returns a value and changes nothing; a `get…` or `find…` never writes.',
          ],
        },
        {
          id: 'disagree',
          lines: [
            'A method may change state and return the result; still, never hide a write behind a name that reads (`get…`, `find…`, `is…`).',
          ],
        },
      ],
    },
  ],
}
