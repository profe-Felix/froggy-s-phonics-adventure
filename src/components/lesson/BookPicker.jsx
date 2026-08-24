import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';

// Dropdown of all BookAssignment records, so a teacher can attach a specific
// book to a book_reading lesson step. Books are class-scoped, so each option
// shows the class + status to help the teacher pick one students can see.
export default function BookPicker({ value, onChange, lessonClass }) {
  const { data: books = [], isLoading } = useQuery({
    queryKey: ['book-picker-books'],
    queryFn: () => base44.entities.BookAssignment.list('-created_date', 200),
  });

  return (
    <div className="flex flex-col gap-1">
      <select
        value={value || ''}
        onChange={(e) => {
          const b = books.find((x) => x.id === e.target.value);
          onChange(e.target.value, b?.title || '');
        }}
        disabled={isLoading}
        className="w-full text-sm border border-gray-200 rounded-lg px-2 py-1.5 mt-0.5 bg-white disabled:opacity-50"
      >
        <option value="">{isLoading ? 'Loading books…' : '— whole bookshelf (student picks) —'}</option>
        {books.map((b) => (
          <option key={b.id} value={b.id}>
            {b.title} ({b.class_name}) · {b.status}
          </option>
        ))}
      </select>
      {lessonClass && (
        <p className="text-[10px] text-gray-400">
          Tip: choose a book whose class is <b>{lessonClass}</b> (or share it) so students see it on their shelf too.
        </p>
      )}
    </div>
  );
}