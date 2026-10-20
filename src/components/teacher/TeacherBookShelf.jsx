import { useState } from 'react';
import { motion } from 'framer-motion';
import { useQuery } from '@tanstack/react-query';
import { Link as LinkIcon } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { useToast } from '@/components/ui/use-toast';
import PdfThumbnail from '@/components/book/PdfThumbnail';
import BookPageThumbnail from '@/components/book/BookPageThumbnail';
import ShelfSectionTabs from '@/components/book/ShelfSectionTabs';
import { groupBooksBySection, resolveSection } from '@/components/book/bookShelfSections';

// Teacher bookshelf: same class-filtered book list the student sees, but
// without per-student queue gating (the teacher can open any class book) and
// without the student-number login. Selecting a book opens the enhanced
// teacher reader (with comprehension questions).
export default function TeacherBookShelf({ className, onSelectBook }) {
  const [selectedModule, setSelectedModule] = useState('All');
  const [selectedSection, setSelectedSection] = useState('df');
  const { toast } = useToast();

  const copyBookLink = (e, book) => {
    e.stopPropagation();
    const id = book.catalog_book_id;
    if (!id) {
      toast({ title: 'No catalog link available', variant: 'destructive' });
      return;
    }
    const url = `${window.location.origin}/BookReader?bookId=${id}`;
    navigator.clipboard?.writeText(url).then(
      () => toast({ title: 'Book link copied!', description: 'Paste it into your Google Slide.' }),
      () => toast({ title: 'Copy failed', description: url, variant: 'destructive' }),
    );
  };

  const { data: books = [], isLoading } = useQuery({
    queryKey: ['teacher-books', className],
    queryFn: async () => {
      const [classConfigs, activeBooks] = await Promise.all([
        base44.entities.ClassConfig.filter({ class_name: className }),
        base44.entities.BookAssignment.filter({ status: 'active' }, '-created_date', 1000),
      ]);
      const classLanguage = classConfigs[0]?.language || 'es';
      const eligible = activeBooks.filter((book) => {
        const allowed = Array.isArray(book.available_to_classes) ? book.available_to_classes : [];
        const hasAccess = allowed.includes(className);
        const lang = book.language || 'es';
        const langMatches = lang === classLanguage || lang === 'bilingual';
        return hasAccess && langMatches;
      });
      const seen = new Set();
      const merged = [];
      for (const b of eligible) {
        const key = b.catalog_book_id || (b.title || '').toLowerCase().trim();
        if (!key || seen.has(key)) continue;
        seen.add(key);
        merged.push(b);
      }
      return merged.sort((a, b) => (a.queue_order || 0) - (b.queue_order || 0));
    },
    enabled: !!className,
    refetchInterval: 10000,
  });

  // Separate DF / LV (and library / unclassified) by the BookAssignment.subject tag.
  const sections = groupBooksBySection(books);
  const activeSection = resolveSection(sections, selectedSection);
  const sectionBooks = sections.find((s) => s.id === activeSection)?.books || [];
  const modules = ['All', ...Array.from(new Set(sectionBooks.map((b) => b.module).filter(Boolean))).sort()];
  const moduleFilter = modules.includes(selectedModule) ? selectedModule : 'All';
  const filtered = moduleFilter === 'All' ? sectionBooks : sectionBooks.filter((b) => b.module === moduleFilter);

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center" style={{ background: '#042f2e' }}>
        <div className="w-8 h-8 border-4 border-teal-400 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (books.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 text-center" style={{ background: '#042f2e' }}>
        <div className="text-5xl">📚</div>
        <p className="text-lg font-black text-white">No books assigned to {className} yet.</p>
        <p className="text-sm text-teal-400">Assign books from the Book Reading dashboard.</p>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto p-4" style={{ background: '#042f2e' }}>
      <h2 className="mb-4 text-xl font-black text-white">📚 Class {className} — Books</h2>
      <ShelfSectionTabs sections={sections} active={activeSection} onSelect={setSelectedSection} />
      {modules.length > 1 && (
        <div className="mb-4 flex flex-wrap gap-2">
          {modules.map((m) => (
            <button
              key={m}
              onClick={() => setSelectedModule(m)}
              className={`rounded-full px-4 py-1.5 text-sm font-bold transition ${
                moduleFilter === m
                  ? 'bg-teal-500 text-white'
                  : 'border border-teal-700 text-teal-300 hover:bg-teal-900'
              }`}
            >
              {m === 'All' ? '📚 All' : `📁 ${m}`}
            </button>
          ))}
        </div>
      )}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4">
        {filtered.map((book) => (
          <motion.div
            key={book.id}
            whileTap={{ scale: 0.97 }}
            whileHover={{ scale: 1.03 }}
            onClick={() => onSelectBook(book)}
            className="relative flex flex-col overflow-hidden rounded-2xl text-left shadow-xl cursor-pointer"
            style={{ background: '#134e4a', border: '2px solid #0d9488' }}
          >
            <button
              onClick={(e) => copyBookLink(e, book)}
              title="Copy direct link for Google Slides"
              className="absolute right-2 top-2 z-10 flex h-8 w-8 items-center justify-center rounded-full bg-black/50 text-teal-200 backdrop-blur transition hover:bg-teal-600 hover:text-white"
            >
              <LinkIcon className="h-4 w-4" />
            </button>
            <div className="h-40 w-full overflow-hidden">
              {book.cover_image_url ? (
                <img src={book.cover_image_url} alt={book.title} className="h-full w-full object-cover" />
              ) : book.book_type === 'html' && book.pages?.length > 0 ? (
                <BookPageThumbnail book={book} pageNumber={1} />
              ) : book.pdf_url ? (
                <PdfThumbnail pdfUrl={book.pdf_url} pageNumber={2} width={300} />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-5xl" style={{ background: '#0f766e' }}>
                  📖
                </div>
              )}
            </div>
            <div className="p-3">
              <p className="text-sm font-black text-white">{book.title}</p>
              <div className="mt-0.5 flex flex-wrap items-center gap-2">
                <p className="text-xs text-teal-400">{book.pdf_page_count || (book.pages || []).length || '?'} pages</p>
                {book.module && (
                  <span className="rounded-full bg-teal-900 px-2 py-0.5 text-xs text-teal-300">{book.module}</span>
                )}
              </div>
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  );
}