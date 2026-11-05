/* eslint-disable prettier/prettier */
import type { routes } from './index.ts'

export interface ApiDefinition {
  health: typeof routes['health']
  auth: {
    register: typeof routes['auth.register']
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
  notes: {
    index: typeof routes['notes.index']
    store: typeof routes['notes.store']
    show: typeof routes['notes.show']
    update: typeof routes['notes.update']
    destroy: typeof routes['notes.destroy']
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
    }
    sharing: {
      show: typeof routes['architectures.sharing.show']
      update: typeof routes['architectures.sharing.update']
      regenerateLink: typeof routes['architectures.sharing.regenerate_link']
      regenerateCode: typeof routes['architectures.sharing.regenerate_code']
    }
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
  }
}
