CREATE TABLE IF NOT EXISTS physical_files (
  id text PRIMARY KEY NOT NULL,
  firm_id text NOT NULL REFERENCES firms(id),
  serial text NOT NULL,
  case_id text REFERENCES cases(id) ON DELETE SET NULL,
  client_id text REFERENCES clients(id) ON DELETE SET NULL,
  title text NOT NULL,
  shelf_location text,
  status text DEFAULT 'in_chamber' NOT NULL,
  holder_id text REFERENCES users(id) ON DELETE SET NULL,
  checked_out_at text,
  due_back_at text,
  notes text,
  created_at text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
  updated_at text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
  deleted_at text,
  created_by text,
  updated_by text
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS file_movements (
  id text PRIMARY KEY NOT NULL,
  firm_id text NOT NULL REFERENCES firms(id),
  file_id text NOT NULL REFERENCES physical_files(id),
  action text NOT NULL,
  user_id text NOT NULL REFERENCES users(id),
  at text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
  due_back_at text,
  note text
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS uidx_physical_files_firm_serial ON physical_files (firm_id, serial);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_physical_files_firm_id ON physical_files (firm_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_physical_files_case_id ON physical_files (case_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_physical_files_client_id ON physical_files (client_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_physical_files_holder_id ON physical_files (holder_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_physical_files_status ON physical_files (status);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_file_movements_firm_id ON file_movements (firm_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_file_movements_file_id ON file_movements (file_id);
