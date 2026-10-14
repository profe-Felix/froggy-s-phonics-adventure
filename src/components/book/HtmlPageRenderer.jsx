import useHtmlBookDocument from '@/components/book/useHtmlBookDocument';
import HtmlDocumentFrame from '@/components/book/HtmlDocumentFrame';

export default function HtmlPageRenderer({ page, highlightWords, alignSelf = 'center' }) {
  const { data: sourceDocument, error, refetch } = useHtmlBookDocument(page?.html_url);
  if (!page?.html_url) return <div role="alert" className="flex h-full items-center justify-center text-muted-foreground">This page has no saved HTML source.</div>;
  if (error) return (
    <div role="alert" className="flex h-full flex-col items-center justify-center gap-3 bg-background p-4 text-foreground">
      <p>The saved page could not be opened.</p>
      <button type="button" onClick={() => refetch()} className="rounded-lg bg-primary px-4 py-2 text-primary-foreground">Retry page</button>
    </div>
  );
  if (!sourceDocument) return <div role="status" className="flex h-full items-center justify-center bg-background text-muted-foreground">Opening saved page…</div>;
  return <HtmlDocumentFrame key={page.html_url} sourceDocument={sourceDocument} pageNumber={page.page_number} highlightWords={highlightWords} alignSelf={alignSelf} />;
}