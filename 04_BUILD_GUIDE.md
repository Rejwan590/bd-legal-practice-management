# 04 - FULL BUILD GUIDE: finish the app, one checked section at a time

## How to use this guide
- Work through the phases in order. Never start the next module until the current module's CHECKLIST passes.
- Each module has: what it does, what it connects to, a checklist you test by hand, and "room for improvement" ideas that you only build AFTER the checklist passes.
- After every module: run the app, tick the checklist, commit to Git, update PROGRESS.md.
- The tool chain: Gemini (prototype) -> Claude (review/fix) -> Antigravity (backend) -> Codex (hardening). Prompts are in 01_PROMPTS.md.

---

## PHASE 0 - Setup (day 1)
1. Verify GitHub Student Pack. Claim DigitalOcean credit and the free domain. Set billing alerts everywhere and note the credit expiry date.
2. Create a PRIVATE GitHub repo. Folders: /app, /server, /docs. Put ARCHITECTURE.md, PROGRESS.md, BUILD_GUIDE.md in /docs.
3. Accounts: Cloudflare (free), Backblaze B2 or Cloudflare R2, UptimeRobot, Sentry.
4. Install locally: Node LTS, Docker Desktop, Git, VS Code.

CHECKLIST: repo exists and is private; billing alerts on; docs committed.

## PHASE 1 - Prototype with Gemini (frontend only, dummy data)
Run Stage 1 to Stage 10 from 01_PROMPTS.md. After each stage open /health and confirm all PASS before typing the next stage. Download ZIP, commit as "prototype from Gemini".

## PHASE 2 - Claude review and fix
Run the Claude prompt. Read its report. Approve fixes. Commit.
CHECKLIST: build passes; type-check passes; tests pass; no Firebase; no direct storage access in screens; no hardcoded text.

## PHASE 3 - Backend, module by module (Antigravity)
Build in THIS order because each module needs the previous one.

### 3.0 Foundation: server, database, auth
- Docker Compose with api + postgres locally. Migrations tool set up. Health endpoint GET /api/v1/health.
- Tables: firms, plans, users, audit_log. Login with hashed passwords (argon2 or bcrypt), short-lived tokens, rate limiting on login, logout.
- Permission middleware and firm_id isolation on every query.
- Connects to: everything. All later modules depend on it.
CHECKLIST
- [x] Owner can log in; wrong password is rejected; 6 quick wrong attempts get rate-limited.
- [x] Staff user cannot call an Owner-only endpoint (returns 403).
- [x] User of Firm A cannot read anything of Firm B (test with two firms).
- [x] Every write creates an audit_log row.
- [x] Frontend login now uses the real API.
Room for improvement later: 2-step login, password reset by email, session list, "log out everywhere".

### 3.1 Clients
- Table, CRUD API, search, soft delete, client profile endpoint returning the client's cases/tasks/files counts.
CHECKLIST
- [x] Create, edit, search by Bangla and English name.
- [x] Soft delete warns when the client has cases and does not orphan them.
- [x] Staff without clients.edit cannot edit.
- [x] Audit log shows who did what.
Room for improvement: duplicate-phone warning, client tags, notes timeline, Excel import.

### 3.2 Cases
- Table, CRUD, filters (status, court, matter type, client), restricted cases, file serial uniqueness per firm.
CHECKLIST
- [x] Case requires a client; client profile lists the case.
- [x] Restricted case is invisible to staff without restricted.view (check API, not only UI).
- [x] Duplicate case number in the same court gives a warning.
- [x] Closing a case keeps all linked records.
Room for improvement: conflict-of-interest check across parties, case timeline, case notes, opposing counsel directory.

### 3.3 Hearings with date history
- hearings + hearing_date_history. Changing a date writes history. cases.next_hearing_at is kept in sync.
CHECKLIST
- [ ] Change a hearing date: old date, new date, reason, user are saved.
- [ ] Case page shows previous, current, next hearing.
- [ ] Adjourned hearing creates the next hearing in one step.
- [ ] Case's next_hearing_at updates immediately.
- [ ] Audit log has the change.
Room for improvement: court holiday warning, weekend warning, bulk adjourn from a cause list, order sheet notes.

