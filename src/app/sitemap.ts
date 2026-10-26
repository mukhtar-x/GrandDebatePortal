import type { MetadataRoute } from "next";
import { getPublicSiteUrl } from "@/lib/site-url";

export default function sitemap(): MetadataRoute.Sitemap {
  // No production origin is guessed. Configure TGD_SITE_URL (or VERCEL_URL)
  // for deploys so generated sitemap locations are canonical and absolute.
  const origin = getPublicSiteUrl();
  if (!origin) return [];

  return [
    { url: origin.toString(), changeFrequency: "weekly", priority: 1 },
    { url: new URL("/register", origin).toString(), changeFrequency: "weekly", priority: 0.9 },
    { url: new URL("/committees", origin).toString(), changeFrequency: "monthly", priority: 0.8 },
    { url: new URL("/archive", origin).toString(), changeFrequency: "monthly", priority: 0.6 },
  ];
}
