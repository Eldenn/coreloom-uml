/* eslint-disable prettier/prettier */
/// <reference path="../manifest.d.ts" />

import type { ExtractBody, ExtractErrorResponse, ExtractQuery, ExtractQueryForGet, ExtractResponse } from '@tuyau/core/types'
import type { InferInput, SimpleError } from '@vinejs/vine/types'

export type ParamValue = string | number | bigint | boolean

export interface Registry {
  'health': {
    methods: ["GET","HEAD"]
    pattern: '/health'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#app/health/controllers/health-controller').default['handle']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#app/health/controllers/health-controller').default['handle']>>>
    }
  }
  'auth.register': {
    methods: ["POST"]
    pattern: '/auth/register'
    types: {
      body: ExtractBody<InferInput<(typeof import('#app/auth/validators/auth-input').registerInput)>>
      paramsTuple: []
      params: {}
      query: ExtractQuery<InferInput<(typeof import('#app/auth/validators/auth-input').registerInput)>>
      response: ExtractResponse<Awaited<ReturnType<import('#app/auth/controllers/register-controller').default['handle']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#app/auth/controllers/register-controller').default['handle']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'auth.login': {
    methods: ["POST"]
    pattern: '/auth/login'
    types: {
      body: ExtractBody<InferInput<(typeof import('#app/auth/validators/auth-input').loginInput)>>
      paramsTuple: []
      params: {}
      query: ExtractQuery<InferInput<(typeof import('#app/auth/validators/auth-input').loginInput)>>
      response: ExtractResponse<Awaited<ReturnType<import('#app/auth/controllers/login-controller').default['handle']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#app/auth/controllers/login-controller').default['handle']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'auth.logout': {
    methods: ["POST"]
    pattern: '/auth/logout'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#app/auth/controllers/logout-controller').default['handle']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#app/auth/controllers/logout-controller').default['handle']>>>
    }
  }
  'auth.me': {
    methods: ["GET","HEAD"]
    pattern: '/auth/me'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#app/auth/controllers/me-controller').default['handle']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#app/auth/controllers/me-controller').default['handle']>>>
    }
  }
  'auth.forgot_password': {
    methods: ["POST"]
    pattern: '/auth/forgot-password'
    types: {
      body: ExtractBody<InferInput<(typeof import('#app/auth/validators/auth-input').forgotPasswordInput)>>
      paramsTuple: []
      params: {}
      query: ExtractQuery<InferInput<(typeof import('#app/auth/validators/auth-input').forgotPasswordInput)>>
      response: ExtractResponse<Awaited<ReturnType<import('#app/auth/controllers/forgot-password-controller').default['handle']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#app/auth/controllers/forgot-password-controller').default['handle']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'auth.reset_password': {
    methods: ["POST"]
    pattern: '/auth/reset-password'
    types: {
      body: ExtractBody<InferInput<(typeof import('#app/auth/validators/auth-input').resetPasswordInput)>>
      paramsTuple: []
      params: {}
      query: ExtractQuery<InferInput<(typeof import('#app/auth/validators/auth-input').resetPasswordInput)>>
      response: ExtractResponse<Awaited<ReturnType<import('#app/auth/controllers/reset-password-controller').default['handle']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#app/auth/controllers/reset-password-controller').default['handle']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'auth.verify_email': {
    methods: ["GET","HEAD"]
    pattern: '/auth/verify-email'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: ExtractQueryForGet<InferInput<(typeof import('#app/auth/validators/auth-input').verifyEmailInput)>>
      response: ExtractResponse<Awaited<ReturnType<import('#app/auth/controllers/verify-email-controller').default['handle']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#app/auth/controllers/verify-email-controller').default['handle']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'auth.resend_verification': {
    methods: ["POST"]
    pattern: '/auth/resend-verification'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#app/auth/controllers/resend-verification-controller').default['handle']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#app/auth/controllers/resend-verification-controller').default['handle']>>>
    }
  }
  'users.show': {
    methods: ["GET","HEAD"]
    pattern: '/users/:id'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#app/users/controllers/users-controller').default['show']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#app/users/controllers/users-controller').default['show']>>>
    }
  }
  'notes.index': {
    methods: ["GET","HEAD"]
    pattern: '/notes'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: ExtractQueryForGet<InferInput<(typeof import('#app/notes/validators/notes-input').listNotesInput)>>
      response: ExtractResponse<Awaited<ReturnType<import('#app/notes/controllers/notes-controller').default['index']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#app/notes/controllers/notes-controller').default['index']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'notes.store': {
    methods: ["POST"]
    pattern: '/notes'
    types: {
      body: ExtractBody<InferInput<(typeof import('#app/notes/validators/notes-input').createNoteInput)>>
      paramsTuple: []
      params: {}
      query: ExtractQuery<InferInput<(typeof import('#app/notes/validators/notes-input').createNoteInput)>>
      response: ExtractResponse<Awaited<ReturnType<import('#app/notes/controllers/notes-controller').default['store']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#app/notes/controllers/notes-controller').default['store']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'notes.show': {
    methods: ["GET","HEAD"]
    pattern: '/notes/:id'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#app/notes/controllers/notes-controller').default['show']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#app/notes/controllers/notes-controller').default['show']>>>
    }
  }
  'notes.update': {
    methods: ["PATCH"]
    pattern: '/notes/:id'
    types: {
      body: ExtractBody<InferInput<(typeof import('#app/notes/validators/notes-input').updateNoteInput)>>
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: ExtractQuery<InferInput<(typeof import('#app/notes/validators/notes-input').updateNoteInput)>>
      response: ExtractResponse<Awaited<ReturnType<import('#app/notes/controllers/notes-controller').default['update']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#app/notes/controllers/notes-controller').default['update']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'notes.destroy': {
    methods: ["DELETE"]
    pattern: '/notes/:id'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#app/notes/controllers/notes-controller').default['destroy']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#app/notes/controllers/notes-controller').default['destroy']>>>
    }
  }
  'account.update_profile': {
    methods: ["PATCH"]
    pattern: '/account'
    types: {
      body: ExtractBody<InferInput<(typeof import('#app/account/validators/account-input').updateProfileInput)>>
      paramsTuple: []
      params: {}
      query: ExtractQuery<InferInput<(typeof import('#app/account/validators/account-input').updateProfileInput)>>
      response: ExtractResponse<Awaited<ReturnType<import('#app/account/controllers/update-profile-controller').default['handle']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#app/account/controllers/update-profile-controller').default['handle']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'account.change_password': {
    methods: ["PUT"]
    pattern: '/account/password'
    types: {
      body: ExtractBody<InferInput<(typeof import('#app/account/validators/account-input').changePasswordInput)>>
      paramsTuple: []
      params: {}
      query: ExtractQuery<InferInput<(typeof import('#app/account/validators/account-input').changePasswordInput)>>
      response: ExtractResponse<Awaited<ReturnType<import('#app/account/controllers/change-password-controller').default['handle']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#app/account/controllers/change-password-controller').default['handle']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'account.destroy': {
    methods: ["DELETE"]
    pattern: '/account'
    types: {
      body: ExtractBody<InferInput<(typeof import('#app/account/validators/account-input').deleteAccountInput)>>
      paramsTuple: []
      params: {}
      query: ExtractQuery<InferInput<(typeof import('#app/account/validators/account-input').deleteAccountInput)>>
      response: ExtractResponse<Awaited<ReturnType<import('#app/account/controllers/delete-account-controller').default['handle']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#app/account/controllers/delete-account-controller').default['handle']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'account.avatar_show': {
    methods: ["GET","HEAD"]
    pattern: '/account/avatar'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#app/account/controllers/avatar-controller').default['show']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#app/account/controllers/avatar-controller').default['show']>>>
    }
  }
  'account.avatar_update': {
    methods: ["POST"]
    pattern: '/account/avatar'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#app/account/controllers/avatar-controller').default['update']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#app/account/controllers/avatar-controller').default['update']>>>
    }
  }
  'account.avatar_destroy': {
    methods: ["DELETE"]
    pattern: '/account/avatar'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#app/account/controllers/avatar-controller').default['destroy']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#app/account/controllers/avatar-controller').default['destroy']>>>
    }
  }
}
