/*
|--------------------------------------------------------------------------
| Ace entry point
|--------------------------------------------------------------------------
|
| The "ace.js" file is the entrypoint for running ace commands.
|
| Do not put any custom code in this file. Instead use the "bin/console.ts"
| file to run code before the ace commands are executed.
|
*/

import '@poppinss/ts-exec'

/**
 * Import ace console entrypoint
 */
await import('./bin/console.js')
