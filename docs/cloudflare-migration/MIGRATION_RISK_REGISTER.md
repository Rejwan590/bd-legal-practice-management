# Migration Risk Register & Mitigation Strategy

**Document Status:** Ready for Review  
**Project:** BD Legal Cloudflare Workers Migration  
**Risk Framework:** Severity Matrix (Impact x Likelihood)

---

## 1. Risk Evaluation Matrix

```
       +-------------------------------------------------------+
       |                    IMPACT LEVEL                       |
       |  Low (1)         | Medium (2)       | High (3)        |
+------+------------------+------------------+-----------------+
| L (3)| Medium Risk      | High Risk        | CRITICAL RISK   |
| I (2)| Low Risk         | Medium Risk      | High Risk       |
| K (1)| Minimal Risk     | Low Risk         | Medium Risk     |
+------+------------------+------------------+-----------------+
  (Likelihood: 1=Rare, 2=Possible, 3=Likely without mitigation)
```

---

## 2. Identified Risks & Mitigation Register

| ID | Category | Risk Description | Pre-Mitigation Score | Mitigation Strategy | Post-Mitigation Score |
|---|---|---|---|---|---|
| **R1** | Security / Compute | **Workers Free 10 ms CPU Limit Failure:** Bcrypt or heavy PBKDF2 iterations exceed the 10 ms CPU limit, crashing logins and user invites. | **CRITICAL (3x3=9)** | **Enforce Workers Paid Plan ($5/mo)** immediately, raising the CPU ceiling to 30,000 ms. Benchmark PBKDF2-HMAC-SHA-512 to execute under 15 ms. | **Low (1x1=1)** |
| **R2** | Transactional | **D1 Batching Atomicity Leak:** Complex operations (e.g. hearing adjournment + date history + next hearing sync) failing midway without rollback. | **High (3x2=6)** | Strict adoption of the **Prepare-Validate-Batch pattern** (`d1.batch()`). All writes execute in a single array. Comprehensive concurrency unit test suite (C1–C4) mandatory before deployment. | **Low (2x1=2)** |
| **R3** | Concurrency | **Receipt Sequence Collision:** Simultaneous fee collections receiving identical receipt numbers. | **High (3x2=6)** | Use SQLite atomic sequence upsert (`ON CONFLICT DO UPDATE SET current_value = current_value + 1 RETURNING current_value`) within the payment batch. | **Low (2x1=2)** |
| **R4** | Performance / Cost | **Unindexed D1 Full-Table Scans:** Accidental unbounded queries burning daily row scan allowances and causing high latency. | **Medium (2x3=6)** | Compound indexes prefixed with `firm_id` on all filtered columns. Server-side pagination enforced at route boundary. | **Low (1x1=1)** |
| **R5** | Storage Limits | **D1 2 MB Row Limit Exceeded by Base64 Photos:** Storing client profile photos in D1 rows causes query failures or database bloat. | **Medium (2x3=6)** | Decouple photo storage to **Cloudflare R2**. D1 stores only image metadata and R2 keys. | **Minimal (1x1=1)** |
| **R6** | Operational | **Git Branching / CI Collision with Master:** Developing migration code on `master` risks breaking existing Azure App Service deployment. | **CRITICAL (3x3=9)** | Absolute Safety Rule: Zero commits to `master`. Migration developed entirely on dedicated `cloudflare` branch. Azure deployment workflow remains untouched. | **Minimal (1x1=1)** |
| **R7** | Data Migration | **Data Loss During Production Cutover:** Data written to Azure PostgreSQL after migration begins but before DNS flip is lost. | **High (3x2=6)** | Use a 3-step cutover protocol: (1) Put Azure into read-only mode (`enforceSubscriptionReadOnly`), (2) Export PostgreSQL to SQLite via ETL script, (3) Flip Cloudflare DNS and activate Workers. | **Low (2x1=2)** |
| **R8** | Lock-In | **Cloudflare Vendor Lock-In:** Difficulty migrating away from Cloudflare if service or pricing changes. | **Low (1x2=2)** | Clean repository pattern separating business logic from D1 bindings. SQLite is open standards; data can be extracted using standard SQLite tooling and restored to Postgres. | **Minimal (1x1=1)** |

---

## 3. Production Rollback Protocol

If an unexpected critical defect occurs after DNS cutover to Cloudflare Workers, the following zero-data-loss rollback protocol is executed:

```
[Incident Detected]
       │
       ▼
1. Put Cloudflare Worker into Maintenance / Read-Only Mode (Returns HTTP 503 / Read-Only)
       │
       ▼
2. Trigger Emergency Export of D1 delta (changes since cutover) to SQL format
       │
       ▼
3. Ingest D1 delta into Azure PostgreSQL
       │
       ▼
4. Revert DNS CNAME to point to legalmanagement-in.azurewebsites.net
       │
       ▼
5. Reactivate Azure App Service writes
```

- **Rollback Time Objective (RTO):** < 15 minutes.
- **Recovery Point Objective (RPO):** Zero lost transactions (using D1 delta log).

---

## 4. Exit Strategy: Migrating Back to PostgreSQL

Because Architecture A uses standard relational tables and Drizzle ORM:
1. Schema files in `drizzle-orm/sqlite-core` have 1:1 conceptual parity with `drizzle-orm/pg-core`.
2. A single migration script (`scripts/sqlite-to-postgres.ts`) can read all D1 tables in topological order (respecting foreign key dependencies) and bulk-insert them into standard PostgreSQL.
3. No proprietary Cloudflare APIs are embedded inside business domain entities.
