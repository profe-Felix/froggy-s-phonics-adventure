import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { ACTIVE_SCHOOL_YEAR } from '@/lib/schoolYear';
import { getHomeroomForClass, ROTATION_TEACHERS } from '@/lib/classRotation';
import { Loader2, ArrowLeft, Users, Shuffle, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import GroupStudentCard from '@/components/smallgroup/GroupStudentCard';
import { COLOR_GROUPS } from '@/lib/smallGroupColors';

const BLOCKS = ['A', 'B', 'C'];

export default function SmallGroupManager() {
  const [students, setStudents] = useState(null);
  const [assignments, setAssignments] = useState(null);
  const [selectedTeacher, setSelectedTeacher] = useState('Felix');
  const [selectedBlock, setSelectedBlock] = useState('A');
  const [selectedStudent, setSelectedStudent] = useState(null);
  const [saving, setSaving] = useState(false);

  const homeroom = getHomeroomForClass(selectedTeacher, selectedBlock);

  // Load all students once
  useEffect(() => {
    base44.entities.Student.filter({ school_year: ACTIVE_SCHOOL_YEAR }, '-created_date', 10000).then(setStudents);
  }, []);

  // Load assignments for this teacher + block
  const loadAssignments = useCallback(async () => {
    if (!selectedTeacher || !selectedBlock) return;
    setAssignments(null);
    setSelectedStudent(null);
    try {
      const recs = await base44.entities.SmallGroupAssignment.filter({
        teacher_name: selectedTeacher,
        block: selectedBlock,
        school_year: ACTIVE_SCHOOL_YEAR,
      });
      setAssignments(recs || []);
    } catch {
      setAssignments([]);
    }
  }, [selectedTeacher, selectedBlock]);

  useEffect(() => {
    loadAssignments();
  }, [loadAssignments]);

  // Students in this block's homeroom
  const blockStudents = useMemo(
    () =>
      students
        ? students.filter(
            (s) => (s.class_name || '').toLowerCase() === homeroom.toLowerCase() && s.name
          )
        : [],
    [students, homeroom]
  );

  const studentMap = useMemo(() => {
    const map = {};
    if (students) for (const s of students) map[s.id] = s;
    return map;
  }, [students]);

  // Map of student_id → array of assignment records (a student can be in
  // multiple color groups, so we keep all their records).
  const assignmentMap = useMemo(() => {
    const map = {};
    if (assignments) for (const a of assignments) {
      if (!map[a.student_id]) map[a.student_id] = [];
      map[a.student_id].push(a);
    }
    return map;
  }, [assignments]);

  // Students per color group
  const studentsByGroup = useMemo(() => {
    const groups = {};
    for (const cg of COLOR_GROUPS) groups[cg.id] = [];
    for (const a of assignments || []) {
      if (groups[a.color_group]) {
        const student = studentMap[a.student_id];
        if (student) groups[a.color_group].push(student);
      }
    }
    return groups;
  }, [assignments, studentMap]);

  // Unassigned students (in homeroom but not in any color group)
  const unassignedStudents = useMemo(
    () => blockStudents.filter((s) => !(assignmentMap[s.id] || []).length),
    [blockStudents, assignmentMap]
  );

  const handleAssign = async (student, colorGroup) => {
    if (!student || !colorGroup) return;
    // A student can be in multiple groups — only add if not already in this one.
    const existing = (assignmentMap[student.id] || []).find(a => a.color_group === colorGroup);
    if (existing) {
      setSelectedStudent(null);
      return; // already in this group
    }
    setSaving(true);
    try {
      await base44.entities.SmallGroupAssignment.create({
        teacher_name: selectedTeacher,
        block: selectedBlock,
        student_id: student.id,
        student_number: student.student_number,
        class_name: student.class_name,
        color_group: colorGroup,
        school_year: ACTIVE_SCHOOL_YEAR,
      });
      await loadAssignments();
    } catch (err) {
      alert('Failed to assign: ' + (err.message || 'Unknown error'));
    }
    setSaving(false);
  };

  const handleUnassign = async (student, colorGroup) => {
    const existing = (assignmentMap[student.id] || []).find(a => a.color_group === colorGroup);
    if (!existing) return;
    setSaving(true);
    try {
      await base44.entities.SmallGroupAssignment.delete(existing.id);
      await loadAssignments();
    } catch (err) {
      alert('Failed to unassign: ' + (err.message || 'Unknown error'));
    }
    setSaving(false);
  };

  const handleAutoAssign = async () => {
    if (!unassignedStudents.length) return;
    if (!window.confirm(`Distribute ${unassignedStudents.length} unassigned students evenly across the 6 color groups?`)) return;
    setSaving(true);
    try {
      const newAssignments = [];
      unassignedStudents.forEach((s, i) => {
        const group = COLOR_GROUPS[i % COLOR_GROUPS.length];
        newAssignments.push({
          teacher_name: selectedTeacher,
          block: selectedBlock,
          student_id: s.id,
          student_number: s.student_number,
          class_name: s.class_name,
          color_group: group.id,
          school_year: ACTIVE_SCHOOL_YEAR,
        });
      });
      await base44.entities.SmallGroupAssignment.bulkCreate(newAssignments);
      await loadAssignments();
    } catch (err) {
      alert('Failed to auto-assign: ' + (err.message || 'Unknown error'));
    }
    setSaving(false);
  };

  const selectedStudentObj = selectedStudent ? studentMap[selectedStudent] : null;
  const selectedStudentGroups = selectedStudent
    ? (assignmentMap[selectedStudent] || []).map(a => a.color_group)
    : [];

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <header className="border-b bg-white sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 py-3">
          <div className="flex items-center gap-3">
            <Link to="/" className="text-slate-400 hover:text-slate-700">
              <ArrowLeft className="w-5 h-5" />
            </Link>
            <h1 className="text-lg font-bold text-slate-800">Small Group Manager</h1>
            <div className="flex-1" />
            {saving && <Loader2 className="w-4 h-4 animate-spin text-slate-400" />}
          </div>

          {/* Teacher + Block selectors */}
          <div className="flex flex-wrap items-center gap-3 mt-3">
            {/* Teacher selector */}
            <div className="flex items-center gap-1">
              <span className="text-xs text-slate-500 mr-1">Teacher</span>
              {ROTATION_TEACHERS.map((t) => {
                const isCurrent = selectedTeacher === t;
                return (
                  <button
                    key={t}
                    onClick={() => setSelectedTeacher(t)}
                    className={cn(
                      'px-3 py-1.5 rounded-md text-sm font-medium border transition-colors',
                      isCurrent
                        ? 'bg-slate-800 text-white border-slate-800'
                        : 'bg-white border-slate-300 hover:bg-slate-50'
                    )}
                  >
                    {t}
                  </button>
                );
              })}
            </div>

            {/* Block selector */}
            <div className="flex items-center gap-1">
              <span className="text-xs text-slate-500 mr-1">Block</span>
              {BLOCKS.map((b) => {
                const h = getHomeroomForClass(selectedTeacher, b);
                const isCurrent = selectedBlock === b;
                return (
                  <button
                    key={b}
                    onClick={() => setSelectedBlock(b)}
                    className={cn(
                      'px-3 py-1.5 rounded-md text-sm font-medium border transition-colors text-left',
                      isCurrent
                        ? 'bg-primary text-primary-foreground border-primary'
                        : 'bg-white border-slate-300 hover:bg-slate-50'
                    )}
                  >
                    <div className="leading-tight">Block {b}</div>
                    <div className={cn('text-[10px] leading-tight', isCurrent ? 'text-primary-foreground/70' : 'text-slate-400')}>
                      {h}
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Auto-assign */}
            {unassignedStudents.length > 0 && (
              <button
                onClick={handleAutoAssign}
                disabled={saving}
                className="ml-auto text-sm font-medium text-indigo-600 hover:text-indigo-800 px-2 py-1 rounded-lg hover:bg-indigo-50 flex items-center gap-1.5"
              >
                <Shuffle className="w-3.5 h-3.5" /> Auto-distribute
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Main */}
      <main className="max-w-7xl mx-auto px-4 py-4">
        {!students ? (
          <div className="flex justify-center py-20">
            <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
          </div>
        ) : blockStudents.length === 0 ? (
          <div className="text-center py-20">
            <Users className="w-10 h-10 mx-auto text-slate-300 mb-3" />
            <p className="text-sm text-slate-500">
              No students found for {homeroom} homeroom.
            </p>
            <p className="text-xs text-slate-400 mt-1">
              Make sure students have class_name = "{homeroom}" and a name set.
            </p>
          </div>
        ) : (
          <div className="flex flex-col lg:flex-row gap-4">
            {/* Unassigned bank */}
            <div className="lg:w-52 shrink-0">
              <div className="bg-white rounded-xl border border-slate-200 p-3">
                <p className="text-sm font-bold text-slate-700 mb-2">
                  Unassigned ({unassignedStudents.length})
                </p>
                <div className="flex flex-col gap-1.5 max-h-[600px] overflow-y-auto">
                  {unassignedStudents.map((s) => (
                    <GroupStudentCard
                      key={s.id}
                      student={s}
                      isSelected={selectedStudent === s.id}
                      onClick={() => setSelectedStudent(selectedStudent === s.id ? null : s.id)}
                    />
                  ))}
                  {unassignedStudents.length === 0 && (
                    <p className="text-xs text-slate-400 py-2 text-center">All students assigned.</p>
                  )}
                </div>
              </div>
            </div>

            {/* Color groups grid */}
            <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3">
              {COLOR_GROUPS.map((cg) => {
                const groupStudents = studentsByGroup[cg.id] || [];
                const canReceive = !!selectedStudentObj;
                return (
                  <div
                    key={cg.id}
                    className={cn(
                      'rounded-xl border-2 overflow-hidden flex flex-col transition-all',
                      cg.border,
                      cg.bg,
                      canReceive && 'cursor-pointer hover:shadow-md hover:ring-2 hover:ring-slate-300'
                    )}
                    onClick={() => canReceive && handleAssign(selectedStudentObj, cg.id)}
                  >
                    {/* Header */}
                    <div className={cn('px-3 py-2 flex items-center justify-between', cg.header)}>
                      <span className="text-sm font-bold text-white">{cg.label}</span>
                      <span className="text-xs font-bold text-white/80 bg-black/20 px-1.5 rounded-full">
                        {groupStudents.length}
                      </span>
                    </div>

                    {/* Assess button */}
                    {groupStudents.length > 0 && (
                      <Link
                        to={`/SmallGroupAssessment?teacher=${encodeURIComponent(selectedTeacher)}&block=${selectedBlock}&group=${cg.id}`}
                        onClick={(e) => e.stopPropagation()}
                        className="block text-center text-[10px] font-bold text-slate-600 hover:text-slate-800 py-1 bg-white/60 border-b border-slate-200 transition-colors hover:bg-white"
                      >
                        📋 Quick Assess
                      </Link>
                    )}

                    {/* Students */}
                    <div className="p-2 flex flex-col gap-1.5 min-h-[200px] flex-1">
                      {groupStudents.map((s) => (
                        <GroupStudentCard
                          key={s.id}
                          student={s}
                          isSelected={selectedStudent === s.id}
                          onClick={() => setSelectedStudent(selectedStudent === s.id ? null : s.id)}
                          onUnassign={(stu) => handleUnassign(stu, cg.id)}
                        />
                      ))}
                      {groupStudents.length === 0 && (
                        <p className="text-xs text-slate-400 text-center py-4">Empty</p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Selected student action bar */}
        {selectedStudentObj && (
          <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-20 bg-white rounded-xl shadow-2xl border border-slate-200 px-4 py-3 flex items-center gap-3 max-w-[90vw]">
            <button
              onClick={() => setSelectedStudent(null)}
              className="text-slate-400 hover:text-slate-600"
            >
              <X className="w-4 h-4" />
            </button>
            <div className="flex items-center gap-2">
              {selectedStudentObj.photo_url ? (
                <img src={selectedStudentObj.photo_url} alt="" className="w-8 h-8 rounded object-cover" />
              ) : (
                <div className="w-8 h-8 rounded bg-slate-200 flex items-center justify-center text-xs font-bold text-slate-500">
                  {selectedStudentObj.name?.[0] || '?'}
                </div>
              )}
              <span className="text-sm font-bold text-slate-800">{selectedStudentObj.name}</span>
              {selectedStudentGroups.length > 0 && (
                <span className="text-xs text-slate-500">
                  In: <span className="font-medium capitalize">{selectedStudentGroups.join(', ')}</span>
                </span>
              )}
            </div>
            <div className="h-6 w-px bg-slate-200" />
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-slate-500">Add to:</span>
              {COLOR_GROUPS.map((cg) => (
                <button
                  key={cg.id}
                  onClick={() => handleAssign(selectedStudentObj, cg.id)}
                  className={cn(
                    'w-7 h-7 rounded-full border-2 transition-all hover:scale-110',
                    cg.header,
                    selectedStudentGroups.includes(cg.id) ? 'ring-2 ring-slate-800 ring-offset-1' : 'border-white/30'
                  )}
                  title={cg.label}
                />
              ))}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}