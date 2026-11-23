import { SidebarTrigger } from "@/components/ui/base-ui/sidebar"
import { i18n } from "@/utils/i18n"

export function NarrowTopBar() {
  return (
    <header className="sticky top-0 z-20 flex h-12 items-center gap-2 border-b bg-background/85 px-3 backdrop-blur md:hidden">
      <SidebarTrigger aria-label={i18n.t("options.sidebar.toggle")} />
      <span className="text-sm font-semibold">智译蛙</span>
    </header>
  )
}
