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
      show: typeof routes['projects.agent_config.show']
      update: typeof routes['projects.agent_config.update']
      destroy: typeof routes['projects.agent_config.destroy']
      answers: {
        update: typeof routes['projects.agent_config.answers.update']
      }
      rules: {
        store: typeof routes['projects.agent_config.rules.store']
        update: typeof routes['projects.agent_config.rules.update']
        destroy: typeof routes['projects.agent_config.rules.destroy']
      }
      generations: {
        store: typeof routes['projects.agent_config.generations.store']
        index: typeof routes['projects.agent_config.generations.index']
        latest: typeof routes['projects.agent_config.generations.latest']
        show: typeof routes['projects.agent_config.generations.show']
      }
      proposals: {
        store: typeof routes['projects.agent_config.proposals.store']
      }
    }
  }
  llm: {
    providers: typeof routes['llm.providers']
    test: typeof routes['llm.test']
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
