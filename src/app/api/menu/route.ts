import { handler } from "@/lib/api";
import { getSettings } from "@/lib/settings";
import { isWithinOpeningHours } from "@/lib/time";
import { publicMenu } from "@/services/menu";

export const GET = handler(async () => {
  const [categories, settings] = await Promise.all([publicMenu(), getSettings()]);
  return {
    categories,
    ordering: {
      enabled: settings.orderingEnabled,
      open: isWithinOpeningHours(new Date(), settings.openingTime, settings.closingTime),
      openingTime: settings.openingTime,
      closingTime: settings.closingTime,
    },
  };
});
