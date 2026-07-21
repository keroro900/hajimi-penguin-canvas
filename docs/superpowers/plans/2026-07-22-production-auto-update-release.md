# Production Auto-Update Release Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Publish an exact, security-reviewed snapshot of the current production workspace to `keroro900/hajimi-penguin-canvas/main` and publish a verified `v2.4.0` Electron update for distributed `2.3.8` clients proven to target that fork.

**Architecture:** All work occurs in the ignored release worktree. Local-only, fixture-tested evidence tools atomically capture the active workspace before any snapshot commit. Updater/release behavior is developed test-first, while GitHub mutation is split into structurally separate prepare-draft, verify-draft, publish, verify-public, and contain commands backed by a fake-adapter state-machine suite. Public visibility is last and is withdrawn immediately if an unmodified legacy-client check fails.

**Tech Stack:** Git worktrees, Node.js/CommonJS, Node test runner, TypeScript, Electron 42, electron-builder/electron-updater, NSIS, PowerShell, GitHub CLI.

**Design spec:** `docs/superpowers/specs/2026-07-21-production-release-auto-update-design.md`

---

## Fixed paths and command variables

Run operational commands from the release worktree unless a step explicitly says otherwise.

```powershell
$productionRoot = 'E:\1\T8-penguin-canvas-main'
$releaseRoot = 'E:\1\T8-penguin-canvas-main\.worktrees\production-release-v2.4.0'
$commonGitDir = (git -C $releaseRoot rev-parse --path-format=absolute --git-common-dir).Trim()
$evidenceRoot = Join-Path $commonGitDir 't8-release\v2.4.0'
$toolRoot = Join-Path $evidenceRoot 'tools'
$repo = 'keroro900/hajimi-penguin-canvas'
$tag = 'v2.4.0'
```

Every local evidence command writes only below `$evidenceRoot`. No tool prints matched secret values.

## File map

Committed release changes:

- `package.json`, `package-lock.json`: version and fork publish provider.
- `electron/main.cjs`: synchronized hard-coded version; updater remains user-controlled.
- `scripts/lib/release-state.cjs`: pure state transitions and remote-state validation.
- `scripts/release-secret-allowlist.json`: committed path+rule+reason allowlist; starts empty and is the only supported false-positive exemption source.
- `scripts/release-github.cjs`: explicit `prepare-draft|verify-draft|publish|verify-public|contain|status|dry-run` modes.
- `scripts/verify-github-release.cjs`: independent public remote verification.
- `scripts/dist-release.cjs`: build only; never implicitly publishes.
- `tests/electronUpdater.test.ts`: updater/config/command-mode contracts.
- `tests/releaseState.test.ts`: fake-adapter transition/race/resume/containment coverage.
- `release-notes/v2.4.0.md`: honest eligibility and migration notes.

Local-only evidence tools created below `$toolRoot` before snapshot capture:

- `test-report.cjs`, `test-report.test.cjs`: spawn/parse TAP into identifier-level JSON.
- `snapshot-manifest.cjs`, `snapshot-manifest.test.cjs`: canonical manifests and exact copy validation.
- `secret-scan.cjs`, `secret-scan.test.cjs`, `secret-rules.json`, `secret-allowlist.json`: full-tree path/rule-only scan.
- `release-evidence.cjs`, `release-evidence.test.cjs`: installer discovery/extraction, packaging inventory, affected tests, artifact inspection, and smoke lifecycle.
- `updater-compat-harness.cjs`, `updater-compat-harness.test.cjs`: disposable-client orchestration and test HTTPS GitHub proxy.

Local-only evidence:

- `$evidenceRoot\run-state.json`: release identity/state.
- `$evidenceRoot\baseline-origin-main.json`, `baseline-raw.tap`: clean origin/main test baseline.
- `$evidenceRoot\manifest-before.json`, `manifest-after.json`, `manifest-destination.json`.
- `$evidenceRoot\affected-tests.json`, `final-tests.json`, `artifact-hashes.json`.

## Chunk 1: Build and self-test local release evidence tools

### Task 1: Test-report tool

**Files:** local-only `$toolRoot\test-report.cjs`, `$toolRoot\test-report.test.cjs`

- [ ] Write a failing fixture test that feeds TAP containing pass, fail, skip, todo, cancelled, duplicate names in different files, and a harness failure. Assert stable `file::test-name` IDs and complete totals.
- [ ] Run RED: `node "$toolRoot\test-report.test.cjs"`. Expected: module-not-found.
- [ ] Implement `parseTap(text)`, `run(command,args,cwd,outJson,outRaw)`, and `compare(baseline,final,affected)`; preserve raw TAP and environment metadata, never collapse duplicate names across files, and emit newly failing IDs as machine-readable JSON.
- [ ] Run GREEN: `node "$toolRoot\test-report.test.cjs"`. Expected: exit 0.

Exact clean-origin baseline command after GREEN, run before snapshot replacement in the release worktree:

```powershell
node "$toolRoot\test-report.cjs" run `
  --cwd "$releaseRoot" `
  --command npm.cmd `
  --args-json '["test"]' `
  --raw "$evidenceRoot\baseline-raw.tap" `
  --json "$evidenceRoot\baseline-origin-main.json"
