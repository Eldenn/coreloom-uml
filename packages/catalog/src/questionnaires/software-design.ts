import type { Questionnaire } from '../schemas.ts'

/**
 * Design at the level of the code: clean code, paradigms, object orientation, design principles
 * and patterns, the structure of the code base, Domain-Driven Design and the patterns between
 * business objects, the database and the network. Questions 1, 2, 5, 6, 8, 10, 12, 15, 22, 23,
 * 25 and 26 are preferences on a 1–5 agreement scale, where 3 produces nothing; 11 and 19 are
 * sets of things that apply; the others record facts about the repository or what the assistant
 * does. It feeds only its own `design.*` slots, so it combines with any other questionnaire.
 * How the system is deployed (monolith or services, brokers, scaling) is not asked here.
 *
 * Bump `version` on any change to a question, an option or a fragment; never reuse a removed
 * question id; declare a removed option in `migrations`.
 */
export const softwareDesign = {
  id: 'software-design',
  version: '1.0.0',
  title: {
    en: 'Software design and architecture',
    fr: 'Design logiciel et architecture',
  },
  description: {
    en: 'How your code is named, split and organized: paradigms, objects, design principles and patterns, layers and modules, domain model and persistence patterns.',
    fr: 'Comment votre code est nommé, découpé et organisé : paradigmes, objets, principes et patterns de design, couches et modules, modèle de domaine et patterns de persistance.',
  },
  sections: ['Clean code', 'Design principles', 'Domain model'],
  questions: [
    {
      id: 'design-naming',
      type: 'scale',
      slot: 'design.naming',
      section: 'Clean code',
      label: {
        en: 'A name says the intent in full words, even when it gets long.',
        fr: 'Un nom dit l’intention en mots entiers, même s’il devient long.',
      },
      required: false,
      fragments: [
        {
          when: { scaleAtLeast: 4 },
          text: 'Name every function, variable and type after its intent, in full words (`startInstance(instance)`, not `proc(d, f)`); when a comment is needed to say what a name means, rename instead.',
        },
        {
          when: { scaleAtMost: 2 },
          text: 'Keep names short and follow the abbreviations the code base already uses; do not rename existing identifiers to longer ones as a side effect.',
        },
      ],
    },
    {
      id: 'design-function-size',
      type: 'scale',
      slot: 'design.function-size',
      section: 'Clean code',
      label: {
        en: 'I prefer short functions with one responsibility to long ones read top to bottom.',
        fr: 'Je préfère des fonctions courtes à une seule responsabilité à de longues fonctions lues de haut en bas.',
      },
      required: false,
      fragments: [
        {
          when: { scaleAtLeast: 4 },
          text: 'Keep a function to one responsibility, readable on one screen and at a cyclomatic complexity of 10 at most: return early with guard clauses instead of nesting branches.',
        },
        {
          when: { scaleAtLeast: 4 },
          text: 'Do not pass a boolean flag or `null` to switch a function’s behaviour: write two functions or take an options object.',
        },
        {
          when: { scaleAtMost: 2 },
          text: 'Keep a linear procedure in one function rather than a chain of two-line functions that call each other; extract a function only when it is reused or hides a real detail.',
        },
      ],
    },
    {
      id: 'design-refactoring',
      type: 'single',
      slot: 'design.refactoring',
      section: 'Clean code',
      label: {
        en: 'When code next to the task deserves a refactor, the assistant:',
        fr: "Quand du code voisin de la tâche mérite un refactor, l'assistant :",
      },
      options: [
        {
          value: 'small-steps',
          label: {
            en: 'Refactors it in small steps, tests first',
            fr: 'Le refactore par petits pas, tests d’abord',
          },
        },
        {
          value: 'propose',
          label: {
            en: 'Tells me, and leaves it for a separate change',
            fr: 'Me le signale, et le laisse pour un changement séparé',
          },
        },
        { value: 'leave', label: { en: 'Leaves it alone', fr: 'N’y touche pas' } },
      ],
      required: false,
      fragments: [
        {
          when: { equals: 'small-steps' },
          text: 'Refactor code the task touches in small steps that each keep the tests green; when no test covers it, write the test first, and keep the refactor apart from the behaviour change.',
        },
        {
          when: { equals: 'propose' },
          text: 'Do not refactor code next to the task: say what deserves it and why at the end, and leave it for a separate change.',
        },
        {
          when: { equals: 'leave' },
          text: 'Do not refactor or restyle code the task does not require changing, even when it looks improvable.',
        },
        {
          when: { answered: true },
          text: 'Delete what a change makes unused (functions, parameters, imports, branches) instead of leaving it or commenting it out.',
        },
      ],
    },
    {
      id: 'design-paradigm',
      type: 'single',
      slot: 'design.paradigm',
      section: 'Clean code',
      label: { en: 'The code is mostly written:', fr: 'Le code est surtout écrit :' },
      options: [
        {
          value: 'object-oriented',
          label: { en: 'With classes and objects', fr: 'Avec des classes et des objets' },
        },
        {
          value: 'functional',
          label: {
            en: 'With functions and plain data',
            fr: 'Avec des fonctions et des données simples',
          },
        },
        {
          value: 'mixed',
          label: {
            en: 'Both: objects at the boundaries, functions for calculations',
            fr: 'Les deux : des objets aux frontières, des fonctions pour les calculs',
          },
        },
        { value: 'other', label: { en: 'Something else', fr: 'Autre chose' }, freeText: true },
      ],
      required: false,
      fragments: [
        {
          when: { equals: 'object-oriented' },
          text: 'Write new behaviour as methods on the class that owns the data, next to the existing classes; do not add a module of free functions that works on another class’s state.',
        },
        {
          when: { equals: 'functional' },
          text: 'Write functions over plain data and compose them (`map`, `filter`, `reduce`); do not introduce a class where a function and a type are enough, and share no mutable state between functions.',
        },
        {
          when: { equals: 'mixed' },
          text: 'Use objects behind an interface where an implementation can be swapped (providers, storage, plugins), and pure functions over plain data for calculations and transformations.',
        },
        {
          when: { other: true },
          text: 'The code is written in this style: {value}; follow it in new code and do not mix in another one.',
        },
      ],
    },
    {
      id: 'design-immutability',
      type: 'scale',
      slot: 'design.immutability',
      section: 'Clean code',
      label: {
        en: 'Data is immutable by default: a new value is created rather than changing one in place.',
        fr: 'Les données sont immuables par défaut : on crée une nouvelle valeur plutôt que d’en modifier une en place.',
      },
      required: false,
      fragments: [
        {
          when: { scaleAtLeast: 4 },
          text: 'Never mutate an argument or a shared value: return a new one, and declare data read-only (`const`, `readonly`); mutate in place only inside a hot loop where the copy was measured as a cost.',
        },
        {
          when: { scaleAtMost: 2 },
          text: 'Changing a local value in place is fine; never mutate an argument the caller still uses without the function name saying so.',
        },
      ],
    },
    {
      id: 'design-side-effects',
      type: 'scale',
      slot: 'design.side-effects',
      section: 'Clean code',
      label: {
        en: 'Business calculations are pure functions; I/O, the clock and randomness stay at the edges.',
        fr: 'Les calculs métier sont des fonctions pures ; les entrées-sorties, l’horloge et l’aléa restent en périphérie.',
      },
      required: false,
      fragments: [
        {
          when: { scaleAtLeast: 4 },
          text: 'Write a business calculation as a pure function of its arguments: read the data before calling it and write the result after, never inside it.',
        },
        {
          when: { scaleAtLeast: 4 },
          text: 'Pass the current time, random values and generated ids in as parameters: a function that reads `Date.now()` or a global is not pure and cannot be tested without a mock.',
        },
        {
          when: { scaleAtMost: 2 },
          text: 'Business code may read the clock and do I/O where it needs it; do not restructure it into pure functions unasked, and keep a way to fake the clock and the I/O in tests.',
        },
      ],
    },
    {
      id: 'design-inheritance',
      type: 'single',
      slot: 'design.inheritance',
      section: 'Design principles',
      label: {
        en: 'To share behaviour between classes, the code uses:',
        fr: 'Pour partager un comportement entre classes, le code utilise :',
      },
      options: [
        {
          value: 'composition',
          label: {
            en: 'Composition and interfaces, no inheritance of our own',
            fr: 'La composition et des interfaces, sans héritage maison',
          },
        },
        {
          value: 'is-a',
          label: {
            en: 'Inheritance only for a true “is a” relation',
            fr: 'L’héritage seulement pour une vraie relation « est un »',
          },
        },
        {
          value: 'base-classes',
          label: {
            en: 'Base classes that hold the common code',
            fr: 'Des classes de base qui portent le code commun',
          },
        },
      ],
      required: false,
      fragments: [
        {
          when: { equals: 'composition' },
          text: 'Never extend one of the project’s classes to reuse its code: pass the behaviour in as a collaborator behind an interface. Extending a class the framework requires is fine.',
        },
        {
          when: { equals: 'is-a' },
          text: 'Extend a class only when the subclass can replace its parent everywhere without surprise; to reuse code, compose. Keep hierarchies one level deep.',
        },
        {
          when: { equals: 'base-classes' },
          text: 'Put code shared by sibling classes in their existing base class and leave the steps that differ abstract; do not add a level to the hierarchy unasked.',
        },
        {
          when: { answered: true },
          text: 'Never write a subclass that throws on, or empties, a method of its parent (a read-only repository whose `save()` fails): split the contract instead.',
        },
      ],
    },
    {
      id: 'design-visibility',
      type: 'scale',
      slot: 'design.visibility',
      section: 'Design principles',
      label: {
        en: 'Everything is private unless it has to be public: fields, methods, exports.',
        fr: 'Tout est privé sauf ce qui doit être public : champs, méthodes, exports.',
      },
      required: false,
      fragments: [
        {
          when: { scaleAtLeast: 4 },
          text: 'Expose the minimum: private fields, no getter or setter added by default, and export only what another module uses; state changes through a method that keeps the object valid.',
        },
        {
          when: { scaleAtLeast: 4 },
          text: 'In TypeScript, `private` is only checked at compile time: use a `#field` when a value must stay private at run time.',
        },
        {
          when: { scaleAtMost: 2 },
          text: 'Plain objects with public fields are fine; do not wrap them in classes with getters and setters, and do not narrow existing visibility as a side effect.',
        },
      ],
    },
    {
      id: 'design-abstraction-timing',
      type: 'single',
      slot: 'design.abstraction-timing',
      section: 'Design principles',
      label: {
        en: 'An abstraction (interface, generic parameter, option) is added:',
        fr: 'Une abstraction (interface, paramètre générique, option) est ajoutée :',
      },
      options: [
        {
          value: 'second-case',
          label: {
            en: 'When a second real case exists',
            fr: 'Quand un deuxième cas réel existe',
          },
        },
        {
          value: 'third-case',
          label: { en: 'At the third case', fr: 'Au troisième cas' },
        },
        {
          value: 'upfront',
          label: {
            en: 'Up front, where variation is expected',
            fr: 'D’emblée, là où une variation est attendue',
          },
        },
      ],
      required: false,
      fragments: [
        {
          when: { equals: 'second-case' },
          text: 'Write the concrete code first; add an interface, a generic parameter or an option only when a second real case exists, never for a hypothetical one.',
        },
        {
          when: { equals: 'third-case' },
          text: 'Write the concrete code, and tolerate a second similar case; abstract at the third one, once what really varies is visible.',
        },
        {
          when: { equals: 'upfront' },
          text: 'Where the task names a point that will vary (provider, format, policy), isolate it behind an interface from the start, so that a new case is a new implementation and not an edited `switch`.',
        },
        {
          when: { answered: true },
          text: 'Do not build what the task does not need yet: no unused parameter, hook, configuration key or extension point.',
        },
      ],
    },
    {
      id: 'design-duplication',
      type: 'scale',
      slot: 'design.duplication',
      section: 'Design principles',
      label: {
        en: 'I prefer a little duplication to the wrong abstraction.',
        fr: 'Je préfère un peu de duplication à une mauvaise abstraction.',
      },
      required: false,
      fragments: [
        {
          when: { scaleAtLeast: 4 },
          text: 'Merge two pieces of code only when they state the same business knowledge and will change for the same reason; code that looks alike by chance stays duplicated.',
        },
        {
          when: { scaleAtMost: 2 },
          text: 'Do not repeat logic: before writing a helper, search for an existing one, and extract a shared function as soon as the same logic appears twice.',
        },
      ],
    },
    {
      id: 'design-principles',
      type: 'multi',
      slot: 'design.principles',
      section: 'Design principles',
      label: {
        en: 'The assistant holds new code to:',
        fr: "L'assistant tient le nouveau code à :",
      },
      options: [
        {
          value: 'single-responsibility',
          label: {
            en: 'Single responsibility: one reason to change',
            fr: 'Responsabilité unique : une seule raison de changer',
          },
        },
        {
          value: 'open-closed',
          label: {
            en: 'Open/closed: extend without editing',
            fr: 'Ouvert/fermé : étendre sans modifier',
          },
        },
        {
          value: 'interface-segregation',
          label: {
            en: 'Interface segregation: small interfaces per client',
            fr: 'Ségrégation des interfaces : de petites interfaces par client',
          },
        },
        {
          value: 'dependency-inversion',
          label: {
            en: 'Dependency inversion: depend on abstractions',
            fr: 'Inversion des dépendances : dépendre d’abstractions',
          },
        },
        {
          value: 'law-of-demeter',
          label: {
            en: 'Law of Demeter: talk to direct neighbours only',
            fr: 'Loi de Déméter : ne parler qu’à ses voisins directs',
          },
        },
        {
          value: 'tell-dont-ask',
          label: {
            en: 'Tell, don’t ask',
            fr: 'Tell, don’t ask : demander à l’objet d’agir',
          },
        },
      ],
      required: false,
      fragments: [
        {
          when: { includes: 'single-responsibility' },
          text: 'Give a class or module one reason to change: do not add billing, notification or another actor’s concern to a service that does something else; create or use the module that owns it.',
        },
        {
          when: { includes: 'open-closed' },
          text: 'When a new case would mean editing a `switch` or an `if` chain on a type in several places, add an implementation of the existing interface instead.',
        },
        {
          when: { includes: 'interface-segregation' },
          text: 'Keep an interface to the methods its caller uses: split one that forces an implementation to stub methods, and depend on the narrowest one.',
        },
        {
          when: { includes: 'dependency-inversion' },
          text: 'Business code depends on an interface it defines, and the detail implements it; this is about the direction of imports, so a dependency injection container alone does not satisfy it.',
        },
        {
          when: { includes: 'law-of-demeter' },
          text: 'Do not chain through an object’s internals (`a.getB().getC().run()`): call a method on the direct collaborator and let it delegate.',
        },
        {
          when: { includes: 'tell-dont-ask' },
          text: 'Ask an object to act rather than reading its state to decide in its place: move the condition into a method of the object that owns the data.',
        },
      ],
    },
    {
      id: 'design-patterns',
      type: 'scale',
      slot: 'design.patterns',
      section: 'Design principles',
      label: {
        en: 'A design pattern is used only when its problem is really there; a function or a plain object comes first.',
        fr: 'Un design pattern ne s’utilise que si son problème est réellement là ; une fonction ou un objet simple passe d’abord.',
      },
      required: false,
      fragments: [
        {
          when: { scaleAtLeast: 4 },
          text: 'Before introducing a design pattern, state the problem it solves here and what it costs; with a single variant, write the direct code.',
        },
        {
          when: { scaleAtLeast: 4 },
          text: 'Prefer a function or an object literal to a Strategy or Factory class hierarchy, and a wrapper function to a Decorator class, when the language allows it.',
        },
        {
          when: { scaleAtMost: 2 },
          text: 'Use the named patterns the code base already uses (Factory, Builder, Strategy, Adapter, Decorator) and name the classes after them, so that the structure is recognized at a glance.',
        },
      ],
    },
    {
      id: 'design-shared-instances',
      type: 'single',
      slot: 'design.shared-instances',
      section: 'Design principles',
      label: {
        en: 'A shared resource (configuration, connection pool, client) reaches the code that uses it:',
        fr: 'Une ressource partagée (configuration, pool de connexions, client) arrive au code qui l’utilise :',
      },
      options: [
        {
          value: 'parameters',
          label: {
            en: 'Through constructor or function parameters',
            fr: 'Par les paramètres du constructeur ou de la fonction',
          },
        },
        {
          value: 'container',
          label: {
            en: 'Through a dependency injection container',
            fr: 'Par un conteneur d’injection de dépendances',
          },
        },
        {
          value: 'module',
          label: {
            en: 'By importing a module-level instance',
            fr: 'Par l’import d’une instance au niveau du module',
          },
        },
      ],
      required: false,
      fragments: [
        {
          when: { equals: 'parameters' },
          text: 'Pass a shared resource in through the constructor or the function parameters and create it once at the entry point; never write a Singleton class or reach for a global.',
        },
        {
          when: { equals: 'container' },
          text: 'Register a shared resource in the dependency injection container and receive it by injection; never instantiate it inside the class that uses it, and never write a Singleton class.',
        },
        {
          when: { equals: 'module' },
          text: 'Import the existing module-level instance of a shared resource; never create a second one, and keep a way to replace it in tests.',
        },
      ],
    },
    {
      id: 'design-folder-structure',
      type: 'single',
      slot: 'design.folder-structure',
      section: 'Architecture',
      label: { en: 'Source folders are organized:', fr: 'Les dossiers de code sont organisés :' },
      options: [
        {
          value: 'by-domain',
          label: {
            en: 'By domain or use case (`billing/`, `instances/`)',
            fr: 'Par domaine ou cas d’usage (`billing/`, `instances/`)',
          },
        },
        {
          value: 'by-type',
          label: {
            en: 'By technical type (`controllers/`, `services/`, `models/`)',
            fr: 'Par type technique (`controllers/`, `services/`, `models/`)',
          },
        },
        { value: 'other', label: { en: 'Another way', fr: 'Autrement' }, freeText: true },
      ],
      required: false,
      fragments: [
        {
          when: { equals: 'by-domain' },
          text: 'Put a new file in the folder of the domain or use case it serves, next to what changes with it; do not create top-level folders named after a technical type (`controllers/`, `utils/`).',
        },
        {
          when: { equals: 'by-type' },
          text: 'Put a new file in the existing folder of its technical type (`controllers/`, `services/`, `models/`) and name it after its domain; do not start a per-domain folder next to them.',
        },
        {
          when: { other: true },
          text: 'Source folders are organized this way: {value}; place new files accordingly and do not start another layout.',
        },
      ],
    },
    {
      id: 'design-dependency-rule',
      type: 'scale',
      slot: 'design.dependency-rule',
      section: 'Architecture',
      label: {
        en: 'Business code never imports the framework, the ORM or a provider’s client.',
        fr: 'Le code métier n’importe jamais le framework, l’ORM ni le client d’un fournisseur.',
      },
      required: false,
      fragments: [
        {
          when: { scaleAtLeast: 4 },
          text: 'Entities and use cases import nothing from the framework, the ORM, HTTP or a provider’s SDK: to reach one, declare an interface in the business code and implement it in an adapter.',
        },
        {
          when: { scaleAtLeast: 4 },
          text: 'Keep business entities apart from ORM models and table shapes, so that the database schema does not dictate the business model.',
        },
        {
          when: { scaleAtMost: 2 },
          text: 'Business code may use the framework and the ORM directly; do not add interfaces and mapping layers to hide them, except in front of a detail that is likely to be replaced.',
        },
      ],
    },
    {
      id: 'design-module-imports',
      type: 'single',
      slot: 'design.module-imports',
      section: 'Architecture',
      label: {
        en: 'A module imports from another module:',
        fr: 'Un module importe depuis un autre module :',
      },
      options: [
        {
          value: 'public-entry',
          label: {
            en: 'Only through its public entry point',
            fr: 'Seulement par son point d’entrée public',
          },
        },
        {
          value: 'any-file',
          label: {
            en: 'From any file, as long as there is no cycle',
            fr: 'Depuis n’importe quel fichier, tant qu’il n’y a pas de cycle',
          },
        },
        { value: 'no-rule', label: { en: 'No rule', fr: 'Pas de règle' } },
      ],
      required: false,
      fragments: [
        {
          when: { equals: 'public-entry' },
          text: 'Import from another module only through its public entry point, never from its internal files; when what you need is not exported, export it there on purpose or ask.',
        },
        {
          when: { equals: 'any-file' },
          text: 'A module may import any file of another one, but never add an import that closes a cycle between two modules.',
        },
        {
          when: { equals: 'no-rule' },
          text: 'No import rule is enforced between modules; follow the imports the neighbouring files use and avoid adding a dependency between two modules that do not know each other yet.',
        },
        {
          when: { answered: true },
          text: 'When two modules need each other, do not import both ways: break the cycle with an interface owned by one of them or by moving the shared part to a third module.',
        },
      ],
    },
    {
      id: 'design-code-structure',
      type: 'single',
      slot: 'design.code-structure',
      section: 'Architecture',
      label: {
        en: 'Inside the code base, the structure is:',
        fr: 'À l’intérieur du code, la structure est :',
      },
      options: [
        {
          value: 'layered',
          label: {
            en: 'Layers (presentation, application, domain, data)',
            fr: 'En couches (présentation, application, domaine, données)',
          },
        },
        {
          value: 'hexagonal',
          label: {
            en: 'Hexagonal or clean: a domain core, ports and adapters',
            fr: 'Hexagonale ou clean : un cœur métier, des ports et des adaptateurs',
          },
        },
        {
          value: 'feature-modules',
          label: {
            en: 'Feature modules, each with its own internals',
            fr: 'Des modules par fonctionnalité, chacun avec ses internes',
          },
        },
        {
          value: 'framework',
          label: {
            en: 'The framework’s default (MVC or similar)',
            fr: 'Celle du framework par défaut (MVC ou proche)',
          },
        },
        { value: 'other', label: { en: 'Something else', fr: 'Autre chose' }, freeText: true },
      ],
      required: false,
      fragments: [
        {
          when: { equals: 'layered' },
          text: 'The code is layered (presentation, application, domain, data): a layer calls only the one below it, never upward or across, and business rules go in the domain layer.',
        },
        {
          when: { equals: 'layered' },
          text: 'Do not add a layer or a class that only forwards calls to the next one.',
        },
        {
          when: { equals: 'hexagonal' },
          text: 'The code is hexagonal: dependencies point toward the domain. Use cases declare ports, adapters (controllers, repositories, clients) implement them, and the domain names no outer layer.',
        },
        {
          when: { equals: 'feature-modules' },
          text: 'The code is split into feature modules: a feature keeps its handlers, logic and data access together; put a change in the module that owns the behaviour and share only through its public interface.',
        },
        {
          when: { equals: 'framework' },
          text: 'The code follows the framework’s default structure: put each file where the framework expects it and do not add layers of your own on top.',
        },
        {
          when: { other: true },
          text: 'The code base is structured this way: {value}; place new code accordingly and do not introduce another structure.',
        },
      ],
    },
    {
      id: 'design-events',
      type: 'single',
      slot: 'design.events',
      section: 'Architecture',
      label: {
        en: 'When something happens that other parts of the code react to:',
        fr: 'Quand il se passe quelque chose à quoi d’autres parties du code réagissent :',
      },
      options: [
        {
          value: 'direct-calls',
          label: {
            en: 'The code calls them directly',
            fr: 'Le code les appelle directement',
          },
        },
        {
          value: 'events',
          label: {
            en: 'It publishes an event that subscribers handle',
            fr: 'Il publie un événement que des abonnés traitent',
          },
        },
      ],
      required: false,
      fragments: [
        {
          when: { equals: 'direct-calls' },
          text: 'Parts of the code call each other directly, so the flow can be read from the caller; do not introduce an event bus, an emitter or an observer unasked.',
        },
        {
          when: { equals: 'events' },
          text: 'Publish an event named in the past tense for a fact others react to, and add a subscriber instead of a direct call; the publisher never knows its subscribers.',
        },
        {
          when: { equals: 'events' },
          text: 'Write every event handler so that a duplicate or out-of-order event does no harm, carry a correlation id on each event and log it, and unsubscribe what you subscribe.',
        },
      ],
    },
    {
      id: 'design-architecture-patterns',
      type: 'multi',
      slot: 'design.architecture-patterns',
      section: 'Architecture',
      label: { en: 'The code base uses:', fr: 'Le code utilise :' },
      options: [
        {
          value: 'cqrs',
          label: {
            en: 'CQRS: separate read and write models',
            fr: 'CQRS : des modèles de lecture et d’écriture séparés',
          },
        },
        {
          value: 'event-sourcing',
          label: {
            en: 'Event sourcing: state rebuilt from stored events',
            fr: 'Event sourcing : l’état reconstruit à partir d’événements stockés',
          },
        },
        {
          value: 'plugins',
          label: {
            en: 'A small core extended by plugins',
            fr: 'Un petit noyau étendu par des plugins',
          },
        },
        {
          value: 'serverless',
          label: {
            en: 'Functions run on demand (serverless)',
            fr: 'Des fonctions exécutées à la demande (serverless)',
          },
        },
        {
          value: 'none',
          label: { en: 'None of these', fr: 'Aucun de ceux-là' },
          exclusive: true,
        },
      ],
      required: false,
      fragments: [
        {
          when: { includes: 'cqrs' },
          text: 'Reads and writes use separate models: a command changes state through the write model and returns no data, a query reads the read model and changes nothing; expect the read side to lag.',
        },
        {
          when: { includes: 'event-sourcing' },
          text: 'State is rebuilt from stored events: never edit or delete a stored event, change state only by appending one, and give a changed event shape a new version that old events are upgraded to.',
        },
        {
          when: { includes: 'plugins' },
          text: 'Add a feature as a plugin against the existing plugin contract, not in the core; treat that contract as public and never change it without asking.',
        },
        {
          when: { includes: 'serverless' },
          text: 'Handlers run as on-demand functions: keep them short and stateless between calls, do the expensive setup outside the handler, and move work that may exceed the time limit elsewhere.',
        },
        {
          when: { includes: 'none' },
          text: 'Do not introduce CQRS, event sourcing, a plugin system or on-demand functions unasked: one model serves reads and writes, and state is stored as it is.',
        },
      ],
    },
    {
      id: 'design-business-logic',
      type: 'single',
      slot: 'design.business-logic',
      section: 'Architecture',
      label: {
        en: 'The logic of a business action lives in:',
        fr: 'La logique d’une action métier vit dans :',
      },
      options: [
        {
          value: 'use-cases',
          label: {
            en: 'One use case per action (`StartInstance`)',
            fr: 'Un cas d’usage par action (`StartInstance`)',
          },
        },
        {
          value: 'services',
          label: {
            en: 'A service per resource (`InstanceService`)',
            fr: 'Un service par ressource (`InstanceService`)',
          },
        },
        {
          value: 'handlers',
          label: {
            en: 'The handler itself, one procedure per action',
            fr: 'Le gestionnaire lui-même, une procédure par action',
          },
        },
      ],
      required: false,
      fragments: [
        {
          when: { equals: 'use-cases' },
          text: 'Write each business action as its own use case that loads, calls the domain and saves, testable without the framework; a controller only validates, calls it and translates the result.',
        },
        {
          when: { equals: 'services' },
          text: 'Put the logic of a business action in a method of the service that owns the resource; a controller only validates, calls it and translates the result into a response.',
        },
        {
          when: { equals: 'handlers' },
          text: 'Write a business action as one procedure in its handler that reads, decides and writes; move a rule to a shared function once a second handler needs it, never copy it.',
        },
      ],
    },
    {
      id: 'design-ddd',
      type: 'single',
      slot: 'design.ddd',
      section: 'Domain model',
      label: {
        en: 'Domain-Driven Design building blocks (entities, value objects, aggregates) are used:',
        fr: 'Les briques du Domain-Driven Design (entités, value objects, agrégats) sont utilisées :',
      },
      options: [
        {
          value: 'core-only',
          label: {
            en: 'In the complex core of the business only',
            fr: 'Dans le cœur complexe du métier seulement',
          },
        },
        { value: 'everywhere', label: { en: 'Everywhere', fr: 'Partout' } },
        { value: 'not-used', label: { en: 'Not used', fr: 'Pas utilisées' } },
      ],
      required: false,
      fragments: [
        {
          when: { equals: 'core-only' },
          text: 'Model the complex core of the business with entities, value objects and aggregates; write simple create-read-update-delete and configuration code plainly, without them.',
        },
        {
          when: { equals: 'everywhere' },
          text: 'Model every business concept as an entity (has an identity) or a value object (defined by its values), and change an aggregate only through its root, one aggregate per transaction.',
        },
        {
          when: { equals: 'core-only' },
          text: 'Make a value object immutable and compared by value, validated when built (`Money`, `Region`); an entity is compared by identity.',
        },
        {
          when: { equals: 'everywhere' },
          text: 'Make a value object immutable and compared by value, validated when built (`Money`, `Region`); an entity is compared by identity.',
        },
        {
          when: { equals: 'not-used' },
          text: 'Do not introduce Domain-Driven Design building blocks (aggregates, value object classes, domain events) unasked: follow the data structures the code already uses.',
        },
      ],
    },
    {
      id: 'design-domain-model',
      type: 'scale',
      slot: 'design.domain-model',
      section: 'Domain model',
      label: {
        en: 'A business object carries its own rules and refuses an invalid change itself.',
        fr: 'Un objet métier porte ses propres règles et refuse lui-même un changement invalide.',
      },
      required: false,
      fragments: [
        {
          when: { scaleAtLeast: 4 },
          text: 'Put a business rule in a method of the entity it protects (`instance.stop(now)` throws on a forbidden transition); never set a status or a field from outside and never add a public setter for it.',
        },
        {
          when: { scaleAtMost: 2 },
          text: 'Entities are plain data and the rules live in services: put a rule in the service that owns the action, in one place, and do not add behaviour to the data types.',
        },
      ],
    },
    {
      id: 'design-ubiquitous-language',
      type: 'scale',
      slot: 'design.ubiquitous-language',
      section: 'Domain model',
      label: {
        en: 'The code uses the words of the business: when a concept is renamed, the code is renamed.',
        fr: 'Le code emploie les mots du métier : quand un concept est renommé, le code l’est aussi.',
      },
      required: false,
      fragments: [
        {
          when: { scaleAtLeast: 4 },
          text: 'Name types, functions and tables with the exact words the business uses, one word per concept and no synonym; when a term in the task matches no name in the code, ask instead of inventing one.',
        },
        {
          when: { scaleAtLeast: 4 },
          text: 'The same word can mean different things in two contexts (an instance for provisioning, an instance for billing): keep one model per context and translate between them, never share one type.',
        },
        {
          when: { scaleAtMost: 2 },
          text: 'Keep the names the code already has, even when the business now uses another word; do not rename identifiers to follow vocabulary unasked.',
        },
      ],
    },
    {
      id: 'design-repositories',
      type: 'single',
      slot: 'design.repositories',
      section: 'Domain model',
      label: {
        en: 'Business code loads and saves its objects through:',
        fr: 'Le code métier charge et enregistre ses objets par :',
      },
      options: [
        {
          value: 'repositories',
          label: {
            en: 'Repositories that hide the ORM or the SQL',
            fr: 'Des repositories qui cachent l’ORM ou le SQL',
          },
        },
        {
          value: 'active-record',
          label: {
            en: 'Models that save themselves (Active Record)',
            fr: 'Des modèles qui s’enregistrent eux-mêmes (Active Record)',
          },
        },
        {
          value: 'data-client',
          label: {
            en: 'The ORM or database client, called directly',
            fr: 'L’ORM ou le client de base, appelé directement',
          },
        },
      ],
      required: false,
      fragments: [
        {
          when: { equals: 'repositories' },
          text: 'Load and save business objects through a repository (`findById`, `save`) that returns domain objects, never ORM rows or query builders; add the method you need to the existing repository.',
        },
        {
          when: { equals: 'active-record' },
          text: 'Models load and save themselves: use their own query and save methods and do not wrap them in repository classes.',
        },
        {
          when: { equals: 'data-client' },
          text: 'Call the ORM or the database client directly where the data is needed; do not add a repository layer that only forwards to it.',
        },
        {
          when: { answered: true },
          text: 'Load explicitly what an action needs, in one query or a fixed number of them; never rely on lazy loading inside a loop, which makes one query per row.',
        },
      ],
    },
    {
      id: 'design-dto',
      type: 'scale',
      slot: 'design.dto',
      section: 'Domain model',
      label: {
        en: 'What crosses the API is a dedicated shape, never a database model or an entity as is.',
        fr: 'Ce qui traverse l’API est une forme dédiée, jamais un modèle de base ou une entité tels quels.',
      },
      required: false,
      fragments: [
        {
          when: { scaleAtLeast: 4 },
          text: 'Never return or accept a database model or an entity as is: map it to a flat transfer shape that lists each exposed field, so that an internal field never leaks and a schema change never changes the contract.',
        },
        {
          when: { scaleAtMost: 2 },
          text: 'Models may be returned as they are, without a mapping layer; before exposing one, check that it holds no internal or sensitive field and hide those explicitly.',
        },
      ],
    },
    {
      id: 'design-cqs',
      type: 'scale',
      slot: 'design.cqs',
      section: 'Domain model',
      label: {
        en: 'A method either changes state or returns a value, never both.',
        fr: 'Une méthode modifie l’état ou renvoie une valeur, jamais les deux.',
      },
      required: false,
      fragments: [
        {
          when: { scaleAtLeast: 4 },
          text: 'Write a method as a command that changes state and returns nothing beyond an id or a status, or as a query that returns a value and changes nothing; a `get…` or `find…` never writes.',
        },
        {
          when: { scaleAtMost: 2 },
          text: 'A method may change state and return the result; still, never hide a write behind a name that reads (`get…`, `find…`, `is…`).',
        },
      ],
    },
  ],
} satisfies Questionnaire
