# Production Snapshot and Auto-Update Release Design

## Goal

Publish the current production workspace to `keroro900/hajimi-penguin-canvas` as a fast-forward update to `main`, then publish a verified `v2.4.0` GitHub Release that verified fork-targeting `2.3.8` desktop clients can discover, download, and install through the existing user-controlled updater UI. The release cannot claim automatic migration from `2.3.8` unless at least one exact installer previously distributed to users is extracted and proven to target `keroro900/hajimi-penguin-canvas`; upstream-targeting builds require a one-time manual migration.

## Safety boundary

The active production workspace must not be switched, reset, stashed, bulk staged, or used for release builds. Work happens in the ignored project-local worktree:

`E:\1\T8-penguin-canvas-main\.worktrees\production-release-v2.4.0`

The release worktree starts from the latest `origin/main`. The active workspace is the authoritative source tree for this release even though its `HEAD` differs from `origin/main`. A production snapshot is materialized there without copying Git metadata, dependencies, logs, caches, generated packages, user data, media input/output, secrets, or Codex temporary directories.

Snapshot semantics are exact replacement, not a three-way merge. The authoritative source set is every existing on-disk path reported by `git ls-files` in the active workspace plus individually approved untracked files. This includes root files such as `.dockerignore`, `.gitignore`, `Dockerfile`, `docker-compose.yml`, `features.json`, `index.html`, `LICENSE`, `package.json`, `package-lock.json`, PostCSS/Tailwind/TypeScript/Vite configuration, and Windows launch scripts, together with tracked content under `backend`, `docs`, `electron`, `extension`, `public`, `release-notes`, `resources`, `scripts`, `shared`, `skills`, `src`, `tests`, and `tools`.

Every destination tracked path must be either byte-for-byte represented in that authoritative manifest or explicitly classified as a release-only path. A destination path absent from both sets is deleted, including stale `origin/main` files. Approved untracked files may come only from the named source directories after individual path review; every candidate is listed before copying. Unknown roots fail closed and require review.

Capture uses a two-pass manifest. Before copying, produce a machine-readable manifest of every included source path with path, file/directory type, executable mode, byte size, and SHA-256. After copying, regenerate the source manifest and the destination manifest. The two source manifests and the destination manifest must match exactly. A mismatch means the active workspace changed during capture; discard the candidate snapshot and repeat. The manifests are stored as local release evidence and are not committed if they disclose local paths.

The release must remain a fast-forward of the current remote `main`. A changed remote tip stops the release. Force-push is forbidden.

## Repository snapshot

Commit topology is explicit:

1. the already reviewed release-design commit based on `origin/main`;
2. a production-snapshot commit that exact-replaces the public source tree while exempting the reviewed design document;
3. a test-first updater/release configuration commit;
4. a version/release-evidence commit if evidence files are intentionally public.

Release-only exemptions are limited to this design document and the subsequent reviewed implementation plan under `docs/superpowers`. They are preserved/reapplied after exact replacement and listed in the snapshot manifest. The production-snapshot commit contains no updater-specific behavior edits. This isolates the large existing product delta from the small release infrastructure changes and makes later review and rollback possible.

Before committing the snapshot:

- run `scripts/check-public-clean.cjs`;
- scan staged paths and staged content for known secret/config patterns;
- reject `.env*`, settings, user data, logs, caches, build output, archives, installers, and runtime credentials;
- inspect the exact staged file list and staged diff summary;
- confirm the active production workspace hash/status did not change during capture.

## Packaging input inventory

Before building, enumerate every `build.files`, `extraResources`, runtime archive, encryption input, post-build requirement, and referenced plugin/tool directory. Each input is classified as one of:

- committed public source;
- generated from committed public source during the build;
- reviewed build-only ignored input;
- forbidden/missing.

Ignored but required inputs such as `.agents/skills` are not part of the GitHub source snapshot, but may be copied to the release worktree as build-only material after complete path and content review. Build-only inputs are scanned by the same secret policy as committed files and packaged outputs. A missing or forbidden input blocks packaging. The final report records which ignored inputs were used and their content hashes without revealing secret values.

## Auto-update configuration

The Electron updater remains user-controlled:

