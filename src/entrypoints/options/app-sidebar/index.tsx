import { Icon } from "@iconify/react"
import { Link, useLocation } from "react-router"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/base-ui/sidebar"
import { AnimatedIndicator } from "./animated-indicator"
import { CollapseToggle } from "./collapse-toggle"

const PRIMARY_NAV_ITEMS = [
  {
    path: "/page-translation",
    label: "网页翻译",
    icon: "tabler:language",
    match: (pathname: string) =>
      pathname === "/" || pathname.startsWith("/page-translation"),
  },
  {
    path: "/video-subtitles",
    label: "视频字幕",
    icon: "tabler:subtitles",
    match: (pathname: string) => pathname.startsWith("/video-subtitles"),
  },
  {
    path: "/site-exceptions",
    label: "网站例外",
    icon: "tabler:shield-off",
    match: (pathname: string) => pathname.startsWith("/site-exceptions"),
  },
] as const

export function AppSidebar() {
  const { pathname } = useLocation()

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="transition-all group-data-[state=expanded]:px-5 group-data-[state=expanded]:pt-5 group-data-[state=expanded]:pb-3">
        <div className="flex items-center gap-2.5 overflow-hidden">
          <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Icon icon="tabler:sparkles" className="size-4.5" />
          </div>
          <div className="min-w-0 group-data-[state=collapsed]:hidden">
            <div className="truncate text-sm font-semibold tracking-tight">智译蛙</div>
            <div className="truncate text-[11px] text-muted-foreground">Smart Read Frog</div>
          </div>
        </div>
      </SidebarHeader>

      <SidebarContent className="transition-all group-data-[state=expanded]:px-2.5 group-data-[state=expanded]:pt-2">
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu className="gap-1">
              {PRIMARY_NAV_ITEMS.map((item) => {
                const isActive = item.match(pathname)
                return (
                  <SidebarMenuItem key={item.path} className="relative">
                    <SidebarMenuButton
                      render={<Link to={item.path} />}
                      isActive={isActive}
                      tooltip={item.label}
                      className="h-9 rounded-lg px-3 font-medium"
                    >
                      <Icon icon={item.icon} className="size-4.5" />
                      <span>{item.label}</span>
                    </SidebarMenuButton>
                    <AnimatedIndicator show={isActive} />
                  </SidebarMenuItem>
                )
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="transition-all group-data-[state=expanded]:px-3 group-data-[state=expanded]:pb-3">
        <div className="px-2 text-[11px] text-muted-foreground group-data-[state=collapsed]:hidden">
          私人极速版
        </div>
      </SidebarFooter>
      <CollapseToggle />
    </Sidebar>
  )
}
