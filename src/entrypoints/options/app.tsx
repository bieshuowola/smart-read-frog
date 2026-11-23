import type { ComponentType } from "react"
import { lazy, Suspense } from "react"
import { Navigate, Route, Routes } from "react-router"
import { ROUTE_DEFS } from "./app-sidebar/nav-items"

type RoutePath = (typeof ROUTE_DEFS)[number]["path"]

const TranslationPage = lazy(() =>
  import("./pages/translation").then((module) => ({ default: module.TranslationPage })),
)
const WebTranslationStylePage = lazy(() =>
  import("./pages/translation/translation-style/web-style-page").then((module) => ({
    default: module.WebTranslationStylePage,
  })),
)
const CustomCssPage = lazy(() =>
  import("./pages/translation/translation-style/custom-css").then((module) => ({
    default: module.CustomCssPage,
  })),
)
const VideoSubtitlesPage = lazy(() =>
  import("./pages/video-subtitles").then((module) => ({ default: module.VideoSubtitlesPage })),
)
const SubtitlesSitesPage = lazy(() =>
  import("./pages/video-subtitles/preference/sites-page").then((module) => ({
    default: module.SubtitlesSitesPage,
  })),
)
const SubtitlesStylePage = lazy(() =>
  import("./pages/video-subtitles/subtitles-style/style-editor").then((module) => ({
    default: module.SubtitlesStylePage,
  })),
)
const SubtitlesCustomCssPage = lazy(() =>
  import("./pages/video-subtitles/subtitles-style/custom-css").then((module) => ({
    default: module.SubtitlesCustomCssPage,
  })),
)
const SiteExceptionsPage = lazy(() =>
  import("./pages/site-exceptions").then((module) => ({ default: module.SiteExceptionsPage })),
)

function HomeRedirect() {
  return <Navigate to="/page-translation" replace />
}

const ROUTE_COMPONENTS: Record<RoutePath, ComponentType> = {
  "/": HomeRedirect,
  "/page-translation": TranslationPage,
  "/page-translation/style": WebTranslationStylePage,
  "/page-translation/custom-css": CustomCssPage,
  "/video-subtitles": VideoSubtitlesPage,
  "/video-subtitles/sites": SubtitlesSitesPage,
  "/video-subtitles/style": SubtitlesStylePage,
  "/video-subtitles/style/custom-css": SubtitlesCustomCssPage,
  "/site-exceptions": SiteExceptionsPage,
}

function RouteLoadingFallback() {
  return (
    <div className="flex flex-1 items-center justify-center p-8 text-sm text-muted-foreground">
      正在加载设置…
    </div>
  )
}

export default function App() {
  return (
    <Suspense fallback={<RouteLoadingFallback />}>
      <Routes>
        {ROUTE_DEFS.map(({ path }) => {
          const Component = ROUTE_COMPONENTS[path]
          return <Route key={path} path={path} element={<Component />} />
        })}
        <Route path="*" element={<Navigate to="/page-translation" replace />} />
      </Routes>
    </Suspense>
  )
}
