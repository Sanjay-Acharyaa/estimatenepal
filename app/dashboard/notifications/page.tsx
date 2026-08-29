import { getSession } from "@/lib/auth";
import { redirect } from "next/navigation";
import { NotificationListPanel } from "./NotificationListPanel";

export default async function NotificationsPage() {
  const session = await getSession();
  if (!session?.user) redirect("/");

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <NotificationListPanel />
    </div>
  );
}
