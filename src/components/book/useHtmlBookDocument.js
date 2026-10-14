import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { prepareHtmlBookDocument } from '@/components/book/htmlBookDocument';

export default function useHtmlBookDocument(source) {
  return useQuery({
    queryKey: ['html-book-document', source],
    enabled: Boolean(source),
    staleTime: Infinity,
    gcTime: 15 * 60 * 1000,
    retry: false,
    queryFn: async () => {
      const url = /^https:\/\//i.test(source)
        ? source
        : (await base44.integrations.Core.CreateFileSignedUrl({ file_uri: source, expires_in: 3600 })).signed_url;
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 15000);
      try {
        const response = await fetch(url, { signal: controller.signal });
        if (!response.ok) throw new Error(`The saved page could not be opened (${response.status}).`);
        const html = await response.text();
        if (!html.trim()) throw new Error('The saved page is empty.');
        return prepareHtmlBookDocument(html);
      } finally {
        clearTimeout(timer);
      }
    },
  });
}