import { defineCommand, runMain } from 'citty'
import { CliError, type ExitCode } from './errors.ts'
import { terminalIo } from './io.ts'
import { mapPush } from './map-push.ts'
import { pull } from './pull.ts'
import { setKey } from './set-key.ts'
import { API_KEY_ENV, API_URL_ENV } from './settings.ts'
import { status } from './status.ts'

/** Replaced by the package's version when bundled (see tsup.config.ts). */
declare const __CLI_VERSION__: string

/** Runs a command and turns a `CliError` into its message and exit code. */
async function run(command: () => Promise<ExitCode>) {
  try {
    process.exitCode = await command()
  } catch (error) {
    if (!(error instanceof CliError)) throw error
    console.error(`Error: ${error.message}`)
    process.exitCode = error.exitCode
  }
}

const apiUrlArg = {
  type: 'string',
  description: `Coreloom UML API URL (or ${API_URL_ENV}; remembered in the manifest)`,
  valueHint: 'url',
} as const

const pullCommand = defineCommand({
  meta: {
    name: 'pull',
    description:
      "Write the configuration's latest generation into this repository, in managed blocks",
  },
  args: {
    'api-url': apiUrlArg,
    config: {
      type: 'string',
      description:
        'Agent conventions id, from their page URL (required the first time, then read from the manifest)',
      valueHint: 'id',
    },
    project: {
      type: 'string',
      description: 'Id of the project the conventions sit in, instead of --config',
      valueHint: 'id',
    },
    'dry-run': { type: 'boolean', description: 'Show the plan and the diffs, write nothing' },
    yes: { type: 'boolean', description: 'Do not ask; stop with code 2 on a block edited by hand' },
    force: { type: 'boolean', description: 'With --yes, overwrite blocks edited by hand' },
  },
  run: ({ args }) =>
    run(() =>
      pull({
        cwd: process.cwd(),
        io: terminalIo(),
        ...(args['api-url'] ? { apiUrl: args['api-url'] } : {}),
        ...(args.config ? { config: args.config } : {}),
        ...(args.project ? { project: args.project } : {}),
        dryRun: args['dry-run'] === true,
        yes: args.yes === true,
        force: args.force === true,
      }),
    ),
})

const statusCommand = defineCommand({
  meta: { name: 'status', description: 'Compare the managed blocks with the last pull' },
  args: { 'api-url': apiUrlArg },
  run: ({ args }) =>
    run(() =>
      status({
        cwd: process.cwd(),
        io: terminalIo(),
        ...(args['api-url'] ? { apiUrl: args['api-url'] } : {}),
      }),
    ),
})

const checkCommand = defineCommand({
  meta: {
    name: 'check',
    description: 'For CI: exit with 0 only when every managed block matches the latest generation',
  },
  args: {
    'api-url': apiUrlArg,
    json: { type: 'boolean', description: 'Print one JSON object instead of text' },
  },
  run: ({ args }) =>
    run(() =>
      status({
        cwd: process.cwd(),
        io: terminalIo(),
        ...(args['api-url'] ? { apiUrl: args['api-url'] } : {}),
        check: true,
        json: args.json === true,
      }),
    ),
})

const configCommand = defineCommand({
  meta: { name: 'config', description: 'Manage the CLI configuration' },
  subCommands: {
    'set-key': defineCommand({
      meta: {
        name: 'set-key',
        description: `Store an API key read on standard input (${API_KEY_ENV} takes precedence)`,
      },
      run: () => run(() => setKey({ io: terminalIo() })),
    }),
  },
})

const mapCommand = defineCommand({
  meta: { name: 'map', description: 'Send a map of the code to a project' },
  subCommands: {
    push: defineCommand({
      meta: {
        name: 'push',
        description:
          'Map this repository with graphify (or read a graph.json) and send the map, never the code',
      },
      args: {
        'api-url': apiUrlArg,
        project: {
          type: 'string',
          description:
            "Id of the project, from its page URL (else the manifest's, when it names one)",
          valueHint: 'id',
        },
        graph: {
          type: 'string',
          description: 'A graph.json graphify wrote, instead of running graphify',
          valueHint: 'path',
        },
        repository: {
          type: 'string',
          description: "Repository web URL (default: the origin remote's, without credentials)",
          valueHint: 'url',
        },
        branch: { type: 'string', description: 'Branch (default: the checked out one)' },
        commit: { type: 'string', description: 'Commit SHA (default: HEAD)', valueHint: 'sha' },
        'dry-run': { type: 'boolean', description: 'Build the map and print it, send nothing' },
      },
      run: ({ args }) =>
        run(() =>
          mapPush({
            cwd: process.cwd(),
            io: terminalIo(),
            ...(args['api-url'] ? { apiUrl: args['api-url'] } : {}),
            ...(args.project ? { project: args.project } : {}),
            ...(args.graph ? { graph: args.graph } : {}),
            ...(args.repository ? { repository: args.repository } : {}),
            ...(args.branch ? { branch: args.branch } : {}),
            ...(args.commit ? { commit: args.commit } : {}),
            dryRun: args['dry-run'] === true,
          }),
        ),
    }),
  },
})

const main = defineCommand({
  meta: {
    name: 'coreloom-uml',
    version: __CLI_VERSION__,
    description: 'Write Coreloom UML agent conventions into a repository and map its code',
  },
  subCommands: {
    pull: pullCommand,
    status: statusCommand,
    check: checkCommand,
    config: configCommand,
    map: mapCommand,
  },
})

runMain(main)
