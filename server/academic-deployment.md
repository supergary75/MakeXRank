# Coach workbench and academic sync rollout

The implementation is checked locally; actual host updates are recorded below. A local build alone does not deploy the API, migrate private rosters or install an app on a coach's phone.

## Verified rollout: 2026-10-19

- Published the working-tree Tencent build and matching API to the existing host. Public entry: `https://81.70.62.5/MakeXRank/?version=coach-20261019#view=coach-workbench`. This rollout does not imply a GitHub push; the previous committed revision remains separate from these working-tree changes.
- Live Nginx routes this app through `/MakeXRank/api/`, not root `/api/` (a different application). Authentication and academic build settings now both use the project prefix, protected by a deployment regression test.
- Verified private backups in `/home/ubuntu/makexrank-backups/coach-20261019`: PostgreSQL custom dump checked by `pg_restore --list`, frontend/API archives and private service/Nginx configuration. Native PostgreSQL schema rehearsal completed inside a transaction and rolled back before activation.
- Retained all six existing accounts, password hashes, roles/scopes and the JWT secret. Post-rollout fingerprints matched the originals. Existing data counts remained: 29 competition rows, one training-sync row, one logistics-sync row, three practice-sync rows and one team-tag-sync row.
- After explicit owner confirmation, inserted the recovered 15-class/91-member roster into the private academic tables, retaining original student IDs. Used the same server validators, sorted per-class advisory locks and one short insert-only transaction; no existing roster was overwritten and no attendance was created. Import audit actor explicitly identifies the owner-confirmed server-admin import, not an interactive account login. Source and verification report remain outside webroot in the private release folder; source is mode 0600 inside a mode 0700 directory.
- Verified coach totals: Brook six classes/36 students; Vincent five/29; Gary four/26. Other accounts with no assigned class remain unassigned; do not grant additional access based solely on an admin role or display name.
- Public `/MakeXRank/api/health` returned 200; anonymous `/MakeXRank/api/academic/snapshot` returned 401. Browser checks confirmed the public workbench, attendance login gate, full website, return navigation and username/password login form. No real-user password login or attendance submission was performed by the agent; the owner is testing those interactively. Physical-phone installation remains unverified.
- Local checks: 166 client tests and 17 isolated PostgreSQL/HTTP server tests passed; Tencent production build passed. Existing bundle-size/optional-image warnings remain.
- Main archive: `makexrank-coach-20261019-1824.tar.gz`, SHA-256 `f22dd748b378eec6497a1a3a7a0b1c2d2f4bf908081b7a9cf133250137cf35d1`. Final frontend copy/cache-v7 delta: `makexrank-coach-ui-20261019-1838.tar.gz`, SHA-256 `0c82ff7fe4a23ac1b7183509b88410d568a59d14e027a2d6b2e67a59a9e13fa8`. Previous production node_modules are retained at `/opt/makexrank/node_modules.pre-coach-20261019`; keep academic tables and imported records during any code rollback.

## Components

- `/MakeXRank/#view=coach-workbench`: mobile club home with separate **快速点名** and **完整网站** entries. The PWA manifest starts here, not inside attendance. `/MakeXRank/#view=weekly-roll-call` is the compact attendance screen with a return-to-workbench button. The full website preserves its routes, login and permissions and offers a workbench return entry.
- `server/academic.mjs`, `academic-workflow.mjs`, `academic.sql`: authenticated Tencent PostgreSQL API for rosters, attendance, holidays and append-only history. These files and `shared/classDirectory.mjs` must accompany `server/app.mjs` in releases.
- `src/services/academicCloud.ts`: production builds use same-origin `/api/academic`. Development stays local-only unless `VITE_ACADEMIC_API_URL` is explicitly configured. Use the same Tencent authentication service/token issuer for an actual cloud-connected development environment.
- The live multi-site Nginx configuration uses `/MakeXRank/api/` for this project. `.env.tencent` explicitly points both authentication and academic requests at `/MakeXRank/api`. The root `/api/` belongs to a different hosted application; do not change that route or send project credentials there.
- Data stays private: no student names in public seed files, JS bundles, GitHub or screenshots. PostgreSQL tables are not exposed through the legacy generic REST table allowlist.