### 3.4 Tasks
- Table, assignment, statuses, overdue computed on the server, staff see only their tasks unless tasks.view_all.
CHECKLIST
- [ ] Owner assigns a task to Karim; Karim sees it, Rahim (other staff) does not.
- [ ] Karim marks it complete; Owner sees completion and who/when.
- [ ] Overdue tasks appear in overdue list and dashboard.
- [ ] Task linked to a case appears on that case.
Room for improvement: recurring tasks, checklists/subtasks, comments, task templates (e.g. "new case" bundle).

### 3.5 Physical file tracking
- physical_files + file_movements. Serial generator F-000001 per firm.
CHECKLIST
- [ ] New file gets next serial automatically; no duplicates even with two users at once.
- [ ] Check out to Ahmed: status and holder change; history row added.
- [ ] Cannot check out a file already out; must check in first.
- [ ] Overdue file (past due-back) shows on dashboard.
- [ ] File shows on case page and client page.
Room for improvement: barcode/QR labels printed from the app, scan to check out, shelf locations.

### 3.6 Calendar and reminders
- Calendar feed from hearings, task deadlines, file due-backs. reminders table. A scheduled job (cron inside the api container) creates due reminders and Web Push.
CHECKLIST
- [ ] A hearing tomorrow appears on the calendar and creates a reminder 1 day and 2 hours before.
- [ ] Change the hearing date: calendar and reminders move automatically.
- [ ] Completing a task removes its pending reminder.
- [ ] Reminder inbox shows sent reminders ("reminder sent" status).
- [ ] Printable daily cause list works with Bangla font.
Room for improvement: SMS channel (prepaid credits), email, Google Calendar export (.ics first, API later), per-user reminder settings.

### 3.7 Dashboard and global search
CHECKLIST
- [ ] Dashboard shows: today's hearings, overdue tasks, files out, next 7 days.
- [ ] Search finds clients, cases, files, tasks, respects permissions and firm_id.
- [ ] Restricted cases never appear for staff in search results.
Room for improvement: saved filters, reports (cases by court, by status), weekly summary email.

### 3.8 Backup and restore
- Server: nightly pg_dump to B2/R2, 14 to 30 days kept. User: encrypted export/restore, last-backup banner, optional folder backup on desktop Chrome/Edge.
CHECKLIST
- [ ] Export, wipe a test firm, restore: all counts and links match.
- [ ] Wrong password cannot open an encrypted backup.
- [ ] Corrupted file is rejected by checksum.
- [ ] Banner turns to warning after 7 days.
- [ ] Server dump restores into a fresh test database (do this monthly).
Room for improvement: Google Drive backup, automatic folder backup on app close, backup size/time report.

### 3.9 Subscription, licensing, admin page
- plans, payments, firms.license_expires_at. Admin page (you only): firm list, record payment (method, txn ID), Activate/Extend/Suspend. Expiry: grace period then read-only.
CHECKLIST
- [ ] Record a bKash payment: expiry extends by the plan duration.
- [ ] After expiry plus grace: every write endpoint returns "read-only" but reads and export still work.
- [ ] Reminders to the firm 7 days and 1 day before expiry.
- [ ] Only your admin account can open the admin page.
Room for improvement: automated gateway (bKash/SSLCommerz/aamarPay), invoices/receipts PDF, coupons, founder-price lock dates.

### 3.10 Language and PWA polish
CHECKLIST
- [ ] Every screen works in English and Bangla; no text is cut off.
- [ ] PDFs show Bangla correctly.
- [ ] App installs; offline read-only shows today's hearings and recent cases; "Update available" prompt works; navigator.storage.persist() is requested; minimum-version check works.
Room for improvement: Bangla digits option, bigger-text mode for older users.

## PHASE 4 - Deploy (Droplet + Caddy + Cloudflare)
1. Create the Droplet (Ubuntu LTS, Singapore, 1 to 2 GB, SSH key). Create a non-root user, disable password SSH, enable the cloud firewall (22, 80, 443), automatic security updates, Droplet backups.
2. Install Docker. Run api + postgres + caddy with Docker Compose. Postgres port is NOT exposed to the internet.
3. Put the domain on Cloudflare (change nameservers). Add an A record to the Droplet IP.
4. Caddy gets the HTTPS certificate. Set Cloudflare SSL mode to Full (strict).
5. GitHub Actions: on push to main, run tests, build, deploy over SSH, restart containers. Keep a staging copy first.
6. Nightly backup job, UptimeRobot, Sentry, billing alerts.
CHECKLIST
- [ ] https://yourdomain works; http redirects to https.
- [ ] Port 5432 is unreachable from outside.
- [ ] Restore test of a server backup succeeded.
- [ ] Alert fires when you stop the api container on purpose.

