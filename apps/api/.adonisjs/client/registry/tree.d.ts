/* eslint-disable prettier/prettier */
import type { routes } from './index.ts'

export interface ApiDefinition {
  health: typeof routes['health']
  auth: {
    register: typeof routes['auth.register']
    options: typeof routes['auth.options']
    login: typeof routes['auth.login']
    logout: typeof routes['auth.logout']
    me: typeof routes['auth.me']
    forgotPassword: typeof routes['auth.forgot_password']
    resetPassword: typeof routes['auth.reset_password']
    verifyEmail: typeof routes['auth.verify_email']
    resendVerification: typeof routes['auth.resend_verification']
  }
  users: {
    show: typeof routes['users.show']
  }
  projects: {
    index: typeof routes['projects.index']
    store: typeof routes['projects.store']
    show: typeof routes['projects.show']
    update: typeof routes['projects.update']
    destroy: typeof routes['projects.destroy']
    agentConfig: {
      generations: {
        latest: typeof routes['projects.agent_config.generations.latest']
      }
    }
  }
  agentConfigs: {
    index: typeof routes['agent_configs.index']
    store: typeof routes['agent_configs.store']
    show: typeof routes['agent_configs.show']
    update: typeof routes['agent_configs.update']
    destroy: typeof routes['agent_configs.destroy']
    answers: {
      update: typeof routes['agent_configs.answers.update']
    }
    rules: {
      store: typeof routes['agent_configs.rules.store']
      update: typeof routes['agent_configs.rules.update']
      destroy: typeof routes['agent_configs.rules.destroy']
    }
    generations: {
      store: typeof routes['agent_configs.generations.store']
      index: typeof routes['agent_configs.generations.index']
      latest: typeof routes['agent_configs.generations.latest']
      show: typeof routes['agent_configs.generations.show']
    }
    proposals: {
      store: typeof routes['agent_configs.proposals.store']
    }
    imports: {
      store: typeof routes['agent_configs.imports.store']
    }
  }
  llm: {
    providers: typeof routes['llm.providers']
    test: typeof routes['llm.test']
    connections: {
      openaiCodex: {
        attempts: {
          store: typeof routes['llm.connections.openai_codex.attempts.store']
          show: typeof routes['llm.connections.openai_codex.attempts.show']
        }
        destroy: typeof routes['llm.connections.openai_codex.destroy']
      }
      claudeCode: {
        login: {
          store: typeof routes['llm.connections.claude_code.login.store']
          code: typeof routes['llm.connections.claude_code.login.code']
        }
        destroy: typeof routes['llm.connections.claude_code.destroy']
      }
    }
  }
  questionnaires: {
    index: typeof routes['questionnaires.index']
    show: typeof routes['questionnaires.show']
  }
  skills: {
    index: typeof routes['skills.index']
    stats: typeof routes['skills.stats']
    events: typeof routes['skills.events']
    show: typeof routes['skills.show']
  }
  architectures: {
    index: typeof routes['architectures.index']
    store: typeof routes['architectures.store']
    show: typeof routes['architectures.show']
    update: typeof routes['architectures.update']
    destroy: typeof routes['architectures.destroy']
    duplicate: typeof routes['architectures.duplicate']
    diagrams: {
      store: typeof routes['architectures.diagrams.store']
      reorder: typeof routes['architectures.diagrams.reorder']
      update: typeof routes['architectures.diagrams.update']
      destroy: typeof routes['architectures.diagrams.destroy']
      sourceShow: typeof routes['architectures.diagrams.source_show']
      sourceUpdate: typeof routes['architectures.diagrams.source_update']
    }
    sharing: {
      show: typeof routes['architectures.sharing.show']
      update: typeof routes['architectures.sharing.update']
      regenerateLink: typeof routes['architectures.sharing.regenerate_link']
      regenerateCode: typeof routes['architectures.sharing.regenerate_code']
    }
    assistant: {
      conversations: {
        index: typeof routes['architectures.assistant.conversations.index']
        store: typeof routes['architectures.assistant.conversations.store']
        show: typeof routes['architectures.assistant.conversations.show']
        update: typeof routes['architectures.assistant.conversations.update']
        destroy: typeof routes['architectures.assistant.conversations.destroy']
        continue: typeof routes['architectures.assistant.conversations.continue']
      }
      messages: {
        store: typeof routes['architectures.assistant.messages.store']
        destroy: typeof routes['architectures.assistant.messages.destroy']
      }
      context: typeof routes['architectures.assistant.context']
      changes: {
        accept: typeof routes['architectures.assistant.changes.accept']
        reject: typeof routes['architectures.assistant.changes.reject']
        undo: typeof routes['architectures.assistant.changes.undo']
      }
    }
  }
  uml: {
    validate: typeof routes['uml.validate']
  }
  shared: {
    show: typeof routes['shared.show']
    unlock: typeof routes['shared.unlock']
  }
  account: {
    updateProfile: typeof routes['account.update_profile']
    changePassword: typeof routes['account.change_password']
    destroy: typeof routes['account.destroy']
    avatarShow: typeof routes['account.avatar_show']
    avatarUpdate: typeof routes['account.avatar_update']
    avatarDestroy: typeof routes['account.avatar_destroy']
    apiTokens: {
      index: typeof routes['account.api_tokens.index']
      store: typeof routes['account.api_tokens.store']
      destroy: typeof routes['account.api_tokens.destroy']
    }
  }
  features: {
    index: typeof routes['features.index']
  }
  admin: {
    featureFlags: {
      index: typeof routes['admin.feature_flags.index']
      update: typeof routes['admin.feature_flags.update']
    }
  }
}