```

Expected: JSON accounts for every pass/fail/skip/cancel/todo/harness outcome and records Node/npm/OS plus non-secret test switches. Do not run the full baseline suite in the authoritative production workspace.

### Task 2: Canonical snapshot-manifest tool

**Files:** local-only `$toolRoot\snapshot-manifest.cjs`, `$toolRoot\snapshot-manifest.test.cjs`

Canonical entry schema:

```json
{"path":"src/x.ts","type":"file","mode":"100644","size":123,"sha256":"...","source":"tracked"}
```

Directory entries use `type:"directory"`, mode `040000`, size `0`, and SHA-256 of the empty byte sequence. Approved untracked executable mode is derived from filesystem executable bits where meaningful, otherwise `100644` on Windows; the rule is deterministic and tested.

Explicit allowed untracked roots:

```text
backend/src, docs, electron, extension, public, release-notes,
resources, scripts, shared, skills, src, tests, tools
```

- [ ] Write failing fixture tests for tracked files, approved untracked files, empty directories, executable mode, Unicode/spaces, a `..` escape, absolute path, symlink/reparse escape, unknown untracked root, forbidden `.env`, and extra destination file.
- [ ] Run RED: `node "$toolRoot\snapshot-manifest.test.cjs"`. Expected: module-not-found.
- [ ] Implement `list-untracked`, `capture`, `compare`, `clear-destination`, and `copy` commands. `list-untracked` emits candidates only. `capture` and `copy` require `--approved-untracked <json>` and reject every untracked path not explicitly present in that reviewed list. `capture` and `compare` accept repeated `--release-only <relative-path>` arguments; those entries are emitted with source `release-only`, and `compare` may add them only on the destination/right side. `clear-destination` requires the registered worktree path/branch plus two literal release-only paths and deletes nothing outside it. `copy` accepts only a previously captured manifest, verifies both roots with `GetFinalPathNameByHandle`/realpath semantics, preserves mode, and rejects destination extras not listed as release-only exemptions.
- [ ] Run GREEN: `node "$toolRoot\snapshot-manifest.test.cjs"`. Expected: exit 0.

Capture command:

```powershell
node "$toolRoot\snapshot-manifest.cjs" list-untracked `
  --root "$productionRoot" `
  --git-root "$productionRoot" `
  --allow-untracked-roots "backend/src,docs,electron,extension,public,release-notes,resources,scripts,shared,skills,src,tests,tools" `
  --deny-file "$toolRoot\snapshot-deny.json" `
  --output "$evidenceRoot\untracked-candidates.json"
```

Review every emitted path. Create `$evidenceRoot\approved-untracked.json` containing explicit `{path,decision:"include",reason}` records; no wildcard approvals. Then capture:

```powershell
node "$toolRoot\snapshot-manifest.cjs" capture `
  --root "$productionRoot" `
  --git-root "$productionRoot" `
  --allow-untracked-roots "backend/src,docs,electron,extension,public,release-notes,resources,scripts,shared,skills,src,tests,tools" `
  --approved-untracked "$evidenceRoot\approved-untracked.json" `
  --deny-file "$toolRoot\snapshot-deny.json" `
  --output "$evidenceRoot\manifest-before.json"
```

Unknown or forbidden candidates produce nonzero exit and require updating the reviewed JSON, not an ad hoc CLI exclusion.

### Task 3: Secret-scanning tool

**Files:** local-only `$toolRoot\secret-scan.cjs`, `$toolRoot\secret-scan.test.cjs`, `$toolRoot\secret-rules.json`, `$toolRoot\secret-allowlist.json`

- [ ] Write failing fixture tests for private-key headers, GitHub/OpenAI/common API tokens, bearer and Basic-scheme HTTP headers, cookies, credential URLs, settings JSON, entropy candidates, binary skipping, allowed documented placeholders, and output redaction.
- [ ] Run RED: `node "$toolRoot\secret-scan.test.cjs"`. Expected: module-not-found.
- [ ] Implement commands `scan-tree`, `scan-manifest`, `scan-staged`, `scan-asar`, and `scan-assets`. Output JSON entries contain only `relativePath`, `ruleId`, and optional byte range—not the matched value. Allowlist entries require exact path+rule ID and a non-empty review reason; CLI exclusions are unsupported. Before the production snapshot commit, use a local empty allowlist and permit no false positives. After snapshot commit, create the committed empty `scripts/release-secret-allowlist.json`; any later false-positive entry must be committed and reviewed before rerunning.
- [ ] Run GREEN: `node "$toolRoot\secret-scan.test.cjs"`. Expected: exit 0.

Candidate-tree scan command:

```powershell
node "$toolRoot\secret-scan.cjs" scan-manifest `
  --root "$productionRoot" `
  --manifest "$evidenceRoot\manifest-before.json" `
  --rules "$toolRoot\secret-rules.json" `
  --allowlist "$toolRoot\secret-allowlist.json" `
  --output "$evidenceRoot\secret-production.json"
