CREATE TABLE "app_settings" (
	"key" varchar(255) PRIMARY KEY NOT NULL,
	"value" text,
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "bouncie_settings" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"authorization_code" text,
	"access_token" text,
	"token_expires_at" timestamp,
	"connected_at" timestamp,
	"last_sync_at" timestamp,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "bouncie_vehicles" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"technician_id" varchar,
	"technician_name" text,
	"device_id" text,
	"imei" text,
	"vehicle_name" text NOT NULL,
	"vehicle_make" text,
	"vehicle_model" text,
	"vehicle_year" text,
	"license_plate" text,
	"vin" text,
	"nickname" text,
	"last_latitude" numeric(10, 7),
	"last_longitude" numeric(10, 7),
	"last_location_updated_at" timestamp,
	"last_speed" numeric(5, 1),
	"last_heading" integer,
	"odometer" numeric(10, 1),
	"fuel_level" numeric(5, 2),
	"is_running" boolean DEFAULT false,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "crawlspace_tiers" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(50) NOT NULL,
	"mil_thickness" integer NOT NULL,
	"roll_price" integer NOT NULL,
	"description" text,
	"is_active" boolean DEFAULT true,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "crm_comment_mentions" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"comment_id" varchar NOT NULL,
	"mentioned_user_id" varchar NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "crm_comments" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" varchar NOT NULL,
	"author_id" varchar NOT NULL,
	"body" text NOT NULL,
	"edited_at" timestamp,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "crm_lead_driver_options" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"label" text NOT NULL,
	"description" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "crm_lead_temp_options" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"numeric_value" integer NOT NULL,
	"label" text NOT NULL,
	"description" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "crm_lead_temp_options_numeric_value_unique" UNIQUE("numeric_value")
);
--> statement-breakpoint
CREATE TABLE "crm_lead_types" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "crm_leads" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"customer_id" varchar NOT NULL,
	"lead_type_id" varchar,
	"lead_temp_id" varchar,
	"lead_driver_id" varchar,
	"potential_value" integer,
	"assigned_sales_rep_id" varchar,
	"interest_level" text,
	"sales_stage" text DEFAULT 'new' NOT NULL,
	"notes" text,
	"won_at" timestamp,
	"lost_at" timestamp,
	"lost_reason" text,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "crm_notifications" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"type" text NOT NULL,
	"title" text NOT NULL,
	"preview" text,
	"entity_type" text,
	"entity_id" varchar,
	"actor_id" varchar,
	"is_read" boolean DEFAULT false NOT NULL,
	"read_at" timestamp,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "crm_project_tasks" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" varchar NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"assigned_user_id" varchar,
	"due_date" timestamp,
	"completed_at" timestamp,
	"sort_order" integer DEFAULT 0,
	"created_by" varchar,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "crm_tagged_comment_recipients" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"comment_id" varchar NOT NULL,
	"user_id" varchar NOT NULL,
	"resolved" boolean DEFAULT false NOT NULL,
	"resolved_at" timestamp,
	"resolved_by_id" varchar,
	"dismissed" boolean DEFAULT false NOT NULL,
	"notification_id" varchar,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "crm_tagged_comments" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"author_id" varchar NOT NULL,
	"page_route" text NOT NULL,
	"body" text NOT NULL,
	"author_dismissed" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "customer_files" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"customer_id" varchar NOT NULL,
	"name" text NOT NULL,
	"url" text NOT NULL,
	"object_path" text,
	"content_type" text,
	"size" integer,
	"uploaded_by" varchar,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "marketing_campaigns" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"type" text NOT NULL,
	"description" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"total_sent" integer DEFAULT 0 NOT NULL,
	"total_delivered" integer DEFAULT 0,
	"total_clicked" integer DEFAULT 0,
	"last_sent_at" timestamp,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "materials_catalog" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"category" text,
	"part_number" text,
	"unit_cost" numeric(10, 2) NOT NULL,
	"unit" text DEFAULT 'each',
	"vendor" text,
	"is_active" boolean DEFAULT true,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "package_price_adjustments" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"adjustment_type" text NOT NULL,
	"unit_type_filter" varchar(50),
	"tier_filter" varchar(50),
	"percentage_change" integer NOT NULL,
	"packages_affected" integer NOT NULL,
	"applied_by" varchar(100),
	"applied_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "pricebook_packages" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"unit_type" varchar(50) NOT NULL,
	"tier" varchar(50) NOT NULL,
	"tonnage" varchar(20) NOT NULL,
	"package_level" varchar(50) NOT NULL,
	"monthly_payment" integer NOT NULL,
	"total_investment" integer NOT NULL,
	"outdoor_brand" varchar(100),
	"outdoor_model" varchar(100),
	"outdoor_name" text,
	"coil_model" varchar(100),
	"coil_name" text,
	"indoor_heat_model" varchar(100),
	"indoor_heat_name" text,
	"thermostat_model" varchar(100),
	"thermostat_name" text,
	"accessory_models" text,
	"outdoor_image_url" text,
	"coil_image_url" text,
	"thermostat_image_url" text,
	"furnace_image_url" text,
	"base_monthly_payment" integer,
	"base_total_investment" integer,
	"adjustment_basis_points" integer DEFAULT 0,
	"is_active" boolean DEFAULT true,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "project_labor_entries" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" varchar NOT NULL,
	"date" date NOT NULL,
	"contractor" text NOT NULL,
	"description" text,
	"labor_type" text,
	"hours" numeric(5, 2),
	"hourly_rate" numeric(10, 2),
	"amount" numeric(10, 2) NOT NULL,
	"created_by" varchar,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "proposal_template_images" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"url" text NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "proposal_templates" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"body" text NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "rebate_case_activity_log" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"case_id" varchar NOT NULL,
	"user_id" varchar,
	"action" text NOT NULL,
	"description" text,
	"metadata" json,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "rebate_case_documents" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"case_id" varchar NOT NULL,
	"category" text DEFAULT 'other' NOT NULL,
	"name" text NOT NULL,
	"url" text NOT NULL,
	"object_path" text,
	"content_type" text,
	"size" integer,
	"notes" text,
	"uploaded_by_user_id" varchar,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "rebate_case_scope_checklist" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"case_id" varchar NOT NULL,
	"item_name" text NOT NULL,
	"is_checked" boolean DEFAULT false NOT NULL,
	"notes" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"completed_at" timestamp,
	"completed_by_user_id" varchar,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "rebate_case_workflow_steps" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"case_id" varchar NOT NULL,
	"step" text NOT NULL,
	"status" text DEFAULT 'not_started' NOT NULL,
	"notes" text,
	"completed_at" timestamp,
	"completed_by_user_id" varchar,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "rebate_cases" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"case_number" text,
	"program_type" text DEFAULT 'HEAR' NOT NULL,
	"application_status" text DEFAULT 'not_started' NOT NULL,
	"priority" text DEFAULT 'normal' NOT NULL,
	"assigned_to_user_id" varchar,
	"customer_id" varchar,
	"application_date" timestamp,
	"reservation_date" timestamp,
	"approval_date" timestamp,
	"paid_date" timestamp,
	"rebate_amount" text,
	"notes" text,
	"client_first_name" text,
	"client_last_name" text,
	"client_email" text,
	"client_phone" text,
	"client_dob" text,
	"household_size" integer,
	"household_income" text,
	"ami_bracket" text,
	"property_address" text,
	"property_city" text,
	"property_state" text,
	"property_zip" text,
	"property_type" text,
	"ownership_status" text,
	"year_built" integer,
	"square_footage" integer,
	"electric_utility" text,
	"electric_account_number" text,
	"gas_utility" text,
	"gas_account_number" text,
	"existing_heating_type" text,
	"existing_heating_age" integer,
	"existing_cooling_type" text,
	"existing_cooling_age" integer,
	"existing_water_heater_type" text,
	"existing_water_heater_age" integer,
	"new_heating_type" text,
	"new_heating_brand" text,
	"new_heating_model" text,
	"new_heating_serial" text,
	"new_heating_seer" text,
	"new_heating_hspf" text,
	"new_cooling_type" text,
	"new_cooling_brand" text,
	"new_cooling_model" text,
	"new_cooling_serial" text,
	"new_water_heater_type" text,
	"new_water_heater_brand" text,
	"new_water_heater_model" text,
	"scope_summary" text,
	"install_cost" text,
	"install_date" timestamp,
	"install_completed_date" timestamp,
	"created_by_user_id" varchar,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "salesbook_bookmarks" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"label" text NOT NULL,
	"page_number" integer NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "task_activity" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"task_id" varchar NOT NULL,
	"user_id" varchar NOT NULL,
	"action" text NOT NULL,
	"before_json" text,
	"after_json" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "task_subtasks" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"task_id" varchar NOT NULL,
	"title" text NOT NULL,
	"is_completed" boolean DEFAULT false NOT NULL,
	"due_at" timestamp,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "task_types" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"icon" text,
	"default_duration_minutes" integer,
	"default_priority" text,
	"is_customer_actionable" boolean DEFAULT false,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "tasks" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"priority" text DEFAULT 'normal' NOT NULL,
	"task_list" text DEFAULT 'inbox' NOT NULL,
	"type_id" varchar,
	"assigned_to_user_id" varchar,
	"created_by_user_id" varchar NOT NULL,
	"due_at" timestamp,
	"start_at" timestamp,
	"end_at" timestamp,
	"completed_at" timestamp,
	"remind_at" timestamp,
	"is_all_day" boolean DEFAULT false,
	"related_entity_type" text DEFAULT 'none',
	"related_entity_id" varchar,
	"customer_id" varchar,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "crm_accounts" ADD COLUMN "bill_to_parent" boolean DEFAULT false;--> statement-breakpoint
