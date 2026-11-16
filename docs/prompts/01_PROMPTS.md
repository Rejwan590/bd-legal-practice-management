# 01 - PROMPTS FOR EACH TOOL (copy and paste)

Chain: **Gemini (AI Studio) -> Claude -> Antigravity -> Codex**

Golden rules for every step:
- Never put real client data, passwords, or server keys into any tool. Use dummy data only.
- Git is the single source of truth. Commit after every working module.
- Always give the tool 02_ARCHITECTURE.md and 03_PROGRESS.md. They are the shared memory.
- Never let two tools edit the same files at the same time.

---

## STEP 1 - GEMINI / AI STUDIO (Build mode): the prototype

Paste this as your first message. Then continue with the Stage prompts below, one at a time.

```
You are building the FRONTEND PROTOTYPE of a legal practice management web app (PWA) for law firms in Bangladesh. This prototype will later be connected to a real backend, so structure matters more than looks. Use DUMMY DATA ONLY.

TECH RULES
- React + TypeScript + Vite. Tailwind for styling. Mobile-friendly, works on desktop and Android browsers.
- DO NOT use Firebase or any cloud service. No external backend.
- All data access goes through a "data layer" in /src/data using repository interfaces (e.g. ClientRepository, CaseRepository). For this prototype, implement them with an in-memory store persisted to localStorage. Screens must NEVER read or write storage directly, only call repositories. Later the repositories will be swapped for a REST API without changing screens.
- Bangla and English from day one: use react-i18next with /src/locales/en.json and bn.json. No hardcoded UI text anywhere. Add an EN / বাংলা toggle in the header. Use the Noto Sans Bengali font.
- Every record has: id (UUID), firmId, createdAt, updatedAt, deletedAt (soft delete only, never hard delete), createdBy, updatedBy.
- Permissions: one central file /src/permissions.ts with permission keys (cases.view, cases.create, cases.edit, cases.delete, hearings.update, clients.view, clients.edit, tasks.view, tasks.assign, tasks.complete, files.view, files.manage, billing.view, settings.manage, users.manage, restricted.view, data.export). Roles: Owner (all permissions) and Staff (a configurable subset). Screens and buttons check permissions through ONE helper, can(permission). Hidden or disabled UI is not enough; also check inside repository methods.
- Audit log: every create, update, delete, hearing-date change, file check-out/in, task assignment and login is written to an audit log (who, what, when, old value, new value). Provide an Audit Log screen for Owners.
- Each module lives in its own folder: /src/modules/<name>/ with its own screens, components, types, and a small README.md saying what it does and what it connects to.

MODULES (build in the order of the stages I give you)
1. Foundation: app shell, mock login (Owner and Staff demo users), role/permission system, i18n, data layer, audit log, settings, and a HEALTH page.
2. Clients: name, phone, address, notes. One client has many cases. Client profile shows all their cases, tasks and files.
3. Cases: file serial number, case number, court, matter type, description, plaintiff, defendant, our role, plaintiff's lawyer, defendant's lawyer, status (ongoing/closed), linked client, restricted flag. Search, filter, sort.
4. Hearings: each case has hearings. When a hearing date changes, KEEP history (old date, new date, reason, who changed it). Show previous, current and next hearing. Courts can adjourn, so support statuses: scheduled, held, adjourned, cancelled. Add an order/outcome note per hearing.
5. Tasks: linked to case and/or client, assigned to a staff member, priority, due date, status (pending, completed, overdue, upcoming). Staff see only their tasks. Owner can monitor all.
6. Physical file tracking: unique serial like F-000123, linked to case and client, current holder, status, check-out and check-in history. No document uploads.
7. Calendar and reminders: a calendar showing hearings, task deadlines and file due-backs. In-app reminders (1 day and 2 hours before hearings, configurable). A reminder inbox.
8. Dashboard and global search: today's hearings, overdue tasks, files checked out, upcoming week. Search across clients, cases, files, tasks.
9. Backup and restore: encrypted export of everything to a file, last-backup banner (warning if older than 7 days), restore from a backup file with a checksum and version check. If the browser supports showDirectoryPicker, offer a "choose backup folder" option; otherwise show Download backup only.
10. Subscription (prototype): plan and expiry date shown in settings; when expired the app becomes READ-ONLY but data stays viewable and exportable.

HOW EVERY SECTION MUST BE CONNECTED (do not build modules in isolation)
- Client -> many Cases. Case -> one Client, many Hearings, many Tasks, many Physical Files.
- Hearing -> shows on Calendar -> creates Reminders. Task deadline -> Calendar and Reminders. File check-out -> task/reminder to return it.
- Changing a hearing date updates the Case's "next hearing", the Calendar, the Reminders and the Dashboard, and writes to the Audit Log.
- Deleting (soft) a client or case must warn about linked records and never leave broken links.

HEALTH PAGE (very important)
Create a /health page that, for EVERY module built so far, runs automatic self-checks and shows PASS/FAIL with a plain message. Examples: "Creating a client works", "Case links to client", "Hearing date change keeps history", "Staff cannot see restricted cases", "Expired subscription blocks editing". I will check this page before approving the next stage.

WORKING METHOD
- Build ONE stage at a time. When a stage is done: (a) update the HEALTH page, (b) list what you built, what works, and what is not done, (c) STOP and wait for me to type "Stage N" for the next one. Do not add features I did not ask for.
- Also create and maintain two files in the project root: ARCHITECTURE.md (data model, permissions, conventions) and PROGRESS.md (done / in progress / next / known issues / decisions). Update PROGRESS.md at the end of every stage.
- Keep code clean, typed, and commented where logic is not obvious.

Start now with STAGE 1 (Foundation) only.
```

