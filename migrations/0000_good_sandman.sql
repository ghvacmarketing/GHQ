CREATE TABLE "announcements" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"message" text NOT NULL,
	"button_text" text DEFAULT 'Got it' NOT NULL,
	"version" text DEFAULT '1' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "attachments" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar,
	"project_id" varchar,
	"activity_id" varchar,
	"work_order_id" varchar,
	"storage_key" text NOT NULL,
	"original_name" text NOT NULL,
	"content_type" text NOT NULL,
	"size_bytes" integer NOT NULL,
	"uploaded_by" varchar,
	"thumbnail_key" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "auth_tokens" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"phone_number" text NOT NULL,
	"token" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "auth_tokens_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "call_daily" (
	"date" date PRIMARY KEY NOT NULL,
	"inbound_calls" integer DEFAULT 0 NOT NULL,
	"missed_calls" integer DEFAULT 0,
	"answered_calls" integer DEFAULT 0,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "call_log_days" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"date" text NOT NULL,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "call_log_days_date_unique" UNIQUE("date")
);
--> statement-breakpoint
CREATE TABLE "call_log_tasks" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"call_log_id" varchar NOT NULL,
	"description" text NOT NULL,
	"is_completed" boolean DEFAULT false NOT NULL,
	"due_date" text,
	"created_at" timestamp DEFAULT now(),
	"completed_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "call_logs" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"day_id" varchar NOT NULL,
	"client_name" text NOT NULL,
	"description" text NOT NULL,
	"phone" text,
	"tag" text,
	"billable" boolean DEFAULT false NOT NULL,
	"created_by_user_id" text,
	"created_by_name" text,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "categories" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"order" text DEFAULT '0' NOT NULL,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "categories_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "checklist_questions" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"checklist_id" varchar NOT NULL,
	"question" text NOT NULL,
	"question_type" text DEFAULT 'text' NOT NULL,
	"options" json,
	"is_required" boolean DEFAULT false NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"help_text" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "commercial_profiles" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" varchar NOT NULL,
	"tax_exempt" boolean DEFAULT false,
	"tax_exempt_number" text,
	"requires_po" boolean DEFAULT false,
	"po_prefix" text,
	"net_terms" integer DEFAULT 30,
	"billing_address" text,
	"billing_city" text,
	"billing_state" text,
	"billing_zip" text,
	"w9_on_file" boolean DEFAULT false,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "commercial_profiles_account_id_unique" UNIQUE("account_id")
);
--> statement-breakpoint
CREATE TABLE "compensation_audit_log" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"compensation_id" varchar,
	"action" text NOT NULL,
	"previous_value" text,
	"new_value" text,
	"changed_by" varchar NOT NULL,
	"changed_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "compensations" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"pay_type" text NOT NULL,
	"rate" text NOT NULL,
	"commission_rate" text,
	"pay_schedule" text DEFAULT 'biweekly' NOT NULL,
	"effective_date" date NOT NULL,
	"end_date" date,
	"created_by" varchar,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "crm_accounts" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"display_name" text NOT NULL,
	"company_name" text,
	"account_type" text DEFAULT 'RESIDENTIAL' NOT NULL,
	"account_status" text DEFAULT 'PROSPECT' NOT NULL,
	"lead_source" text,
	"parent_account_id" varchar,
	"customer_since" date,
	"pinned_note" text,
	"no_call_recording" boolean DEFAULT false,
	"tags" json DEFAULT '[]'::json,
	"source_system" text,
	"source_id" text,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "crm_agreements" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agreement_number" text NOT NULL,
	"customer_id" varchar,
	"property_id" varchar,
	"customer_name" text NOT NULL,
	"agreement_plan" text DEFAULT 'Preventative Maintenance' NOT NULL,
	"next_service_date" date,
	"next_invoice_date" date,
	"address" text,
	"status" text DEFAULT 'active' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"notes" text,
	"start_date" date,
	"end_date" date,
	"contract_date" date,
	"appointment_date" date,
	"number_of_systems" integer DEFAULT 1 NOT NULL,
	"price" numeric(10, 2) DEFAULT '229.00',
	"frequency" text DEFAULT 'annual' NOT NULL,
	"visits_per_period" integer DEFAULT 2 NOT NULL,
	"auto_renew" boolean DEFAULT true NOT NULL,
	"region_id" varchar,
	"agreement_type" text DEFAULT 'standard' NOT NULL,
	"custom_agreement_type_id" varchar,
	"billing_preference" text DEFAULT 'auto_invoice' NOT NULL,
	"activation_date" date,
	"grace_expires_at" date,
	"is_initial_cycle" boolean DEFAULT true NOT NULL,
	"first_invoice_sent_at" timestamp,
	"initial_invoice_id" varchar,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "crm_audit_log" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor_user_id" varchar,
	"actor_type" text DEFAULT 'user' NOT NULL,
	"action" text NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" varchar,
	"metadata" json,
	"ip_address" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "crm_contacts" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" varchar NOT NULL,
	"site_id" varchar,
	"first_name" text NOT NULL,
	"last_name" text,
	"email" text,
	"phone" text,
	"contact_role" text DEFAULT 'PRIMARY' NOT NULL,
	"is_primary" boolean DEFAULT false,
	"is_preferred" boolean DEFAULT false,
	"notes" text,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "crm_customer_notes" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"customer_id" varchar NOT NULL,
	"user_id" varchar,
	"body" text NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "crm_customers" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"company_name" text,
	"email" text,
	"phone" text,
	"customer_type" text DEFAULT 'residential',
	"customer_status" text DEFAULT 'client',
	"full_address" text,
	"lead_source" text,
	"tags" json DEFAULT '[]'::json,
	"notes" text,
	"portal_enabled" boolean DEFAULT false NOT NULL,
	"source_system" text,
	"source_id" text,
	"sales_stage" text,
	"interest_level" text,
	"potential_value" integer,
	"assigned_sales_rep_id" varchar,
	"next_follow_up_at" timestamp,
	"converted_at" timestamp,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "crm_equipment" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"property_id" varchar NOT NULL,
	"equipment_type" text NOT NULL,
	"brand" text,
	"model" text,
	"serial_number" text,
	"install_date" date,
	"notes" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "crm_follow_ups" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"customer_id" varchar NOT NULL,
	"follow_up_type" text DEFAULT 'call' NOT NULL,
	"due_at" timestamp NOT NULL,
	"completed_at" timestamp,
	"outcome" text,
	"notes" text,
	"assigned_user_id" varchar,
	"created_by" varchar,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "crm_invoice_line_items" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"invoice_id" varchar NOT NULL,
	"line_type" text DEFAULT 'part' NOT NULL,
	"description" text NOT NULL,
	"part_number" text,
	"quantity" numeric(10, 2) DEFAULT '1' NOT NULL,
	"unit_price" numeric(10, 2) NOT NULL,
	"line_total" numeric(10, 2) NOT NULL,
	"sort_order" integer DEFAULT 0,
	"item_id" varchar,
	"is_discount_line" boolean DEFAULT false,
	"discount_kind" text,
	"quickbooks_sub_account_id" varchar,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "crm_invoices" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"invoice_number" text NOT NULL,
	"customer_id" varchar,
	"property_id" varchar,
	"work_order_id" varchar,
	"project_id" varchar,
	"status" text DEFAULT 'draft' NOT NULL,
	"subtotal" numeric(10, 2) DEFAULT '0',
	"labor_total" numeric(10, 2) DEFAULT '0',
	"total" numeric(10, 2) DEFAULT '0',
	"amount_paid" numeric(10, 2) DEFAULT '0',
	"balance_due" numeric(10, 2) DEFAULT '0',
	"due_date" timestamp,
	"sent_at" timestamp,
	"paid_at" timestamp,
	"voided_at" timestamp,
	"void_reason" text,
	"payment_method" text,
	"payment_reference" text,
	"stripe_payment_link_id" text,
	"notes" text,
	"created_by" varchar,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "crm_items" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"category" text DEFAULT 'install',
	"item_type" text DEFAULT 'parts',
	"part_number" text,
	"rate" numeric(10, 2) DEFAULT '0',
	"cost_price" numeric(10, 2),
	"unit" text DEFAULT 'each',
	"in_stock" boolean DEFAULT true,
	"is_active" boolean DEFAULT true,
	"is_variable_rate" boolean DEFAULT false,
	"is_discount" boolean DEFAULT false,
	"discount_kind" text,
	"is_system_item" boolean DEFAULT false,
	"sort_order" integer DEFAULT 0,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "crm_job_assignments" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"job_id" varchar NOT NULL,
	"tech_user_id" varchar NOT NULL,
	"start_at" timestamp,
	"end_at" timestamp,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "crm_job_notes" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"job_id" varchar NOT NULL,
	"user_id" varchar,
	"body" text NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "crm_job_status_events" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"job_id" varchar NOT NULL,
	"status" text NOT NULL,
	"user_id" varchar,
	"notes" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "crm_jobs" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"customer_id" varchar,
	"property_id" varchar,
	"account_id" varchar,
	"site_id" varchar,
	"job_type" text NOT NULL,
	"status" text DEFAULT 'new' NOT NULL,
	"priority" text DEFAULT 'normal',
	"description" text,
	"scheduled_start" timestamp,
	"scheduled_end" timestamp,
	"completed_at" timestamp,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "crm_messaging_conversation_tags" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"conversation_id" varchar NOT NULL,
	"tag" text NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "crm_messaging_conversations" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"customer_id" varchar,
	"phone_number" text NOT NULL,
	"customer_name" text,
	"source" text,
	"subject" text,
	"external_source" text DEFAULT 'internal',
	"external_conversation_id" text,
	"status" text DEFAULT 'open',
	"last_message_at" timestamp,
	"last_outbound_at" timestamp,
	"unread_inbound_count" integer DEFAULT 0,
	"unread_count" integer DEFAULT 0,
	"assigned_to_id" varchar,
	"snooze_until" timestamp,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "crm_messaging_messages" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"conversation_id" varchar NOT NULL,
	"direction" text DEFAULT 'outbound',
	"channel" text DEFAULT 'sms',
	"body" text,
	"attachments" json,
	"sent_at" timestamp,
	"delivered_at" timestamp,
	"read_at" timestamp,
	"author_user_id" varchar,
	"external_message_id" text,
	"status" text DEFAULT 'queued',
	"error_message" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "crm_payments" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"invoice_id" varchar NOT NULL,
	"provider" text NOT NULL,
	"amount" numeric(10, 2) NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"provider_payment_id" text,
	"notes" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "crm_projects" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"customer_id" varchar,
	"property_id" varchar,
	"project_type" text NOT NULL,
	"status" text DEFAULT 'lead' NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"expected_value" numeric(10, 2),
	"actual_value" numeric(10, 2),
	"priority" text DEFAULT 'normal',
	"proposal_sent_at" timestamp,
	"approved_at" timestamp,
	"completed_at" timestamp,
	"closed_at" timestamp,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "crm_properties" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"customer_id" varchar NOT NULL,
	"address1" text NOT NULL,
	"address2" text,
	"city" text NOT NULL,
	"state" text NOT NULL,
	"zip" text NOT NULL,
	"notes" text,
	"tenant_name" text,
	"tenant_phone" text,
	"tenant_email" text,
	"owner_name" text,
	"owner_phone" text,
	"owner_email" text,
	"preferred_payment_method" text,
	"billing_override" boolean DEFAULT false,
	"billed_to" text DEFAULT 'property_manager',
	"payment_terms" text,
	"payment_method" text,
	"approval_rule" text,
	"property_type" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "crm_quote_line_items" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"quote_id" varchar NOT NULL,
	"line_type" text DEFAULT 'part' NOT NULL,
	"description" text NOT NULL,
	"part_number" text,
	"quantity" numeric(10, 2) DEFAULT '1' NOT NULL,
	"unit_price" numeric(10, 2) NOT NULL,
	"line_total" numeric(10, 2) NOT NULL,
	"sort_order" integer DEFAULT 0,
	"item_id" varchar,
	"is_discount_line" boolean DEFAULT false,
	"discount_kind" text,
	"option_tag" text,
	"image_url" text,
	"quickbooks_sub_account_id" varchar,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "crm_quotes" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"quote_number" text NOT NULL,
	"job_id" varchar,
	"account_id" varchar,
	"site_id" varchar,
	"contact_id" varchar,
	"customer_name" text NOT NULL,
	"customer_email" text,
	"customer_phone" text,
	"service_address" text,
	"title" text,
	"description" text,
	"line_items" json DEFAULT '[]'::json,
	"subtotal" numeric(10, 2) DEFAULT '0' NOT NULL,
	"labor_total" numeric(10, 2) DEFAULT '0',
	"total" numeric(10, 2) DEFAULT '0' NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"valid_until" timestamp,
	"sent_at" timestamp,
	"viewed_at" timestamp,
	"accepted_at" timestamp,
	"declined_at" timestamp,
	"created_by_id" varchar,
	"assigned_to_id" varchar,
	"internal_notes" text,
	"customer_notes" text,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	"customer_id" varchar,
	"property_id" varchar,
	"work_order_id" varchar,
	"project_id" varchar,
	"scope" text,
	"accepted_by" text,
	"decline_reason" text,
	"notes" text,
	"created_by" varchar,
	"ai_generated_quote" json,
	"quote_mode" text,
	"selected_option" text,
	"quote_type" text,
	"view_token" text,
	"signature_image" text,
	"signer_name" text,
	"signer_ip" text,
	"signed_at" timestamp,
	"quote_category" text,
	"deposit_paid_at" timestamp,
	"deposit_amount" numeric(10, 2),
	"stripe_payment_intent_id" text,
	"stripe_payment_link_id" text
);
--> statement-breakpoint
CREATE TABLE "crm_sessions" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"session_token" text NOT NULL,
	"user_agent" text,
	"ip_address" text,
	"created_at" timestamp DEFAULT now(),
	"expires_at" timestamp NOT NULL,
	"last_seen_at" timestamp DEFAULT now(),
	CONSTRAINT "crm_sessions_session_token_unique" UNIQUE("session_token")
);
--> statement-breakpoint
CREATE TABLE "crm_sites" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" varchar NOT NULL,
	"site_name" text,
	"address1" text NOT NULL,
	"address2" text,
	"city" text NOT NULL,
	"state" text NOT NULL,
	"zip" text NOT NULL,
	"is_primary" boolean DEFAULT false,
	"access_instructions" text,
	"gate_code" text,
	"notes" text,
	"tenant_name" text,
	"tenant_phone" text,
	"tenant_email" text,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "crm_time_entries" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"technician_id" varchar NOT NULL,
	"work_order_id" varchar,
	"clock_in_at" timestamp NOT NULL,
	"clock_out_at" timestamp,
	"duration_minutes" integer,
	"notes" text,
	"source" text DEFAULT 'mobile',
	"created_by_id" varchar,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "crm_users" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"phone" text,
	"role" text DEFAULT 'tech' NOT NULL,
	"password_hash" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "crm_users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "crm_webhook_events" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provider" text NOT NULL,
	"provider_event_id" text NOT NULL,
	"payload_json" json,
	"received_at" timestamp DEFAULT now(),
	"processed_at" timestamp,
	CONSTRAINT "crm_webhook_events_provider_event_id_unique" UNIQUE("provider_event_id")
);
--> statement-breakpoint
CREATE TABLE "crm_work_orders" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"customer_id" varchar,
	"property_id" varchar,
	"project_id" varchar,
	"job_id" varchar,
	"agreement_id" varchar,
	"work_order_number" integer DEFAULT 1 NOT NULL,
	"assigned_tech_id" varchar,
	"visit_type" text DEFAULT 'SERVICE',
	"work_category" text,
	"work_subtype" text NOT NULL,
	"title" text,
	"description" text,
	"scheduled_start" timestamp,
	"scheduled_end" timestamp,
	"status" text DEFAULT 'scheduled' NOT NULL,
	"priority" text DEFAULT 'normal',
	"dispatch_queue_stage" text,
	"checklist" json,
	"parts_used" json,
	"tech_notes" text,
	"completion_summary" text,
	"photos" json,
	"billing_disposition" text,
	"billing_notes" text,
	"dispatch_notes" text,
	"invoice_id" varchar,
	"source_quote_id" varchar,
	"dispatched_at" timestamp,
	"on_site_at" timestamp,
	"started_at" timestamp,
	"completed_at" timestamp,
	"finalized_at" timestamp,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "custom_agreement_types" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"frequency" text DEFAULT 'annual' NOT NULL,
	"visits_per_period" integer DEFAULT 2 NOT NULL,
	"default_price" numeric(10, 2) DEFAULT '0.00',
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "custom_agreement_types_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "customer_import_batches" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"filename" text,
	"file_hash" text,
	"imported_at" timestamp DEFAULT now(),
	"status" text DEFAULT 'processing' NOT NULL,
	"total_rows" text DEFAULT '0',
	"created_count" text DEFAULT '0',
	"updated_count" text DEFAULT '0',
	"skipped_count" text DEFAULT '0',
	"error_count" text DEFAULT '0',
	"error_details" text
);
--> statement-breakpoint
CREATE TABLE "customer_portal_accounts" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"customer_id" varchar NOT NULL,
	"email" text,
	"phone" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"last_login_at" timestamp,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "customer_portal_login_tokens" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" varchar NOT NULL,
	"token" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"used_at" timestamp,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "customer_portal_login_tokens_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "customer_portal_sessions" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" varchar NOT NULL,
	"session_token" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "customer_portal_sessions_session_token_unique" UNIQUE("session_token")
);
--> statement-breakpoint
CREATE TABLE "customers" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"display_name" text NOT NULL,
	"customer_type" text,
	"customer_status" text,
	"full_address" text,
	"phone" text,
	"email" text,
	"lead_source" text,
	"checksum" text,
	"import_batch_id" varchar,
	"last_synced_at" timestamp DEFAULT now(),
	"created_at" timestamp DEFAULT now(),
	"archived" boolean DEFAULT false,
	"archived_at" timestamp,
	"archived_by" varchar,
	"archive_reason" text
);
--> statement-breakpoint
CREATE TABLE "employee_documents" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar,
	"title" text NOT NULL,
	"description" text,
	"file_url" text NOT NULL,
	"category" text NOT NULL,
	"uploaded_by" varchar,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "employee_profiles" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"first_name" text NOT NULL,
	"last_name" text NOT NULL,
	"phone" text,
	"address" text,
	"hire_date" date,
	"department" text,
	"position" text,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "import_batches" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source" text NOT NULL,
	"filename" text,
	"imported_at" timestamp DEFAULT now(),
	"status" text DEFAULT 'completed' NOT NULL,
	"created_count" text DEFAULT '0',
	"updated_count" text DEFAULT '0',
	"skipped_count" text DEFAULT '0',
	"error_count" text DEFAULT '0',
	"summary" text
);
--> statement-breakpoint
CREATE TABLE "invoice_email_logs" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"invoice_id" varchar NOT NULL,
	"direction" text DEFAULT 'outgoing' NOT NULL,
	"from_email" text,
	"recipient_email" text NOT NULL,
	"recipient_name" text,
	"subject" text NOT NULL,
	"html_content" text,
	"text_content" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"error_message" text,
	"sent_by" varchar,
	"sent_at" timestamp DEFAULT now(),
	"delivered_at" timestamp,
	"opened_at" timestamp,
	"personal_message" text,
	"is_manual" boolean DEFAULT false,
	"resend_message_id" text,
	"reply_to_email" text
);
--> statement-breakpoint
CREATE TABLE "lead_history" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"lead_id" varchar NOT NULL,
	"actor" text NOT NULL,
	"action_type" text NOT NULL,
	"payload" json DEFAULT '{}'::json NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "leads" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"phone" text,
	"email" text,
	"address" text,
	"estimated_value" numeric(10, 2),
	"status" text DEFAULT 'New' NOT NULL,
	"client_issue" text,
	"projected_close_date" timestamp,
	"created_at" timestamp DEFAULT now(),
	"won" boolean DEFAULT false NOT NULL,
	"lost" boolean DEFAULT false NOT NULL,
	"closed_at" timestamp,
	"next_actions" json DEFAULT '[]'::json NOT NULL,
	"scheduled_tasks" json DEFAULT '[]'::json NOT NULL,
	"quote_details" text,
	"quote_pricing" text,
	"customer_type" text,
	"job_type" text,
	"lead_source" text,
	"assigned_employee_id" varchar,
	"quote_id" varchar,
	"external_id" text,
	"import_source" text,
	"import_batch_id" varchar,
	"last_imported_at" timestamp,
	"dedupe_hash" text,
	"deleted_at" timestamp,
	"deleted_by" text,
	"updated_at" timestamp DEFAULT now(),
	"tags" json DEFAULT '[]'::json NOT NULL,
	"install_step" text,
	"install_order" integer DEFAULT 0,
	"install_date" timestamp,
	"install_end_date" timestamp,
	"install_entered_at" timestamp,
	"install_subcontractor" text,
	"service_step" text,
	"service_order" integer DEFAULT 0,
	"service_entered_at" timestamp,
	"repair_date" timestamp,
	"current_pipeline" text,
	"transferred_from_pipeline" text,
	"transferred_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "maintenance_agreement_tasks" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agreement_id" varchar NOT NULL,
	"task_name" text NOT NULL,
	"duration" integer DEFAULT 60,
	"amount" numeric(10, 2) DEFAULT '0.00',
	"requires_confirmation" boolean DEFAULT true,
	"allow_upgrade" boolean DEFAULT false,
	"notes" text,
	"sort_order" integer DEFAULT 0,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "maintenance_regions" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"reminder_day_of_month" integer DEFAULT 1 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "maintenance_regions_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "maintenance_task_equipment" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"task_id" varchar NOT NULL,
	"equipment_name" text NOT NULL,
	"make" text,
	"model" text,
	"serial_number" text,
	"location" text,
	"notes" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "maintenance_task_parts" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"task_id" varchar NOT NULL,
	"part_name" text NOT NULL,
	"part_number" text,
	"quantity" integer DEFAULT 1,
	"unit_cost" numeric(10, 2) DEFAULT '0.00',
	"unit_price" numeric(10, 2) DEFAULT '0.00',
	"is_billable" boolean DEFAULT true,
	"notes" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "maintenance_task_schedules" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"task_id" varchar NOT NULL,
	"frequency" text NOT NULL,
	"interval_value" integer DEFAULT 1,
	"day_of_month" integer,
	"day_of_week" integer,
	"active_months" integer[],
	"start_date" date,
	"end_date" date,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "maintenance_visits" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agreement_id" varchar NOT NULL,
	"visit_number" integer NOT NULL,
	"total_visits_in_cycle" integer DEFAULT 2 NOT NULL,
	"cycle_year" integer NOT NULL,
	"target_date" date NOT NULL,
	"reminder_sent_at" timestamp,
	"work_order_id" varchar,
	"completed_at" timestamp,
	"status" text DEFAULT 'pending' NOT NULL,
	"is_renewal_trigger" boolean DEFAULT false NOT NULL,
	"renewal_status" text DEFAULT 'none' NOT NULL,
	"renewal_invoice_id" varchar,
	"notes" text,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "monthly_goals" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"year" integer NOT NULL,
	"month" integer NOT NULL,
	"daily_service_goal" numeric(10, 2) DEFAULT '0' NOT NULL,
	"daily_install_goal" numeric(10, 2) DEFAULT '0' NOT NULL,
	"daily_maintenance_goal" numeric(10, 2) DEFAULT '0' NOT NULL,
	"monthly_service_goal" numeric(10, 2) DEFAULT '0' NOT NULL,
	"monthly_install_goal" numeric(10, 2) DEFAULT '0' NOT NULL,
	"monthly_maintenance_goal" numeric(10, 2) DEFAULT '0' NOT NULL,
	"monthly_sales_goal" numeric(10, 2) DEFAULT '0' NOT NULL,
	"budgeted_monthly_sales_goal" numeric(12, 2) DEFAULT '0' NOT NULL,
	"service_work_days" integer DEFAULT 22 NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "parts" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"part_number" text NOT NULL,
	"description" text NOT NULL,
	"category" text NOT NULL,
	"price" numeric(10, 2) NOT NULL,
	"availability" text NOT NULL,
	"vendor" text,
	"warranty" boolean DEFAULT false,
	"is_custom" boolean DEFAULT false
);
--> statement-breakpoint
CREATE TABLE "paystubs" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"period_start" date NOT NULL,
	"period_end" date NOT NULL,
	"pay_date" date NOT NULL,
	"gross_pay" text NOT NULL,
	"net_pay" text NOT NULL,
	"hours_worked" text,
	"deductions" text,
	"file_url" text,
	"uploaded_by" varchar,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "pdf_files" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"content_type" text DEFAULT 'application/pdf' NOT NULL,
	"size" text NOT NULL,
	"data" text NOT NULL,
	"uploaded_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "phone_whitelist" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"phone_number" text NOT NULL,
	"name" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "phone_whitelist_phone_number_unique" UNIQUE("phone_number")
);
--> statement-breakpoint
CREATE TABLE "portal_users" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"username" text NOT NULL,
	"email" text,
	"password" text NOT NULL,
	"role" text DEFAULT 'employee' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"last_login" timestamp,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "portal_users_username_unique" UNIQUE("username"),
	CONSTRAINT "portal_users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "process_attachments" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"process_id" varchar NOT NULL,
	"filename" text NOT NULL,
	"file_type" text NOT NULL,
	"mime_type" text NOT NULL,
	"file_size" text NOT NULL,
	"file_data" text NOT NULL,
	"display_order" text DEFAULT '0' NOT NULL,
	"uploaded_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "processes" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"description" text NOT NULL,
	"category" text NOT NULL,
	"rationale" text,
	"steps" json,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "project_activities" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" varchar NOT NULL,
	"work_order_id" varchar,
	"user_id" varchar,
	"activity_type" text NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"metadata" json,
	"is_pinned" boolean DEFAULT false,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "property_manager_profiles" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" varchar NOT NULL,
	"requires_approval_before" boolean DEFAULT false,
	"approval_threshold" numeric(10, 2),
	"default_billing_method" text,
	"net_terms" integer DEFAULT 30,
	"management_company_name" text,
	"portfolio_size" integer,
	"billing_terms" text DEFAULT 'NET_30',
	"default_bill_to" text DEFAULT 'PM',
	"main_office_phone" text,
	"main_office_email" text,
	"billing_ap_email" text,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "property_manager_profiles_account_id_unique" UNIQUE("account_id")
);
--> statement-breakpoint
CREATE TABLE "proposal_sessions" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"customer_id" varchar,
	"site_id" varchar,
	"selections_json" json,
	"cart_json" json,
	"pricing_totals_json" json,
	"ai_notes" text,
	"created_by" varchar,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "quickbooks_accounts" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(255) NOT NULL,
	"fully_qualified_name" varchar(500),
	"account_type" text DEFAULT 'Income',
	"account_sub_type" varchar(100),
	"category_type" text,
	"property_type" text,
	"is_parent" boolean DEFAULT false,
	"parent_account_id" varchar,
	"quickbooks_account_id" varchar,
	"quickbooks_parent_account_id" varchar,
	"realm_id" varchar,
	"sync_token" varchar,
	"is_active" boolean DEFAULT true,
	"current_balance" varchar,
	"last_synced_at" timestamp,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "quickbooks_category_class_map" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"category_name" varchar(255) NOT NULL,
	"quickbooks_class_id" varchar,
	"realm_id" varchar NOT NULL,
	"is_default" boolean DEFAULT false,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "quickbooks_classes" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(255) NOT NULL,
	"class_type" text NOT NULL,
	"sub_type" text NOT NULL,
	"quickbooks_class_id" varchar,
	"realm_id" varchar,
	"sync_token" varchar,
	"is_active" boolean DEFAULT true,
	"last_synced_at" timestamp,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "quickbooks_connection" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"realm_id" varchar NOT NULL,
	"access_token" text NOT NULL,
	"refresh_token" text NOT NULL,
	"access_token_expires_at" timestamp NOT NULL,
	"refresh_token_expires_at" timestamp NOT NULL,
	"environment" text DEFAULT 'sandbox',
	"company_name" text,
	"is_active" boolean DEFAULT true,
	"last_sync_at" timestamp,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "quickbooks_connection_realm_id_unique" UNIQUE("realm_id")
);
--> statement-breakpoint
CREATE TABLE "quickbooks_customer_sync" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"crm_customer_id" varchar NOT NULL,
	"quickbooks_customer_id" varchar NOT NULL,
	"realm_id" varchar NOT NULL,
	"sync_status" text DEFAULT 'synced',
	"last_sync_at" timestamp DEFAULT now(),
	"last_error" text,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "quickbooks_invoice_sync" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"crm_invoice_id" varchar NOT NULL,
	"quickbooks_invoice_id" varchar NOT NULL,
	"realm_id" varchar NOT NULL,
	"sync_status" text DEFAULT 'synced',
	"last_sync_at" timestamp DEFAULT now(),
	"last_error" text,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "quickbooks_items" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(255) NOT NULL,
	"description" text,
	"category_type" text NOT NULL,
	"property_type" text NOT NULL,
	"income_account_id" varchar,
	"quickbooks_item_id" varchar,
	"quickbooks_income_account_id" varchar,
	"realm_id" varchar,
	"sync_token" varchar,
	"item_type" text DEFAULT 'Service',
	"is_active" boolean DEFAULT true,
	"unit_price" varchar,
	"last_synced_at" timestamp,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "quickbooks_oauth_states" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"state" varchar NOT NULL,
	"environment" text DEFAULT 'sandbox',
	"created_at" timestamp DEFAULT now(),
	"expires_at" timestamp NOT NULL,
	CONSTRAINT "quickbooks_oauth_states_state_unique" UNIQUE("state")
);
--> statement-breakpoint
CREATE TABLE "quickbooks_payment_sync" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"crm_invoice_id" varchar NOT NULL,
	"quickbooks_payment_id" varchar NOT NULL,
	"realm_id" varchar NOT NULL,
	"amount" numeric(10, 2) NOT NULL,
	"sync_status" text DEFAULT 'synced',
	"last_sync_at" timestamp DEFAULT now(),
	"last_error" text,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "quickbooks_sync_log" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"realm_id" varchar NOT NULL,
	"sync_type" text NOT NULL,
	"direction" text NOT NULL,
	"status" text NOT NULL,
	"records_processed" integer DEFAULT 0,
	"records_failed" integer DEFAULT 0,
	"error_message" text,
	"started_at" timestamp DEFAULT now(),
	"completed_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "quote_conversations" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"customer_id" varchar,
	"customer_name" text NOT NULL,
	"rolling_summary" text,
	"cart_snapshot" json,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "quote_email_logs" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"quote_id" varchar NOT NULL,
	"direction" text DEFAULT 'outgoing' NOT NULL,
	"from_email" text,
	"recipient_email" text NOT NULL,
	"recipient_name" text,
	"subject" text NOT NULL,
	"html_content" text,
	"text_content" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"error_message" text,
	"sent_by" varchar,
	"sent_at" timestamp DEFAULT now(),
	"delivered_at" timestamp,
	"opened_at" timestamp,
	"personal_message" text,
	"is_manual" boolean DEFAULT false,
	"resend_message_id" text,
	"reply_to_email" text
);
--> statement-breakpoint
CREATE TABLE "quote_messages" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"conversation_id" varchar NOT NULL,
	"role" text NOT NULL,
	"content" text NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "quotes" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"customer_name" text NOT NULL,
	"technician" text NOT NULL,
	"parts" json DEFAULT '[]'::json NOT NULL,
	"subtotal" numeric(10, 2) NOT NULL,
	"labor" numeric(10, 2) NOT NULL,
	"total" numeric(10, 2) NOT NULL,
	"ghvac_installed" boolean DEFAULT false,
	"years_since_installation" text,
	"labor_hours" text,
	"status" text DEFAULT 'draft',
	"quote_text" text,
	"email_sent" boolean DEFAULT false,
	"trello_card_id" text,
	"pushed_to_trello" boolean DEFAULT false,
	"job_notes" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "residential_profiles" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" varchar NOT NULL,
	"membership_plan" text,
	"membership_start_date" date,
	"membership_end_date" date,
	"preferred_service_day" text,
	"preferred_time_slot" text,
	"special_instructions" text,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "residential_profiles_account_id_unique" UNIQUE("account_id")
);
--> statement-breakpoint
CREATE TABLE "saved_proposals" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"customer_name" text NOT NULL,
	"customer_address" text,
	"customer_phone" text,
	"customer_email" text,
	"quote_title" text NOT NULL,
	"package_description" text,
	"total" text NOT NULL,
	"quote_data" text NOT NULL,
	"status" text DEFAULT 'saved' NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "service_call_checklists" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"visit_type" text DEFAULT 'SERVICE' NOT NULL,
	"service_type" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "session" (
	"sid" varchar PRIMARY KEY NOT NULL,
	"sess" json NOT NULL,
	"expire" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "settings" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" text NOT NULL,
	"value" text NOT NULL,
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "settings_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE "sms_notification_log" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"customer_id" varchar,
	"notification_type" text NOT NULL,
	"maintenance_visit_id" varchar,
	"work_order_id" varchar,
	"invoice_id" varchar,
	"message_id" varchar,
	"conversation_id" varchar,
	"phone_number" text,
	"message_body" text,
	"status" text DEFAULT 'pending',
	"error_message" text,
	"sent_at" timestamp DEFAULT now(),
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "technicians" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "voicemails" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"trello_card_id" text NOT NULL,
	"trello_list_id" text,
	"title" text,
	"description" text,
	"status" text DEFAULT 'NEW' NOT NULL,
	"caller" text,
	"received_at" timestamp,
	"mp3_filename" text,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "voicemails_trello_card_id_unique" UNIQUE("trello_card_id")
);
--> statement-breakpoint
CREATE TABLE "weather_cache" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"lat" numeric(10, 6) NOT NULL,
	"lon" numeric(10, 6) NOT NULL,
	"forecast_json" json,
	"hourly_json" json,
	"alerts_json" json,
	"fetched_at" timestamp DEFAULT now(),
	"expires_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "weather_daily" (
	"date" date PRIMARY KEY NOT NULL,
	"avg_temp_f" numeric(5, 2),
	"max_temp_f" numeric(5, 2),
	"min_temp_f" numeric(5, 2),
	"cdd" numeric(5, 2) DEFAULT '0',
	"hdd" numeric(5, 2) DEFAULT '0',
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "work_order_checklist_responses" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"work_order_id" varchar NOT NULL,
	"checklist_id" varchar NOT NULL,
	"answers" json NOT NULL,
	"summary" text,
	"completed_by" varchar,
	"completed_at" timestamp DEFAULT now(),
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "work_order_subtypes" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"visit_type" text NOT NULL,
	"subtype" text NOT NULL,
	"is_active" boolean DEFAULT true,
	"sort_order" integer DEFAULT 0,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_project_id_crm_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."crm_projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_activity_id_project_activities_id_fk" FOREIGN KEY ("activity_id") REFERENCES "public"."project_activities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_work_order_id_crm_work_orders_id_fk" FOREIGN KEY ("work_order_id") REFERENCES "public"."crm_work_orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_uploaded_by_crm_users_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."crm_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "call_log_tasks" ADD CONSTRAINT "call_log_tasks_call_log_id_call_logs_id_fk" FOREIGN KEY ("call_log_id") REFERENCES "public"."call_logs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "call_logs" ADD CONSTRAINT "call_logs_day_id_call_log_days_id_fk" FOREIGN KEY ("day_id") REFERENCES "public"."call_log_days"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "checklist_questions" ADD CONSTRAINT "checklist_questions_checklist_id_service_call_checklists_id_fk" FOREIGN KEY ("checklist_id") REFERENCES "public"."service_call_checklists"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commercial_profiles" ADD CONSTRAINT "commercial_profiles_account_id_crm_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."crm_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "compensation_audit_log" ADD CONSTRAINT "compensation_audit_log_user_id_portal_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."portal_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "compensation_audit_log" ADD CONSTRAINT "compensation_audit_log_compensation_id_compensations_id_fk" FOREIGN KEY ("compensation_id") REFERENCES "public"."compensations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "compensation_audit_log" ADD CONSTRAINT "compensation_audit_log_changed_by_portal_users_id_fk" FOREIGN KEY ("changed_by") REFERENCES "public"."portal_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "compensations" ADD CONSTRAINT "compensations_user_id_portal_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."portal_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "compensations" ADD CONSTRAINT "compensations_created_by_portal_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."portal_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_accounts" ADD CONSTRAINT "crm_accounts_parent_account_id_crm_accounts_id_fk" FOREIGN KEY ("parent_account_id") REFERENCES "public"."crm_accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_agreements" ADD CONSTRAINT "crm_agreements_customer_id_crm_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."crm_customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_agreements" ADD CONSTRAINT "crm_agreements_property_id_crm_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."crm_properties"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_agreements" ADD CONSTRAINT "crm_agreements_region_id_maintenance_regions_id_fk" FOREIGN KEY ("region_id") REFERENCES "public"."maintenance_regions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_agreements" ADD CONSTRAINT "crm_agreements_custom_agreement_type_id_custom_agreement_types_id_fk" FOREIGN KEY ("custom_agreement_type_id") REFERENCES "public"."custom_agreement_types"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_audit_log" ADD CONSTRAINT "crm_audit_log_actor_user_id_crm_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."crm_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_contacts" ADD CONSTRAINT "crm_contacts_account_id_crm_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."crm_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_contacts" ADD CONSTRAINT "crm_contacts_site_id_crm_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."crm_sites"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_customer_notes" ADD CONSTRAINT "crm_customer_notes_customer_id_crm_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."crm_customers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_customer_notes" ADD CONSTRAINT "crm_customer_notes_user_id_crm_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."crm_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_equipment" ADD CONSTRAINT "crm_equipment_property_id_crm_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."crm_properties"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_follow_ups" ADD CONSTRAINT "crm_follow_ups_customer_id_crm_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."crm_customers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_follow_ups" ADD CONSTRAINT "crm_follow_ups_assigned_user_id_crm_users_id_fk" FOREIGN KEY ("assigned_user_id") REFERENCES "public"."crm_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_follow_ups" ADD CONSTRAINT "crm_follow_ups_created_by_crm_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."crm_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_invoice_line_items" ADD CONSTRAINT "crm_invoice_line_items_invoice_id_crm_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."crm_invoices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_invoice_line_items" ADD CONSTRAINT "crm_invoice_line_items_item_id_crm_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."crm_items"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_invoices" ADD CONSTRAINT "crm_invoices_work_order_id_crm_work_orders_id_fk" FOREIGN KEY ("work_order_id") REFERENCES "public"."crm_work_orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_invoices" ADD CONSTRAINT "crm_invoices_project_id_crm_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."crm_projects"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_invoices" ADD CONSTRAINT "crm_invoices_created_by_crm_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."crm_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_job_assignments" ADD CONSTRAINT "crm_job_assignments_job_id_crm_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."crm_jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_job_assignments" ADD CONSTRAINT "crm_job_assignments_tech_user_id_crm_users_id_fk" FOREIGN KEY ("tech_user_id") REFERENCES "public"."crm_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_job_notes" ADD CONSTRAINT "crm_job_notes_job_id_crm_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."crm_jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_job_notes" ADD CONSTRAINT "crm_job_notes_user_id_crm_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."crm_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_job_status_events" ADD CONSTRAINT "crm_job_status_events_job_id_crm_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."crm_jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_job_status_events" ADD CONSTRAINT "crm_job_status_events_user_id_crm_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."crm_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_jobs" ADD CONSTRAINT "crm_jobs_customer_id_crm_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."crm_customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_jobs" ADD CONSTRAINT "crm_jobs_property_id_crm_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."crm_properties"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_jobs" ADD CONSTRAINT "crm_jobs_account_id_crm_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."crm_accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_jobs" ADD CONSTRAINT "crm_jobs_site_id_crm_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."crm_sites"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_messaging_conversation_tags" ADD CONSTRAINT "crm_messaging_conversation_tags_conversation_id_crm_messaging_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."crm_messaging_conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_messaging_conversations" ADD CONSTRAINT "crm_messaging_conversations_customer_id_crm_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."crm_customers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_messaging_conversations" ADD CONSTRAINT "crm_messaging_conversations_assigned_to_id_crm_users_id_fk" FOREIGN KEY ("assigned_to_id") REFERENCES "public"."crm_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_messaging_messages" ADD CONSTRAINT "crm_messaging_messages_conversation_id_crm_messaging_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."crm_messaging_conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_messaging_messages" ADD CONSTRAINT "crm_messaging_messages_author_user_id_crm_users_id_fk" FOREIGN KEY ("author_user_id") REFERENCES "public"."crm_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_payments" ADD CONSTRAINT "crm_payments_invoice_id_crm_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."crm_invoices"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_properties" ADD CONSTRAINT "crm_properties_customer_id_crm_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."crm_customers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_quote_line_items" ADD CONSTRAINT "crm_quote_line_items_quote_id_crm_quotes_id_fk" FOREIGN KEY ("quote_id") REFERENCES "public"."crm_quotes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_quote_line_items" ADD CONSTRAINT "crm_quote_line_items_item_id_crm_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."crm_items"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_sessions" ADD CONSTRAINT "crm_sessions_user_id_crm_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."crm_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_sites" ADD CONSTRAINT "crm_sites_account_id_crm_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."crm_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_time_entries" ADD CONSTRAINT "crm_time_entries_technician_id_crm_users_id_fk" FOREIGN KEY ("technician_id") REFERENCES "public"."crm_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_time_entries" ADD CONSTRAINT "crm_time_entries_work_order_id_crm_work_orders_id_fk" FOREIGN KEY ("work_order_id") REFERENCES "public"."crm_work_orders"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_time_entries" ADD CONSTRAINT "crm_time_entries_created_by_id_crm_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."crm_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_work_orders" ADD CONSTRAINT "crm_work_orders_customer_id_crm_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."crm_customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_work_orders" ADD CONSTRAINT "crm_work_orders_property_id_crm_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."crm_properties"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_work_orders" ADD CONSTRAINT "crm_work_orders_project_id_crm_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."crm_projects"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_work_orders" ADD CONSTRAINT "crm_work_orders_job_id_crm_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."crm_jobs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_work_orders" ADD CONSTRAINT "crm_work_orders_assigned_tech_id_crm_users_id_fk" FOREIGN KEY ("assigned_tech_id") REFERENCES "public"."crm_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_work_orders" ADD CONSTRAINT "crm_work_orders_source_quote_id_crm_quotes_id_fk" FOREIGN KEY ("source_quote_id") REFERENCES "public"."crm_quotes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_portal_accounts" ADD CONSTRAINT "customer_portal_accounts_customer_id_crm_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."crm_customers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_portal_login_tokens" ADD CONSTRAINT "customer_portal_login_tokens_account_id_customer_portal_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."customer_portal_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_portal_sessions" ADD CONSTRAINT "customer_portal_sessions_account_id_customer_portal_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."customer_portal_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_documents" ADD CONSTRAINT "employee_documents_user_id_portal_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."portal_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_documents" ADD CONSTRAINT "employee_documents_uploaded_by_portal_users_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."portal_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_profiles" ADD CONSTRAINT "employee_profiles_user_id_portal_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."portal_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_email_logs" ADD CONSTRAINT "invoice_email_logs_invoice_id_crm_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."crm_invoices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "maintenance_agreement_tasks" ADD CONSTRAINT "maintenance_agreement_tasks_agreement_id_crm_agreements_id_fk" FOREIGN KEY ("agreement_id") REFERENCES "public"."crm_agreements"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "maintenance_task_equipment" ADD CONSTRAINT "maintenance_task_equipment_task_id_maintenance_agreement_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."maintenance_agreement_tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "maintenance_task_parts" ADD CONSTRAINT "maintenance_task_parts_task_id_maintenance_agreement_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."maintenance_agreement_tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "maintenance_task_schedules" ADD CONSTRAINT "maintenance_task_schedules_task_id_maintenance_agreement_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."maintenance_agreement_tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "maintenance_visits" ADD CONSTRAINT "maintenance_visits_agreement_id_crm_agreements_id_fk" FOREIGN KEY ("agreement_id") REFERENCES "public"."crm_agreements"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "maintenance_visits" ADD CONSTRAINT "maintenance_visits_work_order_id_crm_work_orders_id_fk" FOREIGN KEY ("work_order_id") REFERENCES "public"."crm_work_orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "maintenance_visits" ADD CONSTRAINT "maintenance_visits_renewal_invoice_id_crm_invoices_id_fk" FOREIGN KEY ("renewal_invoice_id") REFERENCES "public"."crm_invoices"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "paystubs" ADD CONSTRAINT "paystubs_user_id_portal_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."portal_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "paystubs" ADD CONSTRAINT "paystubs_uploaded_by_portal_users_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."portal_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_activities" ADD CONSTRAINT "project_activities_project_id_crm_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."crm_projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_activities" ADD CONSTRAINT "project_activities_work_order_id_crm_work_orders_id_fk" FOREIGN KEY ("work_order_id") REFERENCES "public"."crm_work_orders"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_activities" ADD CONSTRAINT "project_activities_user_id_crm_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."crm_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "property_manager_profiles" ADD CONSTRAINT "property_manager_profiles_account_id_crm_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."crm_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "proposal_sessions" ADD CONSTRAINT "proposal_sessions_customer_id_crm_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."crm_customers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "proposal_sessions" ADD CONSTRAINT "proposal_sessions_site_id_crm_properties_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."crm_properties"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "proposal_sessions" ADD CONSTRAINT "proposal_sessions_created_by_crm_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."crm_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quickbooks_category_class_map" ADD CONSTRAINT "quickbooks_category_class_map_quickbooks_class_id_quickbooks_classes_id_fk" FOREIGN KEY ("quickbooks_class_id") REFERENCES "public"."quickbooks_classes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quickbooks_customer_sync" ADD CONSTRAINT "quickbooks_customer_sync_crm_customer_id_crm_customers_id_fk" FOREIGN KEY ("crm_customer_id") REFERENCES "public"."crm_customers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quickbooks_invoice_sync" ADD CONSTRAINT "quickbooks_invoice_sync_crm_invoice_id_crm_invoices_id_fk" FOREIGN KEY ("crm_invoice_id") REFERENCES "public"."crm_invoices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quickbooks_items" ADD CONSTRAINT "quickbooks_items_income_account_id_quickbooks_accounts_id_fk" FOREIGN KEY ("income_account_id") REFERENCES "public"."quickbooks_accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quickbooks_payment_sync" ADD CONSTRAINT "quickbooks_payment_sync_crm_invoice_id_crm_invoices_id_fk" FOREIGN KEY ("crm_invoice_id") REFERENCES "public"."crm_invoices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quote_email_logs" ADD CONSTRAINT "quote_email_logs_quote_id_crm_quotes_id_fk" FOREIGN KEY ("quote_id") REFERENCES "public"."crm_quotes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "residential_profiles" ADD CONSTRAINT "residential_profiles_account_id_crm_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."crm_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sms_notification_log" ADD CONSTRAINT "sms_notification_log_customer_id_crm_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."crm_customers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sms_notification_log" ADD CONSTRAINT "sms_notification_log_maintenance_visit_id_maintenance_visits_id_fk" FOREIGN KEY ("maintenance_visit_id") REFERENCES "public"."maintenance_visits"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sms_notification_log" ADD CONSTRAINT "sms_notification_log_work_order_id_crm_work_orders_id_fk" FOREIGN KEY ("work_order_id") REFERENCES "public"."crm_work_orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sms_notification_log" ADD CONSTRAINT "sms_notification_log_invoice_id_crm_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."crm_invoices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sms_notification_log" ADD CONSTRAINT "sms_notification_log_conversation_id_crm_messaging_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."crm_messaging_conversations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_order_checklist_responses" ADD CONSTRAINT "work_order_checklist_responses_work_order_id_crm_work_orders_id_fk" FOREIGN KEY ("work_order_id") REFERENCES "public"."crm_work_orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_order_checklist_responses" ADD CONSTRAINT "work_order_checklist_responses_checklist_id_service_call_checklists_id_fk" FOREIGN KEY ("checklist_id") REFERENCES "public"."service_call_checklists"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_order_checklist_responses" ADD CONSTRAINT "work_order_checklist_responses_completed_by_crm_users_id_fk" FOREIGN KEY ("completed_by") REFERENCES "public"."crm_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "idx_quickbooks_invoice_sync_unique" ON "quickbooks_invoice_sync" USING btree ("crm_invoice_id","realm_id");