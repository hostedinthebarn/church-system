## 8. The spike: contributor cap, `/mcp` transport, Claude OAuth (SW-131, run 2026-11-17)

Run on church-system `main` (Apostrophe 4.34.1, `@apostrophecms/event` 1.0.2, MCP SDK 1.32.2, MongoDB 8.0). Observed by running it, not read from source. Throwaway code: `spike/` on PR branch `worker/sw-131`, not for merge.

### Go or no-go on the contributor cap: GO, with two conditions

A real admin's `req`, copied with `role: 'contributor'` (`apos.task.getReq({ user: { ...admin, role: 'contributor' }, mode: 'draft' })`), behaves as a contributor and records the real person.

**Worked, refused by Apostrophe (`forbidden`), not by our code:**
- Insert and update an event as a draft: OK, and `updatedBy` is the real admin (`_id`, title, username). `can(req, 'publish')` is false.
- `publish()`: refused. No published copy appears.
- Insert in `published` mode, or update with a `published`-mode req: refused.
- `_publish: true` on an update or insert (manager call): ignored, nothing published.
- `unpublish`, `delete` (draft or published): refused.
- Localize to `es`: OK, and it creates a **draft**. Publishing the Spanish draft: refused.
- Real contributor over REST (bearer token): POST draft 200; POST in published mode 403; `PATCH` with `_publish: true` 403 (the draft part applied, nothing published); `POST /publish` 403; `/localize` then `/publish` 403; DELETE 403; `/submit` 200. A `:published` id with `aposMode=draft` edits the **draft** only. With no query string it is a 404. Nothing leaked to published.
- Control: the real admin can publish, and can PATCH published over REST.

**Condition 1: an in-process hole.** A draft-mode capped `req` could **update a `:published` document** by passing the published doc to `update()`: it succeeded and changed the live title. Apostrophe's `can()` looks at `req.mode`, not the document's own `aposMode`. A `published`-mode req is refused, and REST is safe, so the hole only exists for in-process calls. Fix, in the tool layer: never pass a document the model supplied. Load it ourselves with `manager.find(req, { aposDocId })` in draft mode, then update that. Observed: `find` in draft mode with a `:published` `_id` returns nothing, and with the `aposDocId` returns the draft. Add a test where the injected input says to edit the live copy.

