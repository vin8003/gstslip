import { createFileRoute } from "@tanstack/react-router";
import { GstApp } from "@/components/gst-app";

export const Route = createFileRoute("/")({ component: Home });

function Home() {
  return <GstApp />;
}