```

Expected: exit 0 and empty findings. Also run `npm --prefix "$productionRoot" run public:check`.

### Task 4: Release-evidence operational tool

**Files:** local-only `$toolRoot\release-evidence.cjs`, `$toolRoot\release-evidence.test.cjs`

- [ ] Write failing fixture tests for `discover-installers`, `extract-installer`, `inventory-packaging`, `affected-tests`, `inspect-artifacts`, and `smoke`. Assert literal paths, subprocess cleanup, timeout handling, and path-only reports.
- [ ] RED: `node "$toolRoot\release-evidence.test.cjs"`. Expected: module-not-found.
- [ ] Implement one subcommand at a time, rerunning the named fixture test after each subcommand; do not implement the next subcommand until the prior one is green. Required subcommands are `discover-installers`, `extract-installer`, `inventory-packaging`, `affected-tests`, `run-affected-tests`, `inspect-artifacts`, `smoke`, `state-init`, `state-transition`, `copy-build-inputs`, `seal-source`, `seal-artifacts`, and `verify-remote`.
- [ ] GREEN: `node "$toolRoot\release-evidence.test.cjs"`. Expected: exit 0.

These exact subcommands replace prose-only operational gates later in the plan.

### Task 5: Updater compatibility harness

**Files:** local-only `$toolRoot\updater-compat-harness.cjs`, `$toolRoot\updater-compat-harness.test.cjs`

- [ ] Write failing tests with fixture GitHub API responses, `latest.yml`, installer, and blockmap. Assert: a test HTTPS proxy presents a disposable trusted CA, maps only the expected GitHub API/download hosts and endpoints, serves verified draft bytes, logs blockmap/range requests, rejects unknown hosts, uses disposable userData/install paths, checks restart version/data preservation, and never modifies packaged files or production code.
- [ ] Run RED: `node "$toolRoot\updater-compat-harness.test.cjs"`. Expected: module-not-found.
- [ ] Implement subcommands `proxy-start`, `proxy-stop`, `preflight`, `run-proxied-update`, and `run-public-update`. `run-proxied-update` installs the test CA and proxy configuration only inside the disposable VM/Sandbox, launches the unmodified packaged 2.3.8 executable with its baked-in GitHub provider, and removes the proxy/CA when the disposable environment exits. It records updater events and validates downloaded blockmap/range requests. No alternate Electron bootstrap or production feed override is permitted.
- [ ] Run GREEN: `node "$toolRoot\updater-compat-harness.test.cjs"`. Expected: exit 0.

The real install/restart command is deferred until assets exist and runs only in Windows Sandbox/VM. Unit fixtures must pass now.

## Chunk 2: Capture and commit the exact production snapshot

### Task 6: Freeze baseline identities and installer eligibility

- [ ] Fetch and initialize exact state:

```powershell
git fetch origin main
node "$toolRoot\release-evidence.cjs" state-init `
  --production "$productionRoot" --release "$releaseRoot" `
  --repo "$repo" --tag "$tag" `
  --tool-root "$toolRoot" `
  --output "$evidenceRoot\run-state.json"
```

Expected: integration base equals fetched origin/main; active HEAD/porcelain-v2, worktree HEAD/status, timestamp, and tool hashes recorded.
- [ ] Run Task 1's exact baseline command against the clean `$releaseRoot` before snapshot replacement.
- [ ] Discover every candidate installer with an executable command:

```powershell
node "$toolRoot\release-evidence.cjs" discover-installers `
  --roots "$productionRoot\dist_electron,$productionRoot\release_packages" `
  --version 2.3.8 --output "$evidenceRoot\installer-candidates.json"
```

- [ ] Review the candidates against distribution records and create `$evidenceRoot\distributed-installers.json` listing every exact installer previously sent to users; no singular default is allowed.
- [ ] Extract and inspect every distributed installer:

```powershell
node "$toolRoot\release-evidence.cjs" extract-installer `
  --input-list "$evidenceRoot\distributed-installers.json" `
  --seven-zip "$releaseRoot\node_modules\7zip-bin\win\x64\7za.exe" `
  --output-root "$evidenceRoot\legacy-installer" `
  --report "$evidenceRoot\installer-cohorts.json"
```

Expected: each SHA-256/size and extracted `resources/app-update.yml` recorded. Require at least one fork-targeting cohort for the automatic-update claim; report every T8mars-targeting cohort as manual-migration-only rather than stopping other eligible cohorts.
- [ ] Inventory packaging inputs exactly:

```powershell
node "$toolRoot\release-evidence.cjs" inventory-packaging `
  --root "$productionRoot" --output "$evidenceRoot\packaging-inputs.json"
```

Expected: build.files, extraResources, encryption/runtime inputs, and `_post_build.cjs` requirements classified; `.agents/skills` reviewed build-only if required; missing/forbidden exits nonzero.

### Task 7: Capture two stable source manifests and copy

- [ ] Run the exact `list-untracked` and first `capture` commands from Task 2, inspect every candidate, and create `$evidenceRoot\approved-untracked.json` with one reviewed record per path. Then run candidate secret/public checks.
- [ ] Verify destination path equals the registered release worktree, branch equals `codex/production-release-v2.4.0`, and destination is not `$productionRoot`.
- [ ] Clear only the verified destination:

```powershell
node "$toolRoot\snapshot-manifest.cjs" clear-destination `
  --destination "$releaseRoot" `
  --expected-branch codex/production-release-v2.4.0 `
  --release-only "docs/superpowers/specs/2026-07-21-production-release-auto-update-design.md" `
  --release-only "docs/superpowers/plans/2026-07-22-production-auto-update-release.md"
```

- [ ] Capture source two and compare:

