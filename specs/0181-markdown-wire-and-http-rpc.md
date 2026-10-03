# 0181: Markdown Wire Data and Self-describing HTTP RPC

- Status: Accepted
- Implementation: Implemented
- Depends on: 0003 Implemented Core Language, 0123 Stable ECMAScript Module Import Contract

## Observable behavior

The standard library exposes `stdlib/mdp.eli`, `stdlib/mds.eli`, and
`stdlib/gepo.eli` through host-neutral ESM runtime modules in `runtime/wire/`.
The data boundary uses native JSON objects and arrays. It accepts finite IEEE
754 numbers; integer precision is limited to JavaScript's safe integer range.

MDP parsing implements structural headings, key/value containers, pipe tables,
element arrays, typed scalars, and comment exclusion. Structural errors carry
an `MDP-E001` through `MDP-E007` or `MDP-E009` code and a one-based source line.
Duplicate keys are rejected and arbitrary keys cannot modify object prototypes.
Encoding preserves JSON values through parse/encode round trips, uses tables for
flat arrays, and element markers for nested, heterogeneous or single-key rows.
Unrepresentable keys, unsupported values, cycles and non-finite numbers fail.
Parsing and encoding accept `maxLength` (default 16 Mi UTF-16 units) and
`maxDepth` (default 256, hard maximum 512).

MDS/0.1 validation accepts parsed objects or Markdown text and returns
`{valid, errors}`. Each error contains `path`, `rule`, `expected`, and `actual`.
Required sections and fields, nested dotted paths, section kinds, row limits,
additional scalar fields, types, enum, numeric bounds, Unicode code point length,
calendar dates, date-times, and ECMAScript Unicode patterns are checked.
Unknown columns and undeclared sections are allowed. Invalid schema declarations
throw before validating data. Patterns are caller-controlled executable regular
expressions and should come from trusted schemas.

## HTTP behavior

The RPC module implements GEPO 0.2 with Fetch `Request` and `Response` values.
`gepo-service` returns a request handler; the host supplies its HTTP listener.
Operation definitions supply `path`, `execute`, and optional title, summary,
contentType, request, success, failures, effect and retry descriptions.
The `execute` callback returns a `Response` and runs only for authorized POST.
GET without the discovery parameter describes the same operation path.
Query discovery, `/.gepo` and `/.well-known/gepo` provide indexes. All ancestor
directories exist, and every index identifies its path, parent, kind, operation
usage and complete immediate children. GET never calls `execute`.
`visible(request, operation)` filters discovery by identity;
`authorize(request, operation-or-null, mode)` independently gates every request.
The default authorizer is public access; applications supply their own policy.
HEAD omits the body, OPTIONS declares allowed methods, and other unsupported
methods return 405. Descriptions use private, no-store cache policy.

`gepo-client` returns async `discover`, `index`, `usage`, and `invoke` methods.
Discovery removes unrelated query parameters and tries canonical query, explicit
and well-known entries; a known path is queried first. It reports `found`,
`empty` or `not-found` with attempts. The default classifier recognizes textual
Markdown/plain-text indexes; a `classify(response)` callback supports other
representations. A successful status alone never establishes discovery.
Usage removes only the reserved discovery parameter. Invocation requires an
explicit body and `{allowPost: true}`, obtains successful current usage first,
and issues exactly one POST. No automatic POST retry occurs.
URL credentials and redirects are rejected. The client accepts custom fetch,
headers, response byte limits (default 2 MiB), timeout (default 30 seconds), and
per-request headers, signal and contentType.

## Acceptance scenarios

- Given nested JSON values and comment-bearing Markdown, parse/encode preserves
  values and rejects structural violations with a code and line.
- Given an MDS schema, validation reports all applicable field and section
  constraints while permitting undeclared sections.
- Given a nested operation, safe discovery reaches every ancestor and same-path
  usage without executing it; explicit POST invokes it once.
- Given denied authorization, redirects, oversized bodies or a lost POST
  response, the client and server retain those boundaries.
- Given either compiler, the language modules emit identical JavaScript and
  Source Maps and execute real local HTTP requests under both Bun and Node.

Evidence: `tests/markdown-wire.test.mjs`, `tests/http-rpc.test.mjs`, and
`tests/wire-compiler.test.mjs`. These local checks establish library behavior;
proxy behavior and deployment-specific authorization require host validation.
