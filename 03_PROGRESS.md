# PROGRESS.md (update at the end of EVERY session)

Rule: read ARCHITECTURE.md and this file before starting. Update this file before stopping. Never put secrets or real client data here.

## Current status
Planning finished. Nothing built yet. Next: Gemini prototype Stage 1.

## Done
(none yet)

| Module | Prototype (Gemini) | Reviewed (Claude) | Backend (Antigravity) | Hardened (Codex) |
|---|---|---|---|---|
| Foundation/auth/permissions | [ ] | [ ] | [ ] | [ ] |
| Clients | [ ] | [ ] | [ ] | [ ] |
| Cases | [ ] | [ ] | [ ] | [ ] |
| Hearings + history | [ ] | [ ] | [ ] | [ ] |
| Tasks | [ ] | [ ] | [ ] | [ ] |
| Physical files | [ ] | [ ] | [ ] | [ ] |
| Calendar + reminders | [ ] | [ ] | [ ] | [ ] |
| Dashboard + search | [ ] | [ ] | [ ] | [ ] |
| Backup/restore | [ ] | [ ] | [ ] | [ ] |
| Subscription/read-only | [ ] | [ ] | [ ] | [ ] |
| Admin page (firms, payments) | [ ] | [ ] | [ ] | [ ] |
| Deploy + server backups | n/a | n/a | [ ] | [ ] |

## In progress
(none)

## Next 3 to 5 tasks
1. Create GitHub repo, add these 3 docs.
2. Run Gemini Stage 1.
3. Check HEALTH page, then Stage 2.

## Known bugs / open questions
- Confirm DigitalOcean student terms allow a commercial product.
- Confirm Singapore hosting is acceptable for clients' data expectations.
- Decide: frontend on Droplet or Cloudflare Pages.

## Decisions log
- Online-first, cloud is source of truth (staff logins, permissions, reminders need a server).
- PWA only for now; Tauri/Android later only if firms ask.
- DigitalOcean Singapore using student credit.
- Manual bKash/Nagad payments and manual license activation first.
- Read-only on expiry, data always exportable.

## Ideas (do not build yet)
SMS credits, Google Calendar, payment gateway, conflict-of-interest check, billing/fees, document attachments, limitation deadlines, court holidays, Excel import, offline editing, Tauri, Android.

## Don't touch
(list stable modules here once they pass review)
