import PdfThumbnail from './PdfThumbnail';

// Renders a single page of a book as a thumbnail.
// Handles both PDF books (renders via pdfjs) and image-based books
// (uses the pages[] array from BookCatalog).
export default function BookPageThumbnail({ book, pageNumber, width = 500 }) {
  if (!book) return null;

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