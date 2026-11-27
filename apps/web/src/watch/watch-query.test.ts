import { describe, expect, it } from 'vitest'

import { WATCH_PAGE_SIZE, watchQueryFrom } from './watch-query'

const topics = { testing: 'Testing', react: 'React' }

describe('watchQueryFrom', () => {
  it('asks for the first page with nothing set', () => {
    expect(watchQueryFrom({}, topics, false)).toEqual({ page: 1, perPage: WATCH_PAGE_SIZE })
  })

  it('reads the words, the tag, the period and the page', () => {
    expect(
      watchQueryFrom({ q: ' vite ', topic: 'react', since: '30', page: '3' }, topics, false),
    ).toEqual({ page: 3, perPage: WATCH_PAGE_SIZE, q: 'vite', topic: 'react', sinceDays: 30 })
  })

  it('drops an unknown tag, period or page and blank words', () => {
    expect(
      watchQueryFrom({ q: '  ', topic: 'cooking', since: '12', page: 'x' }, topics, false),
    ).toEqual({ page: 1, perPage: WATCH_PAGE_SIZE })
  })

  it('sends the admin filters for the admin only', () => {
    const search = { untagged: '1', hidden: '1' }
    expect(watchQueryFrom(search, topics, false)).toEqual({ page: 1, perPage: WATCH_PAGE_SIZE })
    expect(watchQueryFrom(search, topics, true)).toEqual({
      page: 1,
      perPage: WATCH_PAGE_SIZE,
      untagged: true,
      hidden: true,
    })
  })
})
