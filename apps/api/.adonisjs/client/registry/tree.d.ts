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
  account: {
    updateProfile: typeof routes['account.update_profile']
    changePassword: typeof routes['account.change_password']
    destroy: typeof routes['account.destroy']
    avatarShow: typeof routes['account.avatar_show']
    avatarUpdate: typeof routes['account.avatar_update']
    avatarDestroy: typeof routes['account.avatar_destroy']
  }
}
