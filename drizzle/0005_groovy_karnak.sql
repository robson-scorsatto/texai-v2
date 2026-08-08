CREATE TABLE "dental_charts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"clinic_id" uuid NOT NULL,
	"patient_id" uuid NOT NULL,
	"dentition_type" text DEFAULT 'permanente' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "dental_charts_patient_unique" UNIQUE("patient_id")
);
--> statement-breakpoint
CREATE TABLE "tooth_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"clinic_id" uuid NOT NULL,
	"dental_chart_id" uuid NOT NULL,
	"tooth_number" integer NOT NULL,
	"status" text DEFAULT 'saudavel' NOT NULL,
	"procedure_note" text,
	"clinical_record_id" uuid,
	"author_user_id" uuid NOT NULL,
	"is_dev_seed_data" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "dental_charts" ADD CONSTRAINT "dental_charts_clinic_id_clinics_id_fk" FOREIGN KEY ("clinic_id") REFERENCES "public"."clinics"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dental_charts" ADD CONSTRAINT "dental_charts_patient_id_patients_id_fk" FOREIGN KEY ("patient_id") REFERENCES "public"."patients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tooth_records" ADD CONSTRAINT "tooth_records_clinic_id_clinics_id_fk" FOREIGN KEY ("clinic_id") REFERENCES "public"."clinics"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tooth_records" ADD CONSTRAINT "tooth_records_dental_chart_id_dental_charts_id_fk" FOREIGN KEY ("dental_chart_id") REFERENCES "public"."dental_charts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tooth_records" ADD CONSTRAINT "tooth_records_clinical_record_id_clinical_records_id_fk" FOREIGN KEY ("clinical_record_id") REFERENCES "public"."clinical_records"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tooth_records" ADD CONSTRAINT "tooth_records_author_user_id_users_id_fk" FOREIGN KEY ("author_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "dental_charts_clinic_id_idx" ON "dental_charts" USING btree ("clinic_id");--> statement-breakpoint
CREATE INDEX "tooth_records_chart_tooth_idx" ON "tooth_records" USING btree ("dental_chart_id","tooth_number");