```powershell
node "$toolRoot\snapshot-manifest.cjs" capture --root "$productionRoot" --git-root "$productionRoot" `
  --allow-untracked-roots "backend/src,docs,electron,extension,public,release-notes,resources,scripts,shared,skills,src,tests,tools" `
  --approved-untracked "$evidenceRoot\approved-untracked.json" `
  --deny-file "$toolRoot\snapshot-deny.json" `
  --output "$evidenceRoot\manifest-after.json"
node "$toolRoot\snapshot-manifest.cjs" compare `
  --left "$evidenceRoot\manifest-before.json" --right "$evidenceRoot\manifest-after.json"
```

Expected: exact equality.

- [ ] Copy immediately with literal paths:

```powershell
node "$toolRoot\snapshot-manifest.cjs" copy `
  --manifest "$evidenceRoot\manifest-after.json" `
  --approved-untracked "$evidenceRoot\approved-untracked.json" `
  --source "$productionRoot" --destination "$releaseRoot" `
  --release-only "docs/superpowers/specs/2026-07-21-production-release-auto-update-design.md" `
  --release-only "docs/superpowers/plans/2026-07-22-production-auto-update-release.md"
```

- [ ] Immediately recapture and compare active source:

```powershell
node "$toolRoot\snapshot-manifest.cjs" capture --root "$productionRoot" --git-root "$productionRoot" `
  --allow-untracked-roots "backend/src,docs,electron,extension,public,release-notes,resources,scripts,shared,skills,src,tests,tools" `
  --approved-untracked "$evidenceRoot\approved-untracked.json" `
  --deny-file "$toolRoot\snapshot-deny.json" `
  --output "$evidenceRoot\manifest-after-copy.json"
node "$toolRoot\snapshot-manifest.cjs" compare `
  --left "$evidenceRoot\manifest-before.json" --right "$evidenceRoot\manifest-after-copy.json"
node "$toolRoot\snapshot-manifest.cjs" compare `
  --left "$evidenceRoot\manifest-after.json" --right "$evidenceRoot\manifest-after-copy.json"
node "$toolRoot\release-evidence.cjs" state-transition `
  --state "$evidenceRoot\run-state.json" --event source-rechecked `
  --production "$productionRoot" --evidence "$evidenceRoot\manifest-after-copy.json"
```

Expected: both comparisons exact; active HEAD and porcelain-v2 still equal state-init. Any mismatch clears the uncommitted candidate and restarts Task 7.

- [ ] Capture and compare destination with literal exemptions:

The destination Git baseline differs from the authoritative production `HEAD`, so destination provenance must not be inferred from the release branch index. Mechanically derive an exact destination approval file containing only the already reviewed `decision:"include"` records, then use a local alternate index seeded from the production `HEAD`. The alternate index is local evidence only and never replaces either worktree's real index.

```powershell
$approved = Get-Content -Raw "$evidenceRoot\approved-untracked.json" | ConvertFrom-Json
$approvalRecords = if ($null -ne $approved.records) { @($approved.records) } else { @($approved) }
$destinationApproved = @($approvalRecords | Where-Object decision -eq 'include')
$destinationApproved | ConvertTo-Json -Depth 10 | Set-Content -Encoding utf8 "$evidenceRoot\approved-untracked-destination.json"
git -C "$productionRoot" diff --cached --quiet
$productionHead = (git -C "$productionRoot" rev-parse HEAD).Trim()
$env:GIT_INDEX_FILE = "$evidenceRoot\destination-capture.index"
git -C "$releaseRoot" read-tree "$productionHead"
git -C "$releaseRoot" add -- `
  "docs/superpowers/specs/2026-07-21-production-release-auto-update-design.md" `
  "docs/superpowers/plans/2026-07-22-production-auto-update-release.md"
node "$toolRoot\snapshot-manifest.cjs" capture --root "$releaseRoot" --git-root "$releaseRoot" `
  --allow-untracked-roots "backend/src,docs,electron,extension,public,release-notes,resources,scripts,shared,skills,src,tests,tools" `
  --approved-untracked "$evidenceRoot\approved-untracked-destination.json" `
  --deny-file "$toolRoot\snapshot-deny.json" `
  --release-only "docs/superpowers/specs/2026-07-21-production-release-auto-update-design.md" `
  --release-only "docs/superpowers/plans/2026-07-22-production-auto-update-release.md" `
  --output "$evidenceRoot\manifest-destination.json"
Remove-Item Env:GIT_INDEX_FILE
node "$toolRoot\snapshot-manifest.cjs" compare `
  --left "$evidenceRoot\manifest-after-copy.json" `
  --right "$evidenceRoot\manifest-destination.json" `
  --release-only "docs/superpowers/specs/2026-07-21-production-release-auto-update-design.md" `
  --release-only "docs/superpowers/plans/2026-07-22-production-auto-update-release.md"
```

Expected: only the two declared right-side release documents differ; extras/missing/mode/hash differences fail.
- [ ] Run secret/public checks on destination.

### Task 8: Stage, affected-test inventory, and snapshot commit

- [ ] Run `git add -A`; inspect staged paths and scan them:

```powershell
git diff --cached --name-status
git diff --cached --stat
git diff --cached --check
node "$toolRoot\secret-scan.cjs" scan-staged --root "$releaseRoot" `
  --rules "$toolRoot\secret-rules.json" --allowlist "$toolRoot\secret-allowlist.json" `
  --output "$evidenceRoot\secret-staged-snapshot.json"
```

