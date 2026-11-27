---
"@coreloom-uml/api": minor
"@coreloom-uml/web": minor
---

The web research and the assistant can search the web (behind the `web-search` flag): the admin
saves one web search service for the instance (Linkup) in Settings, its key checked with the
service first, sealed and never shown back. The research searches before it reads the pages worth
it, each search listed with its steps; in « Auto », the assistant searches for what the owner asks
about the outside world, shows each query as it runs and ends its reply with the number of
searches. Only the query leaves; an account runs at most 50 searches a day, and no query or result
is logged or stored.