**Condition 2: the bulletin can't be capped as it stands.** The bulletin piece has `localized: false` and `viewRole`/`editRole`/`publishRole: 'admin'`. It has no draft/published copies, so a contributor-capped insert is refused outright. Its "publish" is our own status route (`signedOff`), not Apostrophe's. Options: lower `editRole` to contributor on the bulletin, with sign-off staying admin-only in our route (so that part is our code, not Apostrophe's); or give `bulletin_update_draft` its own admin-level req restricted to the hand-typed fields. This needs a decision before the build.

**Smaller things seen:** a contributor can `revertDraftToPublished`, which discards their own draft (it worked, and the draft was gone). It is draft scope only, but it is destructive: don't expose it. Contributors cannot delete. If the cap had failed, the fallback (a contributor-only account per person) is proven by the REST run above, but it loses the real person's name on the audit trail.

### Transport: works

A module with `routes: { post: { '/mcp': [handler] } }` mounts at `/mcp`. The SDK's `StreamableHTTPServerTransport` in stateless JSON mode (`sessionIdGenerator: undefined`, `enableJsonResponse: true`), one `McpServer` per request, `transport.handleRequest(req, res, req.body)` using Apostrophe's already-parsed body. The MCP Inspector CLI (`--cli <url>/mcp --transport http`) listed the tool and a `tools/call` round-tripped. A 2 MB body passed. `GET /mcp` can return 405 (no stream needed).

Things the stack did:
- **CSRF:** a cookieless POST to `/mcp` is **403 "CSRF exception"** until the module sets `options: { csrfExceptions: [ '/mcp' ] }`. Do that, and rely on the bearer token.
- **Mode:** `req.mode` was `published` by default. The tool layer must set `draft` itself.
- **Session:** `req.session` exists on `/mcp` calls, so Apostrophe is creating sessions. Worth keeping off this route.
- **Locale prefix:** `/es/mcp` was 403. Not needed; Claude uses `/mcp`.
- Run the Inspector as a separate process, never `spawnSync` in the same process as the server (it deadlocks).
- ⚠️ Not tested: behind the Cloudflare Tunnel, and the real OAuth 401 with `WWW-Authenticate`.

### Claude custom-connector OAuth

⚠️ **Claude-specific parts are UNVERIFIED.** Anthropic's connector page (`support.claude.com/en/articles/11175166-…`) and `platform.claude.com` are not on the Worker's fetch allowlist, so I could not read them. Below is what the MCP spec says; what Claude itself requires (fixed redirect URI, whether it needs DCR, token lifetimes it handles) still has to be read from Anthropic's page. See the STAMP lines in the answer.

From the MCP authorization spec, 2025-11-25 ([spec](https://modelcontextprotocol.io/specification/2025-11-25/basic/authorization), read to the Scope Challenge section; and the [tutorial](https://modelcontextprotocol.io/docs/2025-11-25/tutorials/security/authorization.md)):
- **Dynamic client registration:** optional in the spec (MAY). The client-registration order is: pre-registered, then Client ID Metadata Documents (if `client_id_metadata_document_supported`), then DCR (if `registration_endpoint`), then ask the user. So a fixed pre-registered client for Claude or DCR both fit; which one the Claude connector uses is **unverified**. Supporting DCR plus CIMD covers both, which matches ADR-0003 ("DCR if the connectors need it").
- **Redirect URIs:** must be validated exactly against what the client registered (or its metadata document). Claude's own callback URL is **unverified**; take it from Anthropic's page and allow-list it.
- **Metadata endpoints:** the MCP server MUST serve Protected Resource Metadata (RFC 9728), via the `resource_metadata` parameter of the `WWW-Authenticate` header on a 401, or at `/.well-known/oauth-protected-resource[/mcp]`, with `authorization_servers`. The authorization server MUST offer RFC 8414 (`/.well-known/oauth-authorization-server`) or OpenID discovery. Clients try the path-insertion forms first.
- **Resource indicator:** the client must send `resource` (RFC 8707) on both the authorize and token requests; the server must accept only tokens issued for it as audience. Tokens go in the `Authorization: Bearer` header on every request, never the query string. Invalid or expired token: 401. Missing scope: 403 with `insufficient_scope`.
- **PKCE:** the flow is OAuth 2.1 authorization code with PKCE (tutorial, step 5). The SDK's client refuses a server whose metadata lists `code_challenge_methods_supported` without `S256` (SDK `client/auth.js`, observed in the package). The spec's own PKCE paragraph sits past the part of the page the fetch tool returned: **not read**.
- **Token lifetimes:** the spec sets none; the tutorial example returns `expires_in: 3600` with a refresh token. What Claude handles (refresh behaviour, how it copes with expiry) is **unverified**. ADR-0003 already plans short-lived access tokens with refresh.
- The SDK ships a server-side auth router and provider interface (`server/auth`), a possible base for our OAuth server. Not tried.

### `_ai: true` and version records

- In-process, `req.aposAi = true` before the write (what REST's `_ai: true` sets). Observed: the version record for that draft has `ai: true`, `author` the real person's name, `mode`, `locale`. A write without it has `ai: false`.
- **Version records are not written per draft save.** After inserting and updating draft events as the capped user there were **no** records. They appeared when the admin published: one `draft` record (`author` Real Admin, `ai: true`, carried from the draft) and one `published` record (`ai: false`, because that admin's publish req had no AI flag). So the AI flag follows each write, and the published version's `ai` shows how the **publish** was done, not how the content was drafted. The editor-facing trail for "Claude helped" is the draft version plus our own audit log.
- `updatedBy` on the document is the real person, with or without `_ai`.
- ⚠️ Not observed: `_ai` through the REST body (only the in-process flag); two people editing one draft in a day.
