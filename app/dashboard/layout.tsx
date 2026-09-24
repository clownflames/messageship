import { redirect } from "next/navigation";
import { getSession, listWorkspaces, requireWorkspace } from "@/lib/auth/tenant";
import { DashboardShell } from "@/components/dashboard/dashboard-shell";

export const dynamic = "force-dynamic";

export default async function DashboardLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const result = await getSession();
  if (!result?.user) {
    redirect("/login");
  }
  const workspaceList = await listWorkspaces(result.user.id);
  if (workspaceList.length === 0) {
    return <>{children}</>;
  }
  const context = await requireWorkspace();
  return <DashboardShell
    user={{ name: context.user.name, email: context.user.email }}
    activeWorkspace={{ id: context.organization.id, name: context.organization.name }}
    workspaces={workspaceList.map(({ organization, membership }) => ({ id: organization.id, name: organization.name, role: membership.role }))}
  >{children}</DashboardShell>;
}
