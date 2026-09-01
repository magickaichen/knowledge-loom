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

**Source surface**:
An authorized, addressable part of a source system that can contribute evidence to a bootstrap, such
as a project, space, channel, or repository.
_Avoid_: Connector, data source

**Bootstrap scope**:
The person, work domain, source surfaces, and historical boundary authorized for one source-assisted
bootstrap.
_Avoid_: Crawl scope, import scope

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
disclosed, synced, or backed up.
_Avoid_: Sensitivity tag, source scope

**Canonical knowledge**:
A durable, source-linked meaning distilled from one or more source surfaces and owned by one vault
note.
_Avoid_: Source copy, generated summary

**Coverage gap**:
Knowledge required by the bootstrap scope that is missing, conflicting, stale, inaccessible, or not
yet distilled.
_Avoid_: Import error

**Natural knowledge need**:
A retrieval or judgment need that arises during the user's ordinary work rather than being authored
in advance as an evaluation question.
_Avoid_: Benchmark question, test prompt

**Handoff readiness**:
The state in which a bootstrapped vault has declared coverage, provenance, navigation, privacy, and
governance validation, so the user can begin relying on it in ordinary work.
_Avoid_: Migration complete, fully imported
