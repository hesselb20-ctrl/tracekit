# Example: a todo API

Everything here is reproducible from the repo root.

| Path | What it is |
|---|---|
| `todo-api/` | A tiny in-memory Express API: login, a profile endpoint and todo CRUD. Demo credentials only. |
| `record.mjs` | Starts the API, makes 17 real HTTP requests and writes them as a HAR 1.2 file. |
| `session.har` | The recording. It contains the demo email, password and a throwaway token on purpose, so you can see redaction work. |
| `generated/` | What `tracekit build` produced from `session.har`, committed as-is. |
| `try-mcp.mjs` | Connects a real MCP client to `generated/mcp-server` and calls its tools against the live API. |

```bash
npm run example:record   # re-record session.har
npm run example:build    # regenerate examples/generated
npm run example:mcp      # install the server's one dependency and run the round trip
```

`session.har` is recorded by a script instead of a browser so the example can be regenerated without
clicking through DevTools. The format is the same one Chrome, Firefox and Safari export.

The committed output was generated with `--no-ai`, so it is byte-for-byte reproducible without an API
key. With `ANTHROPIC_API_KEY` set and `--no-ai` removed, Claude writes the operation names and tool
descriptions instead.

`generated/session.redacted.har` is what tracekit actually analysed. Compare it with `session.har`:
the token is `REDACTED_TOKEN_1`, the password is `REDACTED_PASSWORD_1`, the email is `user1@example.com`.
