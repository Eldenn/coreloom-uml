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
    codeMaps: {
      index: typeof routes['projects.code_maps.index']
      conformance: typeof routes['projects.code_maps.conformance']
      store: typeof routes['projects.code_maps.store']
      github: typeof routes['projects.code_maps.github']
      follow: {
        show: typeof routes['projects.code_maps.follow.show']
        destroy: typeof routes['projects.code_maps.follow.destroy']
      }
    }
    requirements: {
      index: typeof routes['projects.requirements.index']
      store: typeof routes['projects.requirements.store']
    }
    decisions: {
      index: typeof routes['projects.decisions.index']
      store: typeof routes['projects.decisions.store']
    }
    designReview: {
      show: typeof routes['projects.design_review.show']
    }
    codeReviews: {
      index: typeof routes['projects.code_reviews.index']
    }
  }
  codeMaps: {
    show: typeof routes['code_maps.show']
    destroy: typeof routes['code_maps.destroy']
    links: {
      show: typeof routes['code_maps.links.show']
      update: typeof routes['code_maps.links.update']
    }
    processes: {
      index: typeof routes['code_maps.processes.index']
      propose: typeof routes['code_maps.processes.propose']
    }
    suggestions: {
      index: typeof routes['code_maps.suggestions.index']
      store: typeof routes['code_maps.suggestions.store']
    }
  }
  codeMapSuggestions: {
    update: typeof routes['code_map_suggestions.update']
    draft: typeof routes['code_map_suggestions.draft']
  }
  github: {
    connection: {
      show: typeof routes['github.connection.show']
      start: typeof routes['github.connection.start']
      store: typeof routes['github.connection.store']
      destroy: typeof routes['github.connection.destroy']
    }
    webhook: typeof routes['github.webhook']
  }
  admin: {
    githubApp: {
      show: typeof routes['admin.github_app.show']
      start: typeof routes['admin.github_app.start']
      store: typeof routes['admin.github_app.store']
      destroy: typeof routes['admin.github_app.destroy']
    }
    webSearch: {
      show: typeof routes['admin.web_search.show']
      update: typeof routes['admin.web_search.update']
      destroy: typeof routes['admin.web_search.destroy']
    }
    skillVersions: {
      index: typeof routes['admin.skill_versions.index']
      store: typeof routes['admin.skill_versions.store']
      scans: typeof routes['admin.skill_versions.scans']
      scan: typeof routes['admin.skill_versions.scan']
      modelReview: typeof routes['admin.skill_versions.model_review']
      show: typeof routes['admin.skill_versions.show']
      update: typeof routes['admin.skill_versions.update']
    }
    skills: {
      refresh: typeof routes['admin.skills.refresh']
      update: typeof routes['admin.skills.update']
      topics: typeof routes['admin.skills.topics']
    }
    jobs: {
      index: typeof routes['admin.jobs.index']
    }
    skillSources: {
      index: typeof routes['admin.skill_sources.index']
      store: typeof routes['admin.skill_sources.store']
      update: typeof routes['admin.skill_sources.update']
      destroy: typeof routes['admin.skill_sources.destroy']
    }
    featureFlags: {
      index: typeof routes['admin.feature_flags.index']
      update: typeof routes['admin.feature_flags.update']
    }
  }
  requirements: {
    update: typeof routes['requirements.update']
    destroy: typeof routes['requirements.destroy']
  }
  decisions: {
    update: typeof routes['decisions.update']
    destroy: typeof routes['decisions.destroy']
  }
  architectures: {
    designReview: {
      store: typeof routes['architectures.design_review.store']
    }
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
    milestones: {
      index: typeof routes['architectures.milestones.index']
      store: typeof routes['architectures.milestones.store']
      show: typeof routes['architectures.milestones.show']
      destroy: typeof routes['architectures.milestones.destroy']
      restore: typeof routes['architectures.milestones.restore']
    }
    assistant: {
      messages: {
        store: typeof routes['architectures.assistant.messages.store']
      }
      readings: {
        store: typeof routes['architectures.assistant.readings.store']
      }
      context: typeof routes['architectures.assistant.context']
      changes: {
        accept: typeof routes['architectures.assistant.changes.accept']
        reject: typeof routes['architectures.assistant.changes.reject']
        undo: typeof routes['architectures.assistant.changes.undo']
      }
    }
  }
  designFindings: {
    update: typeof routes['design_findings.update']
  }
  codeReviews: {
    store: typeof routes['code_reviews.store']
    show: typeof routes['code_reviews.show']
    destroy: typeof routes['code_reviews.destroy']
    diagrams: {
      store: typeof routes['code_reviews.diagrams.store']
    }
  }
  codeReviewFindings: {
    update: typeof routes['code_review_findings.update']
  }
  agentConfigs: {
    index: typeof routes['agent_configs.index']
    store: typeof routes['agent_configs.store']
    merges: {
      store: typeof routes['agent_configs.merges.store']
    }
    show: typeof routes['agent_configs.show']
    update: typeof routes['agent_configs.update']
    destroy: typeof routes['agent_configs.destroy']
    readyRules: {
      update: typeof routes['agent_configs.ready_rules.update']
    }
    skills: {
      update: typeof routes['agent_configs.skills.update']
    }
    rules: {
      store: typeof routes['agent_configs.rules.store']
      update: typeof routes['agent_configs.rules.update']
      destroy: typeof routes['agent_configs.rules.destroy']
    }
    roles: {
      suggestions: typeof routes['agent_configs.roles.suggestions']
      store: typeof routes['agent_configs.roles.store']
      update: typeof routes['agent_configs.roles.update']
      destroy: typeof routes['agent_configs.roles.destroy']
    }
    generations: {
      store: typeof routes['agent_configs.generations.store']
      index: typeof routes['agent_configs.generations.index']
      latest: typeof routes['agent_configs.generations.latest']
      show: typeof routes['agent_configs.generations.show']
      skillFiles: typeof routes['agent_configs.generations.skill_files']
    }
    proposals: {
      store: typeof routes['agent_configs.proposals.store']
    }
    research: {
      store: typeof routes['agent_configs.research.store']
      show: typeof routes['agent_configs.research.show']
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
    apiKeys: {
      save: typeof routes['llm.api_keys.save']
      destroy: typeof routes['llm.api_keys.destroy']
    }
  }
  rulePacks: {
    index: typeof routes['rule_packs.index']
  }
  rolePresets: {
    index: typeof routes['role_presets.index']
  }
  skills: {
    index: typeof routes['skills.index']
    stats: typeof routes['skills.stats']
    events: typeof routes['skills.events']
    show: typeof routes['skills.show']
    copy: typeof routes['skills.copy']
  }
  mcp: typeof routes['mcp']
  assistant: {
    conversations: {
      index: typeof routes['assistant.conversations.index']
      store: typeof routes['assistant.conversations.store']
      show: typeof routes['assistant.conversations.show']
      update: typeof routes['assistant.conversations.update']
      destroy: typeof routes['assistant.conversations.destroy']
      continue: typeof routes['assistant.conversations.continue']
    }
    files: {
      store: typeof routes['assistant.files.store']
    }
    sandbox: {
      commands: {
        run: typeof routes['assistant.sandbox.commands.run']
      }
    }
    messages: {
      store: typeof routes['assistant.messages.store']
      destroy: typeof routes['assistant.messages.destroy']
    }
    proposals: {
      settle: typeof routes['assistant.proposals.settle']
    }
    actions: {
      accept: typeof routes['assistant.actions.accept']
      reject: typeof routes['assistant.actions.reject']
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
}
