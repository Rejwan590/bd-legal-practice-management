CREATE INDEX IF NOT EXISTS `idx_fee_agreements_firm_client_case` ON `fee_agreements` (`firm_id`, `client_id`, `case_id`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_fee_payments_firm_agreement_status` ON `fee_payments` (`firm_id`, `fee_agreement_id`, `status`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_expenses_firm_client_case` ON `expenses` (`firm_id`, `client_id`, `case_id`);
