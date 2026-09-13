-- AlterTable
ALTER TABLE "MenuItem" ADD COLUMN     "featured" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "optionGroups" JSONB NOT NULL DEFAULT '[]';

-- AlterTable
ALTER TABLE "OrderItem" ADD COLUMN     "options" JSONB;

-- AlterTable
ALTER TABLE "Settings" ADD COLUMN     "address" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "instagram" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "phone" TEXT NOT NULL DEFAULT '',
ALTER COLUMN "restaurantName" SET DEFAULT 'Istanbul Cafe & Restaurant',
ALTER COLUMN "tagline" SET DEFAULT 'A taste of Turkey, for everyone';
