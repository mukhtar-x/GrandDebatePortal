/** Public origin used for canonical URLs, social cards, and the sitemap. */
export function getPublicSiteUrl(): URL | undefined {
  const configured = process.env.TGD_SITE_URL?.trim();
  const candidate = configured || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : undefined);
  if (!candidate) return undefined;

  try {
    const url = new URL(candidate.includes("://") ? candidate : `https://${candidate}`);
    if (url.hostname === "localhost" || url.hostname === "127.0.0.1") return undefined;
    return new URL(url.origin);
  } catch {
    return undefined;
  }
}

export function getCanonicalUrl(path: string): URL | undefined {
  const origin = getPublicSiteUrl();
  return origin ? new URL(path, origin) : undefined;
}
