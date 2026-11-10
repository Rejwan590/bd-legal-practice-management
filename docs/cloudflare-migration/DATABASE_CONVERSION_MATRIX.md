# Database Conversion Matrix: PostgreSQL to Cloudflare D1 (SQLite)

**Document Status:** Ready for Review  
**Target Engine:** Cloudflare D1 (SQLite 3.x engine) with Drizzle ORM (`drizzle-orm/d1`)  
**Source Engine:** PostgreSQL 16 with Drizzle ORM (`drizzle-orm/node-postgres`)

---

## 1. Type Mapping & Data Guarantees

PostgreSQL and SQLite have fundamentally different type systems. The table below defines the canonical mapping applied across all 31 tables in BD Legal Practice Management.

| PostgreSQL Column Type | D1 / SQLite Replacement | Drizzle ORM Primitive (`sqlite-core`) | Serialization & Validation Rules |
|---|---|---|---|
| `uuid` | `text` (36 chars) | `text('column_name')` | Generated in application layer via Web Crypto `crypto.randomUUID()`. Validated with Zod `.uuid()`. |
| `text` / `varchar` | `text` | `text('column_name')` | UTF-8 encoded text. Case-insensitive searches use `COLLATE NOCASE`. |
| `integer` | `integer` | `integer('column_name')` | Signed 64-bit integer. Guaranteed integer storage. |
| `boolean` | `integer` (0 or 1) | `integer('column_name', { mode: 'boolean' })` | Drizzle ORM automatically maps TypeScript `boolean` to SQLite `0` or `1`. |
| `timestamp with time zone` | `text` (ISO-8601 UTC) | `text('column_name')` | Strict ISO-8601 UTC string: `YYYY-MM-DDTHH:mm:ss.sssZ`. Guarantees lexicographical ordering for SQL string comparisons. |
| `jsonb` | `text` (JSON string) | `text('column_name', { mode: 'json' })` | Validated by Zod before insertion. SQLite `json_extract()` used for indexed sub-queries if needed. |

---

## 2. Currency & Financial Guarantees: Integer Paisa

> [!IMPORTANT]
> **Zero Floating-Point Drift Invariant:**
> All financial amounts (fee agreements, fee payments, chamber expenses, subscription prices, advance payments) MUST be stored as signed integers representing the smallest currency unit: **BDT Paisa (1 BDT = 100 Paisa)**. 
> Example: BDT 12,000.00 is stored strictly as `1200000`. No SQLite `REAL` or floating-point numbers are permitted in any financial schema column.

Affected financial columns:
- `plans.base_price_paisa`, `plans.extra_user_price_paisa`, `plans.extra_device_price_paisa`
- `firms.monthly_price_paisa`
- `fee_agreements.agreed_amount_paisa`, `fee_agreements.paid_amount_paisa`
- `fee_agreement_changes.old_amount_paisa`, `fee_agreement_changes.new_amount_paisa`
- `fee_payments.amount_paisa`
- `expenses.amount_paisa`
- `chamber_expenses.amount_paisa`
- `chamber_advances.amount_paisa`, `chamber_advances.settled_amount_paisa`
- `chamber_advance_settlements.amount_paisa`
- `payments.amount_paisa`

---

## 3. Detailed Conversion Inventory: 31 Tables