### Stage prompts (send one at a time, after you check the HEALTH page)

```
Stage 2: Clients module. Connect it to the audit log and permissions. Update the HEALTH page and PROGRESS.md. Then stop.
```
```
Stage 3: Cases module, linked to Clients (client profile must list its cases). Include restricted cases. Update HEALTH and PROGRESS.md. Then stop.
```
```
Stage 4: Hearings with full date-change history, outcome notes, and the next-hearing field on the case. Update HEALTH and PROGRESS.md. Then stop.
```
```
Stage 5: Tasks with assignment, staff-only views, overdue logic, linked to cases and clients. Update HEALTH and PROGRESS.md. Then stop.
```
```
Stage 6: Physical file tracking with serials and check-out/in history, linked to cases, clients and staff. Update HEALTH and PROGRESS.md. Then stop.
```
```
Stage 7: Calendar and reminders fed by hearings, tasks and file due-backs. Update HEALTH and PROGRESS.md. Then stop.
```
```
Stage 8: Dashboard and global search pulling from every module. Update HEALTH and PROGRESS.md. Then stop.
```
```
Stage 9: Encrypted backup, restore with checksum, last-backup banner, optional folder backup. Update HEALTH and PROGRESS.md. Then stop.
```
```
Stage 10: Subscription expiry with read-only mode, data still viewable and exportable. Then do a final full review: list any missing connections between modules, and update ARCHITECTURE.md and PROGRESS.md.
```

When done: download the ZIP and unzip it into a new Git repo. Commit as "prototype from Gemini".

---

## STEP 2 - CLAUDE: review and fix

Upload the ZIP (or the folder contents) plus 02_ARCHITECTURE.md and 03_PROGRESS.md, then paste:

```
Read ARCHITECTURE.md and PROGRESS.md first. This is a Gemini-generated frontend prototype of a legal practice management PWA. Your job is REVIEW AND FIX, not a rewrite.

1. Audit the code against ARCHITECTURE.md. Produce a report with: (a) what works, (b) bugs, (c) missing connections between modules (client-case-hearing-task-file-calendar-reminder-audit), (d) places where screens bypass the data layer, (e) hardcoded text that should be in i18n, (f) permission checks that are only in the UI and not in the repository layer, (g) any Firebase or cloud dependency that must be removed, (h) security or privacy problems, (i) anything that will make swapping the data layer for a REST API difficult.
2. Rank problems as Critical / Important / Minor.
3. Fix Critical and Important problems one module at a time. After each module, update the HEALTH page checks, run the type-check and build, and tell me exactly how to verify by hand.
4. Add automated tests for: permissions, hearing-date history, soft delete with linked records, read-only mode on expiry, backup and restore round trip.
5. Do not add new features. Do not change the architecture without telling me why.
6. Update PROGRESS.md at the end with what changed and what is next.
```

Commit as "claude review fixes".

---

## STEP 3 - ANTIGRAVITY: build the real backend and connect it

Give it the repo, ARCHITECTURE.md, PROGRESS.md, then paste:

```
Read ARCHITECTURE.md and PROGRESS.md first. The frontend prototype works against mock repositories. Your job is to build the REAL BACKEND and connect it, ONE MODULE AT A TIME, in the order listed in BUILD_GUIDE.md.

Stack: Node.js + TypeScript, PostgreSQL, a migrations tool (Drizzle or Prisma), REST API under /api/v1, Docker Compose for local development.

Rules:
- For each module: write the migration, the API endpoints with server-side permission checks and firm_id isolation, a REST implementation of the matching frontend repository, and automated tests. Do not touch the next module until the current module's checklist in BUILD_GUIDE.md passes.
- Every table: uuid id, firm_id, created_at, updated_at, deleted_at, created_by, updated_by. Soft deletes only. Every write also writes to audit_log.
- Never trust the frontend. Permissions and firm isolation are enforced on the server.
- No secrets in code. Use .env files that are git-ignored and provide .env.example.
- After each module: run tests, update the HEALTH checks, update PROGRESS.md, and stop to tell me what to verify by hand.
- Do not add features that are not in BUILD_GUIDE.md. Suggest improvements in PROGRESS.md under "Ideas" instead.
```

Commit after every module as "backend: <module>".

---

## STEP 4 - CODEX: independent review and hardening

```
Read ARCHITECTURE.md, PROGRESS.md and BUILD_GUIDE.md. Do an INDEPENDENT REVIEW of the whole repo. Do not rewrite working code.

Report on: security (auth, session handling, permission bypass, firm_id isolation, SQL injection, rate limiting on login, secrets in code), data integrity (soft deletes, orphan records, hearing history, migrations that could lose data), module connections (client-case-hearing-task-file-calendar-reminder-audit), missing tests, backup/restore reliability, read-only mode on expiry, and anything that would break when a firm has 10,000 records.

Rank findings Critical / Important / Minor. Fix Critical items with small, focused commits and tests. List Important and Minor items in PROGRESS.md. Do not add features.
```

---

## Handoff checklist between tools
1. Previous tool finished a module and its checks pass.
2. You ran the app and tested by hand.
3. PROGRESS.md is updated and the work is committed.
4. Next tool starts with: "Read ARCHITECTURE.md and PROGRESS.md first."
