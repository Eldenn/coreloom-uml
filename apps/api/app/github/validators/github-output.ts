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
