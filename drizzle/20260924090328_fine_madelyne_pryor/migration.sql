CREATE INDEX "campaigns_org_name_idx" ON "campaigns" ("organization_id","name");--> statement-breakpoint
CREATE INDEX "messages_body_idx" ON "messages" ("body");--> statement-breakpoint
CREATE INDEX "templates_org_name_idx" ON "templates" ("organization_id","name");