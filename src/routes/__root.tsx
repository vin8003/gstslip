import { HeadContent, Outlet, Scripts, createRootRoute } from "@tanstack/react-router";
import { AuthProvider } from "@/lib/auth/provider";
import { PreviewHostBridge } from "@/components/preview-host-bridge";
import { Toaster } from "@/components/ui/sonner";
import appCss from "../styles.css?url";

const APP_NAME = "GSTSlip";
const FONT_HREF =
  "https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,500;9..144,600&family=IBM+Plex+Mono:wght@400;500&family=IBM+Plex+Sans:wght@400;500;600&display=swap";

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: APP_NAME },
      {
        name: "description",
        content:
          "Photograph an India GST tax invoice, extract the fields, and export a CSV register.",
      },
      { name: "theme-color", content: "#0F4D44" },
    ],
    links: [
      { rel: "icon", type: "image/svg+xml", href: "/favicon.svg" },
      { rel: "stylesheet", href: appCss },
      { rel: "manifest", href: "/__grok/manifest.webmanifest" },
      { rel: "apple-touch-icon", href: "/__grok/icon-180.png" },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
    ],
  }),
  component: RootDocument,
});

function RootDocument() {
  return (
    <html lang="en-IN" suppressHydrationWarning>
      <head>
        <HeadContent />
        <link
          rel="stylesheet"
          href={FONT_HREF}
          media="print"
          onLoad={(event) => {
            event.currentTarget.media = "all";
          }}
        />
        <noscript>
          <link rel="stylesheet" href={FONT_HREF} />
        </noscript>
      </head>
      <body>
        <PreviewHostBridge />
        <AuthProvider>
          <Outlet />
        </AuthProvider>
        <Toaster />
        <Scripts />
      </body>
    </html>
  );
}
