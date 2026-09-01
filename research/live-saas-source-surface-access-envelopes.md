# Live SaaS source-surface access envelopes

Updated: 2026-08-31

Wayfinder research ticket: [#27](https://github.com/magickaichen/knowledge-loom/issues/27)

Parent map: [#26](https://github.com/magickaichen/knowledge-loom/issues/26)

## Scope and method

This report asks what an explicitly authorized, bounded bootstrap can retrieve from Jira Cloud,
Confluence Cloud, Slack, and GitHub, and what the product may safely claim about that retrieval.
It covers authorization, addressable surfaces, search and history, pagination, retention and rate
limits, identity and provenance, edits and deletion, relationships, and incremental-change signals.

Every provider statement below is based only on first-party documentation, API specifications, or
official source code. Each provider section separates **Official facts** from **Design inference**.
The provider-neutral envelope and pilot constraints are design conclusions derived from those facts;
they are not provider guarantees.

This is a documentation study. It did not use a live customer tenant, inspect private data, or test
tenant-specific plans, permissions, retention settings, or installed-app policies. Those values need
preflight inspection in a real pilot.

## Conclusion

A useful bootstrap is feasible, but no provider offers a single search or event surface that proves
historical completeness. The reliable baseline is to enumerate explicitly selected containers, page
through their first-class objects, fetch current representations and available revisions, and emit a
coverage manifest that records everything the run could not observe.

The provider-neutral layer should standardize provenance, identity, bounded enumeration, checkpoints,
relationships, and evidence of incomplete coverage. It should not pretend that search semantics,
retention, deletion visibility, or event delivery are uniform. Search is a discovery accelerator;
events are incremental hints; the provider's current object endpoint remains the source to re-fetch.

Slack is the strongest pilot constraint. Workspace retention can remove history, token type changes
which conversations are visible, Slack Connect introduces two organizations' policies, and some
commercial non-Marketplace apps are limited to one history or replies request per minute with 15
messages per page. A first pilot should use a customer-built internal Slack app or an approved
Marketplace distribution, a small explicit channel set, and a history window confirmed to exist.

The pilot should be chosen by source topology and access envelope, not by whether the participant can
name several future questions in advance. Select one bounded work context whose Jira, Confluence, Slack,
or GitHub surfaces contain a small set of completed or active work episodes; validate navigation,
provenance, coverage, and later naturally occurring questions against that material.

## Cross-provider findings

| Concern | Jira Cloud | Confluence Cloud | Slack | GitHub |
| --- | --- | --- | --- | --- |
| Preferred reusable authorization | OAuth 2.0 3LO; scopes intersect user permissions | OAuth 2.0 3LO; scopes intersect user permissions | Bot or user token; conversation visibility differs materially | GitHub App installation with selected repositories and read permissions |
| Completeness-oriented surface | Projects or bounded JQL plus issue/comment/changelog endpoints | Spaces or page subtrees plus CQL/content/version/comment endpoints | Explicit conversation IDs plus history and replies | Selected repositories plus issue, pull, commit, content, and comment endpoints or Git clone |
| Pagination | Offset on some endpoints; token/cursor on enhanced search and changelog | Cursor on modern content/version endpoints; CQL search cursor | Cursor; history/replies page size depends on app distribution | Link-header pagination; commonly up to 100 items per page |
| Historical revisions | Issue changelog and comment `updated` metadata; no documented deleted-body archive | Page and comment versions; versions can be deleted; purging removes history | Edits/deletes depend on events and retention policy; history omits hidden edit/delete events | Current objects plus timelines/events; commits by SHA; no general deleted-body archive |
| Incremental signals | Webhooks or Forge events; filtered issue webhooks | Forge events for content/comment/relation lifecycle | Events API plus overlap polling | Webhooks plus endpoint-specific `since` polling and conditional requests |
| Deletion completeness | Not guaranteed; cascading deletion can omit per-object events | Not guaranteed; purge and cascading deletion can erase descendants without per-object events | Not guaranteed; retention and sender-org policy may permanently remove data | Not guaranteed; webhook failures are not automatically redelivered and delivery history is short |
| Main pilot hazard | Permission filtering and eventual search visibility | Hierarchy/purge semantics and mixed v1/v2 surfaces | Retention, privacy, Slack Connect, and severe history throttles for some apps | Search caps, webhook gaps, transferred/deleted resource visibility, and repository renames |

## Jira Cloud

### Official facts

**Authorization and scopes.** Jira OAuth 2.0 authorization-code grants act on behalf of a user.
Atlassian states that accessible data is limited by both the app's scopes and the user's product
permissions; `/oauth/token/accessible-resources` identifies sites and granted scopes but does not
report the user's permissions. Atlassian recommends classic scopes where available. `read:jira-work`
is the broad classic read scope for projects, issues, and associated work objects; granular scopes can
instead name issue, comment, changelog, project, user, and related resources. See Atlassian's
[OAuth 2.0 3LO guide](https://developer.atlassian.com/cloud/jira/platform/oauth-2-3lo-apps/) and
[Jira scope reference](https://developer.atlassian.com/platform/forge/manifest-reference/scopes-product-jira/).

**Addressable surfaces and search.** The enhanced issue-search API accepts JQL and fields, returns
issue `id`, `key`, `self`, and selected fields, and pages with an opaque `nextPageToken`. It can include
archived projects. Results are filtered by Browse Project permission and issue-level security. The API
also warns that recent updates may not be immediately visible; `reconcileIssues` can request stronger
read-after-write consistency for named issues. See
[Jira issue search](https://developer.atlassian.com/cloud/jira/platform/rest/v3/api-group-issue-search/).

**History and pagination.** Issue responses expose current fields. The bulk changelog endpoint accepts
up to 1,000 issue IDs or keys and up to 10 field IDs, orders changes oldest first, and uses
`nextPageToken`. A changelog entry includes its own ID, actor account ID, timestamp, field, and old/new
values. Comment listing is offset-paginated with `startAt` and `maxResults`; a comment carries an ID,
author, update author, creation and update timestamps, visibility, body, and self link. See
[Jira issues and changelogs](https://developer.atlassian.com/cloud/jira/platform/rest/v3/api-group-issues/)
and [issue comments](https://developer.atlassian.com/cloud/jira/platform/rest/v3/api-group-issue-comments/).
The official changelog documentation does not state a guaranteed history-retention horizon.

**Identity, provenance, and links.** An issue has both a numeric/string `id` and human-facing `key`;
users are represented by account IDs. Comments and changelog entries have their own IDs and actor/time
metadata. Issue resources expose API self links. Typed issue links have inward and outward endpoints;
parent, subtask, and issue-link fields provide hierarchy and dependency context. See
[issue links](https://developer.atlassian.com/cloud/jira/platform/rest/v3/api-group-issue-links/) and
Atlassian's [issue-linking model](https://developer.atlassian.com/cloud/jira/platform/issue-linking-model/).

**Edits and deletion.** Current issue fields and comment `updated` metadata reveal edits, while issue
changelogs preserve supported field transitions. The REST API supports comment update and delete; a
successful delete returns no body, so a later list does not itself provide a deleted-comment tombstone.
Atlassian support documentation says deleted work items are permanently removed and cannot be
recovered without a prior backup/export. Jira audit records can identify an actor and time for some
administrative activity, but access and retention are plan/admin controlled; they are not a baseline
content archive. See [Jira audit activities](https://support.atlassian.com/jira-cloud-administration/docs/audit-activities-in-jira-applications/).

**Incremental signals.** Jira webhooks and Forge events cover issue created, updated, and deleted;
comment created, updated, and deleted; and issue-link changes. Jira webhooks can apply JQL filtering to
issue-related events. Atlassian documents two material gaps: oversized webhook payloads are not
delivered, and deleting a project does not emit one `issue_deleted` webhook for every contained issue.
See [Jira webhooks](https://developer.atlassian.com/cloud/jira/software/webhooks/) and
[Jira Forge events](https://developer.atlassian.com/platform/forge/events-reference/jira/).

**Rate constraints.** Atlassian's current points-based documentation describes an app-level global
pool, plus independent endpoint and tenant burst limits. Its published default global pool is 65,000
points per UTC hour; read costs vary by object class. Limit responses use HTTP 429 and may include
`Retry-After`. See [Jira Cloud rate limiting](https://developer.atlassian.com/cloud/jira/platform/rate-limiting/).

### Design inference

- Treat a project ID or explicit JQL expression as the declared surface. Persist the exact JQL,
  requested fields, archived-project choice, permission-bearing principal, and capture time.
- Use enhanced JQL search to enumerate issue IDs, then fetch issue, comment, relationship, and changelog
  data by ID. Do not treat keyword search as proof that no matching issue exists.
- Use issue ID as the provider object key. Keep issue key and browser/API URLs as mutable aliases because
  users navigate by key even when project moves or renames affect it.
- Use webhook/changelog information to prioritize re-fetch, but run overlapping JQL scans on the updated
  timestamp and deduplicate by issue ID and revision. Project deletion and comment deletion remain
  explicitly unobservable gaps unless a prior capture or event supplies a tombstone.
- Budget by returned objects and selected fields, not only by request count, because Atlassian's points
  model and burst limits can both bind.

## Confluence Cloud

### Official facts

**Authorization and scopes.** Confluence OAuth 2.0 3LO also acts as a user and does not override product
permissions. Relevant classic scopes include `search:confluence`, `read:confluence-content.all`,
`read:confluence-space.summary`, and `read:confluence-user`; attachment download and granular scopes for
pages, comments, hierarchy, and relations are separate capabilities. See the
[Confluence scope reference](https://developer.atlassian.com/cloud/confluence/scopes-for-oauth-2-3LO-and-forge-apps/)
and [Confluence 3LO guide](https://developer.atlassian.com/cloud/confluence/oauth-2-3lo-apps/).

**Addressable surfaces and search.** CQL search can select content by space, type, title, labels,
ancestor, creator, contributor, and last modification, and returns only content the principal may see.
Search is cursor-paginated. Expanding `body.export_view` or `body.styled_view` lowers the documented
maximum result limit to 25. See [Confluence search](https://developer.atlassian.com/cloud/confluence/rest/v1/api-group-search/)
and Atlassian's [REST API tutorial](https://developer.atlassian.com/cloud/confluence/using-the-rest-api/).

The v2 page resource exposes page ID, status, title, space ID, parent ID, author ID, owner ID, creation
time, current version, and UI/API links. See [Confluence pages](https://developer.atlassian.com/cloud/confluence/rest/v2/api-group-page/).

**History and pagination.** Version endpoints exist for pages, comments, and other versioned content.
They are cursor-paginated and expose version number, author ID, creation time, message, minor-edit flag,
and, where requested, body. Inline and footer comments have IDs, parent-comment IDs, page IDs, authors,
timestamps, versions, bodies, and web links. See [Confluence versions](https://developer.atlassian.com/cloud/confluence/rest/v2/api-group-version/)
and [comments](https://developer.atlassian.com/cloud/confluence/rest/v2/api-group-comment/).

**Identity, provenance, permalinks, and relationships.** Page and comment IDs address content directly;
page resources also supply `_links.webui`, `_links.editui`, and `_links.tinyui`. Space ID and parent ID
locate a page. Ancestor, child, and descendant APIs expose hierarchy by content ID and can include page,
whiteboard, database, folder, and smart-link descendants. See
[ancestors](https://developer.atlassian.com/cloud/confluence/rest/v2/api-group-ancestors/),
[children](https://developer.atlassian.com/cloud/confluence/rest/v2/api-group-children/), and
[descendants](https://developer.atlassian.com/cloud/confluence/rest/v2/api-group-descendants/).

**Edits, deletion, and retention.** Atlassian says normal page history retains all published versions,
but a permitted user can permanently delete an individual version and the remaining version numbers
are then renumbered. Deleting published content normally moves it to space trash, where it is restorable
until purged. Purge permanently removes the item, versions, and attachments; deleting drafts,
unpublished content, or individual versions can also be permanent. See
[create, edit, and publish a page](https://support.atlassian.com/confluence-cloud/docs/create-edit-and-publish-a-page/)
and [delete, restore, or purge a page](https://support.atlassian.com/confluence-cloud/docs/delete-restore-or-purge-a-page/).

**Incremental signals.** Forge events cover page, live-doc, and blog creation, update, move, archive,
trash, restore, and deletion, plus comment, attachment, and relation lifecycle events. Events carry an
actor and timestamp and may include current and previous content descriptors. Atlassian warns that
cascading deletion emits only the top-level event; for example, deleting a space does not emit one event
for every descendant. See [Confluence Forge events](https://developer.atlassian.com/platform/forge/events-reference/confluence/)
and [Atlassian app events](https://developer.atlassian.com/platform/forge/events/).

**Rate constraints.** Confluence uses Atlassian's points-based global pool and independent burst limits.
The published default global pool is 65,000 points per UTC hour, with object-sensitive read costs;
clients must honor 429 and `Retry-After`. See
[Confluence Cloud rate limiting](https://developer.atlassian.com/cloud/confluence/rate-limiting/).

### Design inference

- Declare one or more spaces, page roots, or explicit CQL expressions as the surface. A page subtree is
  preferable to an account-wide text query when the work context has a recognizable hierarchy.
- Enumerate IDs with CQL or hierarchy endpoints, then fetch the current page, available versions,
  comments, and relationships separately. Avoid body expansion on large result pages because it reduces
  the search page ceiling and couples enumeration to rendering.
- Store page/content ID as the provider object key and keep web, tiny, title, space, and ancestor paths as
  aliases. The documented fields are addressable identifiers, but the API docs do not promise that
  human-facing paths or every link remain immutable.
- Record version metadata and a content hash. Because versions may be deleted and renumbered, a composite
  of content ID, observed version number, capture time, and hash is safer evidence than version number
  alone.
- Treat trash/purge and cascade events as separate observability states. A missing descendant after a
  space purge cannot be distinguished from a permission loss without a previous inventory and an access
  preflight.

## Slack

### Official facts

**Authorization and scopes.** Slack bot tokens represent the installed app and are generally limited to
conversations the app has joined. User tokens act for a user and can expose resources visible to that
user, subject to scopes and workspace policy. History uses conversation-type scopes such as
`channels:history`, `groups:history`, `im:history`, and `mpim:history`; message search uses a user token
and `search:read`. See [Slack token types](https://docs.slack.dev/authentication/tokens/),
[conversations.history](https://docs.slack.dev/reference/methods/conversations.history/), and
[search.messages](https://docs.slack.dev/reference/methods/search.messages/).

**Addressable surfaces.** Slack's Conversations API normalizes public channels, private channels, direct
messages, multi-person direct messages, and related conversation forms behind conversation IDs. A
conversation object includes ID, name, creation/update metadata, topic, purpose, sharing flags, and, when
configured, a retention duration. Slack notes that IDs or prefixes can change when conversations become
shared, so integrations should use Conversations APIs rather than infer type from prefixes. See the
[conversation object](https://docs.slack.dev/reference/objects/conversation-object/) and
[Conversations API guide](https://docs.slack.dev/apis/web-api/using-the-conversations-api/).

**History, search, and pagination.** `conversations.history` pages a named conversation with a cursor and
optional oldest/latest time boundaries. `conversations.replies` pages a thread identified by conversation
ID and parent-message timestamp. Thread metadata includes `thread_ts`, reply count, and parent user.
See [conversations.replies](https://docs.slack.dev/reference/methods/conversations.replies/).

Slack message search is not a complete enumeration surface: it requires a user token, mirrors user search
filters and visibility, may group nearby results, and caps a page at 100. Slack's method documentation
classifies it as a search facility rather than a history archive. It is therefore useful for discovery,
not for proving that all messages in a selected conversation and time range were read.

**Identity, provenance, and permalinks.** Slack documents a message as addressable by conversation ID and
message `ts`; the timestamp is unique within a conversation. `chat.getPermalink` takes that pair and
returns a current user-facing permalink, including thread handling. Message and event payloads carry
author information (`user` or bot/app identity), event or message timestamps, and thread linkage. See
[chat.getPermalink](https://docs.slack.dev/reference/methods/chat.getPermalink/) and the
[message event](https://docs.slack.dev/reference/events/message/).

**Edits and deletion.** Message-change and message-deletion events identify the same conversation and
message timestamp; deletion events expose `deleted_ts` and may contain `previous_message`. Slack states
that the hidden `message_changed` and `message_deleted` subtype records are not returned by
`conversations.history`. See [message changed](https://docs.slack.dev/reference/events/message/message_changed/),
[message deleted](https://docs.slack.dev/reference/events/message/message_deleted/), and Slack's official
SDK [MessageDeletedEvent type](https://docs.slack.dev/tools/node-slack-sdk/reference/web-api/interfaces/MessageDeletedEvent/).

**Retention.** Slack retention is workspace- and plan-dependent. Paid workspaces can configure retention;
free workspaces expose only recent history and may permanently delete older content under the current
free-plan policy. Retention can also control whether edits and deletion records are retained. For Slack
Connect, the sending organization controls retention and edit/delete policy for messages it sends. See
[customize data retention](https://slack.com/help/articles/203457187-Customize-data-retention-in-Slack),
[free-workspace usage limits](https://slack.com/help/articles/115002422943-Usage-limits-for-free-workspaces),
and [data management in Slack Connect](https://slack.com/help/articles/115004152843-How-data-management-features-apply-to-Slack-Connect).

Slack's Discovery APIs can expose fuller history, edits, and deletions for approved Enterprise
compliance/eDiscovery use cases, but require Enterprise controls, owner approval, and an approved app.
They are not a baseline personal-bootstrap API. See Slack's
[Discovery APIs guide](https://slack.com/help/articles/360002079527-A-guide-to-Slacks-Discovery-APIs).

**Incremental signals.** The Events API supplies event IDs and timestamps and retries failed deliveries
on a documented schedule. Slack expects a successful response within three seconds, limits event volume,
and by default does not guarantee delivery of events delayed beyond two hours unless delayed events are
enabled. See the [Events API](https://docs.slack.dev/apis/events-api/).

**Rate constraints.** Slack applies method tiers per app, workspace, and method. Current policy gives
commercially distributed, non-Marketplace apps affected by the 2025/2026 change only one
`conversations.history` or `conversations.replies` request per minute, with 15 messages as the maximum and
default page size. Marketplace apps retain Tier 3 limits, and customer-built internal apps are documented
at 50+ requests per minute with a limit/default of 1,000. See
[Slack Web API rate limits](https://docs.slack.dev/apis/web-api/rate-limits) and the
[history rate-limit change](https://docs.slack.dev/changelog/2025/05/29/rate-limit-changes-for-non-marketplace-apps/).

### Design inference

- Make the surface an explicit set of workspace and conversation IDs plus a time boundary. Do not bootstrap
  a whole workspace through keyword search.
- Use `(workspace/team ID, conversation ID, message ts)` as the observed address, keep permalink and any
  previous conversation ID as aliases, and avoid inferring conversation type from the ID prefix.
- Page history for root messages and page replies for threads. Preserve author IDs, `ts`, `thread_ts`,
  current permalink, reactions/attachments metadata, and the observed retention/sharing policy.
- Polling `conversations.history` with an `oldest` watermark can find newly created messages, but cannot
  prove edit/delete completeness because edits preserve the original message timestamp and hidden
  edit/delete records do not appear in history. Events improve observability but remain hints to re-fetch
  or create tombstones; overlap scans and event-ID deduplication are required.
- Exclude DMs, private channels, and Slack Connect from the first pilot unless their privacy boundary,
  participant consent, sender-organization retention, and deletion semantics are explicitly accepted.
- Reject a history-heavy pilot if it must use the one-request/minute, 15-message commercial envelope. A
  customer-built internal app, Marketplace distribution, or a much smaller surface is required.

## GitHub

### Official facts

**Authorization and permissions.** GitHub Apps can be installed only on selected repositories and request
fine-grained read permissions with short-lived installation tokens. Apps begin with no permissions.
User-to-server access is limited by both the app's permissions and the user's own access; installation
access is limited by the app permissions and selected repositories. GitHub contrasts this with broader
OAuth scopes such as `repo`. See
[when to build a GitHub App](https://docs.github.com/en/apps/creating-github-apps/about-creating-github-apps/deciding-when-to-build-a-github-app),
[choosing GitHub App permissions](https://docs.github.com/en/apps/creating-github-apps/registering-a-github-app/choosing-permissions-for-a-github-app),
and the [fine-grained endpoint permission matrix](https://docs.github.com/en/rest/authentication/permissions-required-for-fine-grained-personal-access-tokens).

A bootstrap spanning work tracking and code normally needs read access to repository metadata, issues,
pull requests, and contents; each endpoint's permission section is authoritative. GitHub documents that
read Contents permission also permits HTTP Git clone for an installation token.

**Addressable surfaces.** Repositories are the natural selected container. REST issue responses contain
repository-local number, global database ID, GraphQL node ID, API URL, HTML URL, author, labels,
assignees, milestone, and creation/update/close timestamps. GitHub's REST issue endpoints also return pull
requests, distinguishable by the `pull_request` field. Issue listing supports an updated `since` filter
and commonly allows up to 100 items per page. See [REST issues](https://docs.github.com/en/rest/issues/issues).

Pull-request resources expose head/base repositories and refs, merge state, and related commit, file,
review, and review-comment endpoints. Commit resources expose SHA, node ID, HTML URL, author and
committer identities/timestamps, and parent SHAs; commit listing supports path, author, `since`, and
`until`. See [pull requests](https://docs.github.com/en/rest/pulls/pulls) and
[commits](https://docs.github.com/en/rest/commits/commits).

Repository Contents returns paths, blobs/directories, object SHA, API URL, and HTML URL. Directory
responses are capped at 1,000 entries and the Contents endpoint does not serve files over 100 MB; Git
Trees or Git clone are the documented alternatives for larger trees. See
[repository contents](https://docs.github.com/en/rest/repos/contents).

**Search, history, and pagination.** GitHub REST search returns at most 1,000 results for a query and can
limit how many repositories are searched; timeouts may set `incomplete_results`. Search also has stricter
rate and query-shape limits than ordinary REST endpoints. See the official GitHub Docs source for
[REST search](https://github.com/github/docs/blob/main/content/rest/search/search.md).

REST collection endpoints use Link-header pagination when more results exist, and many support up to 100
items per page. See [using REST pagination](https://docs.github.com/en/rest/using-the-rest-api/using-pagination-in-the-rest-api).
Issue comments carry their own database and node IDs, HTML URL, author, body, and created/updated
timestamps, and can be edited or deleted. Issue timelines combine comments and typed events such as
renames, references, transfers, commits, and cross-references with actors and timestamps. See
[issue comments](https://docs.github.com/en/rest/issues/comments),
[issue timeline](https://docs.github.com/en/rest/issues/timeline), and
[issue event types](https://docs.github.com/en/rest/using-the-rest-api/issue-event-types).

**Identity, moves, and deletion.** Database IDs, node IDs, repository IDs, and commit SHAs provide
provider identifiers; HTML URLs provide current user-facing navigation. GitHub documents that requesting
an issue transferred to another repository can return 301. A deleted issue may return 410 to a caller
that can still read the repository, while transfers or deletions into an unreadable resource may appear
as 404. GitHub recommends webhooks to observe transfer and deletion. The current REST object does not
provide the former body of a deleted comment or issue.

**Incremental signals.** Webhooks cover issues, issue comments, pull requests, reviews, pushes, and many
repository changes. Push payloads contain before/after SHAs and created/deleted/forced flags, but GitHub
documents payload and event-generation limits for very large pushes. Each delivery has a unique
`X-GitHub-Delivery` value. GitHub does not automatically redeliver failed deliveries, and the UI/API
delivery history available for redelivery is limited to three days. See
[webhook events and payloads](https://docs.github.com/en/webhooks/webhook-events-and-payloads),
[webhook best practices](https://docs.github.com/en/webhooks/using-webhooks/best-practices-for-using-webhooks),
[failed webhook deliveries](https://docs.github.com/en/webhooks/using-webhooks/handling-failed-webhook-deliveries),
and [redelivering webhooks](https://docs.github.com/en/webhooks/testing-and-troubleshooting-webhooks/redelivering-webhooks).

GitHub's public activity-event feeds are not a historical sync log: they expose at most 300 events from
the previous 30 days and may have substantial latency. See
[REST activity events](https://docs.github.com/en/rest/activity/events).

**Rate constraints.** Authenticated users, OAuth apps, fine-grained tokens, and GitHub App user tokens
normally receive 5,000 primary REST requests per hour, with documented enterprise exceptions. GitHub App
installation limits start at 5,000 and can scale to 12,500 outside the enterprise exception. Secondary
limits include 100 concurrent requests and a point budget per minute. Responses expose rate headers and
may use 403 or 429. Authenticated conditional requests returning 304 do not count against the primary
rate limit. See [REST rate limits](https://docs.github.com/en/rest/using-the-rest-api/rate-limits-for-the-rest-api)
and [REST best practices](https://docs.github.com/en/rest/using-the-rest-api/best-practices-for-using-the-rest-api).

### Design inference

- Use GitHub App installation ID, account/repository ID, and selected repository IDs as the authorization
  and surface boundary. Prefer a GitHub App over a broad personal `repo` token for a reusable product.
- Enumerate issues/PRs/comments/timeline and commits from selected repositories. Use Git clone or Git
  Trees for code and reachable history instead of REST code search when implementation context matters.
- Key repository objects by provider database/node ID and commits by SHA. Keep owner/name, issue number,
  refs, and HTML URLs as aliases because repositories can rename or transfer and refs can move.
- Use endpoint-specific `since` filters, ETags, and overlapping windows for polling. Deduplicate webhook
  hints by delivery ID, then re-fetch the object. Schedule reconciliation scans because webhook failure
  is not automatically redelivered and delivery history is short.
- Do not use REST search or activity events as a completeness primitive. Their result caps, incomplete
  responses, 30-day event horizon, and latency make them discovery/change hints only.

## Lowest useful provider-neutral retrieval envelope

Everything in this section is **design inference**. The goal is a capability-negotiated contract, not the
intersection of the four providers' fields.

### 1. Authorization snapshot — required

Every run records:

- provider and immutable tenant/site/workspace/account identifier;
- token/principal kind, app or installation identifier, and capture time;
- granted scopes or permissions and explicitly selected containers;
- observed principal access, retention/shared-channel policy, and provider plan/distribution limits when
  discoverable;
- authorization failures and surfaces excluded by policy or missing permission.

Scope is evidence of possible access, not evidence of complete access. The snapshot must distinguish
app scope, principal permission, selected resource, and content-level visibility.

### 2. Declared source surface — required

A `SourceSurface` has a local immutable ID and a provider address:

| Field | Meaning |
| --- | --- |
| `provider_address` | Tenant plus project/JQL, space/page root/CQL, workspace/conversation IDs, or installation/repository IDs |
| `object_classes` | Issues, comments, pages, versions, messages, replies, commits, files, and other explicitly enabled classes |
| `history_boundary` | Earliest timestamp, current-only choice, or provider-retained extent |
| `include_exclude` | Named containers, labels/types, branches/paths, privacy exclusions, and attachment policy |
| `policy_snapshot` | Permission, retention, shared/external, and rate assumptions observed at preflight |

The surface is persisted exactly as authorized. The product must never expand it by semantic guesswork.

### 3. Enumerate and checkpoint — required

`Enumerate(surface, provider_cursor, watermark)` yields object references, an opaque next cursor, and
page-level evidence. Provider cursors are resumable run state, not durable object identities. A checkpoint
records the exact surface version, last successful page/watermark, request time, retries, and limit state.

Enumeration uses container-native listing or history endpoints. Search may propose candidate surfaces or
objects but cannot set `complete=true` by itself.

### 4. Fetch a source record — required

The minimum normalized record is:

| Field | Requirement |
| --- | --- |
| Source key | `(provider, tenant_id, object_type, provider_object_id)`; include container ID where provider identity requires it |
| Revision | Provider revision/version/change ID when available, observed update time, capture time, and content hash |
| Navigation | Current user-facing permalink plus API URL; retain prior aliases |
| Provenance | Author/editor IDs and display labels when permitted; created, updated, and observed timestamps |
| Representation | Provider-native metadata plus normalized text/body; preserve enough raw structure to cite the source |
| State | Current, archived, trashed, deleted tombstone, inaccessible, or unknown—only when the provider supplies evidence |
| Visibility | Surface/container, restricted visibility metadata, shared/external flags, and permission caveats |

Revision fetch is optional by capability, but the adapter must say whether it returned current-only,
available versions, or a complete documented revision range. A current 404 is not automatically a delete;
it can also mean permission loss or transfer.

### 5. Relationships — required when exposed

Normalize provider relationships as typed, directed edges with source provenance: parent/child,
thread/reply, comment-on, issue-link, subtask, references/cross-reference, pull-request head/base,
commit-parent, content hierarchy, attachment-of, and authored/assigned/mentioned identities. Unknown edge
types remain provider-qualified rather than being dropped.

### 6. Incremental change capability — declared, not assumed

Each adapter declares one or more modes:

- `event_hint`: webhook/event IDs, event time, object address, and delivery limitations;
- `poll_watermark`: provider field and overlap window used to enumerate recently changed objects;
- `bounded_rescan`: full re-enumeration of a small declared surface;
- `none`: no reliable incremental signal for that class.

Events enqueue a re-fetch; they are not themselves the canonical content. Polling uses overlap and
deduplication because clocks, eventual search visibility, edits preserving creation timestamps, and
pagination races exist. A bounded reconciliation scan repairs missed events. This supports incremental
capture during ordinary work without requiring continuous background sync.

### 7. Completeness manifest — required output

Every bootstrap produces a machine- and human-readable manifest containing:

- attempted surfaces, object classes, and requested time range;
- pages, objects, versions, and relationships fetched;
- final checkpoint and whether enumeration ended normally;
- permission denials, inaccessible/deleted/unknown objects, retention cutoffs, provider truncation,
  incomplete search, event gaps, rate throttling, and unsupported object classes;
- attachment/body omissions and content too large for the chosen endpoint;
- confidence by surface: complete within declared endpoint semantics, partial, or unknown.

An empty result is never promoted to complete without evidence that the declared container was fully
enumerated under the recorded authorization snapshot.

### Deliberately outside the envelope

The lowest useful envelope does not require uniform cross-provider keyword search, guaranteed recovery
of deleted content, continuous background synchronization, privileged compliance exports, mutation of
source systems, or a provider-neutral claim that every historical revision exists. Those capabilities
may be provider-specific extensions.

## Constraints on pilot selection

Everything in this section is **design inference**.

### Must qualify

1. **One owner and one bounded work context.** The participant can authorize the required app/installations
   and name the relevant project, space/subtree, channel set, and repositories. An administrator can
   install an app where user consent alone is insufficient.
2. **Explicit containers, not account-wide search.** Start with one Jira project or bounded JQL, one
   Confluence space/subtree, a small named Slack channel set, and one or a few GitHub repositories. Use
   only the providers that materially contribute to the chosen context; do not add all four for symmetry.
3. **A useful source mix.** Include at least one system carrying planned/current state and one carrying
   rationale or implementation evidence. For a software context this will often be Jira plus one or more
   of Confluence, Slack, and GitHub.
4. **Known history window.** Preflight the earliest desired date, retained Slack history, Confluence/Jira
   version availability, repository history, expected object/page counts, and the resulting rate budget.
5. **Acceptable privacy boundary.** The selected material belongs in the participant's governed personal
   vault. Exclude credentials, restricted personnel/security content, and conversations whose participants
   or company policy do not permit this use.
6. **Observable partiality.** The participant accepts that purged/deleted content and missed historical
   events may be unrecoverable, while the product exposes those limits instead of silently claiming
   completeness.
7. **Evidence-rich work episodes.** The bounded surface contains a handful of completed or active episodes
   with links across systems, enough to test whether the loom can reconstruct decisions, state, and
   implementation without importing an entire company history.

### Slack-specific gate

Use an internal customer-built app or an approved Marketplace path with a small explicit channel set.
Confirm retention and estimate message/reply pages before selection. Do not select a history-heavy pilot
that is constrained to one request per minute and 15 messages per page. Keep DMs, private channels, and
Slack Connect out of the first pilot unless policy, consent, retention ownership, and external-sharing
semantics are explicit parts of the test.

### Do not select when

- app installation or selected-resource authorization cannot be obtained;
- the useful domain can only be found through unbounded keyword search;
- required history predates Slack retention or has been purged from source systems;
- the expected rate/volume cannot finish a bounded bootstrap in an agreed run window;
- the domain owner or allowed vault subject is ambiguous;
- useful evidence depends primarily on deleted content, privileged compliance exports, or continuous sync;
- no source combination contains both work state and enough rationale/implementation evidence to produce
  an immediately navigable starter vault.

### Pilot evidence and handoff

Do not require the participant to invent three to five future questions before setup. Select source
surfaces using known work episodes and evaluate the first handoff through:

- a navigable index and canonical notes that map back to stable source identities and permalinks;
- explicit coverage, unknown, conflict, stale, permission, and retention markers;
- spot checks against sampled source objects and relationships;
- the participant's ability to locate and edit the corresponding canonical note;
- naturally occurring questions during subsequent work, captured as follow-up evaluation rather than an
  onboarding prerequisite.

The bootstrap is ready to hand off when it is useful within the declared surface and its coverage limits
are inspectable. It is not required to be a complete archive of every connected SaaS account.

## Source-access notes

No material first-party documentation source was blocked. Slack's main message-object reference did not
render reliably during this study, so message identity/edit/delete fields were cross-checked against
Slack's official method pages, event references, and official Node SDK type documentation instead. No
live-tenant behavior was verified; tenant-specific permission, plan, retention, and rate-limit preflight
remains mandatory for the pilot.