## Required before rollout

1. From the browser containing the real roster/history, open the migration section and download **教务本地备份**. Keep it outside the repository/webroot. The existing 91-member roster JSON can also be read, but a roster-only file contains no attendance history.
2. Back up the live PostgreSQL database using the existing private server environment. Verify the dump before updating the API. The earlier October 14 frontend/API backups are **not** a verified database backup.
3. Retain the existing `DATABASE_URL`, `JWT_SECRET`, profiles, password hashes, refresh tokens, service user and Nginx routes. Do not run bootstrap/reset/import scripts or replace the database.
4. Use a publicly reachable HTTPS origin with a trusted certificate. Never distribute the localhost preview URL. Installation varies by device/browser; installation does not itself move legacy browser storage.

## Deployment order

1. Back up and stage a versioned API release. Include `server/academic*.mjs`, `server/academic.sql`, `shared/classDirectory.mjs`, existing interview/curriculum files and production dependency lockfile.
2. `mountAcademicRoutes` creates only the four new `academic_*` tables/indexes. It does not modify or delete existing users or competition/training data. The API account needs permission to create these tables. Rehearse on a staging PostgreSQL database first.
3. Restart the existing API, check `/api/health`, then authenticate and check `/api/academic/snapshot`. Confirm anonymous requests are rejected, a coach sees only assigned classes, and Gary/Lisa can view all classes. Viewer roles never write.
4. Publish the matching Tencent frontend build only after the API is available. If the new API is unavailable, the production UI blocks saves instead of silently switching to local-only storage.
5. In Gary/Lisa's actual signed-in browser, read the old local data or select the downloaded JSON backup. Review counts, download a backup, and explicitly confirm migration to Tencent. Imports are insert-only and atomic; same-class rosters and same-date/class/session records already in the cloud are skipped, not merged or replaced. Review skipped/conflicting records separately. No legacy browser key is cleared.
6. Verify on two real accounts/devices. Have a coach submit one genuine current lesson, then have the manager refresh the summary. Do not fabricate real-student attendance for tests. Snapshots refresh when visible every minute and on focus/reconnection, with a manual refresh button.
7. Add **俱乐部工作台** to each phone's home screen, then sign in in that installed app. Test both the attendance and full-website entries on actual iPhone/Android hardware; physical-device installation has not been verified by automated tests.

## Save and recovery behavior

- Each class roster and attendance lesson has an independent revision. Old devices receive a conflict instead of replacing the latest record. Writes are authenticated and checked on the server.
- A correction draft retains the last submitted snapshot for statistics until resubmission. Removed roster members retain their historical attendance IDs.
- Attendance and holiday writes share a short per-day transaction lock, so a holiday cannot silently erase an existing lesson. Future actual attendance is rejected server-side.
- Cached data is separated by backend and account. Offline caches are read-only; this version does **not** queue offline attendance for automatic replay. Reconnect before recording.
- Failed write attempts get a separate account-scoped local backup when browser storage permits. Use **下载未保存修改备份** and manually reconcile it; never force a stale request over a newer revision. A successful server save is still a success if its local cache cannot be written.
- Alert-rule preferences and follow-up flags remain local-only. Closed apps do not send background/WeChat reminders. Substitute teaching currently requires existing class access; this change does not grant all teachers access to other teachers' rosters.

## Rollback

Restore the prior frontend/API release and its production dependencies; retain all `academic_*` tables and backups. Do not drop academic tables or clear browser storage to roll back. Confirm existing account login and training/competition pages still work. Never log or publish database credentials, private rosters, attendance reasons or failed-write backups.

## Verification

`npm test` runs frontend regressions and isolated in-memory PostgreSQL/HTTP integration tests (`server/academic.test.mjs`). Test identities are synthetic and never uploaded to the real database. These checks do not replace a native PostgreSQL concurrency rehearsal or real-device installation testing.
