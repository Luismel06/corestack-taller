-- Preserve existing vehicles as unclassified. The UI uses CAR only as a visual fallback.
CREATE TYPE "WorkshopVehicleType" AS ENUM ('CAR', 'SUV');

ALTER TABLE "WorkshopVehicle"
ADD COLUMN "vehicleType" "WorkshopVehicleType";