The snapshot remains byte-for-byte identical to production. If `git diff --cached --check` reports pre-existing production whitespace, record the exact path/line/message set plus the matching `manifest-after-copy.json` file hashes in `$evidenceRoot\diff-check-production-baseline.json`. Only that exact reviewed set is tolerated for the snapshot commit; any additional or changed finding blocks. Never edit only the release copy to silence a production-origin finding.

- [ ] Build affected-test inventory:

```powershell
node "$toolRoot\release-evidence.cjs" affected-tests `
  --root "$releaseRoot" --base origin/main `
  --output "$evidenceRoot\affected-tests-unreviewed.json"
```

Review every changed and unknown path. Create `$evidenceRoot\affected-tests-review.json` with `mode:"full-suite"`, a non-empty reason, the exact canonical unknown path list, and the exact canonical list of every current `tests/**` test/spec file; no wildcard, option-like, absolute, duplicate, missing, or extra path is allowed. Then seal the reviewed inventory:

```powershell
node "$toolRoot\release-evidence.cjs" affected-tests `
  --root "$releaseRoot" --base origin/main `
  --reviewed-mapping "$evidenceRoot\affected-tests-review.json" `
  --output "$evidenceRoot\affected-tests.json"
```

Unknown changed subsystems without this exact full-suite mapping block the snapshot. The runner re-enumerates the canonical root and full suite before execution.
- [ ] Run affected tests exactly:

```powershell
node "$toolRoot\release-evidence.cjs" run-affected-tests `
  --root "$releaseRoot" --inventory "$evidenceRoot\affected-tests.json" `
  --output "$evidenceRoot\affected-test-results.json"
```

Expected: zero failures, independent of baseline comparison.
- [ ] Commit: `git commit -m "release: snapshot current production workspace"`.
- [ ] Re-run manifest comparison against the active workspace. Expected: unchanged; otherwise reset only the isolated snapshot commit and repeat.

## Chunk 3: Implement updater and release state with TDD

### Task 9: Fork/version updater contract and committed scan allowlist

**Files:** `tests/electronUpdater.test.ts`, `package.json`, `package-lock.json`, `electron/main.cjs`, create `scripts/release-secret-allowlist.json`

- [ ] Add assertions for version `2.4.0`, GitHub provider `keroro900/hajimi-penguin-canvas`, releaseType `release`, hard-coded Electron version, artifact name, `autoDownload=false`, and `autoInstallOnAppQuit=false`.
- [ ] RED: `npm test -- tests/electronUpdater.test.ts`. Expected: provider/version assertions fail.
- [ ] Apply only version/provider synchronization changes and create committed `scripts/release-secret-allowlist.json` as `{"entries":[]}`. Add a test asserting scan commands accept no CLI exclusion and use only this committed file after snapshot.
- [ ] GREEN: same command. Expected: all pass.
- [ ] Stage exact files and audit before commit:

```powershell
git add -- package.json package-lock.json electron/main.cjs tests/electronUpdater.test.ts scripts/release-secret-allowlist.json
git diff --cached --name-only
git commit -m "fix: target fork auto-update release"
```

### Task 10: State machine foundation—source and tag transitions

**Files:** create `scripts/lib/release-state.cjs`, create `tests/releaseState.test.ts`

- [ ] Write RED tests only for: initial state, main pushed/tag absent, tag pushed/draft absent, missing local record, remote-main race, non-fast-forward rejection, and tag-target mismatch.
- [ ] RED: `npm test -- tests/releaseState.test.ts`. Expected: module-not-found.
- [ ] Implement the minimal state schema, `reduceReleaseState`, and fake Git adapter for source/tag actions only. Returned actions never contain force or retarget.
- [ ] GREEN: same command. Commit: `git add -- scripts/lib/release-state.cjs tests/releaseState.test.ts; git commit -m "test: define source release states"`.

### Task 11: State machine—draft assets and resume

- [ ] Add RED table rows for draft allocated; zero/one/two/three assets; each interrupted upload; same-name hash mismatch; draft DB ID/tag/target/title/body marker mismatch; failed upload/download; competing published release; and matching resume from every partial state.
- [ ] RED: run `tests/releaseState.test.ts`; expect new rows fail.
- [ ] Implement only draft identity, missing-asset action selection, and download/hash verification. Overwrite/clobber remains unrepresentable.
- [ ] GREEN, then stage/audit/commit:

```powershell
git add -- scripts/lib/release-state.cjs tests/releaseState.test.ts
git diff --cached --name-only
git commit -m "test: define resumable draft states"
```

### Task 12: State machine—publish, verification, and containment

- [ ] Add RED rows for draft verified, publish success/failure, public verified/failed, withdrawn, withdrawal failed, main changing immediately before publish, and recovery from each state.
- [ ] RED: run state tests; expect new rows fail.
- [ ] Implement publish eligibility and containment actions only for exact verified identities. Asset replacement/tag retarget remain impossible.
- [ ] GREEN, then stage/audit/commit:

```powershell
git add -- scripts/lib/release-state.cjs tests/releaseState.test.ts
git diff --cached --name-only
git commit -m "test: define release containment states"
```

### Task 13: Draft preparation and verification commands

**Files:** `scripts/release-github.cjs`, `scripts/verify-github-release.cjs`, `scripts/dist-release.cjs`, updater/state tests, `release-notes/v2.4.0.md`

- [ ] Add RED fake-adapter integration tests for `status|dry-run|prepare-draft|verify-draft`. Prove prepare can verify/push exact main+tag, allocate owned draft, and upload missing assets but cannot publish; verify-draft can only download/hash.
- [ ] RED: `npm test -- tests/electronUpdater.test.ts tests/releaseState.test.ts`.
- [ ] Implement only those four mode allowlists using the pure reducer and injectable GitHub adapter. Remove `--clobber`; `dist-release.cjs` builds only and prints the next explicit command.
- [ ] Write `release-notes/v2.4.0.md` with honest fork-eligible/manual-migration wording.
- [ ] GREEN, then stage/audit/commit:

```powershell
git add -- scripts/release-github.cjs scripts/dist-release.cjs scripts/lib/release-state.cjs tests/electronUpdater.test.ts tests/releaseState.test.ts release-notes/v2.4.0.md
git diff --cached --name-only
git commit -m "build: prepare verified update drafts"
```

### Task 14: Publish, public verification, and containment commands

- [ ] Add RED fake-adapter tests for `publish|verify-public|contain`; prove publish requires verified draft and performs no uploads/tag/source mutation, verify-public is read-only, and contain cannot upload/replace.
- [ ] RED: focused updater/state tests fail on missing modes.
- [ ] Implement those three allowlists and independent `verify-github-release.cjs` checks.
- [ ] GREEN: focused tests pass.
- [ ] Update release notes if needed, then stage/audit/commit:

```powershell
git add -- scripts/release-github.cjs scripts/verify-github-release.cjs scripts/lib/release-state.cjs tests/electronUpdater.test.ts tests/releaseState.test.ts release-notes/v2.4.0.md
git diff --cached --name-only
git commit -m "build: publish and contain verified updates"
```
- [ ] Dry-run exact command:

```powershell
$env:T8_RELEASE_APPROVAL='release-2.4.0'
$env:T8_RELEASE_REPO='keroro900/hajimi-penguin-canvas'
node scripts/release-github.cjs dry-run --state "$evidenceRoot\run-state.json"
```

Expected: fork/tag/source/assets/draft-only plan, zero remote writes, no empty repo.


## Chunk 4: Source and package verification

### Task 15: Source gates

- [ ] Run focused updater/state/packaging tests:

```powershell
npm test -- tests/electronUpdater.test.ts tests/releaseState.test.ts tests/electronPackaging.test.ts
```

Expected: zero failures.
- [ ] Run reviewed affected tests from `$evidenceRoot\affected-tests.json`; expected zero failures.
- [ ] Run `npm run type-check`; expected exit 0.
- [ ] Run `npm run public:check`; expected exit 0.
- [ ] Run and compare the full suite:

```powershell
node "$toolRoot\test-report.cjs" run --cwd "$releaseRoot" `
  --command npm.cmd --args-json '["test"]' `
  --raw "$evidenceRoot\final-raw.tap" --json "$evidenceRoot\final-tests.json"
