# Knowledge Loom

Knowledge Loom governs how agents turn user-owned knowledge into bounded, inspectable, and reusable
context. This glossary distinguishes the ways a vault enters that governed lifecycle and the
artifacts used to judge whether it is useful.

## Language

**Governance initialization**:
Establishing a vault contract and minimal navigation for a new, empty Markdown vault.
_Avoid_: Bootstrap, import

**In-place adoption**:
Applying a vault contract to an existing Markdown vault while preserving its historical content and
structure.
_Avoid_: Migration, reorganization

**Source-assisted bootstrap**:
Turning one user need and bounded authorized source context into a populated, immediately useful
governed vault.
_Avoid_: Initialization, adoption, bulk import

**Empty-vault cliff**:
The first-run failure state in which setup produces an empty governed vault with no useful knowledge
or clear starting point.
_Avoid_: Fresh vault, setup complete

**Bootstrap seed**:
The minimal clue a user provides to begin source discovery, such as a workstream name or one source
object. A seed starts discovery but does not authorize the discovered scope.
_Avoid_: Source inventory, bootstrap scope

**Candidate source envelope**:
The source objects, relationships, historical boundary, and coverage limits discovered from a
bootstrap seed and proposed to the user in the Bootstrap approval preview.
_Avoid_: User-provided source list, approved scope

**Source surface**:
An authorized, addressable part of a source system that can contribute evidence to a bootstrap, such
as a project, space, channel, or repository.
_Avoid_: Connector, data source

**Bootstrap scope**:
The person, work domain, source surfaces, and historical boundary authorized for one source-assisted
bootstrap.
_Avoid_: Crawl scope, import scope

**Fragment-rich workstream**:
A bounded work domain whose decisions, status, ownership, and implementation evidence are distributed
across source surfaces without one source object providing a reliable map of the whole.
_Avoid_: Large workstream, many-link workstream

**Bootstrap approval**:
The single user-facing authorization to apply a previewed bootstrap scope and optionally perform later
on-demand incremental capture within that unchanged scope.
_Avoid_: Import confirmation, per-note approval

**Authority chain**:
The combination of source authority, destination authority, and a propagation boundary that authorizes
one bootstrap action.
_Avoid_: Access permission, consent checklist

**Source authority**:
Evidence that the vault owner may use information from a selected source surface for the approved work
purpose.
_Avoid_: Connector access, OAuth scope

**Destination authority**:
Evidence that the selected vault storage and lifecycle may retain information under the source's
restrictions.
_Avoid_: Write access, filesystem permission

**Propagation boundary**:
The source-derived restrictions that govern where canonical knowledge may later be retrieved,
disclosed, synced, or backed up. Knowledge supported by multiple sources inherits the strictest boundary.
_Avoid_: Sensitivity tag, source scope

**Canonical knowledge**:
A durable, source-linked meaning distilled from one or more source surfaces and owned by one vault
note.
_Avoid_: Source copy, generated summary

**Source reference**:
The minimum durable provenance that lets a user navigate from canonical knowledge back to the
supporting source, including a stable provider identity or permalink and capture time.
_Avoid_: Evidence graph, source archive

**Coverage gap**:
A known missing, inaccessible, truncated, stale, or unresolved part of the approved bootstrap scope
that the handoff discloses instead of hiding.
_Avoid_: Import error, completeness score

**Natural knowledge need**:
A retrieval or judgment need that arises during the user's ordinary work rather than being authored
in advance as an evaluation question.
_Avoid_: Benchmark question, test prompt

**Evaluation oracle**:
Existing trusted knowledge used only after a bootstrap run to assess its coverage and correctness. It
must not be available as input during source discovery or distillation.
_Avoid_: Bootstrap source, canonical destination

**Handoff readiness**:
The state in which a populated vault has enough navigation, source references, and disclosed gaps for
the user to begin ordinary work immediately.
_Avoid_: Migration complete, fully imported

**Governed evolution**:
The ordinary post-handoff workflow that retrieves and durably captures new knowledge under the vault
contract as the user works.
_Avoid_: Background sync, continuous ingestion

**Exception review**:
A human interruption reserved for an action that expands authority, crosses a propagation boundary,
or causes irreversible loss.
_Avoid_: Manual approval, review gate
