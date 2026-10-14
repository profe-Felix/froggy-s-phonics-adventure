import PdfPageRenderer from '@/components/notebook/PdfPageRenderer';
import HtmlPageRenderer from '@/components/book/HtmlPageRenderer';

export default function BookPageRenderer({ book, pageNumber, alignSelf = 'center', ...options }) {
  const pages = book.pages || [];
  // Imported HTML is an ordered page list, not a PDF. Original printed page
  // numbers may start at zero or skip; navigation always follows upload order.
  if (book.book_type === 'html' || pages.some(page => page.html_url)) {
    const page = pages[pageNumber - 1];
    return page
      ? <HtmlPageRenderer key={page.html_url || pageNumber} page={{ ...page, page_number: pageNumber }} highlightWords={options.highlightWords} alignSelf={alignSelf} />
      : <div className="flex h-full w-full items-center justify-center text-muted-foreground">No saved page</div>;
  }
  if (book.book_type === 'images') {
    const page = pages.find(item => item.page_number === pageNumber);
    return page
      ? <img src={page.image_url} alt={`Page ${pageNumber}`} className="block h-full w-full object-contain" />
      : <div className="flex h-full w-full items-center justify-center text-muted-foreground">No image</div>;
  }
  return <PdfPageRenderer pdfUrl={book.pdf_url} pageNumber={pageNumber} alignSelf={alignSelf} {...options} />;
}