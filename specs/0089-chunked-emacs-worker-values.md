# 0089: Chunked Emacs Worker Value Streams

- Status: Accepted
- Implementation: Implemented
- Date: 2026-09-01
- Depends on: 0020 Emacs Worker Protocol and Measurement Probe,
  0022 Emacs Worker Integration,
  0088 Versioned Emacs Worker Persistent Value Codec

## Summary

The Emacs worker can incrementally transport values encoded by
`eliscript-value-v1` without constructing one complete JSON-ready value tree or
one unbounded protocol line. The additive `eliscript-value-chunks-v1` framing
uses bounded event batches, explicit request acknowledgements, asynchronous
output backpressure, cancellation checks, and shared traversal limits.

This protocol is an Emacs integration over the Eliscript value model. It does
not define language values, collection semantics, equality, hashing, or
standard-library behavior. UI libraries, application frameworks, bundlers,
development servers, and publishing systems are replaceable application-level
probes and provide no acceptance evidence for this specification.

## Negotiation

The worker ready message advertises `value-chunks-v1` in addition to the
`value-codec-v1` capability defined by 0088. A chunked request header selects
both identifiers and omits `arguments`:

```json
{"version":1,"type":"request","id":"7","module":"/tmp/work.mjs","export":"run","valueEncoding":"eliscript-value-v1","valueFraming":"eliscript-value-chunks-v1"}
```

The worker accepts the header, reserves the request id, starts its timeout, and
sends an initial `value-ack` for sequence `-1`. The Emacs client then sends one
`arguments` chunk at a time and waits for the matching acknowledgement before
sending the next chunk. The final acknowledgement is emitted only after the
complete argument value has been decoded and validated.

Requests that omit `valueFraming` retain the version 1 JSON or non-streaming
0088 behavior. Chunking therefore requires no protocol-version change and is
never silently selected for existing callers.

## Event Grammar

Each chunk contains a non-empty `events` array. Events form one prefix stream:

| Event | Meaning |
| --- | --- |
| `["value", value]` | null, Boolean, or finite Number |
| `["undefined"]` | JavaScript undefined |
| `["number", name]` | NaN, infinity, or negative zero |
| `["text", utf16Length]` | start a string with the declared UTF-16 length |
| `["text-part", value]` | append a bounded string part |
| `["open", tag, length]` | start a tagged composite value |

Composite tags are `keyword`, `symbol`, `list`, `vector`, `map`, `set`,
`array`, and `object`. The declared length is the logical member count. The
decoder derives the exact child count from the tag: Map and Object consume key
and value pairs; Symbol, List, Vector, Map, and Set also consume their metadata
slot. There is no closing event, so incomplete and excess streams are
unambiguous.

Text lengths and text-part bounds use UTF-16 code units on both hosts. An
encoder does not split a surrogate pair. The decoder rejects a text stream
whose parts do not equal the declared length.

## Protocol Messages

An argument chunk has this shape:

```json
{"version":1,"type":"value-chunk","id":"7","channel":"arguments","sequence":0,"final":false,"valueEncoding":"eliscript-value-v1","valueFraming":"eliscript-value-chunks-v1","events":[["open","array",2],["value",1]]}
```

The acknowledgement repeats the request id, sequence, encoding, framing, and
`arguments` channel. Exactly one argument chunk may be in flight. Wrong,
repeated, skipped, or post-final sequences are request errors.

Success results use `channel: "response"`. Progress values use
`channel: "progress"` plus a monotonically assigned `stream` id because
multiple progress values may be encoded concurrently with operation execution.
Each response or progress stream starts at sequence zero and marks exactly one
chunk as final. The final response chunk also carries the ordinary worker
timing object. A normal error remains one `response` message with `ok: false`;
partially decoded success or progress values are discarded.

The worker awaits stdout drain before producing the next output chunk. Request
input uses the explicit acknowledgement window. These are transport
backpressure contracts, not hints.

## Value Semantics and Ordering

The supported categories, metadata rules, duplicate rules, special numbers,
native-container distinction, and unsupported-value policy are inherited from
0088. The decoder constructs persistent Vector, Map, and Set values through
owner-token transients and constructs List values iteratively.

