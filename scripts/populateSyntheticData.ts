import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { generateSyntheticDataset, SYNTHETIC_FIRM_ID, OWNER_USER_ID, STAFF_USER_ID } from '../src/data/syntheticData';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface PopulationCounts {
  created: Record<string, number>;
  skipped: Record<string, number>;
  failed: Record<string, number>;
}

async function getPgClient(url: string) {
  try {
    const pgModule = await import('../server/node_modules/pg/lib/index.js' as any);
    const pg = pgModule.default || pgModule;
    const isSsl = url.includes('sslmode=require') || url.includes('azure.com');
    return new pg.Client({
      connectionString: url,
      ssl: isSsl ? { rejectUnauthorized: false } : undefined,
    });
  } catch (err) {
    console.warn('[SyntheticSeed] Notice: pg driver not loaded, skipping direct PostgreSQL operations.');
    return null;
  }
}

export async function populatePostgres(client: any, clean: boolean = false): Promise<PopulationCounts> {
  const counts: PopulationCounts = {
    created: {},
    skipped: {},
    failed: {},
  };

  const dataset = generateSyntheticDataset();

  if (clean) {
    console.log('[SyntheticSeed] Cleaning existing synthetic records from PostgreSQL...');
    const tablesInDeleteOrder = [
      'appointment_attendees',
      'appointments',
      'hearing_date_history',
      'hearings',
      'tasks',
      'fee_payments',
      'fee_agreements',
      'expenses',
      'client_notes',
      'cases',
      'clients',
    ];

    for (const table of tablesInDeleteOrder) {
      try {
        const res = await client.query(
          `DELETE FROM ${table} WHERE firm_id = $1 AND id LIKE '%-syn-%'`,
          [SYNTHETIC_FIRM_ID]
        );
        console.log(`[SyntheticSeed] Cleaned ${res.rowCount || 0} synthetic records from ${table}`);
      } catch (err: any) {
        console.error(`[SyntheticSeed] Error cleaning table ${table}:`, err.message);
      }
    }
    return counts;
  }

  // Idempotently insert Clients
  let clientsCreated = 0;
  let clientsSkipped = 0;
  for (const c of dataset.clients) {
    try {
      const res = await client.query(
        `INSERT INTO clients (id, firm_id, name, name_bn, phone, email, address, notes, archived, created_at, updated_at, created_by, updated_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
         ON CONFLICT (id) DO NOTHING`,
        [
          c.id,
          c.firmId,
          c.name,
          c.nameBn || null,
          c.phone,
          c.email || null,
          c.address,
          c.notes || null,
          c.archived || false,
          c.createdAt,
          c.updatedAt,
          c.createdBy,
          c.updatedBy,
        ]
      );
      if (res.rowCount && res.rowCount > 0) clientsCreated++;
      else clientsSkipped++;
    } catch (err: any) {
      counts.failed['clients'] = (counts.failed['clients'] || 0) + 1;
      console.error(`[SyntheticSeed] Failed to insert client ${c.id}:`, err.message);
    }
  }
  counts.created['clients'] = clientsCreated;
  counts.skipped['clients'] = clientsSkipped;

  // Idempotently insert Cases
  let casesCreated = 0;
  let casesSkipped = 0;
  for (const cs of dataset.cases) {
    try {
      const res = await client.query(
        `INSERT INTO cases (id, firm_id, client_id, file_serial, case_number, court, matter_type, description, plaintiff, defendant, our_role, plaintiff_lawyer, defendant_lawyer, responsible_lawyer_id, status, restricted, next_hearing_at, case_category, case_date, closed_on, police_station, sections_of_law, created_at, updated_at, created_by, updated_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26)
         ON CONFLICT (id) DO NOTHING`,
        [
          cs.id,
          cs.firmId,
          cs.clientId,
          cs.fileSerial,
          cs.caseNumber,
          cs.court,
          cs.matterType,
          cs.description || null,
          cs.plaintiff || null,
          cs.defendant || null,
          cs.ourRole || null,
          cs.plaintiffLawyer || null,
          cs.defendantLawyer || null,
          cs.responsibleLawyerId || null,
          cs.status,
          cs.restricted,
          cs.nextHearingAt || null,
          cs.caseCategory || 'civil',
          cs.caseDate || null,
          cs.closedOn || null,
          cs.policeStation || null,
          cs.sectionsOfLaw || null,
          cs.createdAt,
          cs.updatedAt,
          cs.createdBy,
          cs.updatedBy,
        ]
      );
      if (res.rowCount && res.rowCount > 0) casesCreated++;
      else casesSkipped++;
    } catch (err: any) {
      counts.failed['cases'] = (counts.failed['cases'] || 0) + 1;
      console.error(`[SyntheticSeed] Failed to insert case ${cs.id}:`, err.message);
    }
  }
  counts.created['cases'] = casesCreated;
  counts.skipped['cases'] = casesSkipped;

  // Idempotently insert Hearings
  let hearingsCreated = 0;
  let hearingsSkipped = 0;
  for (const h of dataset.hearings) {
    try {
      const res = await client.query(
        `INSERT INTO hearings (id, firm_id, case_id, appearing_lawyer_id, scheduled_at, court, purpose, status, outcome_note, fixed_for, fixed_for_note, created_at, updated_at, created_by, updated_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
         ON CONFLICT (id) DO NOTHING`,
        [
          h.id,
          h.firmId,
          h.caseId,
          h.appearingLawyerId || null,
          h.scheduledAt,
          h.court || null,
          h.purpose || null,
          h.status,
          h.outcomeNote || null,
          h.fixedFor || null,
          h.fixedForNote || null,
          h.createdAt,
          h.updatedAt,
          h.createdBy,
          h.updatedBy,
        ]
      );
      if (res.rowCount && res.rowCount > 0) hearingsCreated++;
      else hearingsSkipped++;
    } catch (err: any) {
      counts.failed['hearings'] = (counts.failed['hearings'] || 0) + 1;
    }
  }
  counts.created['hearings'] = hearingsCreated;
  counts.skipped['hearings'] = hearingsSkipped;

  // Hearing Date History
  let histCreated = 0;
  let histSkipped = 0;
  for (const hist of dataset.hearingDateHistory) {
    try {
      const res = await client.query(
        `INSERT INTO hearing_date_history (id, firm_id, hearing_id, case_id, old_at, new_at, reason, old_fixed_for, new_fixed_for, changed_by, changed_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
         ON CONFLICT (id) DO NOTHING`,
        [
          hist.id,
          hist.firmId,
          hist.hearingId,
          hist.caseId,
          hist.oldAt,
          hist.newAt,
          hist.reason,
          hist.oldFixedFor || null,
          hist.newFixedFor || null,
          hist.changedBy,
          hist.changedAt,
        ]
      );
      if (res.rowCount && res.rowCount > 0) histCreated++;
      else histSkipped++;
    } catch (err: any) {
      counts.failed['hearingDateHistory'] = (counts.failed['hearingDateHistory'] || 0) + 1;
    }
  }
  counts.created['hearingDateHistory'] = histCreated;
  counts.skipped['hearingDateHistory'] = histSkipped;

  // Tasks
  let tasksCreated = 0;
  let tasksSkipped = 0;
  for (const t of dataset.tasks) {
    try {
      const res = await client.query(
        `INSERT INTO tasks (id, firm_id, case_id, client_id, assigned_to, title, description, priority, due_at, status, completed_at, created_at, updated_at, created_by, updated_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
         ON CONFLICT (id) DO NOTHING`,
        [
          t.id,
          t.firmId,
          t.caseId || null,
          t.clientId || null,
          t.assignedTo,
          t.title,
          t.description || null,
          t.priority,
          t.dueAt,
          t.status,
          t.completedAt || null,
          t.createdAt,
          t.updatedAt,
          t.createdBy,
          t.updatedBy,
        ]
      );
      if (res.rowCount && res.rowCount > 0) tasksCreated++;
      else tasksSkipped++;
    } catch (err: any) {
      counts.failed['tasks'] = (counts.failed['tasks'] || 0) + 1;
    }
  }
  counts.created['tasks'] = tasksCreated;
  counts.skipped['tasks'] = tasksSkipped;

  // Client Notes
  let notesCreated = 0;
  let notesSkipped = 0;
  for (const n of dataset.clientNotes) {
    try {
      const res = await client.query(
        `INSERT INTO client_notes (id, firm_id, client_id, note_date, body, created_at, updated_at, created_by, updated_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         ON CONFLICT (id) DO NOTHING`,
        [n.id, n.firmId, n.clientId, n.noteDate, n.body, n.createdAt, n.updatedAt, n.createdBy, n.updatedBy]
      );
      if (res.rowCount && res.rowCount > 0) notesCreated++;
      else notesSkipped++;
    } catch (err: any) {
      counts.failed['clientNotes'] = (counts.failed['clientNotes'] || 0) + 1;
    }
  }
  counts.created['clientNotes'] = notesCreated;
  counts.skipped['clientNotes'] = notesSkipped;

  // Appointments
  let apptsCreated = 0;
  let apptsSkipped = 0;
  for (const a of dataset.appointments) {
    try {
      const res = await client.query(
        `INSERT INTO appointments (id, firm_id, title, type, starts_at, ends_at, mode, location, organiser_user_id, client_id, case_id, status, notes, reminder_minutes_before, created_at, updated_at, created_by, updated_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)
         ON CONFLICT (id) DO NOTHING`,
        [
          a.id,
          a.firmId,
          a.title,
          a.type,
          a.startsAt,
          a.endsAt,
          a.mode,
          a.location || null,
          a.organiserUserId,
          a.clientId || null,
          a.caseId || null,
          a.status,
          a.notes || null,
          a.reminderMinutesBefore,
          a.createdAt,
          a.updatedAt,
          a.createdBy,
          a.updatedBy,
        ]
      );
      if (res.rowCount && res.rowCount > 0) apptsCreated++;
      else apptsSkipped++;
    } catch (err: any) {
      counts.failed['appointments'] = (counts.failed['appointments'] || 0) + 1;
    }
  }
  counts.created['appointments'] = apptsCreated;
  counts.skipped['appointments'] = apptsSkipped;

  // Appointment Attendees
  let attCreated = 0;
  let attSkipped = 0;
  for (const att of dataset.appointmentAttendees) {
    try {
      const res = await client.query(
        `INSERT INTO appointment_attendees (id, appointment_id, user_id, firm_id, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (id) DO NOTHING`,
        [att.id, att.appointmentId, att.userId, att.firmId, att.createdAt, att.updatedAt]
      );
      if (res.rowCount && res.rowCount > 0) attCreated++;
      else attSkipped++;
    } catch (err: any) {
      counts.failed['appointmentAttendees'] = (counts.failed['appointmentAttendees'] || 0) + 1;
    }
  }
  counts.created['appointmentAttendees'] = attCreated;
  counts.skipped['appointmentAttendees'] = attSkipped;

  // Fee Agreements
  let faCreated = 0;
  let faSkipped = 0;
  for (const fa of dataset.feeAgreements) {
    try {
      const res = await client.query(
        `INSERT INTO fee_agreements (id, firm_id, client_id, case_id, fee_type, agreed_amount_paisa, agreement_date, notes, status, created_at, updated_at, created_by, updated_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
         ON CONFLICT (id) DO NOTHING`,
        [
          fa.id,
          fa.firmId,
          fa.clientId,
          fa.caseId || null,
          fa.feeType,
          fa.agreedAmountPaisa,
          fa.agreementDate,
          fa.notes || null,
          fa.status,
          fa.createdAt,
          fa.updatedAt,
          fa.createdBy,
          fa.updatedBy,
        ]
      );
      if (res.rowCount && res.rowCount > 0) faCreated++;
      else faSkipped++;
    } catch (err: any) {
      counts.failed['feeAgreements'] = (counts.failed['feeAgreements'] || 0) + 1;
    }
  }
  counts.created['feeAgreements'] = faCreated;
  counts.skipped['feeAgreements'] = faSkipped;

  // Fee Payments
  let fpCreated = 0;
  let fpSkipped = 0;
  for (const fp of dataset.feePayments) {
    try {
      const res = await client.query(
        `INSERT INTO fee_payments (id, firm_id, client_id, case_id, fee_agreement_id, hearing_id, payment_date, amount_paisa, method, reference, receipt_number, purpose_note, status, void_reason, voided_by, voided_at, idempotency_key, legacy_unassigned, created_at, updated_at, created_by, updated_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22)
         ON CONFLICT (id) DO NOTHING`,
        [
          fp.id,
          fp.firmId,
          fp.clientId,
          fp.caseId || null,
          fp.feeAgreementId || null,
          fp.hearingId || null,
          fp.paymentDate,
          fp.amountPaisa,
          fp.method,
          fp.reference || null,
          fp.receiptNumber,
          fp.purposeNote,
          fp.status,
          fp.voidReason || null,
          fp.voidedBy || null,
          fp.voidedAt || null,
          fp.idempotencyKey,
          fp.legacyUnassigned || false,
          fp.createdAt,
          fp.updatedAt,
          fp.createdBy,
          fp.updatedBy,
        ]
      );
      if (res.rowCount && res.rowCount > 0) fpCreated++;
      else fpSkipped++;
    } catch (err: any) {
      counts.failed['feePayments'] = (counts.failed['feePayments'] || 0) + 1;
    }
  }
  counts.created['feePayments'] = fpCreated;
  counts.skipped['feePayments'] = fpSkipped;

  // Expenses
  let expCreated = 0;
  let expSkipped = 0;
  // Ensure default categories exist first
  const catNames = ['Court Fees', 'Process Server / Notice', 'Certified Copy', 'Stamp Duty', 'Travel / Conveyance', 'Photocopy & Typing'];
  for (let i = 0; i < catNames.length; i++) {
    const catName = catNames[i];
    try {
      await client.query(
        `INSERT INTO expense_categories (id, firm_id, name, is_default, created_at, updated_at, created_by, updated_by)
         VALUES ($1, $2, $3, true, NOW(), NOW(), $4, $4)
         ON CONFLICT (id) DO NOTHING`,
        [`cat-${i}`, SYNTHETIC_FIRM_ID, catName, OWNER_USER_ID]
      );
      await client.query(
        `INSERT INTO expense_categories (id, firm_id, name, is_default, created_at, updated_at, created_by, updated_by)
         VALUES ($1, $2, $3, true, NOW(), NOW(), $4, $4)
         ON CONFLICT (id) DO NOTHING`,
        [`cat-${catName.toLowerCase().replace(/[^a-z0-9]/g, '-')}`, SYNTHETIC_FIRM_ID, catName, OWNER_USER_ID]
      );
    } catch {}
  }

  for (const exp of dataset.expenses) {
    try {
      const res = await client.query(
        `INSERT INTO expenses (id, firm_id, client_id, case_id, category_id, expense_date, amount_paisa, description, reimbursable, status, void_reason, voided_by, voided_at, created_at, updated_at, created_by, updated_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
         ON CONFLICT (id) DO NOTHING`,
        [
          exp.id,
          exp.firmId,
          exp.clientId || null,
          exp.caseId || null,
          exp.categoryId,
          exp.expenseDate,
          exp.amountPaisa,
          exp.description,
          exp.reimbursable,
          exp.status,
          exp.voidReason || null,
          exp.voidedBy || null,
          exp.voidedAt || null,
          exp.createdAt,
          exp.updatedAt,
          exp.createdBy,
          exp.updatedBy,
        ]
      );
      if (res.rowCount && res.rowCount > 0) expCreated++;
      else expSkipped++;
    } catch (err: any) {
      counts.failed['expenses'] = (counts.failed['expenses'] || 0) + 1;
    }
  }
  counts.created['expenses'] = expCreated;
  counts.skipped['expenses'] = expSkipped;

  return counts;
}