node "$toolRoot\test-report.cjs" compare `
  --baseline "$evidenceRoot\baseline-origin-main.json" `
  --final "$evidenceRoot\final-tests.json" `
  --affected "$evidenceRoot\affected-tests.json" `
  --output "$evidenceRoot\test-comparison.json"
```

Expected: zero newly failing IDs, zero failed affected IDs, and zero updater/release failures even if historically present.
- [ ] Run `npm run build`; expected exit 0.
- [ ] Run final committed-tree scan with no CLI bypass:

```powershell
git diff --check
node "$toolRoot\secret-scan.cjs" scan-tree --root "$releaseRoot" `
  --rules "$toolRoot\secret-rules.json" `
  --allowlist "$releaseRoot\scripts\release-secret-allowlist.json" `
  --output "$evidenceRoot\secret-final-tree.json"
git status --porcelain
```

Expected: clean Git status and empty unallowed findings.

### Task 16: Build exactly once and inspect artifacts

- [ ] Copy/hash-verify only inventoried build inputs:

```powershell
node "$toolRoot\release-evidence.cjs" copy-build-inputs `
  --inventory "$evidenceRoot\packaging-inputs.json" `
  --source "$productionRoot" --destination "$releaseRoot" `
  --output "$evidenceRoot\copied-build-inputs.json"
node "$toolRoot\secret-scan.cjs" scan-manifest `
  --root "$releaseRoot" --manifest "$evidenceRoot\copied-build-inputs.json" `
  --rules "$toolRoot\secret-rules.json" `
  --allowlist "$releaseRoot\scripts\release-secret-allowlist.json" `
  --output "$evidenceRoot\secret-build-inputs.json"