ALTER TABLE "crm_customers" ADD COLUMN "parent_customer_id" varchar;--> statement-breakpoint
ALTER TABLE "crm_customers" ADD COLUMN "bill_to_parent" boolean DEFAULT false;--> statement-breakpoint
ALTER TABLE "crm_customers" ADD COLUMN "last_review_request_at" timestamp;--> statement-breakpoint
ALTER TABLE "crm_invoices" ADD COLUMN "stripe_payment_link_url" text;--> statement-breakpoint
ALTER TABLE "crm_invoices" ADD COLUMN "is_deposit_invoice" boolean DEFAULT false;--> statement-breakpoint
ALTER TABLE "crm_invoices" ADD COLUMN "quote_id" varchar;--> statement-breakpoint
ALTER TABLE "crm_invoices" ADD COLUMN "viewed_at" timestamp;--> statement-breakpoint
ALTER TABLE "crm_invoices" ADD COLUMN "view_count" integer DEFAULT 0;--> statement-breakpoint
ALTER TABLE "crm_invoices" ADD COLUMN "payment_link_click_count" integer DEFAULT 0;--> statement-breakpoint
ALTER TABLE "crm_invoices" ADD COLUMN "last_payment_link_clicked_at" timestamp;--> statement-breakpoint
ALTER TABLE "crm_invoices" ADD COLUMN "is_historical" boolean DEFAULT false;--> statement-breakpoint
ALTER TABLE "crm_invoices" ADD COLUMN "field_edge_invoice_number" text;--> statement-breakpoint
ALTER TABLE "crm_invoices" ADD COLUMN "field_edge_wo_number" text;--> statement-breakpoint
ALTER TABLE "crm_invoices" ADD COLUMN "view_token" text;--> statement-breakpoint
ALTER TABLE "crm_projects" ADD COLUMN "project_number" integer;--> statement-breakpoint
ALTER TABLE "crm_projects" ADD COLUMN "start_date" timestamp;--> statement-breakpoint
ALTER TABLE "crm_projects" ADD COLUMN "end_date" timestamp;--> statement-breakpoint
ALTER TABLE "crm_projects" ADD COLUMN "equipment_info" text;--> statement-breakpoint
ALTER TABLE "crm_projects" ADD COLUMN "scope_of_work" text;--> statement-breakpoint
ALTER TABLE "crm_projects" ADD COLUMN "challenge_points" text;--> statement-breakpoint
ALTER TABLE "crm_projects" ADD COLUMN "equipment_materials" json DEFAULT '[]'::json;--> statement-breakpoint
ALTER TABLE "crm_projects" ADD COLUMN "overhead_percent" numeric(5, 2);--> statement-breakpoint
ALTER TABLE "crm_projects" ADD COLUMN "commission_percent" numeric(5, 2);--> statement-breakpoint
ALTER TABLE "crm_quotes" ADD COLUMN "view_count" integer DEFAULT 0;--> statement-breakpoint
ALTER TABLE "crm_quotes" ADD COLUMN "source_type" text;--> statement-breakpoint
ALTER TABLE "crm_quotes" ADD COLUMN "deposit_invoice_id" varchar;--> statement-breakpoint
ALTER TABLE "crm_work_orders" ADD COLUMN "en_route_at" timestamp;--> statement-breakpoint
ALTER TABLE "crm_work_orders" ADD COLUMN "is_pending" boolean DEFAULT false;--> statement-breakpoint
ALTER TABLE "crm_work_orders" ADD COLUMN "pending_reason" text;--> statement-breakpoint
ALTER TABLE "crm_work_orders" ADD COLUMN "pending_started_at" timestamp;--> statement-breakpoint
ALTER TABLE "crm_work_orders" ADD COLUMN "total_pending_minutes" integer DEFAULT 0;--> statement-breakpoint
ALTER TABLE "crm_work_orders" ADD COLUMN "is_historical" boolean DEFAULT false;--> statement-breakpoint
ALTER TABLE "crm_work_orders" ADD COLUMN "field_edge_wo_number" text;--> statement-breakpoint
ALTER TABLE "crm_work_orders" ADD COLUMN "booking_source" text;--> statement-breakpoint
ALTER TABLE "crm_work_orders" ADD COLUMN "preferred_time_slot" text;--> statement-breakpoint
ALTER TABLE "crm_work_orders" ADD COLUMN "booking_confirmation_sent_at" timestamp;--> statement-breakpoint
ALTER TABLE "crm_work_orders" ADD COLUMN "booking_reminder_sent_at" timestamp;--> statement-breakpoint
ALTER TABLE "crm_work_orders" ADD COLUMN "immediate_action" text;--> statement-breakpoint
ALTER TABLE "crm_work_orders" ADD COLUMN "due_date" timestamp;--> statement-breakpoint
ALTER TABLE "customers" ADD COLUMN "parent_customer_id" varchar;--> statement-breakpoint
ALTER TABLE "customers" ADD COLUMN "bill_to_parent" boolean DEFAULT false;--> statement-breakpoint
ALTER TABLE "sms_notification_log" ADD COLUMN "quote_id" varchar;--> statement-breakpoint
ALTER TABLE "bouncie_vehicles" ADD CONSTRAINT "bouncie_vehicles_technician_id_crm_users_id_fk" FOREIGN KEY ("technician_id") REFERENCES "public"."crm_users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_comment_mentions" ADD CONSTRAINT "crm_comment_mentions_comment_id_crm_comments_id_fk" FOREIGN KEY ("comment_id") REFERENCES "public"."crm_comments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_comment_mentions" ADD CONSTRAINT "crm_comment_mentions_mentioned_user_id_crm_users_id_fk" FOREIGN KEY ("mentioned_user_id") REFERENCES "public"."crm_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_comments" ADD CONSTRAINT "crm_comments_author_id_crm_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."crm_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_leads" ADD CONSTRAINT "crm_leads_customer_id_crm_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."crm_customers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_leads" ADD CONSTRAINT "crm_leads_lead_type_id_crm_lead_types_id_fk" FOREIGN KEY ("lead_type_id") REFERENCES "public"."crm_lead_types"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_leads" ADD CONSTRAINT "crm_leads_lead_temp_id_crm_lead_temp_options_id_fk" FOREIGN KEY ("lead_temp_id") REFERENCES "public"."crm_lead_temp_options"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_leads" ADD CONSTRAINT "crm_leads_lead_driver_id_crm_lead_driver_options_id_fk" FOREIGN KEY ("lead_driver_id") REFERENCES "public"."crm_lead_driver_options"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_leads" ADD CONSTRAINT "crm_leads_assigned_sales_rep_id_crm_users_id_fk" FOREIGN KEY ("assigned_sales_rep_id") REFERENCES "public"."crm_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_notifications" ADD CONSTRAINT "crm_notifications_user_id_crm_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."crm_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_notifications" ADD CONSTRAINT "crm_notifications_actor_id_crm_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."crm_users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_project_tasks" ADD CONSTRAINT "crm_project_tasks_project_id_crm_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."crm_projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_project_tasks" ADD CONSTRAINT "crm_project_tasks_assigned_user_id_crm_users_id_fk" FOREIGN KEY ("assigned_user_id") REFERENCES "public"."crm_users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_project_tasks" ADD CONSTRAINT "crm_project_tasks_created_by_crm_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."crm_users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_tagged_comment_recipients" ADD CONSTRAINT "crm_tagged_comment_recipients_comment_id_crm_tagged_comments_id_fk" FOREIGN KEY ("comment_id") REFERENCES "public"."crm_tagged_comments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_tagged_comment_recipients" ADD CONSTRAINT "crm_tagged_comment_recipients_user_id_crm_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."crm_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_tagged_comments" ADD CONSTRAINT "crm_tagged_comments_author_id_crm_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."crm_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_labor_entries" ADD CONSTRAINT "project_labor_entries_project_id_crm_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."crm_projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_labor_entries" ADD CONSTRAINT "project_labor_entries_created_by_crm_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."crm_users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rebate_case_activity_log" ADD CONSTRAINT "rebate_case_activity_log_case_id_rebate_cases_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."rebate_cases"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rebate_case_activity_log" ADD CONSTRAINT "rebate_case_activity_log_user_id_crm_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."crm_users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rebate_case_documents" ADD CONSTRAINT "rebate_case_documents_case_id_rebate_cases_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."rebate_cases"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rebate_case_documents" ADD CONSTRAINT "rebate_case_documents_uploaded_by_user_id_crm_users_id_fk" FOREIGN KEY ("uploaded_by_user_id") REFERENCES "public"."crm_users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rebate_case_scope_checklist" ADD CONSTRAINT "rebate_case_scope_checklist_case_id_rebate_cases_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."rebate_cases"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rebate_case_scope_checklist" ADD CONSTRAINT "rebate_case_scope_checklist_completed_by_user_id_crm_users_id_fk" FOREIGN KEY ("completed_by_user_id") REFERENCES "public"."crm_users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rebate_case_workflow_steps" ADD CONSTRAINT "rebate_case_workflow_steps_case_id_rebate_cases_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."rebate_cases"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rebate_case_workflow_steps" ADD CONSTRAINT "rebate_case_workflow_steps_completed_by_user_id_crm_users_id_fk" FOREIGN KEY ("completed_by_user_id") REFERENCES "public"."crm_users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rebate_cases" ADD CONSTRAINT "rebate_cases_assigned_to_user_id_crm_users_id_fk" FOREIGN KEY ("assigned_to_user_id") REFERENCES "public"."crm_users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rebate_cases" ADD CONSTRAINT "rebate_cases_customer_id_crm_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."crm_customers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rebate_cases" ADD CONSTRAINT "rebate_cases_created_by_user_id_crm_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."crm_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_activity" ADD CONSTRAINT "task_activity_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_activity" ADD CONSTRAINT "task_activity_user_id_crm_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."crm_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_subtasks" ADD CONSTRAINT "task_subtasks_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_type_id_task_types_id_fk" FOREIGN KEY ("type_id") REFERENCES "public"."task_types"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_assigned_to_user_id_crm_users_id_fk" FOREIGN KEY ("assigned_to_user_id") REFERENCES "public"."crm_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_created_by_user_id_crm_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."crm_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_customer_id_crm_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."crm_customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "crm_leads_customer_id_idx" ON "crm_leads" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX "crm_leads_sales_stage_idx" ON "crm_leads" USING btree ("sales_stage");--> statement-breakpoint
CREATE INDEX "crm_project_tasks_project_id_idx" ON "crm_project_tasks" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "crm_project_tasks_assigned_user_id_idx" ON "crm_project_tasks" USING btree ("assigned_user_id");--> statement-breakpoint
CREATE INDEX "crm_project_tasks_due_date_idx" ON "crm_project_tasks" USING btree ("due_date");--> statement-breakpoint
CREATE INDEX "project_labor_entries_project_id_idx" ON "project_labor_entries" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "project_labor_entries_date_idx" ON "project_labor_entries" USING btree ("date");--> statement-breakpoint
ALTER TABLE "sms_notification_log" ADD CONSTRAINT "sms_notification_log_quote_id_crm_quotes_id_fk" FOREIGN KEY ("quote_id") REFERENCES "public"."crm_quotes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "crm_customers_customer_type_idx" ON "crm_customers" USING btree ("customer_type");--> statement-breakpoint
CREATE INDEX "crm_customers_customer_status_idx" ON "crm_customers" USING btree ("customer_status");--> statement-breakpoint
CREATE INDEX "crm_customers_parent_customer_idx" ON "crm_customers" USING btree ("parent_customer_id");--> statement-breakpoint
CREATE INDEX "crm_invoices_status_idx" ON "crm_invoices" USING btree ("status");--> statement-breakpoint
CREATE INDEX "crm_invoices_customer_id_idx" ON "crm_invoices" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX "crm_invoices_work_order_id_idx" ON "crm_invoices" USING btree ("work_order_id");--> statement-breakpoint
CREATE INDEX "crm_invoices_created_at_idx" ON "crm_invoices" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "crm_job_assignments_tech_user_id_idx" ON "crm_job_assignments" USING btree ("tech_user_id");--> statement-breakpoint
CREATE INDEX "crm_job_assignments_job_id_idx" ON "crm_job_assignments" USING btree ("job_id");--> statement-breakpoint
CREATE INDEX "crm_jobs_customer_id_idx" ON "crm_jobs" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX "crm_jobs_status_idx" ON "crm_jobs" USING btree ("status");--> statement-breakpoint
CREATE INDEX "crm_quotes_status_idx" ON "crm_quotes" USING btree ("status");--> statement-breakpoint
CREATE INDEX "crm_quotes_customer_id_idx" ON "crm_quotes" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX "crm_quotes_created_at_idx" ON "crm_quotes" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "crm_work_orders_assigned_tech_id_idx" ON "crm_work_orders" USING btree ("assigned_tech_id");--> statement-breakpoint
CREATE INDEX "crm_work_orders_status_idx" ON "crm_work_orders" USING btree ("status");--> statement-breakpoint
CREATE INDEX "crm_work_orders_scheduled_start_idx" ON "crm_work_orders" USING btree ("scheduled_start");--> statement-breakpoint
CREATE INDEX "crm_work_orders_customer_id_idx" ON "crm_work_orders" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX "crm_work_orders_project_id_idx" ON "crm_work_orders" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "crm_work_orders_created_at_idx" ON "crm_work_orders" USING btree ("created_at");--> statement-breakpoint
ALTER TABLE "crm_projects" ADD CONSTRAINT "crm_projects_project_number_unique" UNIQUE("project_number");