import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { ACTIVE_SCHOOL_YEAR } from '@/lib/schoolYear';
import { Button } from '@/components/ui/button';
import { ROTATION_ACTIVITIES, TABLE_COLORS } from '@/lib/tableRotationActivities';
import { DESK_W, DESK_H } from '@/components/seating/DeskItem';
import { parseName } from '@/lib/nameNormalize';
import { Loader2, ArrowLeft, Plus, X, ChevronUp, ChevronDown, RotateCw, RefreshCw, Power, Eraser } from 'lucide-react';
import { cn } from '@/lib/utils';

const GROUPS = ['A', 'B', 'C'];
const CANVAS_W = 900;
const CANVAS_H = 600;

export default function TableRotationManager() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [students, setStudents] = useState(null);
  const [desks, setDesks] = useState(null);
  const [rotation, setRotation] = useState(null);
  const [selectedClass, setSelectedClass] = useState(() => searchParams.get('class') || '');
  const [group, setGroup] = useState(() => {
    const g = (searchParams.get('group') || 'A').toUpperCase();
    return GROUPS.includes(g) ? g : 'A';
  });
  const [selectedTable, setSelectedTable] = useState(1);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    base44.entities.Student.filter({ school_year: ACTIVE_SCHOOL_YEAR }, '-created_date', 10000).then(setStudents);
  }, []);

  useEffect(() => {
    const next = new URLSearchParams(searchParams);
    if (selectedClass) next.set('class', selectedClass); else next.delete('class');
    next.set('group', group);
    setSearchParams(next, { replace: true });
  }, [selectedClass, group]);

  const loadData = useCallback(async () => {
    if (!selectedClass) return;
    setDesks(null);
    setRotation(null);
    const [allDesks, rotations] = await Promise.all([
      base44.entities.DeskSeat.filter({ class_name: selectedClass, group }),
      base44.entities.TableRotation.filter({ class_name: selectedClass, group, school_year: ACTIVE_SCHOOL_YEAR }),
    ]);
    setDesks(allDesks);
    setRotation(rotations[0] || null);
  }, [selectedClass, group]);

  useEffect(() => { loadData(); }, [loadData]);

  const classes = useMemo(
    () => students ? [...new Set(students.map(s => s.class_name).filter(Boolean))].sort() : [],
    [students]
  );

  const studentMap = useMemo(() => {
    const map = {};
    if (students) for (const s of students) map[s.id] = s;
    return map;
  }, [students]);

  // Assign table number to a desk
  const handleDeskClick = async (desk) => {
    const newTable = desk.table_number === selectedTable ? 0 : selectedTable;
    setDesks(prev => prev?.map(d => d.id === desk.id ? { ...d, table_number: newTable } : d) || prev);
    try {
      await base44.entities.DeskSeat.update(desk.id, { table_number: newTable });
    } catch { loadData(); }
  };

  // Save rotation (create or update)
  const saveRotation = async (updates) => {
    setSaving(true);
    try {
      if (!rotation) {
        const created = await base44.entities.TableRotation.create({
          class_name: selectedClass,
          group,
          school_year: ACTIVE_SCHOOL_YEAR,
          activities: [],
          rotation_offset: 0,
          active: false,
          ...updates,
        });
        setRotation(created);
      } else {
        const updated = await base44.entities.TableRotation.update(rotation.id, updates);
        setRotation(updated);
      }
    } catch { loadData(); }
    setSaving(false);
  };

  const addActivity = (activity) => {
    const activities = [...(rotation?.activities || []), { id: `slot_${Date.now()}`, activity_type: activity.id, label: activity.label }];
    saveRotation({ activities });
  };

  const removeActivity = (index) => {
    const activities = (rotation?.activities || []).filter((_, i) => i !== index);
    saveRotation({ activities });
  };

  const moveActivity = (index, dir) => {
    const activities = [...(rotation?.activities || [])];
    const newIndex = index + dir;
    if (newIndex < 0 || newIndex >= activities.length) return;
    [activities[index], activities[newIndex]] = [activities[newIndex], activities[index]];
    saveRotation({ activities });
  };

  const handleRotate = () => {
    saveRotation({ rotation_offset: (rotation?.rotation_offset || 0) + 1, last_advanced: new Date().toISOString() });
  };

  const handleResetRotation = () => {
    saveRotation({ rotation_offset: 0 });
  };

  const toggleActive = () => {
    saveRotation({ active: !rotation?.active });
  };

  // Calculate max table number
  const tableCount = useMemo(() => {
    if (!desks) return 0;
    return Math.max(0, ...desks.map(d => d.table_number || 0));
  }, [desks]);

  // Current assignments: Table N → activity
  const assignments = useMemo(() => {
    const activities = rotation?.activities || [];
    const offset = rotation?.rotation_offset || 0;
    const result = [];
    for (let t = 1; t <= tableCount; t++) {
      if (activities.length > 0) {
        const idx = (t - 1 + offset) % activities.length;
        result.push({ table: t, activity: activities[idx] });
      } else {
        result.push({ table: t, activity: null });
      }
    }
    return result;
  }, [rotation, tableCount]);

  const getActivityMeta = (type) => ROTATION_ACTIVITIES.find(a => a.id === type);

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b bg-white sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 py-3">
          <div className="flex items-center gap-3">
            <Link to="/SmallGroupManager" className="text-slate-400 hover:text-slate-700">
              <ArrowLeft className="w-5 h-5" />
            </Link>
            <h1 className="text-lg font-bold text-slate-800">Table Rotation</h1>
            <div className="flex items-center gap-2 ml-2">
              <select
                value={selectedClass}
                onChange={(e) => setSelectedClass(e.target.value)}
                className="h-8 rounded-md border border-input bg-background px-2 text-sm"
              >
                <option value="">Select class…</option>
                {classes.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
              <div className="flex items-center gap-1">
                {GROUPS.map(g => (
                  <button
                    key={g}
                    onClick={() => setGroup(g)}
                    className={cn(
                      'w-8 h-8 rounded-md text-sm font-medium border transition-colors',
                      group === g ? 'bg-slate-800 text-white border-slate-800' : 'bg-white border-slate-300 hover:bg-slate-50'
                    )}
                  >
                    {g}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex-1" />
            {saving && <Loader2 className="w-4 h-4 animate-spin text-slate-400" />}
            {selectedClass && (
              <Button
                size="sm"
                variant={rotation?.active ? 'default' : 'outline'}
                onClick={toggleActive}
                className={cn(rotation?.active && 'bg-green-600 hover:bg-green-700')}
              >
                <Power className="w-4 h-4 mr-1.5" />
                {rotation?.active ? 'Active' : 'Inactive'}
              </Button>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-3 mt-3">
            <div className="flex items-center border rounded-md overflow-hidden">
              <Button asChild size="sm" variant="ghost" className="rounded-none">
                <Link to={`/Desk?class=${encodeURIComponent(selectedClass)}&group=${group}`}>Desk</Link>
              </Button>
              <Button asChild size="sm" variant="ghost" className="rounded-none">
                <Link to={`/Carpet?class=${encodeURIComponent(selectedClass)}&group=${group}`}>Carpet</Link>
              </Button>
              <Button asChild size="sm" variant="default" className="rounded-none">
                <Link to={`/TableRotationManager?class=${encodeURIComponent(selectedClass)}&group=${group}`}>Rotation</Link>
              </Button>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-6">
        {!selectedClass ? (
          <div className="text-center py-20 text-slate-400">Select a class to set up table rotation.</div>
        ) : desks === null ? (
          <div className="flex justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-slate-400" /></div>
        ) : desks.length === 0 ? (
          <div className="text-center py-20">
            <p className="text-sm text-slate-500 mb-2">No desks set up for {selectedClass} Group {group}.</p>
            <Link to={`/Desk?class=${encodeURIComponent(selectedClass)}&group=${group}`} className="text-sm text-indigo-600 hover:text-indigo-800">
              Set up desk seating first →
            </Link>
          </div>
        ) : (
          <div className="flex gap-6">
            {/* Left: Desk layout with table colors */}
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-3 flex-wrap">
                <span className="text-xs font-medium text-slate-500 mr-1">Assign:</span>
                {TABLE_COLORS.map((c, i) => (
                  <button
                    key={i}
                    onClick={() => setSelectedTable(i + 1)}
                    className={cn(
                      'px-2.5 py-1 rounded-md text-xs font-bold border-2 transition-all',
                      selectedTable === i + 1
                        ? cn(c.bg, c.border, c.text, 'ring-2 ring-offset-1', c.text)
                        : 'bg-white border-slate-200 text-slate-400 hover:bg-slate-50'
                    )}
                  >
                    Table {i + 1}
                  </button>
                ))}
                <button
                  onClick={() => setSelectedTable(0)}
                  className={cn(
                    'px-2.5 py-1 rounded-md text-xs font-bold border-2 transition-all flex items-center gap-1',
                    selectedTable === 0
                      ? 'bg-slate-200 border-slate-500 text-slate-700 ring-2 ring-offset-1 ring-slate-400'
                      : 'bg-white border-slate-200 text-slate-400 hover:bg-slate-50'
                  )}
                >
                  <Eraser className="w-3.5 h-3.5" /> Clear
                </button>
              </div>

              <div
                className="relative bg-white rounded-lg border-2 border-dashed border-slate-200 overflow-hidden"
                style={{ width: CANVAS_W, height: CANVAS_H, minWidth: CANVAS_W }}
              >
                {desks.map(desk => {
                  const student = desk.student_id ? studentMap[desk.student_id] : null;
                  const { first } = parseName(student?.name);
                  const tableNum = desk.table_number || 0;
                  const color = tableNum > 0 ? TABLE_COLORS[(tableNum - 1) % TABLE_COLORS.length] : null;
                  const isPortrait = (desk.rotation || 0) % 180 === 90;
                  const visualW = isPortrait ? DESK_H : DESK_W;
                  const visualH = isPortrait ? DESK_W : DESK_H;

                  return (
                    <div
                      key={desk.id}
                      onClick={() => handleDeskClick(desk)}
                      className={cn(
                        'absolute select-none rounded-md border-2 overflow-hidden cursor-pointer transition-all hover:shadow-md',
                        color ? cn(color.bg, color.border) : 'bg-white border-slate-300'
                      )}
                      style={{
                        left: desk.x - visualW / 2,
                        top: desk.y - visualH / 2,
                        width: visualW,
                        height: visualH,
                      }}
                    >
                      {student?.photo_url ? (
                        <img src={student.photo_url} alt="" className="w-full h-full object-cover" />
                      ) : student ? (
                        <div className="w-full h-full flex items-center justify-center p-1">
                          <span className="text-[10px] font-medium leading-tight text-center truncate">{first || student.name}</span>
                        </div>
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-[10px] text-slate-300">Empty</div>
                      )}
                      {tableNum > 0 && (
                        <div className={cn('absolute top-0.5 right-0.5 w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold text-white', color?.solid)}>
                          {tableNum}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
              <p className="text-xs text-slate-400 mt-2">
                Click a table color above, then click desks to assign them. Click a desk again to clear.
              </p>

              {/* Legend */}
              {assignments.length > 0 && (
                <div className="mt-4 flex flex-wrap gap-3">
                  {assignments.map(a => {
                    const color = TABLE_COLORS[(a.table - 1) % TABLE_COLORS.length];
                    const meta = a.activity ? getActivityMeta(a.activity.activity_type) : null;
                    return (
                      <div key={a.table} className={cn('flex items-center gap-2 px-3 py-1.5 rounded-lg border-2', color.bg, color.border)}>
                        <span className={cn('w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold text-white', color.solid)}>
                          {a.table}
                        </span>
                        <span className={cn('text-sm font-medium', color.text)}>
                          {meta ? `${meta.icon} ${meta.label}` : '—'}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Right: Rotation schedule */}
            <div className="w-80 shrink-0">
              <div className="bg-white rounded-xl border border-slate-200 p-4">
                <h3 className="font-bold text-slate-800 mb-3">Rotation Schedule</h3>

                {/* Activity list */}
                <div className="space-y-2 mb-3">
                  {(rotation?.activities || []).map((a, i) => {
                    const meta = getActivityMeta(a.activity_type);
                    return (
                      <div key={a.id} className="flex items-center gap-2 bg-slate-50 rounded-lg px-3 py-2">
                        <span className="text-xs text-slate-400 font-mono w-5">{i + 1}.</span>
                        <span className="text-base">{meta?.icon || '📋'}</span>
                        <span className="flex-1 text-sm font-medium text-slate-700">{a.label}</span>
                        <button onClick={() => moveActivity(i, -1)} disabled={i === 0} className="text-slate-400 hover:text-slate-700 disabled:opacity-30">
                          <ChevronUp className="w-4 h-4" />
                        </button>
                        <button onClick={() => moveActivity(i, 1)} disabled={i === (rotation?.activities || []).length - 1} className="text-slate-400 hover:text-slate-700 disabled:opacity-30">
                          <ChevronDown className="w-4 h-4" />
                        </button>
                        <button onClick={() => removeActivity(i)} className="text-red-400 hover:text-red-600">
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    );
                  })}
                  {(rotation?.activities || []).length === 0 && (
                    <p className="text-xs text-slate-400 text-center py-4">No activities yet. Add one below.</p>
                  )}
                </div>

                {/* Add activity */}
                <select
                  value=""
                  onChange={(e) => {
                    if (e.target.value) {
                      const act = ROTATION_ACTIVITIES.find(a => a.id === e.target.value);
                      if (act) addActivity(act);
                      e.target.value = "";
                    }
                  }}
                  className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm mb-4"
                >
                  <option value="">+ Add activity…</option>
                  {ROTATION_ACTIVITIES.map(a => (
                    <option key={a.id} value={a.id}>{a.icon} {a.label}</option>
                  ))}
                </select>

                {/* Rotation controls */}
                <div className="border-t border-slate-100 pt-3">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs text-slate-500">Offset: {rotation?.rotation_offset || 0}</span>
                    <span className="text-xs text-slate-400">
                      {rotation?.last_advanced ? `Last: ${new Date(rotation.last_advanced).toLocaleDateString()}` : 'Not rotated yet'}
                    </span>
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" onClick={handleRotate} disabled={(rotation?.activities || []).length === 0} className="flex-1">
                      <RotateCw className="w-4 h-4 mr-1.5" />
                      Rotate
                    </Button>
                    <Button size="sm" variant="outline" onClick={handleResetRotation} disabled={!rotation?.rotation_offset}>
                      <RefreshCw className="w-4 h-4" />
                    </Button>
                  </div>
                  <p className="text-xs text-slate-400 mt-2">
                    Rotating shifts every table to the next activity. The offset persists across days — if you only get through 2 of 4, it continues next time.
                  </p>
                </div>
              </div>

              {/* How it works */}
              <div className="mt-4 bg-indigo-50 rounded-xl border border-indigo-100 p-4 text-sm text-indigo-800">
                <p className="font-bold mb-1">How it works</p>
                <ol className="list-decimal list-inside space-y-1 text-xs text-indigo-700">
                  <li>Assign desks to tables using the colored buttons</li>
                  <li>Add activities to the rotation schedule</li>
                  <li>Turn on Active to enable auto-launch</li>
                  <li>Students' iPads auto-open their table's activity on login</li>
                  <li>Click Rotate after each session to advance</li>
                </ol>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}