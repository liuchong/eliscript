# 0092: Persistent Set Source Syntax

- Status: Accepted
- Implementation: Implemented
- Date: 2026-09-01
- Depends on: 0050 Persistent Hash Set Prototype,
  0056 Eliscript-authored Persistent Map-backed Set,
  0082 Persistent Literal Runtime ABI and Explicit Host Containers,
  0087 First-class Quoted Persistent Data,
  0088 Versioned Emacs Worker Persistent Value Codec

## Summary

Eliscript now treats `#{value...}` as the canonical executable source syntax
for a persistent Set. The reader desugars it to `(hash-set value...)`, the
compiler lowers it to a dedicated `persistent-set-literal` IR node, and the
literal runtime ABI constructs the canonical map-backed persistent hash Set.

This completes the missing Set member of the persistent literal family. It
does not introduce another Set representation and does not make native
JavaScript `Set` the default language value.

## Source Syntax

A Set literal starts with `#{`, ends with `}`, and contains zero or more
ordinary Eliscript expressions:

```elisp
#{}
#{:ready 1 "text"}
#{[1 2] {:nested t} #{:inner}}
```

The canonical reader-shaped form is:

```elisp
(hash-set value...)
```

`(hash-set ...)` is also a supported explicit constructor. Reader trees,
macro expansion output, and IR compatibility round trips use this constructor
form as their canonical spelling.

The dispatch brace belongs to the reader grammar. `#'` retains function-quote
behavior, while every other unsupported `#` dispatch continues to fail with
the existing located invalid-read-syntax diagnostic.

## Location and Diagnostic Semantics

The complete Set form spans from `#` through the closing `}`. The synthetic
`hash-set` operator spans the two-character `#{` dispatch. Every member keeps
its own recursive source span.

An unclosed Set reports unexpected end of input at its opening dispatch.
Standalone or mismatched closing delimiters retain the common reader
diagnostic contract. Strings and comments containing `#{` or `}` are never
rewritten as Set syntax.

The Emacs seed reader uses a length-preserving host-readable copy: `#{` becomes
a parenthesized opening plus one whitespace character, and the closing brace
becomes a closing parenthesis. The source buffer remains authoritative for
scanning and locations. The self-hosted reader implements the dispatch
directly. Both paths therefore produce the same located syntax tree without
making host-reader behavior part of the language contract.

## Evaluation and Value Semantics

Every member expression is evaluated exactly once, strictly from left to
right. Construction then associates each result into the canonical persistent
hash Set.

Value-equal duplicates collapse to one member, but duplicate expressions are
not skipped and their side effects remain observable in source order. Set
membership uses the shared `IEquiv` and `IHash` contract, so separately
constructed value-equal persistent List, Vector, Map, Set, Keyword, and Symbol
values behave consistently with Map keys.

The empty literal returns the canonical empty persistent Set. Nested Sets,
Maps, and Vectors remain their canonical persistent runtime values.

## Compiler and Runtime ABI

The complete compilation path is:

```text
#{value...}
  -> (hash-set value...)
  -> persistent-set-literal IR
  -> __eliscript_hash_set(...)
  -> runtime/literals.mjs hashSet(...)
  -> persistentHashSet(...)
```

`runtime/literals.mjs` exports `hashSet(...values)` beside the existing List,
Vector, Map, Keyword, and Symbol constructors. The function delegates directly
to `runtime/core/set.mjs`; it has no collection algorithm or representation of
its own.

Literal runtime discovery imports the ABI once when evaluated Set syntax is
present. Modules containing only native host containers or scalars do not gain
that dependency.

## Quote, Macros, and Portable Execution

Quoted Set syntax is constructor syntax data, matching quoted brace Map
behavior:

```elisp
'#{:ready [1]}
```

produces a persistent List equivalent to `(hash-set :ready [1])`; it does not
evaluate a Set. This preserves the rule that reader-generated constructor
forms remain inspectable syntax under quote.

Macros may consume or produce canonical `(hash-set ...)` syntax. Portable
closures may construct either spelling, and the existing versioned worker
value codec transports the resulting persistent Set without a new wire tag.

## Compatibility Boundary

This is an additive provisional source contract. `#{` was previously an
invalid dispatch, so no valid expression changes meaning. `#'` and unknown
dispatch diagnostics remain unchanged. Native JavaScript Sets remain explicit
host values and are not granted source literal syntax by this specification.

The feature remains provisional until the complete persistent literal and
host-container family passes the P3 compatibility freeze.

## Architecture Boundary

This is a core language, compiler, runtime, and value-semantics feature. Its
implementation and maturity evidence must not depend on React, Vite, another
UI framework, a bundler, a development server, a publishing system, or a site
generator. Such tools may consume generated modules only as application-level
utility validation; they cannot define, alter, or certify Set semantics.

## P3 Completion

Specifications 0093 and 0094 now close static transient ownership analysis and
legacy List-operation migration. Specification 0095 removes the provisional
host aliases and promotes the complete literal/host-container contract to
stable.

## Acceptance Criteria

- **SSL-01:** Empty, nested, heterogeneous, and duplicate-bearing Set literals
  read as canonical `hash-set` constructor syntax.
- **SSL-02:** Strings and comments containing dispatch braces are unchanged;
  unclosed, mismatched, and unknown dispatch syntax has matching located seed
  and self-hosted diagnostics.
- **SSL-03:** The complete form, `#{` operator, and every member retain exact
  recursive source spans.
- **SSL-04:** `#{...}` and `(hash-set ...)` lower to the dedicated
  `persistent-set-literal` IR node and link exactly one literal runtime import.
- **SSL-05:** Every member expression evaluates once from left to right even
  when value-equal results collapse to one Set member.
- **SSL-06:** Nested persistent values and separately reconstructed
  value-equal members use canonical equality and hashing under Bun and Node.
- **SSL-07:** Quote preserves `(hash-set ...)` as persistent syntax data rather
  than evaluating a Set.
- **SSL-08:** Portable closures accept Set syntax and the worker value codec
  round trips the resulting persistent Set.
- **SSL-09:** Seed and self-hosted reader trees, IR, ESM, Source Maps, and
  diagnostics remain equal, and the compiler fixed point remains reproducible.
- **SSL-10:** Public-surface, compatibility, specification, and conformance
  registries describe the new syntax, IR, and runtime ABI consistently.
- **SSL-11:** No application framework, Vite integration, bundler, publishing
  adapter, or site generator is used as core implementation or acceptance
  evidence.
