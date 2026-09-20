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
  const [migratingCatalog, setMigratingCatalog] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [reviewDate, setReviewDate] = useState(todayLocal());
  const [qrBook, setQrBook] = useState(null);
  const [qrBookClass, setQrBookClass] = useState('Felix');

  const classLanguage =
    CLASS_CONFIGS.find(
      config => config.class_name === className
    )?.language || 'es';

  const bookMatchesClassLanguage = book => {
    const bookLanguage = book.language || 'es';

    return (
      bookLanguage === classLanguage ||
      bookLanguage === 'bilingual'
    );
  };

  const { data: books = [] } = useQuery({
    queryKey: [
      'books-all',
      className,
      classLanguage,
    ],
    queryFn: async () => {
      const allBooks =
        await base44.entities.BookAssignment.list(
          '-created_date',
          1000
        );

      return allBooks.filter(book => {
        if (!bookMatchesClassLanguage(book)) {
          return false;
        }

        const allowedClasses = Array.isArray(
          book.available_to_classes
        )
          ? book.available_to_classes
          : [];

        if (allowedClasses.includes(className)) {
          return true;
        }

        // Backward compatibility for older assignments.
        return book.class_name === className;
      });
    },
    refetchInterval: 10000,
  });

  const { data: sharedBooks = [] } = useQuery({
    queryKey: ['books-shared'],
    queryFn: () => base44.entities.BookAssignment.filter({ shared_across_classes: true }),
    refetchInterval: 30000,
  });

  const updateBook = useMutation({
    mutationFn: ({ id, data }) => base44.entities.BookAssignment.update(id, data),
    onSuccess: () => qc.invalidateQueries(['books-all', className]),
  });

  const deleteBook = useMutation({
    mutationFn: (id) => base44.entities.BookAssignment.delete(id),
    onSuccess: () => { qc.invalidateQueries(['books-all', className]); qc.invalidateQueries(['books-shared']); setSelectedBook(null); },
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

  const consolidateBooksIntoFelix = async () => {
    const confirmed = window.confirm(
      'Consolidate duplicate book assignments into the Felix versions?\n\n' +
      'This will update lessons and saved reading sessions before deleting duplicate assignments. ' +
      'Books without a Felix version will be skipped.'
    );

    if (!confirmed) return;

    setMigratingCatalog(true);

    try {
      const [
        allAssignments,
        allLessons,
      ] = await Promise.all([
        base44.entities.BookAssignment.list(
          '-created_date',
          1000
        ),
        base44.entities.Lesson.list(),
      ]);

      const assignmentsByCatalog = new Map();

      for (const assignment of allAssignments) {
        if (!assignment.catalog_book_id) continue;

        if (
          !assignmentsByCatalog.has(
            assignment.catalog_book_id
          )
        ) {
          assignmentsByCatalog.set(
            assignment.catalog_book_id,
            []
          );
        }

        assignmentsByCatalog
          .get(assignment.catalog_book_id)
          .push(assignment);
      }

      const replaceBookIdInSteps = (
        steps,
        oldBookId,
        newBookId
      ) => {
        let changed = false;

        const nextSteps = (steps || []).map(step => {
          if (step?.config?.bookId !== oldBookId) {
            return step;
          }

          changed = true;

          return {
            ...step,
            config: {
              ...(step.config || {}),
              bookId: newBookId,
            },
          };
        });

        return {
          steps: nextSteps,
          changed,
        };
      };

      let lessons = [...allLessons];
      let groupsConsolidated = 0;
      let assignmentsDeleted = 0;
      let assignmentsSkipped = 0;
      let lessonsUpdated = 0;
      let sessionsUpdated = 0;

      for (
        const [catalogBookId, assignments]
        of assignmentsByCatalog.entries()
      ) {
        if (assignments.length < 2) continue;

        const felixAssignment = assignments.find(
          assignment =>
            String(
              assignment.class_name || ''
            ).trim().toLowerCase() === 'felix'
        );

        if (!felixAssignment) {
          assignmentsSkipped += assignments.length;
          continue;
        }

        const duplicates = assignments.filter(
          assignment =>
            assignment.id !== felixAssignment.id
        );

        const mergedClasses = Array.from(
          new Set(
            assignments.flatMap(assignment => [
              assignment.class_name,
              ...(
                Array.isArray(
                  assignment.available_to_classes
                )
                  ? assignment.available_to_classes
                  : []
              ),
            ]).filter(Boolean)
          )
        );

        await base44.entities.BookAssignment.update(
          felixAssignment.id,
          {
            available_to_classes: mergedClasses,
            school_year:
              felixAssignment.school_year ||
              ACTIVE_SCHOOL_YEAR,
            shared_across_classes:
              assignments.some(
                assignment =>
                  assignment.shared_across_classes
              ),
          }
        );

        await base44.entities.BookCatalog.update(
          catalogBookId,
          {
            source_assignment_id:
              felixAssignment.id,
          }
        );

        for (const duplicate of duplicates) {
          for (let index = 0; index < lessons.length; index += 1) {
            const lesson = lessons[index];

            const topLevelResult =
              replaceBookIdInSteps(
                lesson.steps,
                duplicate.id,
                felixAssignment.id
              );

            let dailyLessonsChanged = false;

            const nextDailyLessons = (
              lesson.daily_lessons || []
            ).map(dailyLesson => {
              const dailyResult =
                replaceBookIdInSteps(
                  dailyLesson.steps,
                  duplicate.id,
                  felixAssignment.id
                );

              if (!dailyResult.changed) {
                return dailyLesson;
              }

              dailyLessonsChanged = true;

              return {
                ...dailyLesson,
                steps: dailyResult.steps,
              };
            });

            if (
              topLevelResult.changed ||
              dailyLessonsChanged
            ) {
              await base44.entities.Lesson.update(
                lesson.id,
                {
                  steps: topLevelResult.steps,
                  daily_lessons:
                    nextDailyLessons,
                }
              );

              lessons[index] = {
                ...lesson,
                steps: topLevelResult.steps,
                daily_lessons:
                  nextDailyLessons,
              };

              lessonsUpdated += 1;
            }
          }

          const duplicateSessions =
            await base44.entities.BookReadingSession.filter(
              {
                book_id: duplicate.id,
              },
              '-created_date',
              1000
            );

          for (const session of duplicateSessions) {
            await base44.entities.BookReadingSession.update(
              session.id,
              {
                book_id: felixAssignment.id,
              }
            );

            sessionsUpdated += 1;
          }

          const lessonStillReferencesDuplicate =
            lessons.some(lesson => {
              const topLevelReference = (
                lesson.steps || []
              ).some(
                step =>
                  step?.config?.bookId ===
                  duplicate.id
              );

              const dailyReference = (
                lesson.daily_lessons || []
              ).some(dailyLesson =>
                (dailyLesson.steps || []).some(
                  step =>
                    step?.config?.bookId ===
                    duplicate.id
                )
              );

              return (
                topLevelReference ||
                dailyReference
              );
            });

          if (lessonStillReferencesDuplicate) {
            assignmentsSkipped += 1;
            continue;
          }

          const remainingSessions =
            await base44.entities.BookReadingSession.filter(
              {
                book_id: duplicate.id,
              },
              '-created_date',
              1
            );

          if (remainingSessions.length > 0) {
            assignmentsSkipped += 1;
            continue;
          }

          await base44.entities.BookAssignment.delete(
            duplicate.id
          );

          assignmentsDeleted += 1;
        }

        groupsConsolidated += 1;
      }

      qc.invalidateQueries([
        'books-all',
        className,
      ]);
      qc.invalidateQueries(['books-shared']);
      qc.invalidateQueries(['book-picker-books']);
      qc.invalidateQueries(['books-linked']);
      qc.invalidateQueries(['all-lessons']);
      qc.invalidateQueries(['lessons']);
      qc.invalidateQueries(['book-sessions']);

      alert(
        `Felix book consolidation complete.\n\n` +
        `${groupsConsolidated} book groups consolidated\n` +
        `${assignmentsDeleted} duplicate assignments deleted\n` +
        `${lessonsUpdated} lesson records updated\n` +
        `${sessionsUpdated} reading sessions redirected\n` +
        `${assignmentsSkipped} assignments skipped for safety`
      );
    } catch (error) {
      console.error(
        'Felix book consolidation failed',
        error
      );

      alert(
        'The consolidation stopped because of an error. ' +
        'Completed updates are safe, and you can run it again to finish.'
      );
    } finally {
      setMigratingCatalog(false);
    }
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
              <div className="flex items-center justify-between gap-3">
                <p className="font-bold text-teal-200 text-sm">
                  Create New Book
                </p>

                <button
                  type="button"
                  onClick={consolidateBooksIntoFelix}
                  disabled={migratingCatalog || uploading}
                  className="px-3 py-1.5 rounded-xl text-xs font-bold text-white disabled:opacity-50"
                  style={{
                    background: '#0f766e',
                    border: '1px solid #14b8a6',
                  }}
                >
                  {migratingCatalog
                    ? 'Consolidating books…'
                    : 'Consolidate into Felix'}
                </button>
              </div>
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
                    <p className="text-xs text-teal-400">{b.status} · {b.pdf_page_count || '?'} pages</p>
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
                    title={b.shared_across_classes ? 'Shared with all classes — click to unshare' : 'Share with all classes'}
                    onClick={() => updateBook.mutate({ id: b.id, data: { shared_across_classes: !b.shared_across_classes } })}
                    className={`px-2 py-1 rounded-full text-xs font-bold transition-all hover:scale-105 ${b.shared_across_classes ? 'bg-yellow-600 text-yellow-100' : 'bg-gray-700 text-gray-400 hover:bg-teal-900 hover:text-teal-300'}`}>
                    {b.shared_across_classes ? '🌐 Shared' : '🔒 Private'}
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
                    onClick={() => { if (confirm(`Remove "${b.title}" from class ${className}? This unassigns it from this class's library.`)) deleteBook.mutate(b.id); }}
                    className="px-2 py-1 rounded-full text-xs font-bold bg-red-900 text-red-200 hover:bg-red-700 transition-all hover:scale-105"
                    title="Unassign this book from this class"
                  >
                    🗑
                  </button>
                </div>
              </motion.div>
            ))}

            {/* Shared library from other classes */}
            {sharedBooks.filter(b =>
              bookMatchesClassLanguage(b) &&
              b.class_name !== className &&
              !(
                Array.isArray(b.available_to_classes) &&
                b.available_to_classes.includes(className)
              )
            ).length > 0 && (
              <div className="mt-2">
                <p className="text-teal-300 text-xs font-bold uppercase mb-2">🌐 Shared Library — from other classes</p>
                {sharedBooks.filter(b =>
                  bookMatchesClassLanguage(b) &&
                  b.class_name !== className &&
                  !(
                    Array.isArray(b.available_to_classes) &&
                    b.available_to_classes.includes(className)
                  )
                ).map(b => (
                  <div key={b.id} className="rounded-2xl p-4 flex items-center gap-3 mb-2"
                    style={{ background: '#0a2e2c', border: '1px dashed #0d9488' }}>
                    {b.cover_image_url
                      ? <img src={b.cover_image_url} alt={b.title} className="w-12 h-12 rounded-xl object-cover" />
                      : <div className="w-12 h-12 rounded-xl flex items-center justify-center text-2xl" style={{ background: '#0f766e' }}>📖</div>}
                    <div className="flex-1">
                      <p className="font-black text-white text-sm">{b.title}</p>
                      <p className="text-teal-400 text-xs">
                        {(b.language || 'es') === 'en'
                          ? 'English'
                          : (b.language || 'es') === 'bilingual'
                            ? 'Bilingual'
                            : 'Spanish'}
                        {' · '}
                        {b.pdf_page_count || '?'} pages
                        {b.module ? ` · ${b.module}` : ''}
                      </p>
                    </div>
                    <button
                      onClick={async () => {
                        try {
                          const currentClasses =
                            Array.isArray(b.available_to_classes) &&
                            b.available_to_classes.length > 0
                              ? b.available_to_classes
                              : [b.class_name].filter(Boolean);

                          const availableToClasses = Array.from(
                            new Set([
                              ...currentClasses,
                              className,
                            ])
                          );

                          await base44.entities.BookAssignment.update(
                            b.id,
                            {
                              available_to_classes:
                                availableToClasses,
                              school_year:
                                b.school_year ||
                                ACTIVE_SCHOOL_YEAR,
                            }
                          );

                          qc.invalidateQueries([
                            'books-all',
                            className,
                          ]);

                          qc.invalidateQueries([
                            'books-shared',
                          ]);
                        } catch (error) {
                          console.error(
                            'Granting book access failed',
                            error
                          );

                          alert(
                            'Access to this book could not be updated.'
                          );
                        }
                      }}
                      className="px-3 py-1.5 rounded-xl text-xs font-bold text-white whitespace-nowrap"
                      style={{ background: '#0f766e', border: '1px solid #14b8a6' }}>
                      + Give access to {className}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {tab === 'queue' && (
          <div className="max-w-2xl mx-auto flex flex-col gap-4">
            <p className="text-teal-300 text-sm">Arrange books in reading order. Mark students as "mastered" to let them advance to the next book in the queue.</p>

            {/* Active books sorted by queue_order */}
            {[...books].filter(b => b.status === 'active' || b.status === 'draft').sort((a, b) => (a.queue_order || 0) - (b.queue_order || 0)).map((b, idx, arr) => (
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

            {books.filter(b => b.status === 'active' || b.status === 'draft').length === 0 && (
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
              books={[
                ...books,
                ...sharedBooks.filter(
                  b =>
                    bookMatchesClassLanguage(b) &&
                    b.class_name !== className &&
                    !books.some(
                      localBook =>
                        localBook.id === b.id
                    )
                )
              ]}
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