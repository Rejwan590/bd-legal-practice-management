CREATE TABLE IF NOT EXISTS "chamber_expense_categories" (
	"id" text PRIMARY KEY NOT NULL,
	"firm_id" text NOT NULL,
	"name" text NOT NULL,
	"name_bn" text,
	"kind" text DEFAULT 'general' NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"created_by" text,
	"updated_by" text
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "chamber_advances" (
	"id" text PRIMARY KEY NOT NULL,
	"firm_id" text NOT NULL,
	"given_to" text NOT NULL,
	"given_to_user_id" text,
	"amount_paisa" bigint NOT NULL,
	"given_date" text NOT NULL,
	"purpose" text NOT NULL,
	"payment_method" text NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"void_reason" text,
	"voided_by" text,
	"voided_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"created_by" text,
	"updated_by" text
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "chamber_expenses" (
	"id" text PRIMARY KEY NOT NULL,
	"firm_id" text NOT NULL,
	"category_id" text NOT NULL,
	"description" text NOT NULL,
	"amount_paisa" bigint NOT NULL,
	"expense_date" text NOT NULL,
	"paid_to" text NOT NULL,
	"payment_method" text NOT NULL,
	"receipt_ref" text,
	"notes" text,
	"advance_id" text,
	"status" text DEFAULT 'posted' NOT NULL,
	"void_reason" text,
	"voided_by" text,
	"voided_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"created_by" text,
	"updated_by" text
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "chamber_advance_settlements" (
	"id" text PRIMARY KEY NOT NULL,
	"firm_id" text NOT NULL,
	"advance_id" text NOT NULL,
	"type" text NOT NULL,
	"expense_id" text,
	"amount_paisa" bigint NOT NULL,
	"settled_date" text NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"created_by" text,
	"updated_by" text
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "chamber_expense_categories" ADD CONSTRAINT "chamber_expense_categories_firm_id_firms_id_fk" FOREIGN KEY ("firm_id") REFERENCES "public"."firms"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "chamber_advances" ADD CONSTRAINT "chamber_advances_firm_id_firms_id_fk" FOREIGN KEY ("firm_id") REFERENCES "public"."firms"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "chamber_advances" ADD CONSTRAINT "chamber_advances_given_to_user_id_users_id_fk" FOREIGN KEY ("given_to_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "chamber_expenses" ADD CONSTRAINT "chamber_expenses_firm_id_firms_id_fk" FOREIGN KEY ("firm_id") REFERENCES "public"."firms"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "chamber_expenses" ADD CONSTRAINT "chamber_expenses_category_id_chamber_expense_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."chamber_expense_categories"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "chamber_expenses" ADD CONSTRAINT "chamber_expenses_advance_id_chamber_advances_id_fk" FOREIGN KEY ("advance_id") REFERENCES "public"."chamber_advances"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "chamber_advance_settlements" ADD CONSTRAINT "chamber_advance_settlements_firm_id_firms_id_fk" FOREIGN KEY ("firm_id") REFERENCES "public"."firms"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "chamber_advance_settlements" ADD CONSTRAINT "chamber_advance_settlements_advance_id_chamber_advances_id_fk" FOREIGN KEY ("advance_id") REFERENCES "public"."chamber_advances"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "chamber_advance_settlements" ADD CONSTRAINT "chamber_advance_settlements_expense_id_chamber_expenses_id_fk" FOREIGN KEY ("expense_id") REFERENCES "public"."chamber_expenses"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_chamber_expense_categories_firm_id" ON "chamber_expense_categories" USING btree ("firm_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_chamber_advances_firm_id" ON "chamber_advances" USING btree ("firm_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_chamber_advances_status" ON "chamber_advances" USING btree ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_chamber_advances_given_date" ON "chamber_advances" USING btree ("given_date");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_chamber_expenses_firm_id" ON "chamber_expenses" USING btree ("firm_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_chamber_expenses_expense_date" ON "chamber_expenses" USING btree ("expense_date");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_chamber_expenses_category_id" ON "chamber_expenses" USING btree ("category_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_chamber_expenses_status" ON "chamber_expenses" USING btree ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_chamber_advance_settlements_firm_id" ON "chamber_advance_settlements" USING btree ("firm_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_chamber_advance_settlements_advance_id" ON "chamber_advance_settlements" USING btree ("advance_id");
