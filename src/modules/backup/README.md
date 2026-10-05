# Backup & Disaster Recovery Module (Stage 9)

## What it does
Provides end-to-end backup export, tamper-evident cryptographic verification, and disaster recovery restore for law chambers in Bangladesh:
- **Snapshot Export (`createBackup`)**:
  - Full transactional snapshot encompassing 9 chamber entities: Clients, Cases, Hearings, Hearing Date History, Tasks, Physical Files, File Custody Movements, Active Reminders, and Audit Logs.
  - **Deterministic SHA-256 Signature**: Computes canonical JSON hash for tamper detection.
  - **AES-GCM-256 Client-Side Encryption**: Optional password protection using standard Web Crypto API with PBKDF2 key derivation (100,000 iterations, SHA-256, 16-byte cryptographic salt).
  - **Firm ID Isolation**: Exclusively bundles records matching caller's `firmId`; zero cross-firm leakage.
  - **Automated Audit Trail**: Automatically writes a `BACKUP_EXPORT` record into the audit log.
- **Tamper-Evident Inspection (`inspectBackup`)**:
  - Validates magic header, structure, and calculates SHA-256 checksum against signed header.
  - Detects data corruption or manual file tampering, preventing poisoned imports.
  - Decrypts password-protected snapshots with instant password validation and error feedback.
  - Displays pre-restore summary: source chamber, export timestamp, operator, and entity record counts.
- **Disaster Recovery Restore (`restoreBackup`)**:
  - Supports two restore strategies:
    - **Clean Restore**: Replaces chamber records with snapshot contents (disaster recovery / fresh machine setup). Foreign firm records are protected.
    - **Merge Restore**: Safely upserts records by ID without overwriting newer edits.
  - Atomic commit through `localStore.mutate()`.
  - Automatically records an immutable `BACKUP_RESTORE` audit trail row documenting operator, mode, restored record counts, and source snapshot metadata.
- **Strict Role-Based Access Control**:
  - `data.export`: Required to create or download chamber backups.
  - `settings.manage`: Required to execute database restore operations.
