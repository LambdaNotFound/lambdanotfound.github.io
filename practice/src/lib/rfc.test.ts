import { describe, expect, it } from "vitest";
import { absoluteLinks, firstSentence, inline, parseBlocks, parseRfc, parseTables, slugOf, splitFlip } from "./rfc";

// A small RFC in the shape system-design's rfc-spec.md fixes, wrapped the
// way its exemplar wraps lines.
const RFC = `# RFC: Paste Bin

**Status:** Draft · **Author:** @someone

| Name | Sign-off | Comments |
| --- | --- | --- |
| @TBD | - [ ] approved | |

## Background

People share logs.

## Terminologies

| Term | Meaning |
| --- | --- |
| **Paste** | One stored text, with a \\| in it. |

## Problem Statement

Anyone must store a text and read it back, at 1 million pastes a day. Reads
dwarf writes (NFR2).

The forcing question is how to serve reads without touching the write path.

## Requirements

### Functional Requirements

| ID | Requirement |
| --- | --- |
| FR1 | A create call stores a text. |
| FR2 | A read call returns it (FR1). |

### Non-functional Requirements

| ID | Requirement |
| --- | --- |
| NFR1 | **Write load.** 1 million creates a day. |
| NFR2 | **Read latency.** At most 50 ms at p99. |

### Out of Scope

- Accounts (FR1).

## Estimates

- **Request rates.** 12 creates a second, and
  1,200 reads (NFR1).
- **Storage.** 1 TB a year.

## Proposed Solution

### Overview

One service over one store. See [the note](../../concepts/caching.md#why) and [below](#api).

\`\`\`mermaid
flowchart LR
  a --> b
\`\`\`

### API

\`\`\`proto
service Pastes { rpc Create(CreateRequest) returns (CreateResponse); }
\`\`\`

- Nothing lists.

### Data model and storage

Reads look up by id.

\`\`\`sql
CREATE TABLE pastes (
  id    STRING(8) NOT NULL PRIMARY KEY,  -- random
  hash  BYTES     NOT NULL,              -- SHA-256 of the text
  body  STRING    NOT NULL,
  UNIQUE INDEX pastes_hash_key (hash)
);
\`\`\`

**Pros:** one table. **Cons:** a big index.

### Read Path

A read checks a cache first.

\`\`\`mermaid
sequenceDiagram
  C->>N: Read(id)
\`\`\`

### Id Generator

Ids are random. More detail here.

### Example

Node A stores "hi".

## Alternatives Considered

### Store

**Chosen:** one SQL table with a unique hash index, capitalized on the page.

- **Key-value store.** Pro: fast reads. Con: no unique secondary index
  (FR1); it flips if pastes become write-once blobs.
- **Object store.** Pro: cheap. Con: slow reads (NFR2). The closest call,
  it flips if reads drop.

### Ids

- **Counter.** Pro: never collides. Con: ids are guessable.

## Failure Modes and Observability

Two failure modes follow.

- **The store is slow.** Reads time out (NFR2).
- **A node dies.** Its cache goes.

Metrics that track them:

- Read latency against NFR2.

## Work Breakdown

| # | Task | Description | Depends on |
| --- | --- | --- | --- |
| 1 | Store | The table. | none |
`;

