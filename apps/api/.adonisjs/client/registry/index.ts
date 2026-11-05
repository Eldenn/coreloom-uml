/* eslint-disable prettier/prettier */
import type { AdonisEndpoint } from '@tuyau/core/types'
import type { Registry } from './schema.d.ts'
import type { ApiDefinition } from './tree.d.ts'

const placeholder: any = {}

const routes = {
  'health': {
    methods: ["GET","HEAD"],
    pattern: '/health',
    tokens: [{"old":"/health","type":0,"val":"health","end":""}],
    types: placeholder as Registry['health']['types'],
  },
  'auth.register': {
    methods: ["POST"],
    pattern: '/auth/register',
    tokens: [{"old":"/auth/register","type":0,"val":"auth","end":""},{"old":"/auth/register","type":0,"val":"register","end":""}],
    types: placeholder as Registry['auth.register']['types'],
  },
  'auth.login': {
    methods: ["POST"],
    pattern: '/auth/login',
    tokens: [{"old":"/auth/login","type":0,"val":"auth","end":""},{"old":"/auth/login","type":0,"val":"login","end":""}],
    types: placeholder as Registry['auth.login']['types'],
  },
  'auth.logout': {
    methods: ["POST"],
    pattern: '/auth/logout',
    tokens: [{"old":"/auth/logout","type":0,"val":"auth","end":""},{"old":"/auth/logout","type":0,"val":"logout","end":""}],
    types: placeholder as Registry['auth.logout']['types'],
  },
  'auth.me': {
    methods: ["GET","HEAD"],
    pattern: '/auth/me',
    tokens: [{"old":"/auth/me","type":0,"val":"auth","end":""},{"old":"/auth/me","type":0,"val":"me","end":""}],
    types: placeholder as Registry['auth.me']['types'],
  },
  'auth.forgot_password': {
    methods: ["POST"],
    pattern: '/auth/forgot-password',
    tokens: [{"old":"/auth/forgot-password","type":0,"val":"auth","end":""},{"old":"/auth/forgot-password","type":0,"val":"forgot-password","end":""}],
    types: placeholder as Registry['auth.forgot_password']['types'],
  },
  'auth.reset_password': {
    methods: ["POST"],
    pattern: '/auth/reset-password',
    tokens: [{"old":"/auth/reset-password","type":0,"val":"auth","end":""},{"old":"/auth/reset-password","type":0,"val":"reset-password","end":""}],
    types: placeholder as Registry['auth.reset_password']['types'],
  },
  'auth.verify_email': {
    methods: ["GET","HEAD"],
    pattern: '/auth/verify-email',
    tokens: [{"old":"/auth/verify-email","type":0,"val":"auth","end":""},{"old":"/auth/verify-email","type":0,"val":"verify-email","end":""}],
    types: placeholder as Registry['auth.verify_email']['types'],
  },
  'auth.resend_verification': {
    methods: ["POST"],
    pattern: '/auth/resend-verification',
    tokens: [{"old":"/auth/resend-verification","type":0,"val":"auth","end":""},{"old":"/auth/resend-verification","type":0,"val":"resend-verification","end":""}],
    types: placeholder as Registry['auth.resend_verification']['types'],
  },
  'users.show': {
    methods: ["GET","HEAD"],
    pattern: '/users/:id',
    tokens: [{"old":"/users/:id","type":0,"val":"users","end":""},{"old":"/users/:id","type":1,"val":"id","end":""}],
    types: placeholder as Registry['users.show']['types'],
  },
  'notes.index': {
    methods: ["GET","HEAD"],
    pattern: '/notes',
    tokens: [{"old":"/notes","type":0,"val":"notes","end":""}],
    types: placeholder as Registry['notes.index']['types'],
  },
  'notes.store': {
    methods: ["POST"],
    pattern: '/notes',
    tokens: [{"old":"/notes","type":0,"val":"notes","end":""}],
    types: placeholder as Registry['notes.store']['types'],
  },
  'notes.show': {
    methods: ["GET","HEAD"],
    pattern: '/notes/:id',
    tokens: [{"old":"/notes/:id","type":0,"val":"notes","end":""},{"old":"/notes/:id","type":1,"val":"id","end":""}],
    types: placeholder as Registry['notes.show']['types'],
  },
  'notes.update': {
    methods: ["PATCH"],
    pattern: '/notes/:id',
    tokens: [{"old":"/notes/:id","type":0,"val":"notes","end":""},{"old":"/notes/:id","type":1,"val":"id","end":""}],
    types: placeholder as Registry['notes.update']['types'],
  },
  'notes.destroy': {
    methods: ["DELETE"],
    pattern: '/notes/:id',
    tokens: [{"old":"/notes/:id","type":0,"val":"notes","end":""},{"old":"/notes/:id","type":1,"val":"id","end":""}],
    types: placeholder as Registry['notes.destroy']['types'],
  },
  'account.update_profile': {
    methods: ["PATCH"],
    pattern: '/account',
    tokens: [{"old":"/account","type":0,"val":"account","end":""}],
    types: placeholder as Registry['account.update_profile']['types'],
  },
  'account.change_password': {
    methods: ["PUT"],
    pattern: '/account/password',
    tokens: [{"old":"/account/password","type":0,"val":"account","end":""},{"old":"/account/password","type":0,"val":"password","end":""}],
    types: placeholder as Registry['account.change_password']['types'],
  },
  'account.destroy': {
    methods: ["DELETE"],
    pattern: '/account',
    tokens: [{"old":"/account","type":0,"val":"account","end":""}],
    types: placeholder as Registry['account.destroy']['types'],
  },
  'account.avatar_show': {
    methods: ["GET","HEAD"],
    pattern: '/account/avatar',
    tokens: [{"old":"/account/avatar","type":0,"val":"account","end":""},{"old":"/account/avatar","type":0,"val":"avatar","end":""}],
    types: placeholder as Registry['account.avatar_show']['types'],
  },
  'account.avatar_update': {
    methods: ["POST"],
    pattern: '/account/avatar',
    tokens: [{"old":"/account/avatar","type":0,"val":"account","end":""},{"old":"/account/avatar","type":0,"val":"avatar","end":""}],
    types: placeholder as Registry['account.avatar_update']['types'],
  },
  'account.avatar_destroy': {
    methods: ["DELETE"],
    pattern: '/account/avatar',
    tokens: [{"old":"/account/avatar","type":0,"val":"account","end":""},{"old":"/account/avatar","type":0,"val":"avatar","end":""}],
    types: placeholder as Registry['account.avatar_destroy']['types'],
  },
} as const satisfies Record<string, AdonisEndpoint>

export { routes }

export const registry = {
  routes,
  $tree: {} as ApiDefinition,
}

declare module '@tuyau/core/types' {
  export interface UserRegistry {
    routes: typeof routes
    $tree: ApiDefinition
  }
}
