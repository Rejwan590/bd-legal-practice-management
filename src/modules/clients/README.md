# Clients Module

## What it does
Provides chamber client master management and case dossier aggregation:
- Client registration and profile management with English & Bangla names, phone, address, and confidential chamber notes.
- Real-time search across English/Bengali names, phone numbers, and addresses.
- Multi-case association: client dossier displays all linked court cases, pending tasks, and physical file custody bundles.
- Soft-delete protection: warns if active cases/tasks/files are linked, archives the client with `deletedAt`, preserves all relational integrity, and never drops records.
- Role-based permissions: requires `clients.view` to search/list/view dossiers, and `clients.edit` to register, edit, or archive clients.
- Fully wired to immutable Audit Log recording `CREATE`, `UPDATE`, and `DELETE` operations with before/after state diffs.

## Key Invariants
- Screens interact strictly through `IClientRepository`.
- Every client record includes `id` (UUID), `firmId`, `createdAt`, `updatedAt`, `deletedAt`, `createdBy`, and `updatedBy`.
- `MockClientRepository` enforces `clients.edit` inside methods before executing any modification.
- Soft-deleted clients are excluded from standard views and searches without physical record deletion.

## Connects to
- Cases Module (Stage 3): Clients are the parent entity of cases (`case.clientId`).
- Tasks Module (Stage 5): Client profile lists tasks assigned for this client.
- Physical Files Module (Stage 6): Tracks custody of physical files assigned to this client.
- Audit Log Module (Stage 1): Captures every client creation, edit, and soft-delete.
- Global Search (Stage 8): Powers search by client name, phone number, and address.