describe("parseRfc", () => {
  const d = parseRfc(RFC, "paste-bin", "abc123");

  it("reads the header and the forcing question", () => {
    expect(d.title).toBe("Paste Bin");
    expect(d.status).toBe("Draft");
    expect(d.url).toBe("https://github.com/LambdaNotFound/system-design/blob/abc123/design-doc/paste-bin/rfc.md");
    expect(d.forcing).toBe("How to serve reads without touching the write path.");
    expect(d.summary).toBe("Anyone must store a text and read it back, at 1 million pastes a day.");
    expect(d.problem).toEqual([{ kind: "p", text: "Anyone must store a text and read it back, at 1 million pastes a day. Reads dwarf writes (NFR2)." }]);
  });

  it("reads both requirement tables, with each non-functional label", () => {
    expect(d.functional).toEqual([
      { id: "FR1", label: "", text: "A create call stores a text." },
      { id: "FR2", label: "", text: "A read call returns it (FR1)." },
    ]);
    expect(d.nonFunctional).toEqual([
      { id: "NFR1", label: "Write load", text: "1 million creates a day." },
      { id: "NFR2", label: "Read latency", text: "At most 50 ms at p99." },
    ]);
    expect(d.outOfScope).toEqual([{ kind: "list", ordered: false, items: ["Accounts (FR1)."] }]);
  });

  it("joins wrapped bullets and keeps escaped pipes in a cell", () => {
    expect(d.estimates).toEqual([
      {
        kind: "list",
        ordered: false,
        items: ["**Request rates.** 12 creates a second, and 1,200 reads (NFR1).", "**Storage.** 1 TB a year."],
      },
    ]);
    expect(d.terms).toEqual([{ kind: "table", head: ["Term", "Meaning"], rows: [["**Paste**", "One stored text, with a | in it."]] }]);
  });

  it("sends each solution subsection to its step", () => {
    expect(d.overview?.title).toBe("Overview");
    expect(d.api?.title).toBe("API");
    expect(d.entities?.title).toBe("Data model and storage");
    expect(d.flows.map((s) => s.title)).toEqual(["Read Path"]);
    expect(d.components.map((s) => s.title)).toEqual(["Id Generator"]);
    expect(d.example?.blocks).toEqual([{ kind: "p", text: 'Node A stores "hi".' }]);
    expect(d.entities?.blocks.at(-1)).toEqual({ kind: "pc", pro: "one table.", con: "a big index." });
  });

  it("turns the schema sketch into a table with its keys", () => {
    expect(d.tables).toEqual([
      {
        name: "pastes",
        columns: [
          { name: "id", type: "STRING(8)", key: "PK", note: "random" },
          { name: "hash", type: "BYTES", key: "UNIQUE", note: "SHA-256 of the text" },
          { name: "body", type: "STRING", key: "", note: "" },
        ],
      },
    ]);
  });

  it("points relative links at GitHub, at the built commit", () => {
    const p = d.overview?.blocks[0];
    expect(p).toEqual({
      kind: "p",
      text:
        "One service over one store. See [the note](https://github.com/LambdaNotFound/system-design/blob/abc123/concepts/caching.md#why)" +
        " and [below](https://github.com/LambdaNotFound/system-design/blob/abc123/design-doc/paste-bin/rfc.md#api).",
    });
  });

  it("reads each decision: the chosen line, the rejected options, and when one would flip", () => {
    expect(d.decisions).toEqual([
      {
        title: "Store",
        chosen: "One SQL table with a unique hash index, capitalized on the page.",
        alternatives: [
          {
            name: "Key-value store",
            pro: "fast reads.",
            con: "no unique secondary index (FR1).",
            flip: "It flips if pastes become write-once blobs.",
          },
          { name: "Object store", pro: "cheap.", con: "slow reads (NFR2).", flip: "The closest call, it flips if reads drop." },
        ],
        notes: [],
      },
      { title: "Ids", chosen: "", alternatives: [{ name: "Counter", pro: "never collides.", con: "ids are guessable.", flip: "" }], notes: [] },
    ]);
  });

  it("reads the failure modes and keeps the metrics as notes", () => {
    expect(d.failureModes).toEqual([
      { name: "The store is slow", text: "Reads time out (NFR2)." },
      { name: "A node dies", text: "Its cache goes." },
    ]);
    expect(d.failureNotes).toEqual([
      { kind: "p", text: "Two failure modes follow." },
      { kind: "p", text: "Metrics that track them:" },
      { kind: "list", ordered: false, items: ["Read latency against NFR2."] },
    ]);
  });

  it("survives an RFC with sections missing", () => {
    const bare = parseRfc("# RFC: Bare\n\n## Background\n\nNothing yet.\n", "bare");
    expect(bare.title).toBe("Bare");
    expect(bare.forcing).toBe("");
    expect(bare.functional).toEqual([]);
    expect(bare.decisions).toEqual([]);
    expect(bare.overview).toBe(null);
  });
});

describe("parseBlocks", () => {
  it("keeps code fences whole, even with headings and pipes inside", () => {
    expect(parseBlocks(["```text", "| not a table", "## not a heading", "```"])).toEqual([
      { kind: "code", lang: "text", text: "| not a table\n## not a heading" },
    ]);
  });

  it("reads ordered lists", () => {
    expect(parseBlocks(["1. **Cache.** First.", "2. **Read.** Then."])).toEqual([
      { kind: "list", ordered: true, items: ["**Cache.** First.", "**Read.** Then."] },
    ]);
  });
});

describe("splitFlip", () => {
  it("leaves a con with no flip alone", () => {
    expect(splitFlip("it costs two.")).toEqual({ con: "it costs two.", flip: "" });
  });

  it("does not empty a con that is all flip", () => {
    expect(splitFlip("it flips if h is low.")).toEqual({ con: "it flips if h is low.", flip: "" });
  });
});

describe("absoluteLinks", () => {
  it("leaves full URLs alone", () => {
    expect(absoluteLinks("[x](https://example.com/a)", "design-doc/a", "main", "u")).toBe("[x](https://example.com/a)");
  });
});

describe("parseTables", () => {
  it("reads a primary key declared on its own line", () => {
    const [t] = parseTables("CREATE TABLE t (\n  a INT NOT NULL,\n  b TEXT,\n  PRIMARY KEY (a)\n);");
    expect(t.columns.map((c) => [c.name, c.key])).toEqual([
      ["a", "PK"],
      ["b", ""],
    ]);
  });
});

describe("inline", () => {
  it("splits bold, code, links, italics and requirement ids", () => {
    expect(inline("**Pro:** a `b` [c](d) *e* FR1 and NFR12's", (id) => id !== "FR1")).toEqual([
      { t: "b", v: [{ t: "text", v: "Pro:" }] },
      { t: "text", v: " a " },
      { t: "code", v: "b" },
      { t: "text", v: " " },
      { t: "link", v: "c", href: "d" },
      { t: "text", v: " " },
      { t: "i", v: [{ t: "text", v: "e" }] },
      { t: "text", v: " " },
      { t: "text", v: "FR1" },
      { t: "text", v: " and " },
      { t: "req", v: "NFR12" },
      { t: "text", v: "'s" },
    ]);
  });

  it("leaves a lone asterisk alone", () => {
    expect(inline("5 * 3")).toEqual([{ t: "text", v: "5 * 3" }]);
  });
});

describe("firstSentence and slugOf", () => {
  it("splits at the first sentence end", () => {
    expect(firstSentence("Ids are random. More detail here.")).toEqual({ head: "Ids are random.", tail: "More detail here." });
    expect(firstSentence("One sentence only.")).toEqual({ head: "One sentence only.", tail: "" });
  });

  it("finds the slug in a glob path", () => {
    expect(slugOf("../../designs-src/design-doc/url-shortener/rfc.md")).toBe("url-shortener");
  });
});
