# Cost & Operational Architecture: Cloudflare Workers

**Document Status:** Ready for Review  
**Target Environment:** Cloudflare Workers Paid + D1 + R2  
**Comparison Baselines:** Microsoft Azure (Current) & Render.com (Alternative Container)

---

## 1. Hosting & Infrastructure Cost Comparison

The table below compares the direct monthly infrastructure costs across the three candidate hosting platforms for BD Legal Practice Management:

| Infrastructure Component | Azure (Current Architecture) | Render.com (Container Alternative) | Cloudflare Workers Paid (Recommended) |
|---|---|---|---|
| **API Compute / App Server** | Azure App Service Linux (B1: $13/mo; P0V3: $45/mo) | Standard Web Service ($7/mo) | Cloudflare Workers Paid ($5.00/mo flat baseline) |
| **Relational Database** | Azure Database for PostgreSQL Flexible (B1ms: $28/mo + storage) | Managed PostgreSQL ($7/mo starter, $19/mo pro) | Cloudflare D1 (Included in $5 plan; 25B rows read, 50M rows written) |
| **Object / Backup Storage** | Azure Blob Storage (~$2/mo + egress fees) | AWS S3 or Backblaze B2 (~$3/mo) | Cloudflare R2 ($0.015/GB-mo, **Zero Egress Fees**) |
| **SSL / DDoS / CDN** | Azure Front Door / App Gateway ($35+/mo) | Cloudflare Free DNS proxy | Native Cloudflare Tier 1 Global Anycast CDN (Included) |
| **Egress Bandwidth** | $0.087 per GB | $0.10 per GB over 100 GB | **$0.00 (Zero data transfer fees worldwide)** |
| **Estimated Total Monthly** | **$55.00 – $75.00 / month** | **$26.00 – $38.00 / month** | **~$5.00 – $7.00 / month** |

> [!TIP]
> **Net Financial Impact:**
> Moving from Azure to Cloudflare Workers Paid reduces the recurring infrastructure overhead from ~$65/mo to ~$5/mo — a **>90% operational cost reduction** while improving edge latency across Bangladesh.

---

## 2. Cloudflare D1 Usage Quotas & Row Scan Modeling

Cloudflare D1 bills based on **rows read (scanned)** and **rows written**:

### 2.1 Workers Paid Allowance
- **Rows Read Included:** 25 Billion rows read per month (overage: $0.001 per 1 million rows).
- **Rows Written Included:** 50 Million rows written per month (overage: $1.00 per 1 million rows).
- **Database Storage Included:** 5 GB total database storage across 50,000 databases (overage: $0.75 per GB-mo).

### 2.2 Row Scan Optimization (Preventing Inadvertent Billing Runaway)
In D1, a query without an index that filters a table with 10,000 rows **counts as 10,000 rows read**, even if only 1 row is returned.

To prevent unindexed full-table scans:
1. **Mandatory Compound Indexes**:
   Every tenant query filters by `firm_id`. All secondary searches MUST have compound indexes prefixed with `firm_id`:
   - `idx_cases_firm_next_hearing`: `(firm_id, next_hearing_at)`
   - `idx_cases_firm_status`: `(firm_id, status)`
   - `idx_hearings_firm_date`: `(firm_id, hearing_date)`
   - `idx_fee_payments_firm_date`: `(firm_id, payment_date)`
2. **Server-Side Pagination Enforced**:
   Unbounded list queries (e.g. `SELECT * FROM cases WHERE firm_id = ?`) are prohibited in the API layer. All listing endpoints must require `limit` (max 50) and `offset` / keyset cursor.

---

## 3. Backup, Disaster Recovery & Point-in-Time Recovery (PITR)

BD Legal is a mission-critical legal application. A chamber losing its court calendar or client files face legal liability.

### 3.1 D1 Time Travel (Native PITR)
Cloudflare D1 includes **Time Travel**:
- Tracks transaction bookmarks automatically.
- Allows rolling back the entire database to any specific minute within the retention window (up to 30 days on Workers Paid).
- Command to restore to a specific timestamp:
  ```bash
  wrangler d1 time-travel restore <DATABASE_NAME> --timestamp="2026-11-10T12:00:00Z"
  ```

### 3.2 Automated Nightly SQL Dumps to Cloudflare R2
In addition to Time Travel, an automated scheduled Cloudflare Worker (Cron Trigger `0 2 * * *` — 2:00 AM BST) executes:
1. Export complete D1 database via Cloudflare Management API.
2. Encrypt dump using AES-256-GCM with a chamber master backup key.
3. Save encrypted archive to `BACKUPS_BUCKET` in Cloudflare R2 under:
   `backups/daily/bdlegal-prod-YYYY-MM-DD.sql.enc`
4. Prune dumps older than 90 days according to R2 lifecycle rules.

### 3.3 Individual Chamber Export (Tenant Portability)
Chambers have the legal right to export their complete practice data:
- The endpoint `GET /api/v1/chamber/export` generates a clean JSON / SQLite dump containing solely that `firm_id`'s records.
- Stored temporarily in R2 with a 15-minute signed download URL.

---

## 4. Observability, Logging & Alerts

### 4.1 Cloudflare Workers Analytics Engine & Tail Workers
- **Real-Time Logs:** `wrangler tail` streams live execution logs, uncaught exceptions, and status codes.
- **Workers Logpush:** Streams structured JSON logs to external monitoring (e.g., Datadog, Axiom, or Cloudflare R2) without impacting worker CPU limits.
- **Alerts:** Cloudflare dashboard alerts configured for:
  - Error rate spikes (> 1% 5xx responses over 5 minutes).
  - CPU time alerts (> 50 ms sustained CPU execution).
  - Rate-limit triggers on login endpoints.