| # | PostgreSQL Table Name | D1 SQLite Table Name | Primary Key | Foreign Keys & Cascade Behavior | Index Definitions | Notes & JSONB Columns |
|---|---|---|---|---|---|---|
| 1 | `plans` | `plans` | `id` (text) | None | None | System plan definitions |
| 2 | `firms` | `firms` | `id` (text) | `plan_id -> plans.id` (RESTRICT) | `idx_firms_status`, `idx_firms_license_expiry` | Master chamber registry |
| 3 | `users` | `users` | `id` (text) | `firm_id -> firms.id` (CASCADE), `reports_to_user_id -> users.id` (SET NULL) | `idx_users_firm_id`, `idx_users_email`, `idx_users_mobile_number` | Authentication and chamber staff |
| 4 | `clients` | `clients` | `id` (text) | `firm_id -> firms.id` (CASCADE), `created_by_user_id -> users.id` (RESTRICT) | `idx_clients_firm_id`, `idx_clients_mobile_number`, `idx_clients_email` | Client profiles |
| 5 | `client_photos` | `client_photos` | `client_id` (text) | `client_id -> clients.id` (CASCADE), `firm_id -> firms.id` (CASCADE) | `idx_client_photos_firm_id` | **Migrated to Cloudflare R2.** Schema retains `r2_key`, `mime`, `updated_at`. |
| 6 | `client_notes` | `client_notes` | `id` (text) | `client_id -> clients.id` (CASCADE), `firm_id -> firms.id` (CASCADE), `created_by_user_id -> users.id` (RESTRICT) | `idx_client_notes_client_id`, `idx_client_notes_firm_id` | Case notes linked to client |
| 7 | `cases` | `cases` | `id` (text) | `firm_id -> firms.id` (CASCADE), `client_id -> clients.id` (RESTRICT), `responsible_lawyer_id -> users.id` (RESTRICT) | `idx_cases_firm_id`, `idx_cases_client_id`, `idx_cases_case_number`, `idx_cases_next_hearing_at` | Core case management entity |
| 8 | `case_notes` | `case_notes` | `id` (text) | `case_id -> cases.id` (CASCADE), `firm_id -> firms.id` (CASCADE), `created_by_user_id -> users.id` (RESTRICT) | `idx_case_notes_case_id`, `idx_case_notes_firm_id` | Notes attached to cases |
| 9 | `hearings` | `hearings` | `id` (text) | `case_id -> cases.id` (CASCADE), `firm_id -> firms.id` (CASCADE) | `idx_hearings_case_id`, `idx_hearings_firm_id`, `idx_hearings_hearing_date` | Hearing calendar entries |
| 10 | `hearing_date_history` | `hearing_date_history` | `id` (text) | `hearing_id -> hearings.id` (CASCADE), `case_id -> cases.id` (CASCADE), `firm_id -> firms.id` (CASCADE), `changed_by_user_id -> users.id` (RESTRICT) | `idx_hdh_hearing_id`, `idx_hdh_case_id`, `idx_hdh_firm_id` | Audit of adjourned/rescheduled dates |
| 11 | `case_shares` | `case_shares` | `id` (text) | `case_id -> cases.id` (CASCADE), `user_id -> users.id` (CASCADE), `firm_id -> firms.id` (CASCADE) | `idx_case_shares_case_user` (UNIQUE) | Case permission delegation |
| 12 | `audit_log` | `audit_log` | `id` (text) | `firm_id -> firms.id` (CASCADE), `user_id -> users.id` (RESTRICT) | `idx_audit_firm_entity`, `idx_audit_created_at` | `before_state: text` (JSON), `after_state: text` (JSON) |
| 13 | `payments` | `payments` | `id` (text) | `firm_id -> firms.id` (CASCADE), `recorded_by_admin_id -> platform_admins.id` (RESTRICT) | `idx_payments_firm_id`, `idx_payments_created_at` | Platform subscription billing |
| 14 | `backups_log` | `backups_log` | `id` (text) | `firm_id -> firms.id` (CASCADE) | `idx_backups_log_firm_id` | Metadata of R2 backup archives |
| 15 | `platform_admins` | `platform_admins` | `id` (text) | None | `idx_platform_admins_email` (UNIQUE) | Super-admin accounts |
| 16 | `admin_audit` | `admin_audit` | `id` (text) | `admin_id -> platform_admins.id` (RESTRICT) | `idx_admin_audit_created_at` | `details: text` (JSON) |
| 17 | `license_events` | `license_events` | `id` (text) | `firm_id -> firms.id` (CASCADE), `performed_by_admin_id -> platform_admins.id` (RESTRICT) | `idx_license_events_firm_id` | `metadata: text` (JSON) |
| 18 | `devices` | `devices` | `id` (text) | `firm_id -> firms.id` (CASCADE), `user_id -> users.id` (CASCADE) | `idx_devices_firm_user`, `idx_devices_fingerprint` | Registered client hardware |
| 19 | `appointments` | `appointments` | `id` (text) | `firm_id -> firms.id` (CASCADE), `client_id -> clients.id` (SET NULL) | `idx_appointments_firm_id`, `idx_appointments_start_time` | Client and internal meetings |
| 20 | `appointment_attendees` | `appointment_attendees` | `id` (text) | `appointment_id -> appointments.id` (CASCADE), `user_id -> users.id` (CASCADE) | `idx_app_attendees_unique` (UNIQUE) | Appointment participant links |
| 21 | `tasks` | `tasks` | `id` (text) | `firm_id -> firms.id` (CASCADE), `case_id -> cases.id` (SET NULL), `assigned_to_user_id -> users.id` (RESTRICT) | `idx_tasks_firm_id`, `idx_tasks_case_id`, `idx_tasks_status` | Chamber workflow tasks |
| 22 | `fee_agreements` | `fee_agreements` | `id` (text) | `firm_id -> firms.id` (CASCADE), `case_id -> cases.id` (CASCADE), `client_id -> clients.id` (RESTRICT) | `idx_fee_agreements_case_id`, `idx_fee_agreements_firm_id` | Financial billing contracts |
| 23 | `fee_agreement_changes` | `fee_agreement_changes` | `id` (text) | `fee_agreement_id -> fee_agreements.id` (CASCADE), `changed_by_user_id -> users.id` (RESTRICT) | `idx_fac_fee_agreement_id` | Historical log of agreed fee changes |
| 24 | `number_sequences` | `number_sequences` | `id` (text) | `firm_id -> firms.id` (CASCADE) | `idx_number_sequences_firm_type_year` (UNIQUE) | Atomic receipt/invoice counters |
| 25 | `fee_payments` | `fee_payments` | `id` (text) | `fee_agreement_id -> fee_agreements.id` (CASCADE), `firm_id -> firms.id` (CASCADE), `client_id -> clients.id` (RESTRICT) | `idx_fee_payments_firm_id`, `idx_fee_payments_receipt_number` | Client money collection receipts |
| 26 | `expense_categories` | `expense_categories` | `id` (text) | `firm_id -> firms.id` (CASCADE) | `idx_exp_cat_firm_id` | Case expense taxonomy |
| 27 | `expenses` | `expenses` | `id` (text) | `firm_id -> firms.id` (CASCADE), `case_id -> cases.id` (CASCADE), `category_id -> expense_categories.id` (RESTRICT) | `idx_expenses_firm_case`, `idx_expenses_date` | Reimbursable case expenses |
| 28 | `chamber_expense_categories` | `chamber_expense_categories` | `id` (text) | `firm_id -> firms.id` (CASCADE) | `idx_chamber_exp_cat_firm_id` | Office overhead taxonomy |
| 29 | `chamber_advances` | `chamber_advances` | `id` (text) | `firm_id -> firms.id` (CASCADE), `user_id -> users.id` (RESTRICT) | `idx_chamber_advances_firm_user` | Petty cash & clerk advances |
| 30 | `chamber_expenses` | `chamber_expenses` | `id` (text) | `firm_id -> firms.id` (CASCADE), `category_id -> chamber_expense_categories.id` (RESTRICT) | `idx_chamber_expenses_firm_date` | General chamber operational expenses |
| 31 | `chamber_advance_settlements` | `chamber_advance_settlements` | `id` (text) | `advance_id -> chamber_advances.id` (CASCADE), `expense_id -> chamber_expenses.id` (CASCADE), `firm_id -> firms.id` (CASCADE) | `idx_cas_advance_id` | Advance reconciliation ledger |

