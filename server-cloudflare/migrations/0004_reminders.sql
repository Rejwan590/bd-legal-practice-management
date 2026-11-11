CREATE TABLE IF NOT EXISTS reminders (
  id text PRIMARY KEY NOT NULL,
  firm_id text NOT NULL REFERENCES firms(id),
  user_id text NOT NULL REFERENCES users(id),
  source_type text NOT NULL,
  source_id text NOT NULL,
  title text NOT NULL,
  description text,
  remind_at text NOT NULL,
  due_at text NOT NULL,
  channel text DEFAULT 'in_app' NOT NULL,
  status text DEFAULT 'pending' NOT NULL,
  sent_at text,
  dismissed_at text,
  created_at text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
  updated_at text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
  deleted_at text,
  created_by text,
  updated_by text
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_reminders_firm_id ON reminders (firm_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_reminders_firm_user ON reminders (firm_id, user_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_reminders_remind_at ON reminders (remind_at);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_reminders_source ON reminders (firm_id, source_type, source_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_reminders_status ON reminders (status);
