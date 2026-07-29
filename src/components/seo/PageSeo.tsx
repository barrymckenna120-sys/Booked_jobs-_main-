import { Helmet } from "react-helmet-async";

const SITE_URL = "https://bookedjobs.ie";

type Props = {
  title: string;
  description: string;
  path: string; // route path, e.g. "/", "/auth"
  jsonLd?: Record<string, unknown> | Record<string, unknown>[];
  noindex?: boolean;
};

/**
 * Per-route head tags for public/marketing pages.
 * Sets title, description, canonical, and og/twitter mirrors.
 * The static index.html retains sitewide fallbacks for social crawlers
 * that do not execute JS.
 */
export default function PageSeo({ title, description, path, jsonLd, noindex }: Props) {
  const url = `${SITE_URL}${path.startsWith("/") ? path : `/${path}`}`;
  return (
    <Helmet>
      <title>{title}</title>
      <meta name="description" content={description} />
      <link rel="canonical" href={url} />
      <meta property="og:title" content={title} />
      <meta property="og:description" content={description} />
      <meta property="og:url" content={url} />
      <meta property="og:type" content="website" />
      <meta name="twitter:title" content={title} />
      <meta name="twitter:description" content={description} />
      {noindex ? <meta name="robots" content="noindex" /> : null}
      {jsonLd ? (
        <script type="application/ld+json">
          {JSON.stringify(jsonLd)}
        </script>
      ) : null}
    </Helmet>
  );
}
