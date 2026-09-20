import { useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ACTIVE_SCHOOL_YEAR, todayLocal } from '@/lib/schoolYear';
import { QRCodeSVG } from 'qrcode.react';
import PdfPageRenderer from '@/components/notebook/PdfPageRenderer';
import LaserReplayOverlay from '@/components/notebook/LaserReplayOverlay';
import BookStudentGrid from './BookStudentGrid';
import TeacherBookAnnotator from './TeacherBookAnnotator';
import BackButton from '@/components/ui/BackButton';
import { useClassNames } from '@/hooks/useClassNames';

const MODULES = ['', 'M1', 'M2', 'M3', 'M4', 'M5', 'M6', 'M7', 'M8', 'M9'];

export default function TeacherBookDashboard({ onBack }) {
  const qc = useQueryClient();
  const {
    classList: CLASS_NAMES,
    configs: CLASS_CONFIGS,
  } = useClassNames();
  const [className, setClassName] = useState(CLASS_NAMES[0] || 'Felix');
  const [newModule, setNewModule] = useState('');
  const [tab, setTab] = useState('books');
  const [selectedBook, setSelectedBook] = useState(null);
  const [selectedCatalogBook, setSelectedCatalogBook] = useState(null);
  const [newTitle, setNewTitle] = useState('');
  const [uploading, setUploading] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [reviewDate, setReviewDate] = useState(todayLocal());
  const [qrBook, setQrBook] = useState(null);
  const [qrBookClass, setQrBookClass] = useState('Felix');

  const selectedClassConfig =
    CLASS_CONFIGS.find(
      config => config.class_name === className
    );

  const classLanguage =
    selectedClassConfig?.language || 'es';

  const classGrade =
    selectedClassConfig?.grade || 'kinder';

  const bookMatchesSelectedClass = book => {
    const bookLanguage = book.language || 'es';
    const bookGrade = book.grade || 'kinder';

    const languageMatches =
      bookLanguage === classLanguage ||
      bookLanguage === 'bilingual';

    return (
      languageMatches &&
      bookGrade === classGrade
    );
  };

  const { data: books = [] } = useQuery({
    queryKey: [
      'books-all',
      className,
      classLanguage,
      classGrade,
    ],
    queryFn: async () => {
      const allBooks =
        await base44.entities.BookAssignment.list(
          '-created_date',
          1000
        );

      return allBooks.filter(
        book => bookMatchesSelectedClass(book)
      );
    },
    refetchInterval: 10000,
  });

  const assignedBooks = books.filter(book =>
    Array.isArray(book.available_to_classes) &&
    book.available_to_classes.includes(className)
  );

  const updateBook = useMutation({
    mutationFn: ({ id, data }) => base44.entities.BookAssignment.update(id, data),
    onSuccess: () => qc.invalidateQueries(['books-all', className]),
  });

  const deleteBook = useMutation({
    mutationFn: (id) => base44.entities.BookAssignment.delete(id),
    onSuccess: () => { qc.invalidateQueries(['books-all', className]); setSelectedBook(null); },
  });

  const extractPageCount = async (file) => {
    try {
      const pdfjsLib = await import('pdfjs-dist');
      pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`;
      const ab = await file.arrayBuffer();
      const pdf = await pdfjsLib.getDocument({ data: ab }).promise;
      return pdf.numPages;
    } catch { return 1; }
  };

  const uploadBook = async (file) => {
    if (!newTitle.trim()) return alert('Enter a book title first');

    setUploading(true);

    try {
      const isPdf = file.type === 'application/pdf';

      const [{ file_url }, pageCount] = await Promise.all([
        base44.integrations.Core.UploadFile({ file }),
        isPdf ? extractPageCount(file) : Promise.resolve(1),
      ]);

      const catalogBook = await base44.entities.BookCatalog.create({
        title: newTitle.trim(),
        language: classLanguage,
        grade: classGrade,
        pdf_url: isPdf ? file_url : null,
        cover_image_url: !isPdf ? file_url : null,
        pages: [],
        pdf_page_count: pageCount,
        book_type: isPdf ? 'pdf' : 'images',
        module: newModule || '',
        recording_pages: [],
        source_assignment_id: '',
      });

      const assignment = await base44.entities.BookAssignment.create({
        title: newTitle.trim(),
        class_name: className,
        language: classLanguage,
        grade: classGrade,
        catalog_book_id: catalogBook.id,
        available_to_classes: [className],
        school_year: ACTIVE_SCHOOL_YEAR,
        pdf_url: isPdf ? file_url : null,
        cover_image_url: !isPdf ? file_url : null,
        pdf_page_count: pageCount,
        book_type: isPdf ? 'pdf' : 'images',
        module: newModule || '',
        status: 'draft',
        teacher_annotations: [],
      });

      await base44.entities.BookCatalog.update(catalogBook.id, {
        source_assignment_id: assignment.id,
      });

      setNewTitle('');
      setNewModule('');
      qc.invalidateQueries(['books-all', className]);
    } catch (error) {
      console.error('Book upload failed', error);
      alert('The book could not be created. Please try again.');
    } finally {
      setUploading(false);
    }
  };

  const ensureCatalogForBook = async (book) => {
    if (!book) return null;

    if (book.catalog_book_id) {
      return base44.entities.BookCatalog.get(book.catalog_book_id);
    }

    const catalogMatches = book.pdf_url
      ? await base44.entities.BookCatalog.filter({
          pdf_url: book.pdf_url,
        })
      : await base44.entities.BookCatalog.filter({
          cover_image_url: book.cover_image_url,
        });

    let catalogBook = catalogMatches[0] || null;

    if (!catalogBook) {
      catalogBook = await base44.entities.BookCatalog.create({
        title: book.title,
        language: book.language || classLanguage,
        grade: book.grade || classGrade,
        pdf_url: book.pdf_url || null,
        cover_image_url: book.cover_image_url || null,
        pages: book.pages || [],
        pdf_page_count: book.pdf_page_count || 1,
        book_type: book.book_type || 'pdf',
        module: book.module || '',
        recording_pages: [],
        source_assignment_id: book.id,
      });
    }

    await base44.entities.BookAssignment.update(book.id, {
      catalog_book_id: catalogBook.id,
      language: book.language || classLanguage,
      grade: book.grade || classGrade,
      available_to_classes:
        Array.isArray(book.available_to_classes) &&
        book.available_to_classes.length > 0
          ? book.available_to_classes
          : [book.class_name].filter(Boolean),
      school_year:
        book.school_year ||
        ACTIVE_SCHOOL_YEAR,
    });

    qc.invalidateQueries(['books-all', className]);

    return catalogBook;
  };

  const handleDrop = async (e) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer?.files?.[0];
    if (!file) return;
    await uploadBook(file);
  };

  const getBookClasses = book =>
    Array.isArray(book.available_to_classes)
      ? book.available_to_classes
      : [];

  const getMatchingClasses = book => {
    const bookLanguage = book.language || 'es';
    const bookGrade = book.grade || 'kinder';

    return CLASS_CONFIGS
      .filter(config => {
        const gradeMatches =
          (config.grade || 'kinder') ===
          bookGrade;

        const languageMatches =
          bookLanguage === 'bilingual' ||
          (config.language || 'es') ===
            bookLanguage;

        return gradeMatches && languageMatches;
      })
      .map(config => config.class_name)
      .filter(Boolean);
  };

  const toggleSelectedClassAccess =
    async book => {
      const currentClasses =
        getBookClasses(book);

      const alreadyAssigned =
        currentClasses.includes(className);

      const availableToClasses =
        alreadyAssigned
          ? currentClasses.filter(
              currentClass =>
                currentClass !== className
            )
          : Array.from(
              new Set([
                ...currentClasses,
                className,
              ])
            );

      await base44.entities.BookAssignment.update(
        book.id,
        {
          available_to_classes:
            availableToClasses,
        }
      );

      qc.invalidateQueries([
        'books-all',
        className,
      ]);

      qc.invalidateQueries([
        'books-linked',
        className,
      ]);
    };

  const toggleAllMatchingClassAccess =
    async book => {
      const currentClasses =
        getBookClasses(book);

      const matchingClasses =
        getMatchingClasses(book);

      const allMatchingAssigned =
        matchingClasses.length > 0 &&
        matchingClasses.every(
          matchingClass =>
            currentClasses.includes(
              matchingClass
            )
        );

      let availableToClasses;

      if (allMatchingAssigned) {
        // Turn off the group scope but keep the
        // currently selected class assigned.
        availableToClasses =
          currentClasses.filter(
            currentClass =>
              !matchingClasses.includes(
                currentClass
              ) ||
              currentClass === className
          );

        if (
          !availableToClasses.includes(
            className
          )
        ) {
          availableToClasses.push(className);
        }
      } else {
        availableToClasses = Array.from(
          new Set([
            ...currentClasses,
            ...matchingClasses,
          ])
        );
      }

      await base44.entities.BookAssignment.update(
        book.id,
        {
          available_to_classes:
            availableToClasses,
          shared_across_classes:
            !allMatchingAssigned,
        }
      );

      qc.invalidateQueries([
        'books-all',
        className,
      ]);

      qc.invalidateQueries([
        'books-linked',
        className,
      ]);
    };

  const setStatus = (status) => {
    if (!selectedBook) return;
    updateBook.mutate({ id: selectedBook.id, data: { status } });
    setSelectedBook(b => ({ ...b, status }));
  };

  return (
    <div className="min-h-screen flex flex-col" style={{ background: '#042f2e', color: 'white' }}>
      <div className="flex items-center gap-3 px-4 py-3 border-b" style={{ borderColor: '#0d9488', background: '#0f3d3a' }}>
        <BackButton tone="teal" onClick={onBack} />
        <h1 className="text-lg font-black text-white flex-1">📚 Book Reading</h1>
        <select value={className} onChange={e => setClassName(e.target.value)}
          className="px-3 py-1.5 rounded-xl font-bold text-white border border-teal-600"
          style={{ background: '#0f3d3a' }}>
          {CLASS_NAMES.map(c => <option key={c} value={c}>Class {c}</option>)}
        </select>
      </div>

      <div className="flex gap-0 border-b" style={{ borderColor: '#0d9488', background: '#0f3d3a' }}>
        {[['books', '📚 Books'], ['queue', '📋 Queue'], ['annotate', '🔊 Annotate'], ['students', '👥 Students']].map(([id, label]) => (
          <button key={id} onClick={() => setTab(id)}
            className={`px-4 py-2.5 font-bold text-sm ${tab === id ? 'text-white border-b-2 border-teal-400' : 'text-teal-400 hover:text-white'}`}>
            {label}
          </button>
        ))}
      </div>

      <div className="flex-1 p-4 overflow-auto">
        {tab === 'books' && (
          <div className="max-w-2xl mx-auto flex flex-col gap-4">
            <div className="rounded-2xl p-4 flex flex-col gap-3" style={{ background: '#0f3d3a', border: '1px solid #0d9488' }}>
              <p className="font-bold text-teal-200 text-sm">
                Create New Book
              </p>
              <input value={newTitle} onChange={e => setNewTitle(e.target.value)} placeholder="Book title…"
                className="px-3 py-2 rounded-xl border border-teal-600 text-white text-sm"
                style={{ background: '#042f2e' }} />
              <select value={newModule} onChange={e => setNewModule(e.target.value)}
                className="px-3 py-2 rounded-xl border border-teal-600 text-white text-sm"
                style={{ background: '#042f2e' }}>
                <option value="">No module</option>
                {MODULES.filter(Boolean).map(m => <option key={m} value={m}>{m}</option>)}
              </select>
              <div
                onDragOver={e => { e.preventDefault(); setDragging(true); }}
                onDragLeave={() => setDragging(false)}
                onDrop={handleDrop}
                onClick={() => document.getElementById('book-file-input').click()}
                className={`h-28 rounded-2xl border-4 border-dashed flex flex-col items-center justify-center gap-2 cursor-pointer transition-all ${dragging ? 'border-teal-400 bg-teal-900/30' : 'border-teal-700 hover:border-teal-500'}`}>
                {uploading
                  ? <div className="w-6 h-6 border-4 border-teal-400 border-t-transparent rounded-full animate-spin" />
                  : <><span className="text-3xl">📄</span><p className="text-teal-300 text-sm font-bold">Drop PDF or image, or tap to browse</p></>}
              </div>
              <input id="book-file-input" type="file" accept="application/pdf,image/*" className="hidden"
                onChange={async e => { const f = e.target.files?.[0]; e.target.value = ''; if (f) await uploadBook(f); }} />
            </div>

            {books.map(b => (
              <motion.div key={b.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                className="rounded-2xl p-4 flex items-center gap-3 cursor-pointer"
                style={{ background: selectedBook?.id === b.id ? '#14444022' : '#0f3d3a', border: `1px solid ${selectedBook?.id === b.id ? '#14b8a6' : '#0d9488'}` }}
                onClick={async () => {
                  setSelectedBook(b);
                  setSelectedCatalogBook(null);
                  setTab('annotate');

                  try {
                    const catalogBook = await ensureCatalogForBook(b);

                    setSelectedCatalogBook(catalogBook);
                    setSelectedBook(current => ({
                      ...current,
                      catalog_book_id: catalogBook?.id || '',
                    }));
                  } catch (error) {
                    console.error('Loading book catalog failed', error);
                    alert('The permanent book settings could not be loaded.');
                  }
                }}>
                {b.cover_image_url
                  ? <img src={b.cover_image_url} alt={b.title} className="w-12 h-12 rounded-xl object-cover" />
                  : <div className="w-12 h-12 rounded-xl flex items-center justify-center text-2xl" style={{ background: '#0f766e' }}>📖</div>}
                <div className="flex-1">
                  <p className="font-black text-white">{b.title}</p>
                  <div className="flex items-center gap-2 mt-0.5">
                    <p className="text-xs text-teal-400">
                      {getBookClasses(b).includes(className)
                        ? 'Assigned to this class'
                        : 'Not assigned to this class'}
                      {' · '}
                      {b.status}
                      {' · '}
                      {b.pdf_page_count || '?'} pages
                    </p>
                    {b.module && <span className="text-xs text-teal-200 bg-teal-800 px-2 py-0.5 rounded-full">{b.module}</span>}
                  </div>
                </div>
                <div className="flex items-center gap-2" onClick={e => e.stopPropagation()}>
                  <button
                    onClick={() => { setQrBook(b); setQrBookClass(className); }}
                    className="px-2 py-1 rounded-lg text-xs font-bold text-teal-300 border border-teal-700 hover:bg-teal-900"
                    title="Generate QR for this book">
                    📱 QR
                  </button>
                  <select
                    value={b.module || ''}
                    onChange={e => updateBook.mutate({ id: b.id, data: { module: e.target.value } })}
                    className="px-2 py-1 rounded-lg text-xs font-bold text-white border border-teal-700"
                    style={{ background: '#042f2e' }}>
                    <option value="">No module</option>
                    {MODULES.filter(Boolean).map(m => <option key={m} value={m}>{m}</option>)}
                  </select>
                  <button
                    title={
                      getBookClasses(b).includes(
                        className
                      )
                        ? `Remove student access for ${className}`
                        : `Give student access to ${className}`
                    }
                    onClick={() =>
                      toggleSelectedClassAccess(b)
                    }
                    className={`px-2 py-1 rounded-full text-xs font-bold transition-all hover:scale-105 ${
                      getBookClasses(b).includes(
                        className
                      )
                        ? 'bg-teal-700 text-teal-100'
                        : 'bg-gray-700 text-gray-300'
                    }`}
                  >
                    {getBookClasses(b).includes(
                      className
                    )
                      ? `✓ ${className}`
                      : `+ ${className}`}
                  </button>

                  <button
                    title="Assign this book to every class with the same language and grade"
                    onClick={() =>
                      toggleAllMatchingClassAccess(b)
                    }
                    className={`px-2 py-1 rounded-full text-xs font-bold transition-all hover:scale-105 ${
                      getMatchingClasses(b).length > 0 &&
                      getMatchingClasses(b).every(
                        matchingClass =>
                          getBookClasses(b).includes(
                            matchingClass
                          )
                      )
                        ? 'bg-yellow-600 text-yellow-100'
                        : 'bg-gray-700 text-gray-300'
                    }`}
                  >
                    {getMatchingClasses(b).length > 0 &&
                    getMatchingClasses(b).every(
                      matchingClass =>
                        getBookClasses(b).includes(
                          matchingClass
                        )
                    )
                      ? `🌐 All ${
                          (b.language || 'es') === 'en'
                            ? 'English'
                            : (b.language || 'es') ===
                                'bilingual'
                              ? 'Bilingual'
                              : 'Spanish'
                        } ${
                          (b.grade || 'kinder') ===
                          'first'
                            ? '1st Grade'
                            : 'Kinder'
                        }`
                      : '🌐 Assign all matching'}
                  </button>
                  <button
                    onClick={() => {
                      const next = b.status === 'draft' ? 'active' : b.status === 'active' ? 'closed' : 'draft';
                      updateBook.mutate({ id: b.id, data: { status: next } });
                    }}
                    className={`px-3 py-1 rounded-full text-xs font-bold transition-all hover:scale-105 ${
                      b.status === 'active' ? 'bg-green-700 text-green-100 hover:bg-green-600' :
                      b.status === 'closed' ? 'bg-red-900 text-red-200 hover:bg-red-800' :
                      'bg-gray-700 text-gray-300 hover:bg-teal-800 hover:text-teal-100'
                    }`}>
                    {b.status}
                  </button>
                  <button
                    onClick={() => {
                      if (
                        confirm(
                          `Permanently delete "${b.title}"?\n\n` +
                          'This removes the canonical book for every class. ' +
                          'Use the class access button instead if you only want to remove student access.'
                        )
                      ) {
                        deleteBook.mutate(b.id);
                      }
                    }}
                    className="px-2 py-1 rounded-full text-xs font-bold bg-red-900 text-red-200 hover:bg-red-700 transition-all hover:scale-105"
                    title="Permanently delete this book for every class"
                  >
                    🗑
                  </button>
                </div>
              </motion.div>
            ))}
          </div>
        )}

        {tab === 'queue' && (
          <div className="max-w-2xl mx-auto flex flex-col gap-4">
            <p className="text-teal-300 text-sm">Arrange books in reading order. Mark students as "mastered" to let them advance to the next book in the queue.</p>

            {/* Active books sorted by queue_order */}
            {[...assignedBooks].filter(b => b.status === 'active' || b.status === 'draft').sort((a, b) => (a.queue_order || 0) - (b.queue_order || 0)).map((b, idx, arr) => (
              <div key={b.id} className="rounded-2xl p-4 flex flex-col gap-3"
                style={{ background: '#0f3d3a', border: '1px solid #0d9488' }}>
                <div className="flex items-center gap-3">
                  <div className="flex flex-col gap-1">
                    <button disabled={idx === 0}
                      onClick={() => {
                        const prev = arr[idx - 1];
                        updateBook.mutate({ id: b.id, data: { queue_order: prev.queue_order || idx - 1 } });
                        updateBook.mutate({ id: prev.id, data: { queue_order: b.queue_order || idx } });
                      }}
                      className="text-teal-300 hover:text-white font-bold text-xs disabled:opacity-20">▲</button>
                    <button disabled={idx === arr.length - 1}
                      onClick={() => {
                        const next = arr[idx + 1];
                        updateBook.mutate({ id: b.id, data: { queue_order: next.queue_order || idx + 1 } });
                        updateBook.mutate({ id: next.id, data: { queue_order: b.queue_order || idx } });
                      }}
                      className="text-teal-300 hover:text-white font-bold text-xs disabled:opacity-20">▼</button>
                  </div>
                  <div className="w-8 h-8 rounded-full flex items-center justify-center font-black text-lg shrink-0"
                    style={{ background: '#0d9488', color: 'white' }}>{idx + 1}</div>
                  {b.cover_image_url
                    ? <img src={b.cover_image_url} alt={b.title} className="w-10 h-10 rounded-xl object-cover shrink-0" />
                    : <div className="w-10 h-10 rounded-xl flex items-center justify-center text-xl shrink-0" style={{ background: '#0f766e' }}>📖</div>}
                  <div className="flex-1 min-w-0">
                    <p className="font-black text-white text-sm truncate">{b.title}</p>
                    <p className="text-teal-400 text-xs">{b.status} · {b.pdf_page_count || '?'} pages</p>
                  </div>
                </div>

                {/* Mastery grid */}
                <div>
                  <p className="text-teal-300 text-xs font-bold mb-1.5">✅ Mastered (can advance to next book):</p>
                  <div className="flex flex-wrap gap-1.5">
                    {Array.from({ length: 30 }, (_, i) => i + 1).map(n => {
                      const mastered = (b.mastered_students || []).includes(n);
                      return (
                        <button key={n}
                          onClick={() => {
                            const current = b.mastered_students || [];
                            const next = mastered ? current.filter(s => s !== n) : [...current, n];
                            updateBook.mutate({ id: b.id, data: { mastered_students: next } });
                          }}
                          className={`w-7 h-7 rounded-lg font-bold text-xs transition-all ${mastered ? 'bg-green-600 text-white' : 'text-teal-500 border border-teal-800 hover:border-teal-500'}`}>
                          {n}
                        </button>
                      );
                    })}
                  </div>
                  {(b.mastered_students || []).length > 0 && (
                    <p className="text-green-400 text-xs mt-1 font-bold">
                      {(b.mastered_students || []).length} student{(b.mastered_students || []).length !== 1 ? 's' : ''} mastered → can read next book
                    </p>
                  )}
                </div>

                {/* Individual assignment — empty = all students, non-empty = only those students */}
                <div>
                  <p className="text-teal-300 text-xs font-bold mb-1.5">👤 Assigned to (empty = all students):</p>
                  <div className="flex flex-wrap gap-1.5">
                    {Array.from({ length: 30 }, (_, i) => i + 1).map(n => {
                      const assigned = (b.assigned_students || []).includes(n);
                      return (
                        <button key={n}
                          onClick={() => {
                            const current = b.assigned_students || [];
                            const next = assigned ? current.filter(s => s !== n) : [...current, n];
                            updateBook.mutate({ id: b.id, data: { assigned_students: next } });
                          }}
                          className={`w-7 h-7 rounded-lg font-bold text-xs transition-all ${assigned ? 'bg-indigo-600 text-white' : 'text-teal-500 border border-teal-800 hover:border-teal-500'}`}>
                          {n}
                        </button>
                      );
                    })}
                  </div>
                  {(b.assigned_students || []).length > 0 && (
                    <button
                      onClick={() => updateBook.mutate({ id: b.id, data: { assigned_students: [] } })}
                      className="text-teal-400 text-xs font-bold mt-1 hover:text-white underline"
                    >
                      Clear (assign to all)
                    </button>
                  )}
                </div>
              </div>
            ))}

            {assignedBooks.filter(b => b.status === 'active' || b.status === 'draft').length === 0 && (
              <p className="text-teal-400 text-center mt-8">No active books yet. Create books in the Books tab.</p>
            )}
          </div>
        )}

        {tab === 'annotate' && (
          <div className="max-w-3xl mx-auto">
            {!selectedBook
              ? <p className="text-teal-400 text-center mt-8">Select a book from the Books tab first</p>
              : (
                <div className="flex flex-col gap-4">
                  <div className="rounded-2xl p-3 flex items-center gap-3 flex-wrap" style={{ background: '#0f3d3a', border: '1px solid #0d9488' }}>
                    <p className="font-black text-white flex-1">{selectedBook.title}</p>
                    {['draft', 'active', 'closed'].map(s => (
                      <button key={s} onClick={() => setStatus(s)}
                        className={`px-4 py-1.5 rounded-xl font-bold text-sm ${selectedBook.status === s ? 'bg-teal-600 text-white' : 'text-teal-300 border border-teal-700'}`}>
                        {s}
                      </button>
                    ))}
                  </div>

                  <div
                    className="rounded-2xl p-4 flex flex-col gap-3"
                    style={{
                      background: '#0f3d3a',
                      border: '1px solid #0d9488',
                    }}
                  >
                    <div>
                      <p className="text-teal-200 font-bold text-sm">
                        🎙 Recording — Required Pages
                      </p>
                      <p className="text-teal-400 text-xs mt-1">
                        Select every page that contains text students should record.
                        These choices stay with the permanent book for future classes
                        and school years.
                      </p>
                    </div>

                    {!selectedCatalogBook ? (
                      <p className="text-teal-400 text-xs font-bold">
                        Loading permanent book settings…
                      </p>
                    ) : (
                      <div className="flex items-center gap-2 flex-wrap">
                        {Array.from(
                          {
                            length:
                              selectedBook.pdf_page_count ||
                              selectedCatalogBook.pdf_page_count ||
                              1,
                          },
                          (_, index) => index + 1
                        ).map(pageNumber => {
                          const enabled = (
                            selectedCatalogBook.recording_pages || []
                          ).includes(pageNumber);

                          return (
                            <button
                              key={pageNumber}
                              type="button"
                              onClick={async () => {
                                const currentPages =
                                  selectedCatalogBook.recording_pages || [];

                                const recordingPages = enabled
                                  ? currentPages.filter(
                                      page => page !== pageNumber
                                    )
                                  : [...currentPages, pageNumber].sort(
                                      (a, b) => a - b
                                    );

                                try {
                                  await base44.entities.BookCatalog.update(
                                    selectedCatalogBook.id,
                                    {
                                      recording_pages: recordingPages,
                                    }
                                  );

                                  setSelectedCatalogBook(current => ({
                                    ...current,
                                    recording_pages: recordingPages,
                                  }));

                                  qc.invalidateQueries([
                                    'book-catalog',
                                    selectedCatalogBook.id,
                                  ]);
                                } catch (error) {
                                  console.error(
                                    'Updating recording pages failed',
                                    error
                                  );

                                  alert(
                                    'The recording pages could not be saved.'
                                  );
                                }
                              }}
                              className={`w-10 h-10 rounded-xl font-bold text-sm transition-all ${
                                enabled
                                  ? 'bg-teal-500 text-white'
                                  : 'text-teal-400 border border-teal-700 hover:border-teal-400'
                              }`}
                              title={
                                enabled
                                  ? `Page ${pageNumber} requires a recording`
                                  : `Page ${pageNumber} does not require a recording`
                              }
                            >
                              {pageNumber}
                            </button>
                          );
                        })}
                      </div>
                    )}

                    {selectedCatalogBook &&
                      (selectedCatalogBook.recording_pages || []).length === 0 && (
                        <p className="text-amber-300 text-xs font-bold">
                          No recording pages selected yet.
                        </p>
                      )}
                  </div>

                  <TeacherBookAnnotator
                    book={selectedBook}
                    onUpdate={(updatedBook) => {
                      setSelectedBook(updatedBook);
                      updateBook.mutate({ id: updatedBook.id, data: { teacher_annotations: updatedBook.teacher_annotations } });
                    }}
                  />
                </div>
              )
            }
          </div>
        )}

        {tab === 'students' && (
          <div className="max-w-5xl mx-auto flex flex-col gap-3">
            <div className="flex items-center gap-3 flex-wrap">
              <p className="font-black text-white text-sm">📋 Student Recordings</p>
              <div className="flex items-center gap-2 ml-auto">
                <label className="text-teal-300 text-xs font-bold">Date:</label>
                <input type="date" value={reviewDate} onChange={e => setReviewDate(e.target.value)}
                  className="px-3 py-1 rounded-xl border border-teal-600 text-white text-sm"
                  style={{ background: '#042f2e' }} />
              </div>
            </div>
            <BookStudentGrid
              books={assignedBooks}
              className={className}
              reviewDate={reviewDate}
            />
          </div>
        )}
      </div>

      {/* Book QR Modal */}
      {qrBook && (() => {
        const qrUrl = `${window.location.origin}/BookReading?book=${encodeURIComponent(qrBook.title)}&class=${qrBookClass}&year=${ACTIVE_SCHOOL_YEAR}`;
        return (
          <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-[200] p-6" onClick={() => setQrBook(null)}>
            <div className="bg-white rounded-3xl p-8 text-center shadow-2xl w-full max-w-lg" onClick={e => e.stopPropagation()}>
              <p className="font-black text-2xl mb-1">📚 Book QR</p>
              <p className="text-sm text-gray-500 mb-4">{qrBook.title}</p>
              <div className="flex items-center gap-3 mb-5 justify-center">
                <span className="text-base font-bold text-gray-700">Class:</span>
                <select value={qrBookClass} onChange={e => setQrBookClass(e.target.value)}
                  className="border-2 border-gray-300 rounded-xl px-3 py-2 text-base font-bold">
                  {CLASS_NAMES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div className="flex justify-center mb-4">
                <QRCodeSVG value={qrUrl} size={320} level="M" />
              </div>
              <p className="text-xs text-gray-400 mb-5 break-all">{qrUrl}</p>
              <button onClick={() => setQrBook(null)} className="border-2 border-gray-300 bg-white rounded-2xl px-8 py-3 text-base font-bold hover:bg-gray-50">Close</button>
            </div>
          </div>
        );
      })()}
    </div>
  );
}