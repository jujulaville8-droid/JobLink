# Historical reset SQL — not for deployment

These scripts drop tables/types or rebuild old schemas. Never run them against restored or production data. The local test harness uses the legacy fresh schema only inside a newly created in-memory database. See `docs/deployment.md` for the additive release process. Their presence here does not make them safe restoration commands.
