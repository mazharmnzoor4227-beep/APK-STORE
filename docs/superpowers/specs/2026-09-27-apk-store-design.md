# APK STORE — product and system design

## Purpose and scope

APK STORE is a public Android app marketplace for apps selected by its owner. Visitors browse and download from a responsive website or a native Android app. The owner manages one shared catalog from a mobile-friendly web admin panel. The supplied Stitch ZIP is a visual reference, not functioning application code. Its rollback, NFC signing, GPG, SIEM, and enterprise incident screens are outside this product.

The product is complete when an owner can upload a signed APK or import an eligible GitHub release APK, edit its listing, approve publication, and see that listing and download work on both clients. A later compatible APK must appear as a pending update, then become available in both clients only after owner approval. No visitor account is needed.

## Visual design

Use Stitch's broad information architecture (home, details, updates, dashboard, editor, review), redesigned as an original black and green interface. The dark palette uses near-black backgrounds, muted charcoal surfaces, a restrained vivid green for primary actions and status, off-white body text, and subtle borders. Avoid neon glows, dense terminal decoration, cyan accents, decorative graphs, and fake telemetry. Use a highly readable sans serif for primary copy and monospace only for version, package ID, checksum, and build metadata. App icons and real screenshots carry most of the visual interest.

The public website and Android app support Light, Dark, and System theme choices, saved locally. The admin panel uses the same tokens and responsive layouts. On narrow screens, search and primary navigation remain reachable with one hand. On desktop, use a restrained sidebar/top navigation and wider grids. Screens include real loading, empty, offline, upload failure, and download failure states. Every displayed action must have a working destination or be omitted until available.

## User journeys

### Visitor

Browse featured and recent apps; search by title/category; open a detail page with icon, verified package metadata, description, screenshots, version, size, release notes and checksum; download the current published APK. Web download uses the browser. Android downloads to app-managed storage, reports actual byte progress, checks checksum, then hands installation to Android's system confirmation. Android may require the user to grant install-from-this-source permission. Library tracks store downloads. Updates compare installed package ID, signing identity where readable, and version code with the published release; they never silently install.

### Owner

Authenticate into a private web admin. Create a listing via direct APK upload or GitHub repository selection. The admin explicitly enables a repository and chooses a release asset; repository selection alone never publishes every app. Upload/import extracts package ID, version name/code, minimum SDK, file size, signing certificate digest, and SHA-256; display extracted values read-only. The owner supplies title, category, description, icon, screenshots, and release notes, previews the listing, and approves publication.

For an existing package, the incoming APK is assigned to its current listing only when package ID and signing certificate match and version code increases. Otherwise it is blocked with a specific correction message. Uploads and new GitHub assets enter a pending review state. The owner can reject, edit metadata, or approve. Approval atomically switches the published release pointer while preserving release history and prior download integrity. Unpublishing removes a listing from public discovery without deleting existing records.

## Architecture and data flow

The repository contains three independent applications plus shared contracts: `apps/web` (public site and admin), `apps/android` (native Kotlin/Compose client), and `packages/contracts` (API schema and shared catalog types). A backend service owns all privileged mutations, APK inspection, import jobs, and publication transactions. A relational database stores apps, immutable releases, screenshots, repository connections, approval events, and admin audit records. Object storage holds uploaded APKs and media. Only published records are public. Public downloads use immutable versioned assets with a content checksum; admin operations require a server-verified owner identity. No service credential or GitHub token enters a public client.

Initial implementation may use Supabase Auth/Postgres/Storage plus server-side functions and a web host, subject to checking available connected projects and deployment quotas before provisioning. The provider boundary stays behind a catalog API so hosting can change without rewriting Android. Direct uploads must use resumable or bounded uploads with size and type checks; backend APK inspection is authoritative. GitHub integration should use a least-privilege installation or scoped token held server-side, discover selected repositories and release assets, and copy approved candidates into durable object storage. GitHub Actions artifacts are temporary build outputs and cannot be the permanent public download source.

### Core records

- `apps`: internal ID, immutable package ID, listing fields, category, visibility, current published release ID.
- `releases`: app ID, version code/name, certificate digest, APK checksum/size/storage key, source, release notes, status, timestamps.
- `repo_connections`: repository ID, owner selection, enabled state, asset selection policy, last checked state.
- `media`: app ID, icon/screenshots, display order, storage key.
- `review_events`: candidate release, owner action, timestamp, reason, actor.

Constraints enforce uniqueness for package ID and `(app_id, version_code)`, and prevent a release from belonging to a different package. Publication happens server-side in one transaction after revalidating the APK and owner identity.

## Screens

Android: home, search/results, categories, app detail, download progress, library, updates, settings, and permission/error states. Web: responsive home, search/results, category, app detail/download, settings/theme, and basic legal/support pages. Admin: sign-in, overview, app list, upload/import choice, repository picker, metadata editor, candidate review, release history, and errors. The supplied Stitch screens guide hierarchy, but unneeded enterprise controls and fabricated metrics are removed. Dashboard counters derive from database records.

## Safety, compatibility, and errors

Reject malformed or non-APK files, oversized uploads, missing signatures, duplicate/lower version codes, mismatched package IDs, and incompatible signing certificates. Show exact failure reasons in admin without publishing a partial record. An interrupted download can retry; checksum mismatch discards the file. Public clients must never see draft assets or private repository credentials. Rate limit sensitive endpoints, validate upload content server-side, use row-level access controls if Supabase is selected, and log owner actions. Android updates require the same package ID and compatible signing lineage and use system install confirmation. No automatic rollback or downgrade is promised.

## Performance and verification

Render catalog pages with paginated queries and optimized images; cache published metadata while invalidating on approval. Keep Android startup and list scrolling responsive by loading thumbnails asynchronously and doing downloads/inspection off the main thread. Verify on narrow and wide screens, light and dark themes, slow connections, empty catalog, failed upload, invalid APK, rejected candidate, successful approval, and real Android installation. Acceptance requires a signed test APK to move from upload through approval to website download and Android system installer, followed by a higher compatible version appearing as an update. Verify mismatched package/signature and lower version are blocked. Builds and checks run in GitHub Actions; Android workflow uploads a directly downloadable APK artifact for the owner's phone workflow.

## Implementation sequence

1. Establish design tokens, catalog contract, database/storage security, and a runnable public web slice.
2. Complete web admin upload/inspection/approval and durable download path; test with real signed APKs.
3. Add selected GitHub repository import and pending release discovery.
4. Build native Android browsing, download/install, library, update detection, and theme setting.
5. Verify end-to-end flows and release both public website and Android APK.

The first usable milestone is the public web catalog plus owner-approved manual APK publication. GitHub import and Android integration build on that proven data path. Deployment credentials and domain details are supplied through connected service configuration, never committed to git.
