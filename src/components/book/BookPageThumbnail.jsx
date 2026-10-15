import PdfThumbnail from './PdfThumbnail';
import HtmlPageThumbnail from './HtmlPageThumbnail';

// Renders a single page of a book as a thumbnail.
// Handles PDF books (renders via pdfjs), image-based books (uses pages[]
// image_url), and HTML books (image_url if available, otherwise the saved
// HTML rendered in a sandboxed iframe).
export default function BookPageThumbnail({ book, pageNumber, width = 500 }) {
  if (!book) return null;

  // HTML book: always render the saved HTML in an iframe (the extracted
  // image_url is often a blank placeholder, but html_url has real content)
  if (book.book_type === 'html' && book.pages?.length > 0) {
    const pageData = book.pages.find(p => p.page_number === pageNumber);
    if (pageData?.html_url) {
      return <HtmlPageThumbnail book={book} pageNumber={pageNumber} />;
    }
  }

  // Image-based book: find the page image
  if (book.book_type === 'images' && book.pages?.length > 0) {
    const pageData = book.pages.find(p => p.page_number === pageNumber);
    if (pageData?.image_url) {
      return (
        <img
          src={pageData.image_url}
          alt={`Page ${pageNumber}`}
          className="h-full w-full object-contain"
        />
      );
    }
  }

  // PDF book: render the page
  if (book.pdf_url) {
    return <PdfThumbnail pdfUrl={book.pdf_url} pageNumber={Math.max(1, pageNumber)} width={width} />;
  }

  // Fallback
  return (
    <div className="flex h-full w-full items-center justify-center text-6xl" style={{ background: '#0f766e' }}>
      📖
    </div>
  );
}