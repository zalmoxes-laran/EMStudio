# ADR-003 — Offline versioning vs real-time convergence

Status: **accepted** (E. Demetrescu, August 2026).
Scope: EMStudio, s3Dgraphy, StratiGraph Server, EM-blender-tools — every place where
the *same* study is edited by more than one hand, whether at the same moment
or months apart. Builds on ADR-002 (who is the host, what travels on the
wire); this ADR is about **which edit wins, and what a version means** once
several of them exist.

## Problem

ADR-002 gave the ecosystem one wire and one host role. It left two things
open, and P3/P4 have now had to answer both in code:

1. **Offline.** Two people take the same project away, edit it, and come
   back. The first implementation resolved this with "the incoming one
   wins" — which means the result depended on the *order* the files were
   merged in, and nobody could say which was the right order.
2. **Real-time.** Several clients edit through a relay, some of them
   reconnecting after a gap. Without a stated rule, "what the room holds"
   is whatever the last message happened to be.

These are usually treated as two problems with two mechanisms (a VCS for
one, a CRDT for the other). Treating them as two would give the ecosystem
two answers to the same question — *is this edit newer than that one?* —
and the answers would differ, silently, on exactly the cases that matter.

## Decision

### 1. One arbitration: dated convergence, at FIELD level

There is a single function that decides between two versions of a node, and
both paths go through it: the offline container merge (`resolveNodePair`,
P3) and the real-time operation apply (`applyRemoteOp` / `api.apply_op`,
P4.1). The rule is:

* every write **stamps** the field it wrote — the writing IS the stamping
  (P4.1b, `set_field` / `store.setField`), not a separate act somebody can
  forget;
* between two versions of a field, the **more recent stamp wins**; ties are
  broken by author id, deterministically, so the outcome does not depend on
  which side is "incoming";
* an **emptied** field carries a tombstone (`{ts, by, removed: true}`), so
  "she emptied it" is distinguishable from "I have something she never had".
  Absence is not deletion; only a tombstone is;
* what LOSES is a field, never a node: a remote edit to one field and a
  local edit to another both survive, and the loss is reported (`conflicts`,
  with the loser's value) rather than swallowed.

The consequence worth stating: **the merge is commutative**. Merging A into
B gives the same document as merging B into A. That is what makes an offline
round trip reproducible, and it is the same property that lets the relay be
a *relay* — passing operations on without ordering them — instead of an
operational-transform server.

### 2. Real-time is offline, faster

A room (StratiGraph Server, P4.2) holds the state of record and applies every
operation through the same library. It does not transform, order or
reconcile: if this ever changes, the rule has moved to the wrong
repository. A client that has been away is not a special case of anything —
it sends its unsent operations, they are merged by date, and they converge.

### 3. A client whose base is older than the compaction point RE-SYNCS

A room compacts its history (garbage-collects settled operations) up to a
watermark, which is the **minimum** over the members currently connected —
so a member that is present can never fall behind it. A member that was
AWAY can.

If a client's base is older than the announced `gc_watermark`, it must not
replay its history: what it would re-assert has already been settled and
forgotten, so replaying could resurrect it. Instead it:

1. takes the room's document as its state of record;
2. **re-applies its own unconfirmed work on top**, re-stamped now — values
   *and* emptyings (the tombstone travels; a re-send that carried only the
   values would let an emptied field come back full);
3. re-sends the same operations, so the room converges to the same thing.

The order of (1) and (2) is part of the decision, not an implementation
detail: the snapshot a room sends was built *before* it received the
re-sent operations, so a client that re-sent without re-applying would show
its user the room's older document — with the field they emptied looking
full — until something else arrived. The room would be right and the screen
would be wrong, which is the failure people actually notice.

### 4. A project version is an IMPRINT, not a counter

`bump_version` derives the version from the **content digest** of the
graphs (sorted-key canonical JSON, no layout): re-saving a project that
nothing changed does not bump it, and two people who made the same edits
independently arrive at the same imprint. A version can be **pinned** for
citation, and a pinned version records `prov:wasRevisionOf` — so the chain
is readable without a server.

## The open question, named on purpose

The rule above says "the more recent stamp wins", and the stamp is a
**wall clock** — the machine's, at the moment of the write. Two laptops
whose clocks disagree will therefore disagree about which edit is newer,
and a laptop set to yesterday can lose work it should have won.

The alternative — ordering by *causality* (a vector/Lamport clock: "this
edit was made knowing about that one") — is immune to clock skew, but it
cannot answer "which of these two is the more recent statement about the
world?" for two edits that never saw each other, which is exactly the
offline case an archaeological project lives in. It also makes the stamp
unreadable to a human and to RDF: `prov:generatedAtTime` wants an instant.

**This is a conscious choice, to be confirmed in WP6** (it is the point
raised in D2.1 §4.6). What has been done to bound the risk:

* the tie-break is deterministic (author id), so a skewed clock produces a
  *wrong* winner, never an unstable one;
* every stamp records **who** as well as **when**, so a suspicious
  resolution can be read and reversed by a person;
* losers are not discarded silently — `conflicts` carries the loser's value,
  which is what makes a bad clock recoverable rather than fatal;
* the room stamps with the **token's identity and the server's clock** for
  operations it applies, so the multi-user path has one clock, not N.

What WP6 has to decide is whether that is enough for the institutional
deployment, or whether the offline path should additionally carry a
causality vector alongside the instant (they are not exclusive: the instant
stays for reading and for RDF; the vector, if adopted, decides the compare).
Nothing in the current implementation forecloses that — `compare_clocks`
is one function, in one place, in both languages.

## Consequences

* Two tools, two languages, **one arbitration** — parity between
  `crdt.py` and `crdt.ts` is pinned by shared fixtures and a shared digest.
* An offline merge is reproducible and order-independent; a real-time
  session converges without a central sequencer.
* "Version" means content, not ceremony: no bump for a no-op save.
* The clock question is **open and named**, not hidden behind the code that
  happens to implement it.

## References

* ADR-002 — live sync & source of truth (host role, wire).
* P3 (dated merge, conflicts, project versioning); P4.1 / P4.1b (CRDT
  algebra, field stamping and field tombstones); P4.2 (relay, compaction
  watermark); P4.3 (room client, rebase); STEP 4 of the 2026-08-14 runner
  (re-sync carries the emptyings).
* D2.1 §4.6 — the versioning question this ADR answers in part and defers
  in part.
