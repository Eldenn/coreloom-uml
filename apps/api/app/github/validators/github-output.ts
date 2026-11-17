/** A repository the user reads through the GitHub App. */
export type GithubRepositoryOutput = {
  /** GitHub's repository id. */
  id: number
  owner: string
  name: string
  /** `https://github.com/<owner>/<name>`, what `POST /projects/:id/code-maps/github` takes. */
  url: string
  private: boolean
  defaultBranch: string
}

/** `GET /github/connection`: whether the App is set up here, and what the user connected. */
export type GithubConnectionOutput = {
  /** False when this server has no GitHub App: only public repositories can be read. */
  available: boolean
  /** The GitHub account of the last connection, null before any (or after disconnecting). */
  login: string | null
  repositories: GithubRepositoryOutput[]
}

/** `POST /github/connection/start`: the GitHub page to send the browser to. */
export type GithubConnectionStartOutput = { url: string }

/** `POST /github/connection`: the connection, and the web app's page to go back to. */
export type GithubConnectionCompleteOutput = GithubConnectionOutput & { returnTo: string }

/** The GitHub App this server uses, as the admin sees it. No secret, ever. */
export type GithubAppOutput = {
  appId: number
  slug: string
  /** The App's name on GitHub; its slug when it comes from the environment. */
  name: string
  /** The account that owns it, null when it comes from the environment. */
  owner: { login: string; type: 'User' | 'Organization' } | null
  /** The App's public page, where users install it. */
  pageUrl: string
  /** The App's settings on GitHub (where it is deleted), null when the owner is unknown. */
  settingsUrl: string | null
  /** Whether GitHub delivers pushes here (an App made without a webhook follows none). */
  webhook: boolean
}

/** `GET /admin/github-app` */
export type GithubAppStatusOutput = {
  /** Where the App comes from: the environment wins over the settings; null when there is none. */
  source: 'environment' | 'settings' | null
  app: GithubAppOutput | null
  /** Where GitHub would deliver pushes, and whether it can reach it (public HTTPS address). */
  webhookUrl: string
  webhookReachable: boolean
}

/**
 * `POST /admin/github-app/manifest`: the page the browser posts the manifest to (a form with one
 * `manifest` field holding this JSON), on GitHub.
 */
export type GithubAppManifestOutput = {
  url: string
  manifest: Record<string, unknown>
}
