import React from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import BuildingMasteryActivity from '@/components/literacy/BuildingMasteryActivity';

export default function BuildingPractice() {
  const [params] = useSearchParams();
  const id = params.get('studentId'), lessonId = params.get('lessonId'), kind = params.get('kind');
  const student = useQuery({ queryKey: ['building-practice-student', id],
    queryFn: () => base44.entities.Student.get(id), enabled: !!id, retry: false });
  const back = `/BuildingPracticeSetup?lessonId=${encodeURIComponent(lessonId || '')}&studentId=${encodeURIComponent(id || '')}`;
  return <div className="min-h-dvh flex flex-col">
    <header className="p-2 border-b"><Link to={back}>Back to building practice setup</Link></header>
    {!id || !lessonId || !kind ? <p className="p-6">Open an activity from Building Practice Setup with an existing student selected.</p>
      : student.isLoading ? <p className="p-6">Loading student…</p>
      : student.error || !student.data ? <p className="p-6">This existing student could not load. No student was created.</p>
      : <BuildingMasteryActivity key={`${id}:${lessonId}:${kind}`} studentData={student.data}
          studentNumber={student.data.student_number} className={student.data.class_name}
          lessonId={lessonId} kind={kind} onComplete={() => { window.location.assign(back); }} />}
  </div>;
}
