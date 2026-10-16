import { useEffect, useRef, useState, useCallback } from 'react';
import { getSharedNotebookTest } from '@/components/notebook-test/sharedNotebookClient';
import { ACTIVE_SCHOOL_YEAR } from '@/lib/schoolYear';

// Test-only hook — uses the test shared notebook client.
export default function useSharedNotebookTest(assignment, className, studentNumber, page, teacher = false) {
  const client = useRef(null);
  const [state, setState] = useState({ session: null, pages: {}, ready: false, status: 'Connecting to test notebook…', error: '', writer: 0 });
  useEffect(() => {
    if (!assignment?.id || !className || !studentNumber) return;
    const connection = getSharedNotebookTest({ assignment_id: assignment.id, class_name: className, student_number: Number(studentNumber), school_year: ACTIVE_SCHOOL_YEAR }, teacher);
    client.current = connection; connection.listeners.add(setState); setState(connection.state); connection.pageChanged(page);
    return () => { connection.release(setState); };
  }, [assignment?.id, className, studentNumber, teacher]);
  useEffect(() => { client.current?.pageChanged(page); }, [page]);
  const enqueue = useCallback((page, change) => client.current?.enqueue(page, change), []);
  const flush = useCallback(() => client.current?.flush() || Promise.resolve(false), []);
  return { ...state, enqueue, flush };
}