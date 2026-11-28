/*
|--------------------------------------------------------------------------
| Default account: the API refuses to start without it in production
|--------------------------------------------------------------------------
|
| The admin is the default account (`DEFAULT_ACCOUNT_*`), so the web server stops here rather
| than serving with no admin. Loaded for the web server only: no job reads the default account,
| and the staging and production compose files give it to no worker (security review I6).
| `node ace account:ensure-default` checks the same itself.
*/
import { currentDefaultAccountProblems } from '#app/auth/services/default-account'

const problems = currentDefaultAccountProblems()
if (problems.length > 0) throw new Error(problems.join('\n'))
