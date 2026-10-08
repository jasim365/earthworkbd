import { Link, useRouterState } from "@tanstack/react-router";
import {
  LayoutDashboard,
  FolderPlus,
  Calculator,
  Table2,
  ClipboardList,
  LineChart,
  TrendingUp,
  ReceiptText,
  BadgeDollarSign,
  FileText,
  ArrowDownUp,
  Settings,
  Settings2,
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

const groups = [
  {
    label: "Project",
    items: [
      { title: "Dashboard", url: "/", icon: LayoutDashboard },
      { title: "New Project", url: "/projects/new", icon: FolderPlus },
      { title: "Design Config", url: "/design", icon: Settings2 },
    ],
  },
  {
    label: "Estimation",
    items: [
      { title: "Earthwork Calculator", url: "/analysis", icon: Calculator },
      { title: "Survey / Input Data", url: "/sections", icon: Table2 },
      { title: "Calculation Result", url: "/results", icon: ClipboardList },
    ],
  },
  {
    label: "Drawings",
    items: [
      { title: "Cross Section", url: "/visualization", icon: LineChart },
      { title: "Longitudinal Profile", url: "/profile", icon: TrendingUp },
    ],
  },
  {
    label: "Costing & Output",
    items: [
      { title: "BOQ", url: "/boq", icon: ReceiptText },
      { title: "Rate Analysis", url: "/rates", icon: BadgeDollarSign },
      { title: "Reports", url: "/reports", icon: FileText },
      { title: "Import / Export", url: "/data", icon: ArrowDownUp },
      { title: "Settings", url: "/settings", icon: Settings },
    ],
  },
] as const;

export function AppSidebar() {
  const { state, setOpenMobile } = useSidebar();
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
            <div className="min-w-0 leading-tight">
              <p className="truncate text-sm font-semibold">EarthworkBD</p>
              <p className="truncate text-[11px] text-muted-foreground">Earthwork Estimation Suite</p>
            </div>
          )}
        </div>
        {groups.map((g) => (
          <SidebarGroup key={g.label}>
            <SidebarGroupLabel>{g.label}</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {g.items.map((item) => (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton asChild isActive={pathname === item.url} tooltip={item.title}>
                      <Link to={item.url} onClick={() => setOpenMobile(false)} className="flex items-center gap-2">
                        <item.icon className="size-4 shrink-0" />
                        {!collapsed && <span className="truncate">{item.title}</span>}
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>
    </Sidebar>
  );
}