---

## 4. SQL Syntax & Raw Template Conversion Matrix

The codebase contains 60 usages of `sql<...>` constructs in `server/src/db/client.ts` and `schema.ts`. Below is the complete translation matrix from PostgreSQL to SQLite:

| Pattern & Purpose | PostgreSQL Syntax (`pg`) | Cloudflare D1 / SQLite Replacement |
|---|---|---|
| **Case-Insensitive Search** | `WHERE name ILIKE ${'%' + q + '%'}` | `WHERE name LIKE ${'%' + q + '%'} COLLATE NOCASE` |
| **Year Extraction** | `EXTRACT(YEAR FROM created_at) = ${year}` | `CAST(strftime('%Y', created_at) AS INTEGER) = ${year}` |
| **Month Extraction** | `EXTRACT(MONTH FROM date) = ${month}` | `CAST(strftime('%m', date) AS INTEGER) = ${month}` |
| **Current Timestamp** | `NOW()` or `CURRENT_TIMESTAMP` | `strftime('%Y-%m-%dT%H:%M:%fZ', 'now')` or ISO-8601 string from JS `new Date().toISOString()` |
| **UUID Generation** | `gen_random_uuid()` (PostgreSQL extension) | Generated client-side in Node/V8 via `crypto.randomUUID()` |
| **JSON Extraction** | `metadata->>'action'` | `json_extract(metadata, '$.action')` |
| **Conditional Aggregation** | `CASE WHEN ${schema.clientPhotos.clientId} IS NOT NULL THEN true ELSE false END` | `CASE WHEN ${schema.clientPhotos.clientId} IS NOT NULL THEN 1 ELSE 0 END` |
| **Sub-Query Boolean Coercion** | `sql<boolean>\`EXISTS (...)\`` | `sql<number>\`EXISTS (...)\`` (returns `1` or `0`, converted to `Boolean` in TS) |
| **String Concatenation** | `first_name \|\| ' ' \|\| last_name` | `first_name \|\| ' ' \|\| last_name` (Identical in SQLite) |
| **Interval Arithmetic** | `NOW() + INTERVAL '30 days'` | `datetime('now', '+30 days')` |
| **Upsert Target Syntax** | `ON CONFLICT (client_id) DO UPDATE SET ...` | `ON CONFLICT (client_id) DO UPDATE SET ...` (Identical SQLite 3.24+ syntax supported in D1) |

---

## 5. Foreign Key Enforcement in Cloudflare D1

SQLite does not enable foreign key constraint checking by default. In Cloudflare D1:
- D1 enforces foreign keys when PRAGMA foreign_keys is enabled.
- All D1 connection sessions initialized in Hono middleware must execute:
  ```sql
  PRAGMA foreign_keys = ON;
  ```
- Drizzle ORM relations handle cascade semantics during schema definition, but D1 enforces referential integrity on deletes and updates.