- startup checks are allowed;
- `autoDownload` stays disabled;
- `autoInstallOnAppQuit` stays disabled;
- the user explicitly chooses download and install;
- development mode never checks GitHub Releases.

`package.json` will contain an electron-builder GitHub publish provider for:

- owner: `keroro900`
- repository: `hajimi-penguin-canvas`
- release type: public release

The updater test must assert this fork rather than the historical `T8mars/T8-penguin-canvas` repository. Release scripts must resolve the same repository by default while still allowing an explicit environment override. A dry run must fail when repository resolution is empty or inconsistent.

## Existing-client repository bootstrap

Changing `package.json` only affects newly built clients. Before claiming that existing `2.3.8` clients can discover `v2.4.0`, identify the exact `2.3.8` installer file(s) previously distributed to users, record their SHA-256, extract/install each in a disposable location, and inspect the packaged `resources/app-update.yml`.

Only a `2.3.8` build whose packaged provider is `keroro900/hajimi-penguin-canvas` is eligible for automatic migration through this Release. The current local `JIMI AI` unpacked `2.3.8` candidate appears to target this fork, but that is not accepted as evidence for a separately distributed installer until installer extraction confirms it.

If any distributed installer targets `T8mars/T8-penguin-canvas`, publishing only to `keroro900` cannot update it. Without explicit authority to publish a bridge Release in `T8mars`, those users require one final manually delivered migration installer. The release report must separate eligible fork-targeting clients from legacy upstream-targeting clients and must not claim universal `2.3.8` automatic migration.

## Version and artifacts

The release version is `2.4.0`. `package.json`, `package-lock.json`, the hard-coded Electron `APP_VERSION`, installer and blockmap names, `latest.yml`, packaged `app-update.yml`, Git tag, and GitHub Release target must all agree on version and repository.

The build must produce exactly the updater assets referenced by `latest.yml`:

- `JIMI AI-Setup-2.4.0.exe`
- `JIMI AI-Setup-2.4.0.exe.blockmap`
- `latest.yml`

The packaged `resources/app-update.yml` must point to `keroro900/hajimi-penguin-canvas`. The installer name in `latest.yml` must match the actual artifact. SHA-256 and SHA-512 values for all local release assets are recorded before upload.

## Test-first updater changes

Updater behavior changes follow red-green-refactor:

1. Update or add tests that expect the fork repository, `2.4.0`, non-empty release repository resolution, and matching packaged metadata.
2. Run the focused tests and confirm they fail for the current missing/wrong configuration.
3. Make the smallest configuration/script changes.
4. Re-run focused tests until green.

No existing production behavior outside packaging, release validation, and updater metadata is intentionally changed.

## Verification gates

The clean `origin/main` baseline currently reports 1165 tests with 1143 passing and 15 failing; the remaining outcomes must be recorded explicitly as skipped, cancelled, todo, or harness-level outcomes. These failures predate this release work. They include project-local skill fixtures, environment-dependent live API cases, documentation contracts, storage assumptions, and the updater repository configuration.

Before snapshot changes, capture a machine-readable baseline containing test file/name identifiers, status, duration, Node/npm/OS versions, relevant non-secret environment switches, and all pass/fail/skip/cancel/todo counts. Final comparison is by test identifier: zero newly failing identifiers are allowed. Count equality alone is insufficient and cannot hide one fixed failure plus one new failure.

The release cannot claim a globally clean baseline unless those failures are resolved by the production snapshot. Required release gates are:

- updater focused tests pass;
- release-script and packaging tests pass;
- `npm run type-check` passes;
- `npm run public:check` passes;
- all tests affected by the production snapshot/updater changes pass;
- full `npm test` has no new failures relative to the captured baseline, with any remaining failures explicitly reported;
- `npm run build` passes;
- Electron NSIS packaging and post-build checks pass;
- packaged smoke launch succeeds where supported;
- Git diff and staged-content secret checks pass.

Secret scanning covers the complete candidate Git tree, reviewed ignored build-only inputs, generated `app.asar`/unpacked resources, and the final Release asset inventory. It runs the existing public check plus path-only scans for private keys, common API-token formats, authorization headers, cookies, local settings payloads, credential-bearing URLs, and high-entropy secret candidates. Findings report file path and rule identifier only, never the matched credential value. Known false positives require an explicit path-and-rule allowlist entry committed for review; ad hoc command-line exclusions are forbidden.

