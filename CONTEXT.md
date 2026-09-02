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
Automatically discovering and distilling a user's authorized existing work into a populated,
registered governed vault during setup, without requiring a topic or source list.
_Avoid_: Topic bootstrap, initialization, bulk import

**Empty-vault cliff**:
The first-run failure state in which setup produces an empty governed vault with no useful knowledge
or clear starting point.
_Avoid_: Fresh vault, setup complete

**Source surface**:
An authorized, addressable part of a source system that can contribute evidence to a bootstrap, such
as a project, space, channel, or repository.
_Avoid_: Connector, data source

**Bootstrap scope**:
The automatically discovered person, work domains, source surfaces, and historical boundary
authorized through one bootstrap preview.
_Avoid_: Crawl scope, import scope

**Bootstrap approval**:
The single user-facing authorization to apply the previewed contract, bootstrap scope, populated
notes, registration, and active-project association.
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

**Handoff readiness**:
The state in which a populated, registered vault has enough navigation, source references, and
disclosed gaps for later skills to use it immediately.
_Avoid_: Migration complete, fully imported

**Governed evolution**:
The ordinary post-handoff workflow that retrieves and durably captures new knowledge under the vault
contract as the user works.
_Avoid_: Background sync, continuous ingestion

**Exception review**:
A human interruption reserved for an action that expands authority, crosses a propagation boundary,
or causes irreversible loss.
_Avoid_: Manual approval, review gate
