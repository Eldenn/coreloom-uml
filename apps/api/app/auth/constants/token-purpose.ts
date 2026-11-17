/**
 * Purpose strings bound to encrypted tokens (`encryption.encrypt`/`.decrypt`).
 * Binding a purpose prevents a token minted for one flow (e.g. email
 * verification) from being replayed against another (e.g. password reset).
 */
export const TokenPurpose = {
  PasswordReset: 'password-reset',
  EmailVerification: 'email-verification',
  /** The `state` of a GitHub App connection (`app/github/services/github-state.ts`). */
  GithubConnection: 'github-connection',
  /** The `state` of the GitHub App's creation from its manifest (`github-app-manifest.ts`). */
  GithubAppManifest: 'github-app-manifest',
  /** The GitHub App's secrets, stored in `github_app_registrations`. */
  GithubAppCredentials: 'github-app-credentials',
} as const