async function main() {
  const isClean = process.argv.includes('--clean');
  console.log('========================================================================');
  console.log(`[BD Legal Practice Management] Synthetic Test Data Generator`);
  console.log(`Mode: ${isClean ? 'CLEAN (Remove Synthetic Data)' : 'POPULATE (Generate 100 Clients & Related Records)'}`);
  console.log(`Target Firm: ${SYNTHETIC_FIRM_ID}`);
  console.log('========================================================================\n');

  const dataset = generateSyntheticDataset();
  console.log(`[Dataset Manifest Prepared]`);
  console.log(`- Synthetic Clients: ${dataset.clients.length}`);
  console.log(`- Related Cases: ${dataset.cases.length}`);
  console.log(`- Hearings: ${dataset.hearings.length}`);
  console.log(`- Hearing Date Histories: ${dataset.hearingDateHistory.length}`);
  console.log(`- Assigned Tasks: ${dataset.tasks.length}`);
  console.log(`- Client Consultations & Notes: ${dataset.clientNotes.length}`);
  console.log(`- Appointments: ${dataset.appointments.length}`);
  console.log(`- Fee Agreements: ${dataset.feeAgreements.length}`);
  console.log(`- Fee Payments: ${dataset.feePayments.length}`);
  console.log(`- Case Expenses: ${dataset.expenses.length}`);
  console.log(`- Physical File Records (Mock Store): ${dataset.physicalFiles.length}`);
  console.log(`- File Movements: ${dataset.fileMovements.length}\n`);

  // 1. Check PostgreSQL Database if DATABASE_URL is set
  const dbUrl = process.env.DATABASE_URL;
  if (dbUrl) {
    console.log(`[PostgreSQL Target Detected]: Connecting to database...`);
    const pgClient = await getPgClient(dbUrl);
    if (pgClient) {
      try {
        await pgClient.connect();
        console.log(`[PostgreSQL] Connected successfully.`);
        const counts = await populatePostgres(pgClient, isClean);
        if (!isClean) {
          console.log('\n[PostgreSQL Population Summary]:');
          for (const [entity, count] of Object.entries(counts.created)) {
            console.log(`  - ${entity}: ${count} created, ${counts.skipped[entity] || 0} reused/skipped, ${counts.failed[entity] || 0} failed`);
          }
        }
        await pgClient.end();
      } catch (err: any) {
        console.warn(`[PostgreSQL] Connection or execution error: ${err.message}`);
      }
    }
  } else {
    console.log(`[Database Notice]: No DATABASE_URL configured in environment.`);
    console.log(`Application active runtime: In-Memory / Mock Store (dual-mode parity).`);
  }

  // 2. Populate / Clean In-Memory & Mock Store
  try {
    const { localStore } = await import('../src/data/mockStore.js');
    if (isClean) {
      const res = localStore.removeSyntheticData();
      console.log(`\n[Mock Store Clean Summary]:`);
      for (const [entity, count] of Object.entries(res.removed)) {
        console.log(`  - ${entity}: ${count} synthetic records removed`);
      }
    } else {
      const res = localStore.populateSyntheticData();
      console.log(`\n[Mock Store Population Summary]:`);
      for (const [entity, count] of Object.entries(res.created)) {
        console.log(`  - ${entity}: ${count} created, ${res.skipped[entity] || 0} reused/skipped`);
      }
    }
  } catch (err: any) {
    console.warn(`[MockStore] Notice: ${err.message}`);
  }

  console.log('\n========================================================================');
  console.log(`SYNTHETIC DATA OPERATION COMPLETE.`);
  console.log('========================================================================');
}

main().catch((err) => {
  console.error('[SyntheticSeed Fatal Error]:', err);
  process.exit(1);
});
