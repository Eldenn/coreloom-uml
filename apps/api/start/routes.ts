import router from '@adonisjs/core/services/router'
import { middleware } from '#start/kernel'
import { authThrottle } from '#start/limiter'

/*
|--------------------------------------------------------------------------
| Health check
|--------------------------------------------------------------------------
*/
router
  .get('/health', [() => import('#app/health/controllers/health-controller'), 'handle'])
  .as('health')

/*
|--------------------------------------------------------------------------
| Authentication (session-backed, local users table)
|--------------------------------------------------------------------------
|
| Route names (`auth.*`) are what the Tuyau client tree is built from. They
| MUST be snake_case: Tuyau camelCases each segment for the client type
| (`forgot_password` -> `client.api.auth.forgotPassword`) and snake_cases the
| property back at runtime to look the route up. A camelCase name typechecks
| but resolves to nothing at runtime ("... is not a function").
*/
router
  .group(() => {
    router
      .post('/register', [() => import('#app/auth/controllers/register-controller'), 'handle'])
      .as('register')
    router
      .post('/login', [() => import('#app/auth/controllers/login-controller'), 'handle'])
      .as('login')
    router
      .post('/logout', [() => import('#app/auth/controllers/logout-controller'), 'handle'])
      .as('logout')
      .use(middleware.auth())
    router
      .get('/me', [() => import('#app/auth/controllers/me-controller'), 'handle'])
      .as('me')
      .use(middleware.auth())
    router
      .post('/forgot-password', [
        () => import('#app/auth/controllers/forgot-password-controller'),
        'handle',
      ])
      .as('forgot_password')
    router
      .post('/reset-password', [
        () => import('#app/auth/controllers/reset-password-controller'),
        'handle',
      ])
      .as('reset_password')
    router
      .get('/verify-email', [
        () => import('#app/auth/controllers/verify-email-controller'),
        'handle',
      ])
      .as('verify_email')
    router
      .post('/resend-verification', [
        () => import('#app/auth/controllers/resend-verification-controller'),
        'handle',
      ])
      .as('resend_verification')
      .use(middleware.auth())
  })
  .prefix('/auth')
  .as('auth')
  .use(authThrottle)

/*
|--------------------------------------------------------------------------
| Users
|--------------------------------------------------------------------------
*/
router
  .get('/users/:id', [() => import('#app/users/controllers/users-controller'), 'show'])
  .as('users.show')
  // `User.id` is an integer column; constrain `:id` to digits so a non-numeric
  // value is a clean route 404 instead of a Postgres `22P02` cast error → 500.
  .where('id', router.matchers.number())
  .use(middleware.auth())

/*
|--------------------------------------------------------------------------
| Notes (reference user-owned resource — copy this for new domains)
|--------------------------------------------------------------------------
|
| RESTful CRUD, owner-scoped, paginated `index`. Route names (`notes.*`) are
| snake_case like every other group so the Tuyau client resolves them.
*/
const notesController = () => import('#app/notes/controllers/notes-controller')
router
  .group(() => {
    router.get('/', [notesController, 'index']).as('notes.index')
    router.post('/', [notesController, 'store']).as('notes.store')
    router.get('/:id', [notesController, 'show']).as('notes.show')
    router.patch('/:id', [notesController, 'update']).as('notes.update')
    router.delete('/:id', [notesController, 'destroy']).as('notes.destroy')
  })
  .prefix('/notes')
  // `Note.id` is an integer column — constrain `:id` to digits so a non-numeric
  // value is a clean route 404 instead of a Postgres cast error.
  .where('id', router.matchers.number())
  .use(middleware.auth())

/*
|--------------------------------------------------------------------------
| Account (self-service management of the signed-in user)
|--------------------------------------------------------------------------
|
| Route names (`account.*`) drive the Tuyau client tree, e.g.
| `client.api.account.changePassword({ body: { ... } })`.
|
| `middleware.verified()` is available (see `start/kernel.ts`) for routes that
| must sit behind a verified email — none do yet.
*/
router
  .group(() => {
    router
      .patch('/account', [
        () => import('#app/account/controllers/update-profile-controller'),
        'handle',
      ])
      .as('account.update_profile')
    router
      .put('/account/password', [
        () => import('#app/account/controllers/change-password-controller'),
        'handle',
      ])
      .as('account.change_password')
      // Verifies the current password — throttle it like the auth endpoints.
      .use(authThrottle)
    router
      .delete('/account', [
        () => import('#app/account/controllers/delete-account-controller'),
        'handle',
      ])
      .as('account.destroy')
      .use(authThrottle)

    // Avatar: drive-backed, private disk. `avatar_show` streams the bytes back
    // through this authenticated route (own avatar only).
    const avatarController = () => import('#app/account/controllers/avatar-controller')
    router.get('/account/avatar', [avatarController, 'show']).as('account.avatar_show')
    router.post('/account/avatar', [avatarController, 'update']).as('account.avatar_update')
    router.delete('/account/avatar', [avatarController, 'destroy']).as('account.avatar_destroy')
  })
  .use(middleware.auth())
