import useHtmlBookDocument from '@/components/book/useHtmlBookDocument';
import HtmlDocumentFrame from '@/components/book/HtmlDocumentFrame';

// Renders an HTML book page as a thumbnail by loading the saved HTML
// and displaying it in a scaled, sandboxed iframe. Used by BookPageThumbnail
// for HTML book pages that have no raster image_url.
export default function HtmlPageThumbnail({ book, pageNumber }) {
  const pageData = book.pages?.find(p => p.page_number === pageNumber);
  const source = pageData?.html_url || '';
  const { data: doc, isLoading, error } = useHtmlBookDocument(source);

  if (isLoading) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-slate-50 text-xs font-bold text-slate-400">
        Loading page…
      </div>
    );
  }
  if (error || !doc) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-slate-50 text-xs font-bold text-slate-400">
        Page unavailable
      </div>
    );
  }

  return (
    <div className="h-72 w-full">
      <HtmlDocumentFrame sourceDocument={doc} pageNumber={pageNumber} />
    </div>
  );
}