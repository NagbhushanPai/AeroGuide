import { jsonLdString } from "@/lib/seo";

/** schema.org structured data for search engines. Rendered on the server only. */
export function JsonLd({ data }: { data: object }) {
  return (
    <script
      type="application/ld+json"
      // The string is escaped (no "<"), so it can't close the script element.
      dangerouslySetInnerHTML={{ __html: jsonLdString(data) }}
    />
  );
}
