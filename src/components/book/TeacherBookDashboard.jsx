import { useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import PdfPageRenderer from '@/components/notebook/PdfPageRenderer';
import LaserReplayOverlay from '@/components/notebook/LaserReplayOverlay';
import BookStudentGrid from './BookStudentGrid';
import TeacherBookAnnotator from './TeacherBookAnnotator';

const CLASS_NAMES = ['F', 'V', 'C', 'A', 'B', 'D'];

export default function TeacherBookDashboard({ onBack }) {
  const qc = useQueryClient();
  const [className, setClassName] = useState('F');
  const [tab, setTab] = useState('books');
  const [selectedBook, setSelectedBook] = useState(null);
  const [newTitle, setNewTitle] = useState('');
  const [uploading, setUploading] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [reviewDate, setReviewDate] = useState(new Date().toISOString().slice(0, 10));

  const { data: books = [] } = useQuery({
    queryKey: ['books-all', className],
    queryFn: () => base44.entities.BookAssignment.filter({ class_name: className }),
    refetchInterval: 10000,
  });

  const updateBook = useMutation({
    mutationFn: ({ id, data }) => base44.entities.BookAssignment.update(id, data),
    onSuccess: () => qc.invalidateQueries(['books-all', className]),
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
    const isPdf = file.type === 'application/pdf';
    const [{ file_url }, pageCount] = await Promise.all([
      base44.integrations.Core.UploadFile({ file }),
      isPdf ? extractPageCount(file) : Promise.resolve(1),
    ]);
    await base44.entities.BookAssignment.create({
      title: newTitle.trim(),
      class_name: className,
      pdf_url: isPdf ? file_url : null,
      cover_image_url: !isPdf ? file_url : null,
      pdf_page_count: pageCount,
      book_type: isPdf ? 'pdf' : 'images',
      status: 'draft',
      teacher_annotations: [],
    });
    setNewTitle('');
    setUploading(false);
    qc.invalidateQueries(['books-all', className]);
  };

  const handleDrop = async (e) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer?.files?.[0];
    if (!file) return;
    await uploadBook(file);
  };

  const setStatus = (status) => {
    if (!selectedBook) return;
    updateBook.mutate({ id: selectedBook.id, data: { status } });
    setSelectedBook(b => ({ ...b, status }));
  };

  return (
    <div className="min-h-screen flex flex-col" style={{ background: '#042f2e', color: 'white' }}>
      <div className="flex items-center gap-3 px-4 py-3 border-b" style={{ borderColor: '#0d9488', background: '#0f3d3a' }}>
        <button onClick={onBack} className="text-teal-300 hover:text-white font-bold">← Back</button>
        <h1 className="text-lg font-black text-white flex-1">📚 Book Reading</h1>
        <select value={className} onChange={e => setClassName(e.target.value)}
          className="px-3 py-1.5 rounded-xl font-bold text-white border border-teal-600"
          style={{ background: '#0f3d3a' }}>
          {CLASS_NAMES.map(c => <option key={c} value={c}>Class {c}</option>)}
        </select>
      </div>

      <div className="flex gap-0 border-b" style={{ borderColor: '#0d9488', background: '#0f3d3a' }}>
        {[['books', '📚 Books'], ['annotate', '🔊 Annotate'], ['students', '👥 Students']].map(([id, label]) => (
          <button key={id} onClick={() => setTab(id)}
            className={`px-5 py-2.5 font-bold text-sm ${tab === id ? 'text-white border-b-2 border-teal-400' : 'text-teal-400 hover:text-white'}`}>
            {label}
          </button>
        ))}
      </div>

      <div className="flex-1 p-4 overflow-auto">
        {tab === 'books' && (
          <div className="max-w-2xl mx-auto flex flex-col gap-4">
            <div className="rounded-2xl p-4 flex flex-col gap-3" style={{ background: '#0f3d3a', border: '1px solid #0d9488' }}>
              <p className="font-bold text-teal-200 text-sm">Create New Book</p>
              <input value={newTitle} onChange={e => setNewTitle(e.target.value)} placeholder="Book title…"
                className="px-3 py-2 rounded-xl border border-teal-600 text-white text-sm"
                style={{ background: '#042f2e' }} />
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
                onClick={() => { setSelectedBook(b); setTab('annotate'); }}>
                {b.cover_image_url
                  ? <img src={b.cover_image_url} alt={b.title} className="w-12 h-12 rounded-xl object-cover" />
                  : <div className="w-12 h-12 rounded-xl flex items-center justify-center text-2xl" style={{ background: '#0f766e' }}>📖</div>}
                <div className="flex-1">
                  <p className="font-black text-white">{b.title}</p>
                  <p className="text-xs text-teal-400">{b.status} · {b.pdf_page_count || '?'} pages</p>
                </div>
                <span className={`px-3 py-1 rounded-full text-xs font-bold ${b.status === 'active' ? 'bg-green-800 text-green-200' : 'bg-gray-700 text-gray-300'}`}>
                  {b.status}
                </span>
              </motion.div>
            ))}
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
          <div className="max-w-5xl mx-auto">
            {!selectedBook
              ? <p className="text-teal-400 text-center mt-8">Select a book first</p>
              : (
                <div className="flex flex-col gap-4">
                  <div className="flex items-center gap-3 flex-wrap">
                    <p className="font-black text-white">{selectedBook.title}</p>
                    <div className="flex items-center gap-2 ml-auto">
                      <label className="text-teal-300 text-xs font-bold">Date:</label>
                      <input type="date" value={reviewDate} onChange={e => setReviewDate(e.target.value)}
                        className="px-3 py-1 rounded-xl border border-teal-600 text-white text-sm"
                        style={{ background: '#042f2e' }} />
                    </div>
                  </div>
                  <BookStudentGrid book={selectedBook} className={className} reviewDate={reviewDate} />
                </div>
              )
            }
          </div>
        )}
      </div>
    </div>
  );
}