## PHASE 5 - Hardening (Codex review) and pilot
- Run the Codex review prompt. Fix Critical items.
- Draft terms of service, privacy policy, reminder disclaimer; lawyer review.
- Pilot with one lawyer for 10 to 15 days. Ask: what is confusing, missing, unnecessary, too many clicks, what would you pay?
- Refine, test with a staff member and a second firm, then launch to 10 to 20 firms at founder price.

## THE "EVERYTHING IS CONNECTED" TEST (run before the pilot)
1. Create client Rahim -> create Case 102 for Rahim -> add hearing for tomorrow.
2. Calendar shows it. Reminder exists. Dashboard shows it under today/tomorrow.
3. Assign task "Prepare affidavit" on Case 102 to Karim. Karim logs in and sees it.
4. Create file F-000001 for Case 102 and check it out to Ahmed. File shows on case and client pages.
5. Change the hearing date with a reason. History, next hearing, calendar, reminder, dashboard and audit log all update.
6. Make Case 102 restricted. Karim cannot see it in list, search, calendar, dashboard or task links.
7. Soft-delete Rahim: you get a warning about linked records.
8. Export backup, wipe test firm, restore. Everything above is back.
9. Expire the subscription. Writes are blocked; reading and export still work.
If any step fails, fix it before the pilot.

---

# WHY YOU NEED POSTGRESQL, CADDY AND CLOUDFLARE

## PostgreSQL: the database
A database is the app's permanent memory. Without it, cases, clients and hearings would vanish when the server restarts.
- **Shared by everyone:** the lawyer, Karim and your phone all read the same data, which is what staff logins, task assignment and reminders need.
- **Relationships are enforced:** client -> cases -> hearings -> tasks -> files are linked tables with foreign keys, so you cannot leave a hearing pointing at a deleted case by accident.
- **Safe changes:** transactions mean a hearing date change and its history row are saved together or not at all. Migrations let you add features later without losing data.
- **Reliable and free:** mature, open source, easy to back up with pg_dump, and runs fine on a small Droplet for 20 firms.
- **Why not browser storage:** IndexedDB can be wiped by the user and cannot be shared between devices.
Keep it private: Postgres should only talk to your api inside Docker, never to the internet.

## Caddy: the front door of your server
Caddy is a web server that sits in front of your api.
- **Automatic HTTPS:** it gets and renews free certificates by itself. HTTPS is required for PWAs, service workers, push notifications and login security. Without it, passwords travel in the clear.
- **Reverse proxy:** the outside world only reaches Caddy on ports 80 and 443. Caddy passes requests to your api, so the api and database stay hidden.
- **Simple:** a few lines of config instead of the long setup other servers need, which suits a solo founder.
- **Extras:** compression, security headers, serving the frontend files, and redirecting http to https.

## Cloudflare: the shield and the map
Cloudflare sits between your users and your server.
- **DNS:** it is where your domain points to your Droplet. Fast, free, and easy to change (for example if you move servers later) without touching the app.
- **Protection:** hides your server's real IP, blocks many attacks and bots, absorbs DDoS traffic, and can rate-limit login pages. Important for a product holding privileged legal data.
- **Speed:** caches the frontend files near the user, so the PWA loads faster, helpful on slower connections.
- **Free SSL and Pages:** can host the PWA frontend for free (Cloudflare Pages) if you prefer not to serve it from the Droplet.
- **R2 storage:** an optional cheap place for your off-site nightly backups.
- **Caveats:** use SSL mode Full (strict) so the Cloudflare-to-server leg is encrypted too. Do not cache API responses that contain private data. Cloudflare is optional for the pilot but worth adding before real firms use it.

## How they fit together
User's browser -> Cloudflare (DNS, protection, caching) -> Caddy (HTTPS, routing) -> your API -> PostgreSQL (data) -> nightly backup to B2/R2.
