import { Providers } from "@/components/providers";
import { MANAGER_ROLES, staffPage } from "@/lib/auth";
import { getSettings } from "@/lib/settings";
import { AdminNav } from "./admin-nav";

export default async function AdminLayout({ children }: LayoutProps<"/admin">) {
  const [staff, settings] = await Promise.all([staffPage(MANAGER_ROLES), getSettings()]);
  return (
    <Providers>
      <div className="paper min-h-dvh lg:flex">
        <AdminNav staff={{ name: staff.name, role: staff.role }} restaurant={settings.restaurantName} />
        <div className="min-w-0 flex-1">{children}</div>
      </div>
    </Providers>
  );
}
