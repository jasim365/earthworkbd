import { Link, useRouterState } from "@tanstack/react-router";
import {
  LayoutDashboard,
  Settings2,
  Table2,
  Calculator,
  LineChart,
  FileText,
  Mountain,
} from "lucide-react";

import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";

const items = [
  { title: "Dashboard", url: "/", icon: LayoutDashboard },
  { title: "Design Config", url: "/design", icon: Settings2 },
  { title: "Sectional Data", url: "/sections", icon: Table2 },
  { title: "Analysis", url: "/analysis", icon: Calculator },
  { title: "Visualization", url: "/visualization", icon: LineChart },
  { title: "Reports", url: "/reports", icon: FileText },
] as const;

export function AppSidebar() {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const pathname = useRouterState({ select: (r) => r.location.pathname });

  return (
    <Sidebar collapsible="icon">
      <SidebarContent>
        <div className="flex items-center gap-2 px-3 py-4">
          <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground">
            <Mountain className="size-4" />
          </span>
          {!collapsed && (
            <div className="leading-tight">
              <p className="text-sm font-semibold">Earthwork Pro</p>
              <p className="text-[11px] text-muted-foreground">Estimation Suite</p>
            </div>
          )}
        </div>
        <SidebarGroup>
          <SidebarGroupLabel>Modules</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {items.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild isActive={pathname === item.url}>
                    <Link to={item.url} className="flex items-center gap-2">
                      <item.icon className="size-4" />
                      {!collapsed && <span>{item.title}</span>}
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  );
}