Failure of any updater, public-boundary, type, build, packaging, artifact, or smoke gate blocks pushing `main` and blocks publishing the Release.

## GitHub publication

Before any remote write, start or load a local release-run record containing a unique run identifier, integration base, verified source SHA, version/tag, draft identity when allocated, and approved asset names, sizes, and hashes. If tag `v2.4.0` or any draft/published GitHub Release already exists without a matching local record, fail closed. Asset clobbering and tag retargeting are forbidden.

A previously interrupted run may resume only as a bounded state machine when every completed remote object exactly matches its recorded identity: remote `main` and tag target the recorded verified source SHA; the draft has the recorded database identity, tag, target, title, and body marker; every existing asset has an approved name and exact size/hash; and no published competing release exists. Resume performs only missing transitions or missing asset uploads and never overwrites an existing asset. Any mismatch fails closed and preserves evidence for human review.

After all local gates pass:

1. Fetch `origin/main` and verify it still equals the integration base.
2. Push `verified-release-sha:refs/heads/main` with an explicit non-force refspec. A non-fast-forward rejection aborts publication.
3. Re-read remote `main` and require it to equal the verified release SHA.
4. Create annotated/lightweight tag `v2.4.0` at exactly that SHA using a non-force push; re-read and verify the resolved remote tag SHA.
5. Create `v2.4.0` as a Draft Release targeting the verified tag/SHA.
6. Upload the installer, blockmap, and `latest.yml` to the draft without clobber.
7. Download all three draft assets and compare cryptographic hashes byte-for-byte with the locally approved files; verify draft target, tag SHA, version, filenames, and metadata.
8. Immediately before publication, re-check remote `main`, resolved tag SHA, draft identity, asset hashes, and absence of a competing published release.
9. Publish the already verified draft and mark it Latest as the final atomic visibility step.
10. Re-read the public Release, tag, Latest feed, and all three downloadable assets; require the same source SHA and cryptographic hashes.

No public Release is visible before source push and draft-asset verification. Existing tags or releases are never overwritten.

## Client compatibility gate

Before publication, the new unpacked/installed build must pass packaged startup and updater metadata tests in an isolated user-data directory. The draft feed and downloaded assets must also pass provider-level update parsing and differential-package verification.

Draft Releases are not visible through the normal GitHub Latest feed. Pre-publication compatibility testing therefore uses an explicit test-only harness: run the unmodified packaged application code in a disposable Windows environment while injecting a local/generic update feed through the harness before updater initialization. The injected feed serves the already downloaded and hash-verified draft assets and exact `latest.yml`; no test-feed override is added to production code. This simulation must report `2.4.0`, download the update, launch the NSIS path, restart as `2.4.0`, and preserve the isolated user-data fixture.

This injected-feed simulation is not accepted as proof that the baked-in GitHub repository works. Immediately after publishing the verified draft, an unmodified eligible `2.3.8` installer whose packaged `app-update.yml` points to `keroro900` must query the public feed, report `2.4.0`, and download the public asset in a disposable environment. It must then complete the same install/restart/version/user-data checks. If the pre-publication disposable environment or test-feed harness is unavailable, keep the Release as draft. If the post-public unmodified-client check fails, immediately apply the containment procedure below.

After publication, verify the public Latest feed URL resolves to the same `latest.yml` and repeat at least the check/download portion from a disposable `2.3.8` client profile.

## Recovery

Until GitHub publication, recovery is deleting the isolated worktree/branch; the active production directory remains intact. If source push succeeds but Release publication fails, keep `main` as published source, retain the local release-run record and verified artifacts, and report the exact failed state. Resume only through the matching-state rules above after revalidating remote source, tag, draft identity, and asset hashes; otherwise require human review or a new patch version.

If a public Release is created but verification fails, immediately remove discoverability by converting/withdrawing it back to draft where GitHub permits, and remove its Latest designation. Preserve the tag, source SHA, downloaded assets, and forensic hashes. Do not replace assets with a new build under the same version. Corrected binaries require a new patch version. If GitHub cannot withdraw the release safely, stop, report the exact public exposure, and publish no further assets until a human chooses containment.
