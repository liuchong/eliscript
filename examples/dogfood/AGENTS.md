# dogfood Agent Rules

These rules apply to the `examples/dogfood/` application project.

## Project Boundary

- dogfood is application-level validation for Eliscript. It must consume public
  compiler, runtime, standard-library, interop, and platform APIs.
- dogfood must not add blog, React, Markdown, GitHub, bundler, hosting, or
  Marketplace behavior to the Eliscript language core.
- The directory is the canonical standalone project root. Every path and command
  must work both below `examples/dogfood/` and after the directory is exported
  as a repository root.

## Eliscript-Only Logic

- dogfood contains exactly two top-level executable programs: the renderer and
  the builder. Both programs are authored in Eliscript and compiled to
  JavaScript.
- The renderer accepts a normalized blog model and owns HTML and browser UI. It
  cannot fetch GitHub data or depend on the Actions environment.
- The builder runs in GitHub Actions, converts Markdown, Issues, Discussions,
  and comments into the normalized model, then invokes the renderer.
- All handwritten executable product, build, Action, adapter, rendering, state,
  and browser logic must use `.eli` source.
- JavaScript or source maps below `dist/` are generated artifacts. They must
  never be hand-edited and must carry reproducible source identity.
- YAML, JSON, Markdown, HTML, CSS, images, lockfiles, and Action metadata are
  host contracts or assets, not an exception for handwritten JavaScript logic.
- JavaScript packages may be consumed only through explicit Eliscript interop
  at the application boundary.

## Content And Identity

- Never deduplicate posts by title, display slug, body text, or update time.
- Cross-source identity requires an explicit canonical post id. Duplicate ids
  fail closed unless the configuration declares one source as a projection of
  another.
- Preserve source provenance and native comment topology. Discussion replies
  must not be silently flattened into Issue-style comments.
- Remote articles may be published only by the configured site owner or an
  explicitly listed coauthor. Repository association, labels, categories, and
  article metadata never grant publication authority.
- An Issue or Discussion used as a comment carrier must be classified before
  article selection and can never become an article through overlapping labels,
  categories, metadata, or author authority.

## Security

- Never emit `GITHUB_TOKEN`, API credentials, private source bodies, or
  authorization headers into generated site files, source maps, logs, caches,
  or build manifests.
- Browser GitHub access is allowed only for public data without embedded
  credentials. Private data may be fetched only at build time.
- Treat Issue, Discussion, Markdown, and comment bodies as untrusted input.
  Rendering must sanitize HTML and URLs before output.
- Do not use `pull_request_target` to build untrusted content.

## Action Budget

- Comment events must not trigger site builds by default.
- A sleep inside an Actions job is not debounce and must not be presented as
  quota protection.
- Static comment snapshots use scheduled or manual reconciliation, content
  fingerprints, no-change skips, and one deployment concurrency group.
- Event-driven comment builds are opt-in, visibly budgeted, and never the
  default template.

## Delivery

- Design documents define behavior; tests and generated artifacts provide
  implementation evidence. Do not mark a gate complete from prose alone.
- Every implementation gate must add observable behavior, focused local tests,
  and a clean standalone-package check.
- Do not publish, tag, change a version, or enable Pages without an explicit
  user request.
