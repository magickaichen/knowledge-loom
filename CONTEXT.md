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
Constructing an immediately usable governed vault from a bounded set of authorized source systems.
_Avoid_: Initialization, adoption, bulk import

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

**Source object**:
The provider- and tenant-scoped stable identity of one source artifact. Mutable keys, names, paths,
and URLs are aliases rather than identity.
_Avoid_: Source URL, source copy

**Source observation**:
Immutable evidence captured for one observed revision or state of a source object, including revision
evidence, provenance, observation time, and content hash without retaining the complete provider payload.
_Avoid_: Latest snapshot, canonical knowledge

**Source relation**:
A typed, directed connection between source objects whose basis is recorded as provider-confirmed or
inferred. An inferred relation connects evidence without merging source identities.
_Avoid_: Source merge, semantic identity

**Evidence ledger**:
The durable inventory of fetched source observations, their dispositions, and their source relations.
It retains compact evidence metadata while complete provider payloads remain transient.
_Avoid_: Source archive, citation list

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

**Authority evidence**:
The vault owner's bootstrap approval combined with verified source permissions, provider restrictions,
and the destination vault's declared storage and lifecycle.
_Avoid_: OAuth grant, compliance questionnaire

**Authority revocation**:
The loss of source or destination authority after canonical knowledge has been created; it stops the
affected action and preserves or isolates existing knowledge according to which authority was lost.
_Avoid_: Token expiry, automatic deletion

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

**Canonical assertion**:
The smallest independently meaningful fact, decision, status, responsibility, or rationale within
canonical knowledge. Its provenance links to specific source observations.
_Avoid_: Sentence citation, note summary

**Assertion basis**:
How a canonical assertion was formed: source-stated, synthesized from cited premises, inferred with
rationale and confidence, or human-confirmed.
_Avoid_: Confidence score, citation count

**Evidence support**:
The lifecycle-aware provenance link from a canonical assertion to a source observation. Its state
shows whether that observation currently supports, supersedes, contradicts, or can no longer verify the assertion.
_Avoid_: Citation URL, source list

**Coverage gap**:
A structured record of material within the bootstrap scope that is missing, conflicting, stale,
inaccessible, truncated, unsupported, or unresolved, including its impact and recovery state.
_Avoid_: Import error, warning text

**Retrieval coverage**:
The inspectable result of enumerating each authorized source surface, object class, and history boundary
under the provider's declared endpoint semantics.
_Avoid_: Account completeness, search result count

**Synthesis coverage**:
The disposition of every fetched source observation as cited, contextual, duplicate, out of scope,
unresolved, or failed.
_Avoid_: Retrieval coverage, note count

**Natural knowledge need**:
A retrieval or judgment need that arises during the user's ordinary work rather than being authored
in advance as an evaluation question.
_Avoid_: Benchmark question, test prompt

**Evaluation oracle**:
Existing trusted knowledge used only after a bootstrap run to assess its coverage and correctness. It
must not be available as input during source discovery or distillation.
_Avoid_: Bootstrap source, canonical destination

**Handoff readiness**:
The state in which a bootstrapped vault has declared coverage, provenance, navigation, privacy, and
governance validation, so the user can begin relying on it in ordinary work.
_Avoid_: Migration complete, fully imported

**Exception review**:
A human interruption reserved for an action that expands authority, crosses a propagation boundary,
or causes irreversible loss.
_Avoid_: Manual approval, review gate