```

Expected: hashes match inventory and no unallowed findings.
- [ ] Execute exact build:

```powershell
$env:T8_REQUIRE_AI_WATERMARK_RUNTIME='1'
$env:T8_REQUIRE_PARSEHUB_RUNTIME='1'
$env:T8_REQUIRE_RUNTIME_ARCHIVES='1'
$env:T8_REQUIRE_UPDATE_ARTIFACTS='1'
npm run dist
```

Expected: exit 0; NSIS and `_post_build.cjs` pass. Do not rebuild this version after hashes are sealed.

- [ ] Require these files: `dist_electron\JIMI AI-Setup-2.4.0.exe`, its `.blockmap`, and `latest.yml`.
- [ ] Verify version/repository metadata with an executable command:

```powershell
node "$toolRoot\release-evidence.cjs" inspect-artifacts `
  --root "$releaseRoot" --version 2.4.0 `
  --repo keroro900/hajimi-penguin-canvas `
  --output "$evidenceRoot\artifact-inspection.json"
```

Expected: package/lock/Electron/EXE/file names/latest.yml all 2.4.0 and packaged app-update.yml uses the fork.
- [ ] Run package scans:

```powershell
node "$toolRoot\secret-scan.cjs" scan-asar `
  --asar "$releaseRoot\dist_electron\win-unpacked\resources\app.asar" `
  --unpacked "$releaseRoot\dist_electron\win-unpacked\resources\app.asar.unpacked" `
  --rules "$toolRoot\secret-rules.json" `
  --allowlist "$releaseRoot\scripts\release-secret-allowlist.json" `
  --output "$evidenceRoot\secret-package.json"
node "$toolRoot\secret-scan.cjs" scan-assets `
  --root "$releaseRoot\dist_electron" --version 2.4.0 `
  --rules "$toolRoot\secret-rules.json" `
  --allowlist "$releaseRoot\scripts\release-secret-allowlist.json" `
  --output "$evidenceRoot\secret-assets.json"
```

Expected: empty unallowed findings.
- [ ] Record and seal artifact hashes:

```powershell
node "$toolRoot\release-evidence.cjs" seal-artifacts `
  --state "$evidenceRoot\run-state.json" `
  --root "$releaseRoot\dist_electron" --version 2.4.0 `
  --output "$evidenceRoot\artifact-hashes.json"
```

Expected: exactly installer, blockmap, and latest.yml sealed with size/SHA-256/SHA-512.
- [ ] Smoke launch with lifecycle management:

```powershell
node "$toolRoot\release-evidence.cjs" smoke `
  --exe "$releaseRoot\dist_electron\win-unpacked\JIMI AI.exe" `
  --user-data "$evidenceRoot\smoke-userdata" `
  --expected-version 2.4.0 --timeout-ms 90000 `
  --output "$evidenceRoot\smoke.json"
```

Expected: readiness observed, clean shutdown/forced-cleanup fallback recorded, child processes gone, normal userData paths unchanged.

- [ ] Create and verify disposable environment before any source push:

```powershell
node "$toolRoot\updater-compat-harness.cjs" preflight `
  --evidence-root "$evidenceRoot" `
  --tools "$toolRoot" `
  --draft-assets "$evidenceRoot\draft-download" `
  --output-config "$evidenceRoot\sandbox.wsb" `
  --output "$evidenceRoot\sandbox-preflight.json"
```

Expected: Windows Sandbox/VM available; configuration maps only evidence/tools directories, provides isolated networking, and rejects production/userData mounts. Draft assets may not exist yet, but their future evidence path must be mappable. If unavailable, stop before Task 17.

## Chunk 5: Push source, prepare verified draft, and test compatibility

### Task 17: Push exact source and tag without force

- [ ] Execute the mandatory immediately-before-write remote gate:

```powershell
git fetch origin main
node "$toolRoot\release-evidence.cjs" verify-remote `
  --state "$evidenceRoot\run-state.json" --repo "$repo" `
  --expect-main-from-state integrationBase `
  --tag v2.4.0 --allow-tag-state absent-or-owned `
  --allow-release-state absent-or-owned `
  --forbid-competing-published `
  --output "$evidenceRoot\remote-prewrite.json"
node "$toolRoot\release-evidence.cjs" state-transition `
  --state "$evidenceRoot\run-state.json" --event remote-prewrite-verified `
  --evidence "$evidenceRoot\remote-prewrite.json"
```

Expected: remote main equals recorded integration base; tag and draft/release are absent or exactly owned by this run record; no competing published Release exists. Any mismatch stops before the first push.
- [ ] Seal and assign current source SHA:

```powershell
$sealedSha = (git rev-parse HEAD).Trim()
if ($sealedSha -notmatch '^[0-9a-f]{40}$') { throw 'invalid sealed SHA' }
node "$toolRoot\release-evidence.cjs" seal-source `
  --state "$evidenceRoot\run-state.json" --sha "$sealedSha" `
  --root "$releaseRoot" --artifact-hashes "$evidenceRoot\artifact-hashes.json"
```

Expected: clean worktree, integration base unchanged, artifacts sealed.
- [ ] Execute `git push origin "${sealedSha}:refs/heads/main"`; non-fast-forward failure stops.
- [ ] Verify and record main:

```powershell
node "$toolRoot\release-evidence.cjs" verify-remote `
  --state "$evidenceRoot\run-state.json" --repo "$repo" `
  --expect-main "$sealedSha" --output "$evidenceRoot\remote-main.json"
node "$toolRoot\release-evidence.cjs" state-transition `
  --state "$evidenceRoot\run-state.json" --event main-pushed `
  --evidence "$evidenceRoot\remote-main.json"