Streaming traversal preserves the concrete collection iteration order and
does not materialize complete encoded sort keys. Therefore the event byte
order for insertion-equivalent Map or Set values is not canonical. Decoded
Map and Set semantics remain independent of that order. Callers requiring
canonical bytes use the non-streaming 0088 codec or canonical data text; they
must not hash the chunk sequence as a canonical value representation.

## Limits and Failure Model

The JavaScript implementation defaults to:

| Limit | Default |
| --- | ---: |
| Maximum depth | 64 |
| Maximum value nodes | 8,000,000 |
| Maximum members in one collection | 4,000,000 |
| Maximum UTF-16 units in one string | 268,435,456 |
| Maximum UTF-16 units in one stream | 536,870,912 |
| Maximum encoded event batch | 256 KiB |
| Maximum events per batch | 512 |
| Maximum text part | 8,192 UTF-16 units |

The worker additionally rejects an oversized framed chunk line and limits one
incoming framed stream to 768 MiB. Limits apply to the complete logical value,
not independently to each chunk.

Malformed events, unsupported values, cycles, duplicate logical members,
invalid metadata, depth or size violations, and cancellation produce stable
`value-stream-*` errors with a logical value path where available. A cancel or
timeout can terminate request upload before module execution. Traversal checks
the AbortSignal between values and text parts, and output generation yields to
the event loop between chunks.

## Emacs API

`tools/worker/eliscript-value-stream.el` provides incremental encoders and
decoders. The encoder maintains an explicit task stack; callers pull one event
or one bounded chunk at a time. The decoder accepts events or chunks and
returns a value only after `finish` verifies a complete root.

The asynchronous, synchronous, portable, and portable synchronous worker
calls accept `:value-chunks t`. That option implies `:value-codec t`; callers
never construct raw chunk messages. Existing callbacks receive the same Emacs
records defined by 0088. Cancellation clears unsent encoder state and prevents
decoded partial values from reaching application callbacks.

## Acceptance Criteria

- **WVS-01:** Ready negotiation advertises chunk support without changing
  worker protocol version 1.
- **WVS-02:** Chunked request headers omit arguments and require both exact
  encoding and framing identifiers.
- **WVS-03:** One initial and one per-chunk acknowledgement enforce a single
  in-flight argument chunk.
- **WVS-04:** Event grammar round trips every 0088 persistent, identifier,
  metadata, scalar, Array, and Object category.
- **WVS-05:** Text parts preserve UTF-16 length and never split surrogate
  pairs.
- **WVS-06:** JavaScript and Emacs encoders produce bounded chunks without a
  complete intermediate wire tree.
- **WVS-07:** JavaScript and Emacs decoders reject malformed, duplicate,
  truncated, excess, and over-limit streams.
- **WVS-08:** Persistent collection decoding uses bounded incremental builders
  rather than repeated immutable reconstruction.
- **WVS-09:** Progress and response streams retain request identity, ordered
  sequence numbers, and exact encoding and framing identifiers.
- **WVS-10:** Worker stdout drain and request acknowledgements provide explicit
  output and input backpressure.
- **WVS-11:** Cancellation and timeout work during argument upload, traversal,
  execution, progress, and response encoding.
- **WVS-12:** Stream failures retain stable codes and logical paths and never
  deliver partial values to callbacks.
- **WVS-13:** Legacy JSON and non-streaming 0088 call paths remain unchanged.
- **WVS-14:** Bun unit tests, worker protocol tests, and real Emacs/Bun process
  tests exercise chunking, progress, results, errors, and cancellation.
- **WVS-15:** Public-surface, compatibility, specification, and conformance
  registries track the framing and executable evidence.
- **WVS-16:** Core implementation and acceptance evidence have no dependency
  on an application framework, UI library, bundler, or publishing adapter.

## Remaining P5 Gate

This specification implements the incremental protocol and bounded framing,
but it does not by itself close PD-08. P5 still requires a maintained 256 MiB
logical-dataset process probe with measured per-process peak memory and an
approved memory budget. That evidence must exercise the real Emacs/Bun
boundary and remain separate from application demonstrations.
