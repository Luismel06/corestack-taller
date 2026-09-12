ALTER TYPE "Role" ADD VALUE 'MANAGER';
ALTER TYPE "Role" ADD VALUE 'SERVICE_ADVISOR';
ALTER TYPE "Role" ADD VALUE 'RECEPTIONIST';
ALTER TYPE "Role" ADD VALUE 'SUPERVISOR';
ALTER TYPE "Role" ADD VALUE 'INVENTORY_MANAGER';
ALTER TYPE "Role" ADD VALUE 'ACCOUNTING';
ALTER TABLE "Membership" ADD COLUMN "permissionOverrides" JSONB;
ALTER TABLE "Membership" ADD CONSTRAINT "Membership_permissionOverrides_object_check"
  CHECK ("permissionOverrides" IS NULL OR jsonb_typeof("permissionOverrides") = 'object');