```

- [ ] Create/push tag without force and verify:

```powershell
git tag v2.4.0 "$sealedSha"
git push origin "${sealedSha}:refs/tags/v2.4.0"
node "$toolRoot\release-evidence.cjs" verify-remote `
  --state "$evidenceRoot\run-state.json" --repo "$repo" `
  --expect-main "$sealedSha" --expect-tag v2.4.0 `
  --output "$evidenceRoot\remote-tag.json"
node "$toolRoot\release-evidence.cjs" state-transition `
  --state "$evidenceRoot\run-state.json" --event tag-pushed `
  --evidence "$evidenceRoot\remote-tag.json"
```

Expected: main and resolved tag equal sealed SHA; never force/retarget.

### Task 18: Prepare and verify Draft Release

- [ ] Prepare draft only:

```powershell
node scripts/release-github.cjs prepare-draft --state "$evidenceRoot\run-state.json"
```

Expected: owned draft allocated, missing assets uploaded without clobber, state records database ID; command has no publish capability.

- [ ] Verify draft only:

```powershell
node scripts/release-github.cjs verify-draft --state "$evidenceRoot\run-state.json"
```

Expected: all three assets downloaded under `$evidenceRoot\draft-download`, hashes match sealed files, state `draft-verified`; command has no publish capability.

### Task 19: Run pre-public compatibility from verified draft bytes

- [ ] Require the successful Sandbox/VM preflight from Task 16. If unavailable, leave Release draft and stop.
- [ ] Run each fork-eligible 2.3.8 cohort through one harness command that owns proxy start, readiness, application execution, and cleanup in an internally tested `try/finally`, while leaving the packaged application and baked-in provider unmodified:

```powershell
node "$toolRoot\updater-compat-harness.cjs" run-proxied-update `
  --installer-list "$evidenceRoot\installer-cohorts.json" `
  --draft-root "$evidenceRoot\draft-download" `
  --sandbox-config "$evidenceRoot\sandbox.wsb" `
  --expected-version 2.4.0 `
  --proxy-log "$evidenceRoot\local-feed.json" `
  --evidence "$evidenceRoot\compat-local.json" `
  --cleanup-evidence "$evidenceRoot\compat-local-cleanup.json"
```

Expected: check, differential/blockmap download, install, restart as 2.4.0, fixture preserved, no production paths touched, and cleanup evidence proves proxy process/CA/proxy settings were removed even after failure.

## Chunk 6: Publish, verify, and contain if needed

### Task 20: Publish the already verified draft

- [ ] Re-fetch/revalidate main, tag, draft DB identity/title/body marker, three draft hashes, sealed artifacts, clean source, and no competing release.
- [ ] Publish exact command:

```powershell
node scripts/release-github.cjs publish --state "$evidenceRoot\run-state.json"
```

Expected: existing verified draft becomes public Latest; no uploads/tag edits/source pushes.

### Task 21: Public unmodified-client verification

- [ ] Run read-only remote verification:

```powershell
node scripts/release-github.cjs verify-public --state "$evidenceRoot\run-state.json"
node scripts/verify-github-release.cjs v2.4.0
```

Expected: main/tag/source, Latest, asset names/sizes/hashes, `latest.yml`, and fork metadata all match.

- [ ] In Sandbox/VM run the eligible unmodified 2.3.8 installer with its baked-in GitHub provider:

```powershell
node "$toolRoot\updater-compat-harness.cjs" run-public-update `
  --installer-list "$evidenceRoot\installer-cohorts.json" `
  --sandbox-config "$evidenceRoot\sandbox.wsb" `
  --expected-repo keroro900/hajimi-penguin-canvas `
  --expected-version 2.4.0 `
  --evidence "$evidenceRoot\compat-public.json"
```

Expected: public check/download/install/restart/data preservation succeeds.

### Task 22: Explicit recovery transitions

At every command failure, save the reducer state and exact remote readback. Never replace assets or retarget tags.

- [ ] Main pushed/tag absent: resume only tag creation after main SHA match.
- [ ] Tag pushed/draft absent: resume only draft creation after tag/main match.
- [ ] Draft partially uploaded: upload only missing names after every existing hash matches.
- [ ] Draft verification failed: keep draft; no publish; changed bytes require `v2.4.1`.
- [ ] Publish failed: re-read draft; retry publish only if same verified DB identity/assets/state.
- [ ] Post-public verification failed: run containment:

```powershell
node scripts/release-github.cjs contain --state "$evidenceRoot\run-state.json"
```

Expected: withdraw to draft/remove Latest without asset mutation. If containment fails, record `containment-failed`, stop all writes, report public exposure, and require human action.

## Chunk 7: Completion

### Task 23: Final review and handoff

- [ ] Use `superpowers:verification-before-completion`; re-run focused source and remote read-only verification.
- [ ] Use `superpowers:requesting-code-review`; review snapshot boundary, updater UI behavior, state machine, secrets, artifacts, and remote proof.
- [ ] Fix code only with new failing tests. Any binary-changing fix uses a new patch version and new build.
- [ ] Use `superpowers:finishing-a-development-branch`; retain worktree until public updater proof is complete.
- [ ] Report source SHA, tag, Release URL, asset sizes/hashes, eligible legacy installer SHA/provider, exact tests, remaining baseline failures, migration coverage, and any containment/recovery action.
