import { AppSidebar } from "@/components/app-sidebar";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen">
      <AppSidebar />
      <main className="min-w-0 flex-1 overflow-auto p-4 md:p-6">{children}</main>
    </div>
  );
}
