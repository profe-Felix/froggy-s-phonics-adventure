import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { Link } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { ACTIVE_SCHOOL_YEAR } from '@/lib/schoolYear';
import { getHomeroomForClass } from '@/lib/classRotation';
import { LETTER_SOUNDS, LETTER_SOUNDS_EN } from '@/components/data/letterSounds';
import { SIGHT_WORDS_EASY as SW_ES, SIGHT_WORDS_EASY_EN as SW_EN } from '@/components/data/sightWords';
import { FULL_SEQUENCE, EN_LETTERS_ROW1, EN_LETTERS_ROW2, createEmptyData, getIntroducedSightWordsThrough } from '@/lib/dashboardData';
import { DECODING_LEVELS, generateDecodingItems, canAssessLevel } from '@/lib/decodingSyllables';
import useAudioRecorder from '@/hooks/useAudioRecorder';
import AssessmentRecordingPlayer from '@/components/smallgroup/AssessmentRecordingPlayer';
import AssessmentHistory from '@/components/smallgroup/AssessmentHistory';
import { Loader2, ArrowLeft, Check, X, ChevronRight, ChevronLeft, ChevronDown, AlertCircle, Mic, Play, Volume2, BarChart3 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { parseName } from '@/lib/nameNormalize';

const ASSESSMENT_TYPES = [
  { id: 'decoding', label: 'Decoding', prompt: 'Lee esto:', isLetter: false },
  { id: 'upper_names', label: 'Uppercase Names', prompt: '¿Cómo se llama esta letra?', isLetter: true },
  { id: 'lower_names', label: 'Lowercase Names', prompt: '¿Cómo se llama esta letra?', isLetter: true },
  { id: 'upper_sounds', label: 'Uppercase Sounds', prompt: '¿Qué sonido hace?', isLetter: true },
  { id: 'lower_sounds', label: 'Lowercase Sounds', prompt: '¿Qué sonido hace?', isLetter: true },
  { id: 'sight_words', label: 'Sight Words', prompt: 'Lee la palabra:', isLetter: false },
];

// Digraphs are assessed last (after all single letters).
const DIGRAPHS = new Set(['Ll', 'll', 'Ch', 'ch', 'Rr', 'rr']);

// Letters with two sounds (fuerte/suave) — assessed with S/F buttons instead of ✓/✗.
// C = /k/ (fuerte: ca,co,cu) vs /s/ (suave: ce,ci)
// G = /g/ (fuerte: ga,go,gu) vs /x/ (suave: ge,gi)
// R = /r/ (fuerte: rolled, initial/rr) vs /ɾ/ (suave: flap, medial/final)
const TWO_SOUND_LETTERS = new Set(['c', 'g', 'r', 'C', 'G', 'R']);

// Maps a two-sound letter + sound type to the correct Student Dashboard key.
// c/G have separate dashboard entries for fuerte vs suave; r shares one key.
const SOUND_DASH_KEY = {
  'c': { fuerte: 'c', suave: 'c_s' },
  'C': { fuerte: 'C', suave: 'C_s' },
  'g': { fuerte: 'g', suave: 'g_j' },
  'G': { fuerte: 'G', suave: 'G_j' },
  'r': { fuerte: 'r', suave: 'r_s' },
  'R': { fuerte: 'R_', suave: 'R_s' },
};

function getItemPool(language, assessmentType, moduleNumber, lessonNumber) {
  if (assessmentType === 'sight_words') {
    if (language === 'en') return [...SW_EN];
    if (moduleNumber && lessonNumber) {
      const introduced = getIntroducedSightWordsThrough({ moduleNumber, lessonNumber });
      if (introduced.length > 0) return introduced;
    }
    return [...SW_ES];
  }
  if (language === 'en') {
    const allLetters = [...EN_LETTERS_ROW1, ...EN_LETTERS_ROW2];
    if (assessmentType === 'lower_names' || assessmentType === 'lower_sounds') {
      return allLetters.map((l) => l.toLowerCase());
    }
    return allLetters;
  }
  const seen = new Set();
  const uppercase = [];
  const lowercase = [];
  FULL_SEQUENCE.forEach((l, i) => {
    if (seen.has(l.d)) return;
    seen.add(l.d);
    if (i % 2 === 0) uppercase.push(l.d);
    else lowercase.push(l.d);
  });
  // Move digraphs (ll, ch, rr) to the end so single letters are assessed first.
  const sortDigraphs = (arr) => {
    const regular = arr.filter((l) => !DIGRAPHS.has(l));
    const digraphs = arr.filter((l) => DIGRAPHS.has(l));
    return [...regular, ...digraphs];
  };
  if (assessmentType === 'lower_names' || assessmentType === 'lower_sounds') {
    return sortDigraphs([...lowercase]);
  }
  return sortDigraphs([...uppercase]);
}

function letterToDashboardKey(letter, language) {
  if (language === 'en') return letter.toUpperCase();
  const entry = FULL_SEQUENCE.find((l) => l.d === letter);
  return entry?.k || letter;
}

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Get the current item and progress for any assessment type, including decoding.
function getCurrentItem(results, studentId, assessmentType) {
  if (assessmentType === 'decoding') {
    const r = results[studentId]?.['decoding'];
    if (!r || r.completed) return null;
    const level = r.levels?.[r.current_level];
    if (!level || level.completed) return null;
    return level.item_order[level.current_index];
  }
  const r = results[studentId]?.[assessmentType];
  if (!r) return null;
  return r.item_order[r.current_index];
}

export default function SmallGroupAssessment() {
  const urlParams = new URLSearchParams(window.location.search);
  const teacher = urlParams.get('teacher') || 'Felix';
  const block = urlParams.get('block') || 'A';
  const group = urlParams.get('group') || 'red';

  const [students, setStudents] = useState(null);
  const [assignments, setAssignments] = useState([]);
  const [session, setSession] = useState(null);
  const [assessmentType, setAssessmentType] = useState('decoding');
  const [assessingStudentId, setAssessingStudentId] = useState(null);
  const [results, setResults] = useState({});
  const [loading, setLoading] = useState(true);
  const [lastMark, setLastMark] = useState(null);
  const [teacherNote, setTeacherNote] = useState('');
  const [classConfigs, setClassConfigs] = useState({});
  const [recordingSignedUrls, setRecordingSignedUrls] = useState({}); // studentId -> signed_url
  const [showRecordingFor, setShowRecordingFor] = useState(null); // studentId
  const [recordingTimeline, setRecordingTimeline] = useState([]);
  const [history, setHistory] = useState([]);
  const [showHistoryFor, setShowHistoryFor] = useState(null);
  const recorder = useAudioRecorder();

  // Keep a ref of latest results so beforeunload/visibilitychange handlers can access it
  const resultsRef = useRef(results);
  useEffect(() => { resultsRef.current = results; }, [results]);

  // Load all students
  useEffect(() => {
    base44.entities.Student.filter({ school_year: ACTIVE_SCHOOL_YEAR }, '-created_date', 10000).then(setStudents);
  }, []);

  // Load class configs (for decoding assessment — needs active M#.L#)
  useEffect(() => {
    base44.entities.ClassConfig.list().then((configs) => {
      const map = {};
      for (const c of configs) map[c.class_name] = c;
      setClassConfigs(map);
    }).catch(() => {});
  }, []);

  // Load assignments for this teacher+block+group
  useEffect(() => {
    base44.entities.SmallGroupAssignment.filter({
      teacher_name: teacher,
      block: block,
      color_group: group,
      school_year: ACTIVE_SCHOOL_YEAR,
    }).then(setAssignments).catch(() => {});
  }, [teacher, block, group]);

  // Load or create session
  useEffect(() => {
    if (!students) return;
    let alive = true;
    (async () => {
      setLoading(true);
      try {
        const [active, completed] = await Promise.all([
          base44.entities.SmallGroupAssessment.filter({
            teacher_name: teacher,
            block: block,
            color_group: group,
            status: 'active',
            school_year: ACTIVE_SCHOOL_YEAR,
          }),
          base44.entities.SmallGroupAssessment.filter({
            teacher_name: teacher,
            block: block,
            color_group: group,
            status: 'completed',
            school_year: ACTIVE_SCHOOL_YEAR,
          }, '-created_date', 50),
        ]);
        if (!alive) return;
        setHistory(completed || []);
        if (active.length > 0) {
          setSession(active[0]);
          setResults(active[0].results || {});
        } else {
          // No active session — start a fresh round. History from completed
          // sessions is preserved for progress monitoring and "Reassess" display.
          const created = await base44.entities.SmallGroupAssessment.create({
            teacher_name: teacher,
            block: block,
            color_group: group,
            school_year: ACTIVE_SCHOOL_YEAR,
            status: 'active',
            started_at: new Date().toISOString(),
            results: {},
            broadcast_state: {},
          });
          if (!alive) return;
          setSession(created);
          setResults({});
        }
      } catch {
        // ignore
      }
      if (alive) setLoading(false);
    })();
    return () => { alive = false; };
  }, [students, teacher, block, group]);

  const studentMap = useMemo(() => {
    const map = {};
    if (students) for (const s of students) map[s.id] = s;
    return map;
  }, [students]);

  // Build per-student history from completed sessions for progress monitoring.
  // Each entry: { date, type, correct[], incorrect[], completed }
  const studentHistory = useMemo(() => {
    const map = {};
    for (const sess of history) {
      const sessResults = sess.results || {};
      for (const [studentId, types] of Object.entries(sessResults)) {
        if (!map[studentId]) map[studentId] = [];
        for (const [type, result] of Object.entries(types)) {
          if (type === 'decoding') {
            const allCorrect = Object.values(result.levels || {}).flatMap((l) => l.correct || []);
            const allIncorrect = Object.values(result.levels || {}).flatMap((l) => l.incorrect || []);
            map[studentId].push({ date: sess.ended_at || sess.started_at || sess.created_date, type, correct: allCorrect, incorrect: allIncorrect, completed: result.completed });
          } else {
            map[studentId].push({ date: sess.ended_at || sess.started_at || sess.created_date, type, correct: result.correct || [], incorrect: result.incorrect || [], completed: result.completed });
          }
        }
      }
    }
    return map;
  }, [history]);

  const groupStudents = useMemo(
    () => assignments
      .map((a) => studentMap[a.student_id])
      .filter(Boolean)
      .sort((a, b) => (a.name || '').localeCompare(b.name || '')),
    [assignments, studentMap]
  );

  const assessingStudent = assessingStudentId ? studentMap[assessingStudentId] : null;

  // Current item and progress (works for both regular and decoding types)
  const currentItem = assessingStudentId ? getCurrentItem(results, assessingStudentId, assessmentType) : null;

  // For decoding: get current level info
  const decodingResult = assessingStudentId ? results[assessingStudentId]?.['decoding'] : null;
  const currentDecodingLevel = decodingResult?.current_level;
  const currentLevelData = decodingResult?.levels?.[currentDecodingLevel];

  // For regular types: get the result
  const studentResult = assessmentType !== 'decoding' && assessingStudentId
    ? results[assessingStudentId]?.[assessmentType]
    : null;
  const isDone = assessmentType === 'decoding'
    ? decodingResult?.completed
    : studentResult?.completed || (studentResult && studentResult.current_index >= studentResult.item_order.length);

  // Two-sound letters (c, g, r) in sounds mode get S/F buttons instead of ✓/✗.
  const isTwoSoundItem = (assessmentType === 'upper_sounds' || assessmentType === 'lower_sounds')
    && currentItem && TWO_SOUND_LETTERS.has(currentItem);

  // Broadcast current item to student screen
  const broadcastItem = useCallback((item, student, opts = {}) => {
    if (!session) return;
    const { done = false, decodingLevel = null, itemIndex = 0, totalItems = 0, type: assessType = assessmentType } = opts;
    const state = done
      ? { show_item: false, student_id: student.id, done: true, assessment_type: assessType }
      : {
          current_item: item,
          student_id: student.id,
          student_number: student.student_number,
          class_name: student.class_name,
          item_index: itemIndex,
          total_items: totalItems,
          show_item: true,
          assessment_type: assessType,
          ...(decodingLevel ? { decoding_level: decodingLevel } : {}),
        };
    base44.entities.SmallGroupAssessment.update(session.id, { broadcast_state: state }).catch(() => {});
  }, [session, assessmentType]);

  const persistResults = useCallback((newResults) => {
    if (!session) return Promise.resolve();
    return base44.entities.SmallGroupAssessment.update(session.id, { results: newResults }).catch(() => {});
  }, [session]);

  // Write broadcast_state alone (tiny payload) so students receive the next
  // item instantly via realtime. The full `results` object grows as the session
  // progresses and is persisted on a short debounce so rapid marking doesn't
  // stall the broadcast on a large DB write.
  const broadcastNow = useCallback((state) => {
    if (!session) return;
    base44.entities.SmallGroupAssessment.update(session.id, { broadcast_state: state }).catch(() => {});
  }, [session]);

  const resultsDebounceRef = useRef(null);
  const pendingResultsRef = useRef(null);
  const persistResultsDebounced = useCallback((newResults) => {
    if (!session) return;
    pendingResultsRef.current = newResults;
    if (resultsDebounceRef.current) clearTimeout(resultsDebounceRef.current);
    resultsDebounceRef.current = setTimeout(() => {
      resultsDebounceRef.current = null;
      const toWrite = pendingResultsRef.current;
      if (toWrite) {
        base44.entities.SmallGroupAssessment.update(session.id, { results: toWrite }).catch(() => {});
      }
    }, 500);
  }, [session]);

  const flushResults = useCallback(() => {
    if (resultsDebounceRef.current) {
      clearTimeout(resultsDebounceRef.current);
      resultsDebounceRef.current = null;
    }
    if (pendingResultsRef.current && session) {
      base44.entities.SmallGroupAssessment.update(session.id, { results: pendingResultsRef.current }).catch(() => {});
    }
  }, [session]);

  // Update student's mode_progress
  const updateModeProgress = useCallback(async (student, type, result) => {
    if (!student || !result) return;
    const isLetter = ['upper_names', 'lower_names', 'upper_sounds', 'lower_sounds'].includes(type);
    const modeKey = isLetter ? 'letter_sounds' : 'sight_words_easy';
    const current = student.mode_progress?.[modeKey] || {
      mastered_items: [], learning_items: [], item_attempts: {},
      total_correct: 0, total_attempts: 0,
    };
    const masteredSet = new Set(current.mastered_items || []);
    const learningSet = new Set(current.learning_items || []);
    for (const item of result.correct || []) {
      masteredSet.add(item);
      learningSet.delete(item);
    }
    for (const item of result.incorrect || []) {
      learningSet.add(item);
    }
    const itemAttempts = { ...(current.item_attempts || {}) };
    for (const item of result.attempted || []) {
      if (!itemAttempts[item]) itemAttempts[item] = { correct: 0, incorrect: 0 };
      if ((result.correct || []).includes(item)) itemAttempts[item].correct++;
      else itemAttempts[item].incorrect++;
    }
    const newModeProgress = {
      ...(student.mode_progress || {}),
      [modeKey]: {
        mastered_items: [...masteredSet],
        learning_items: [...learningSet],
        item_attempts: itemAttempts,
        total_correct: (current.total_correct || 0) + (result.correct?.length || 0),
        total_attempts: (current.total_attempts || 0) + (result.attempted?.length || 0),
      },
    };
    try {
      await base44.entities.Student.update(student.id, { mode_progress: newModeProgress });
    } catch {}
  }, []);

  // Update student dashboard with assessment results
  const updateDashboard = useCallback(async (student, type, result) => {
    if (!student || !result) return;
    const isName = type === 'upper_names' || type === 'lower_names';
    const isSound = type === 'upper_sounds' || type === 'lower_sounds';
    if (!isName && !isSound) return;

    const lang = student.language || 'es';
    let dashboard;
    try {
      const existing = await base44.entities.StudentDashboard.filter({
        student_id: student.id,
        school_year: ACTIVE_SCHOOL_YEAR,
      });
      dashboard = existing[0];
    } catch { return; }

    let data;
    if (dashboard?.dashboard_data) {
      data = JSON.parse(dashboard.dashboard_data);
    } else {
      data = createEmptyData();
    }

    for (const item of result.correct || []) {
      if (lang === 'en') {
        const key = item.toUpperCase();
        if (data.letters[key]) {
          if (isName) {
            if (type === 'upper_names') data.letters[key].upper = true;
            else data.letters[key].lower = true;
          } else {
            data.letters[key].sound = true;
          }
        }
      } else {
        if (isName) {
          const dashKey = letterToDashboardKey(item, lang);
          if (data.letters[dashKey]) data.letters[dashKey].upper = true;
        } else if (isSound) {
          // For two-sound letters (c, g, r), use sound_marks to pick the right dashboard key.
          // c/G have separate fuerte/suave entries; r shares one key for both sounds.
          const soundMap = SOUND_DASH_KEY[item];
          const itemIndex = result.item_order?.indexOf(item);
          const soundMark = itemIndex >= 0 ? result.sound_marks?.[itemIndex] : null;
          if (soundMap && soundMark) {
            const dashKey = soundMap[soundMark];
            if (data.letters[dashKey]) data.letters[dashKey].sound = true;
          } else {
            const dashKey = letterToDashboardKey(item, lang);
            if (data.letters[dashKey]) data.letters[dashKey].sound = true;
          }
        }
      }
    }

    const payload = {
      student_id: student.id,
      student_number: student.student_number,
      class_name: student.class_name,
      school_year: ACTIVE_SCHOOL_YEAR,
      language: lang,
      dashboard_data: JSON.stringify(data),
    };
    try {
      if (dashboard?.id) {
        await base44.entities.StudentDashboard.update(dashboard.id, payload);
      } else {
        await base44.entities.StudentDashboard.create(payload);
      }
    } catch {}
  }, []);

  // Stop and upload recording (for sight words)
  const stopAndSaveRecording = useCallback(async (studentId) => {
    if (recorder.state !== 'recording' && recorder.state !== 'paused') return null;
    try {
      const blob = await recorder.stopRecording();
      if (!blob || blob.size === 0) return null;
      const file = new File([blob], `sw-recording-${studentId}-${Date.now()}.webm`, { type: 'audio/webm' });
      const { file_uri } = await base44.integrations.Core.UploadPrivateFile({ file });
      return file_uri;
    } catch {
      return null;
    }
  }, [recorder]);

  // Start assessment for a student
  const startAssessment = async (student, overrideType) => {
    // If switching from sight words with an active recording, stop and save it first
    if (assessmentType === 'sight_words' && assessingStudentId && (recorder.state === 'recording' || recorder.state === 'paused')) {
      await stopAndSaveRecording(assessingStudentId);
      recorder.reset();
    }

    const type = overrideType || assessmentType;
    if (overrideType) setAssessmentType(overrideType);
    setTeacherNote('');

    if (type === 'decoding') {
      // Get the student's class config for active M#.L#
      const config = classConfigs[student.class_name];
      const moduleNum = config?.active_spanish_module || 1;
      const lessonNum = config?.active_spanish_lesson || 1;

      const existing = results[student.id]?.['decoding'];
      if (existing && !existing.completed) {
        setAssessingStudentId(student.id);
        const level = existing.levels?.[existing.current_level];
        if (level) {
          broadcastItem(level.item_order[level.current_index], student, {
            type,
            decodingLevel: existing.current_level,
            itemIndex: level.current_index,
            totalItems: level.item_order.length,
          });
        }
      } else {
        // Start new decoding assessment — begin with CV level
        const cvItems = shuffle(generateDecodingItems('CV', moduleNum, lessonNum));
        if (cvItems.length === 0) {
          alert('No CV syllables available for this class\'s current curriculum position. Check the active module/lesson in Manage Classes.');
          return;
        }
        const newDecoding = {
          current_level: 'CV',
          levels: {
            CV: {
              item_order: cvItems,
              correct: [], incorrect: [], attempted: [],
              current_index: 0, completed: false, accuracy: 0,
            },
          },
          completed: false,
          notes: {},
        };
        const newResults = {
          ...results,
          [student.id]: {
            ...(results[student.id] || {}),
            decoding: newDecoding,
          },
        };
        setResults(newResults);
        persistResults(newResults);
        setAssessingStudentId(student.id);
        broadcastItem(cvItems[0], student, {
          type,
          decodingLevel: 'CV',
          itemIndex: 0,
          totalItems: cvItems.length,
        });
      }
      return;
    }

    // Regular assessment types
    const existing = results[student.id]?.[type];
    if (existing && !existing.completed && existing.current_index < existing.item_order.length) {
      setAssessingStudentId(student.id);
      broadcastItem(existing.item_order[existing.current_index], student, {
        type,
        itemIndex: existing.current_index,
        totalItems: existing.item_order.length,
      });
    } else {
      const config = classConfigs[student.class_name];
      const moduleNum = config?.active_spanish_module || 1;
      const lessonNum = config?.active_spanish_lesson || 1;
      const pool = getItemPool(student.language, type, moduleNum, lessonNum);
      const isLetterType = ['upper_names', 'lower_names', 'upper_sounds', 'lower_sounds'].includes(type);
      const itemOrder = isLetterType ? pool : shuffle(pool);
      const newResult = {
        correct: [], incorrect: [], attempted: [],
        item_order: itemOrder, current_index: 0, completed: false,
        notes: {},
      };
      const newResults = {
        ...results,
        [student.id]: {
          ...(results[student.id] || {}),
          [type]: newResult,
        },
      };
      setResults(newResults);
      persistResults(newResults);
      setAssessingStudentId(student.id);
      broadcastItem(itemOrder[0], student, {
        type,
        itemIndex: 0,
        totalItems: itemOrder.length,
      });
    }

    // Start recording for sight words
    if (type === 'sight_words') {
      setRecordingTimeline([]);
      try {
        await recorder.startRecording();
      } catch {
        // Mic permission denied — continue without recording
      }
    }
  };

  // Switch to a different assessment type for the current student (tab click)
  const switchAssessmentType = async (newType) => {
    const student = studentMap[assessingStudentId];
    if (!student) return;
    if (assessmentType === 'sight_words' && (recorder.state === 'recording' || recorder.state === 'paused')) {
      await stopAndSaveRecording(assessingStudentId);
      recorder.reset();
    }
    setLastMark(null);
    setTeacherNote('');
    await startAssessment(student, newType);
  };

  // Mark correct or incorrect
  const handleMark = async (mark, soundType = null) => {
    if (!assessingStudentId) return;

    // Save the teacher note for this item
    let noteToSave = teacherNote.trim();
    setTeacherNote('');

    if (assessmentType === 'decoding') {
      await handleMarkDecoding(mark, noteToSave);
      return;
    }

    // Map suave/fuerte to 'correct' — both count as correct for two-sound letters.
    const resultKey = (mark === 'suave' || mark === 'fuerte') ? 'correct' : mark;

    // Regular assessment types
    const studentResult = results[assessingStudentId]?.[assessmentType];
    if (!studentResult) return;
    const item = studentResult.item_order[studentResult.current_index];
    if (!item) return;

    // Save note
    if (noteToSave) {
      studentResult.notes = { ...(studentResult.notes || {}), [studentResult.current_index]: noteToSave };
    }

    // Track recording timestamp for sight words
    let newTimeline = recordingTimeline;
    if (assessmentType === 'sight_words' && recorder.state === 'recording') {
      const elapsed = recorder.elapsed;
      newTimeline = [...recordingTimeline, {
        item,
        shown_at: recordingTimeline.length > 0
          ? recordingTimeline[recordingTimeline.length - 1].shown_at
          : 0,
        marked_at: elapsed,
        correct: mark === 'correct',
        note: noteToSave,
      }];
      setRecordingTimeline(newTimeline);
    }

    const newResult = {
      ...studentResult,
      [resultKey]: [...studentResult[resultKey], item],
      attempted: [...studentResult.attempted, item],
      current_index: studentResult.current_index + 1,
    };
    // Track which sound the student produced (for c, g, r).
    if (soundType) {
      newResult.sound_marks = { ...(studentResult.sound_marks || {}), [studentResult.current_index]: soundType };
    }
    const done = newResult.current_index >= newResult.item_order.length;
    if (done) newResult.completed = true;

    const newResults = {
      ...results,
      [assessingStudentId]: {
        ...results[assessingStudentId],
        [assessmentType]: newResult,
      },
    };
    setResults(newResults);
    setLastMark({ item, correct: resultKey === 'correct', sound: soundType });

    const broadcastState = done
      ? { show_item: false, student_id: assessingStudent.id, done: true, assessment_type: assessmentType }
      : {
          current_item: newResult.item_order[newResult.current_index],
          student_id: assessingStudent.id,
          student_number: assessingStudent.student_number,
          class_name: assessingStudent.class_name,
          item_index: newResult.current_index,
          total_items: newResult.item_order.length,
          show_item: true,
          assessment_type: assessmentType,
        };
    if (session) {
      base44.entities.SmallGroupAssessment.update(session.id, { broadcast_state: broadcastState }).catch(() => {});
      persistResultsDebounced(newResults);
    }

    if (done) {
      updateModeProgress(assessingStudent, assessmentType, newResult);
      updateDashboard(assessingStudent, assessmentType, newResult);
      // Stop and save recording for sight words
      if (assessmentType === 'sight_words') {
        const fileUri = await stopAndSaveRecording(assessingStudentId);
        if (fileUri) {
          const finalResult = { ...newResult, recording_url: fileUri, recording_timeline: newTimeline };
          const finalResults = {
            ...newResults,
            [assessingStudentId]: {
              ...newResults[assessingStudentId],
              [assessmentType]: finalResult,
            },
          };
          setResults(finalResults);
          persistResultsDebounced(finalResults);
        }
        recorder.reset();
      }
      setTimeout(() => setLastMark(null), 800);
    } else {
      setTimeout(() => setLastMark(null), 500);
    }
  };

  // Handle marking for decoding assessment (with level progression)
  const handleMarkDecoding = async (mark, note) => {
    const dr = results[assessingStudentId]?.['decoding'];
    if (!dr || dr.completed) return;
    const level = dr.levels?.[dr.current_level];
    if (!level || level.completed) return;
    const item = level.item_order[level.current_index];
    if (!item) return;

    // Save note
    if (note) {
      dr.notes = { ...(dr.notes || {}), [`${dr.current_level}_${level.current_index}`]: note };
    }

    const newLevel = {
      ...level,
      [mark]: [...level[mark], item],
      attempted: [...level.attempted, item],
      current_index: level.current_index + 1,
    };

    const levelDone = newLevel.current_index >= newLevel.item_order.length;
    if (levelDone) {
      newLevel.completed = true;
      newLevel.accuracy = newLevel.item_order.length > 0
        ? newLevel.correct.length / newLevel.item_order.length
        : 0;
    }

    const newLevels = { ...dr.levels, [dr.current_level]: newLevel };
    let newDecoding = { ...dr, levels: newLevels };
    let assessmentDone = false;
    let nextLevelId = null;
    let nextItems = [];

    if (levelDone) {
      const levelIdx = DECODING_LEVELS.findIndex((l) => l.id === dr.current_level);
      if (levelIdx < DECODING_LEVELS.length - 1) {
        // Always advance to next level (first round — see approach on all patterns)
        const config = classConfigs[assessingStudent.class_name];
        const moduleNum = config?.active_spanish_module || 1;
        const lessonNum = config?.active_spanish_lesson || 1;
        nextLevelId = DECODING_LEVELS[levelIdx + 1].id;
        nextItems = shuffle(generateDecodingItems(nextLevelId, moduleNum, lessonNum));
        if (nextItems.length > 0) {
          newDecoding.current_level = nextLevelId;
          newDecoding.levels = {
            ...newLevels,
            [nextLevelId]: {
              item_order: nextItems,
              correct: [], incorrect: [], attempted: [],
              current_index: 0, completed: false, accuracy: 0,
            },
          };
        } else {
          // Can't generate items for next level — end here
          newDecoding.completed = true;
          assessmentDone = true;
        }
      } else {
        // No more levels — assessment done
        newDecoding.completed = true;
        assessmentDone = true;
      }
    }

    const newResults = {
      ...results,
      [assessingStudentId]: {
        ...results[assessingStudentId],
        decoding: newDecoding,
      },
    };
    setResults(newResults);
    setLastMark({ item, correct: mark === 'correct' });

    // Broadcast next item or done
    if (assessmentDone) {
      if (session) {
        broadcastNow({ show_item: false, student_id: assessingStudentId, done: true, assessment_type: 'decoding' });
        persistResultsDebounced(newResults);
      }
      // Update mode progress with all decoding items
      const allCorrect = Object.values(newDecoding.levels).flatMap((l) => l.correct || []);
      const allIncorrect = Object.values(newDecoding.levels).flatMap((l) => l.incorrect || []);
      const allAttempted = Object.values(newDecoding.levels).flatMap((l) => l.attempted || []);
      updateModeProgress(assessingStudent, 'decoding', { correct: allCorrect, incorrect: allIncorrect, attempted: allAttempted });
      setTimeout(() => setLastMark(null), 800);
    } else if (nextLevelId && nextItems.length > 0) {
      // Broadcast first item of next level
      if (session) {
        broadcastNow({
          current_item: nextItems[0],
          student_id: assessingStudentId,
          student_number: assessingStudent.student_number,
          class_name: assessingStudent.class_name,
          item_index: 0,
          total_items: nextItems.length,
          show_item: true,
          assessment_type: 'decoding',
          decoding_level: nextLevelId,
        });
        persistResultsDebounced(newResults);
      }
      setTimeout(() => setLastMark(null), 500);
    } else {
      // Continue in same level
      const updatedLevel = newDecoding.levels[dr.current_level];
      if (session) {
        broadcastNow({
          current_item: updatedLevel.item_order[updatedLevel.current_index],
          student_id: assessingStudentId,
          student_number: assessingStudent.student_number,
          class_name: assessingStudent.class_name,
          item_index: updatedLevel.current_index,
          total_items: updatedLevel.item_order.length,
          show_item: true,
          assessment_type: 'decoding',
          decoding_level: dr.current_level,
        });
        persistResultsDebounced(newResults);
      }
      setTimeout(() => setLastMark(null), 500);
    }
  };

  // End current section/level early and advance to the next level (down arrow).
  // Lets the teacher say "enough" on this section and see the next pattern.
  const handleEndSection = async () => {
    if (!assessingStudentId || assessmentType !== 'decoding') return;
    const dr = results[assessingStudentId]?.['decoding'];
    if (!dr || dr.completed) return;
    const level = dr.levels?.[dr.current_level];
    if (!level) return;

    // Mark current level as completed with current accuracy
    const newLevel = {
      ...level,
      completed: true,
      accuracy: level.item_order.length > 0
        ? level.correct.length / level.item_order.length
        : 0,
    };
    const newLevels = { ...dr.levels, [dr.current_level]: newLevel };
    let newDecoding = { ...dr, levels: newLevels };
    let assessmentDone = false;
    let nextLevelId = null;
    let nextItems = [];

    const levelIdx = DECODING_LEVELS.findIndex((l) => l.id === dr.current_level);
    if (levelIdx < DECODING_LEVELS.length - 1) {
      const config = classConfigs[assessingStudent.class_name];
      const moduleNum = config?.active_spanish_module || 1;
      const lessonNum = config?.active_spanish_lesson || 1;
      nextLevelId = DECODING_LEVELS[levelIdx + 1].id;
      nextItems = shuffle(generateDecodingItems(nextLevelId, moduleNum, lessonNum));
      if (nextItems.length > 0) {
        newDecoding.current_level = nextLevelId;
        newDecoding.levels = {
          ...newLevels,
          [nextLevelId]: {
            item_order: nextItems,
            correct: [], incorrect: [], attempted: [],
            current_index: 0, completed: false, accuracy: 0,
          },
        };
      } else {
        newDecoding.completed = true;
        assessmentDone = true;
      }
    } else {
      newDecoding.completed = true;
      assessmentDone = true;
    }

    const newResults = {
      ...results,
      [assessingStudentId]: {
        ...results[assessingStudentId],
        decoding: newDecoding,
      },
    };
    setResults(newResults);

    if (assessmentDone) {
      if (session) {
        broadcastNow({ show_item: false, student_id: assessingStudentId, done: true, assessment_type: 'decoding' });
        persistResultsDebounced(newResults);
      }
      const allCorrect = Object.values(newDecoding.levels).flatMap((l) => l.correct || []);
      const allIncorrect = Object.values(newDecoding.levels).flatMap((l) => l.incorrect || []);
      const allAttempted = Object.values(newDecoding.levels).flatMap((l) => l.attempted || []);
      updateModeProgress(assessingStudent, 'decoding', { correct: allCorrect, incorrect: allIncorrect, attempted: allAttempted });
      setTimeout(() => setLastMark(null), 800);
    } else if (nextLevelId && nextItems.length > 0) {
      if (session) {
        broadcastNow({
          current_item: nextItems[0],
          student_id: assessingStudentId,
          student_number: assessingStudent.student_number,
          class_name: assessingStudent.class_name,
          item_index: 0,
          total_items: nextItems.length,
          show_item: true,
          assessment_type: 'decoding',
          decoding_level: nextLevelId,
        });
        persistResultsDebounced(newResults);
      }
    }
  };

  // End early
  const handleEndEarly = async () => {
    if (!assessingStudentId) return;
    let latestResults = results;

    // Stop and save recording for sight words
    if (assessmentType === 'sight_words' && (recorder.state === 'recording' || recorder.state === 'paused')) {
      const fileUri = await stopAndSaveRecording(assessingStudentId);
      if (fileUri) {
        const currentResult = latestResults[assessingStudentId]?.[assessmentType];
        if (currentResult) {
          const updatedResult = { ...currentResult, recording_url: fileUri, recording_timeline: recordingTimeline };
          latestResults = {
            ...latestResults,
            [assessingStudentId]: {
              ...latestResults[assessingStudentId],
              [assessmentType]: updatedResult,
            },
          };
          setResults(latestResults);
        }
      }
      recorder.reset();
    }

    if (assessmentType === 'decoding') {
      const dr = latestResults[assessingStudentId]?.['decoding'];
      if (dr) {
        const allCorrect = Object.values(dr.levels).flatMap((l) => l.correct || []);
        const allIncorrect = Object.values(dr.levels).flatMap((l) => l.incorrect || []);
        const allAttempted = Object.values(dr.levels).flatMap((l) => l.attempted || []);
        updateModeProgress(assessingStudent, 'decoding', { correct: allCorrect, incorrect: allIncorrect, attempted: allAttempted });
      }
    } else {
      const sr = latestResults[assessingStudentId]?.[assessmentType];
      if (sr) {
        updateModeProgress(assessingStudent, assessmentType, sr);
        updateDashboard(assessingStudent, assessmentType, sr);
      }
    }

    // Persist all results and broadcast end — saves progress even if teacher
    // exits without hitting E, so refreshes and new sessions don't lose data.
    if (session) {
      pendingResultsRef.current = latestResults;
      broadcastNow({ show_item: false, student_id: assessingStudentId, done: true });
      flushResults();
    }
    setAssessingStudentId(null);
    setLastMark(null);
    setTeacherNote('');
  };

  // Keyboard handler
  useEffect(() => {
    if (!assessingStudentId) return;
    const handler = (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
      const sr = results[assessingStudentId]?.[assessmentType];
      const currentItemNow = sr?.item_order?.[sr?.current_index];
      const isSoundType = assessmentType === 'upper_sounds' || assessmentType === 'lower_sounds';
      const isTwoSound = isSoundType && currentItemNow && TWO_SOUND_LETTERS.has(currentItemNow);
      if (isTwoSound) {
        if (e.key === 's' || e.key === 'S') { e.preventDefault(); handleMark('suave', 'suave'); }
        else if (e.key === 'f' || e.key === 'F') { e.preventDefault(); handleMark('fuerte', 'fuerte'); }
        else if (e.key === 'ArrowLeft') { e.preventDefault(); handleMark('incorrect'); }
        else if (e.key === 'ArrowDown') { e.preventDefault(); handleEndSection(); }
        else if (e.key === 'e' || e.key === 'E') { e.preventDefault(); handleEndEarly(); }
      } else {
        if (e.key === 'ArrowRight') { e.preventDefault(); handleMark('correct'); }
        else if (e.key === 'ArrowLeft') { e.preventDefault(); handleMark('incorrect'); }
        else if (e.key === 'ArrowDown') { e.preventDefault(); handleEndSection(); }
        else if (e.key === 'e' || e.key === 'E') { e.preventDefault(); handleEndEarly(); }
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [assessingStudentId, results, session, assessmentType, teacherNote, recordingTimeline]);

  // Save results on page refresh, close, or tab switch so progress is never lost.
  // Uses resultsRef to get the latest state without re-subscribing on every mark.
  useEffect(() => {
    if (!session) return;
    const saveOnUnload = () => {
      const latest = resultsRef.current;
      if (latest && Object.keys(latest).length > 0) {
        base44.entities.SmallGroupAssessment.update(session.id, { results: latest }).catch(() => {});
      }
    };
    const onVisibilityChange = () => {
      if (document.visibilityState === 'hidden') saveOnUnload();
    };
    window.addEventListener('beforeunload', saveOnUnload);
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      window.removeEventListener('beforeunload', saveOnUnload);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [session]);

  // End session
  const handleEndSession = async () => {
    if (!session) return;
    // Stop any active recording
    if (recorder.state === 'recording' || recorder.state === 'paused') {
      await stopAndSaveRecording(assessingStudentId);
      recorder.reset();
    }
    if (!confirm('End this assessment session? You can start a new one later.')) return;
    // Save current results before marking session completed so this round's
    // data is preserved in history for progress monitoring.
    const completedSession = await base44.entities.SmallGroupAssessment.update(session.id, {
      results: resultsRef.current,
      status: 'completed',
      ended_at: new Date().toISOString(),
      broadcast_state: {},
    });
    setHistory((prev) => [completedSession, ...prev]);
    // Immediately create a fresh active session for the next round.
    const created = await base44.entities.SmallGroupAssessment.create({
      teacher_name: teacher,
      block: block,
      color_group: group,
      school_year: ACTIVE_SCHOOL_YEAR,
      status: 'active',
      started_at: new Date().toISOString(),
      results: {},
      broadcast_state: {},
    });
    setSession(created);
    setResults({});
    setAssessingStudentId(null);
  };

  // Load recording signed URL for replay
  const loadRecording = async (studentId) => {
    const r = results[studentId]?.['sight_words'];
    if (!r?.recording_url) return;
    try {
      const { signed_url } = await base44.integrations.Core.CreateFileSignedUrl({ file_uri: r.recording_url });
      setRecordingSignedUrls((prev) => ({ ...prev, [studentId]: signed_url }));
    } catch {}
  };

  // Update a note in the recording timeline (for replay)
  const handleTimelineNoteChange = (studentId, index, note) => {
    const r = results[studentId]?.['sight_words'];
    if (!r?.recording_timeline) return;
    const newTimeline = [...r.recording_timeline];
    newTimeline[index] = { ...newTimeline[index], note };
    const newResult = { ...r, recording_timeline: newTimeline };
    const newResults = {
      ...results,
      [studentId]: {
        ...results[studentId],
        sight_words: newResult,
      },
    };
    setResults(newResults);
    if (session) {
      base44.entities.SmallGroupAssessment.update(session.id, { results: newResults }).catch(() => {});
    }
  };

  const groupLabel = group.charAt(0).toUpperCase() + group.slice(1);

  // ── Loading ──────────────────────────────────────────────────────────
  if (loading || !students) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-slate-400" />
      </div>
    );
  }

  // ── Assessment view (student selected) ────────────────────────────────
  if (assessingStudent && (currentItem || isDone)) {
    let correctCount, incorrectCount, progress, totalItems, currentIndex;

    if (assessmentType === 'decoding') {
      correctCount = Object.values(decodingResult?.levels || {}).reduce((sum, l) => sum + (l.correct?.length || 0), 0);
      incorrectCount = Object.values(decodingResult?.levels || {}).reduce((sum, l) => sum + (l.incorrect?.length || 0), 0);
      totalItems = currentLevelData?.item_order?.length || 0;
      currentIndex = currentLevelData?.current_index || 0;
      progress = totalItems > 0 ? (currentIndex / totalItems) * 100 : 0;
    } else {
      correctCount = studentResult?.correct?.length || 0;
      incorrectCount = studentResult?.incorrect?.length || 0;
      totalItems = studentResult?.item_order?.length || 0;
      currentIndex = studentResult?.current_index || 0;
      progress = totalItems > 0 ? (currentIndex / totalItems) * 100 : 0;
    }

    const { first } = parseName(assessingStudent.name);
    const isRecording = assessmentType === 'sight_words' && (recorder.state === 'recording' || recorder.state === 'starting');

    return (
      <div className="min-h-screen bg-slate-900 flex flex-col">
        {/* Top bar */}
        <div className="flex items-center justify-between px-6 py-3 bg-slate-800">
          <div className="flex items-center gap-3">
            <button
              onClick={handleEndEarly}
              className="text-slate-400 hover:text-white text-sm font-medium"
            >
              ← Back to list
            </button>
            <span className="text-slate-600">|</span>
            <span className="text-white font-bold">{first || assessingStudent.name}</span>
            {assessingStudent.photo_url && (
              <img src={assessingStudent.photo_url} alt="" className="w-7 h-7 rounded-full object-cover" />
            )}
            {isRecording && (
              <span className="flex items-center gap-1 text-red-400 text-xs font-medium">
                <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                REC
              </span>
            )}
          </div>
          <div className="flex items-center gap-4 text-sm">
            <span className="text-green-400 font-bold">✓ {correctCount}</span>
            <span className="text-red-400 font-bold">✗ {incorrectCount}</span>
            <span className="text-slate-400">
              {currentIndex} / {totalItems}
            </span>
          </div>
        </div>

        {/* Assessment type tabs */}
        <div className="px-6 py-2 bg-slate-800/50 border-b border-slate-700 flex items-center gap-2 flex-wrap">
          <span className="text-xs text-slate-500">Assessing:</span>
          {ASSESSMENT_TYPES.map((t) => (
            <button
              key={t.id}
              onClick={() => switchAssessmentType(t.id)}
              className={cn(
                'px-2.5 py-1 rounded-md text-xs font-medium border transition-colors',
                assessmentType === t.id
                  ? 'bg-white text-slate-900 border-white'
                  : 'bg-slate-700/50 text-slate-300 border-slate-600 hover:bg-slate-700'
              )}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Decoding level indicator */}
        {assessmentType === 'decoding' && currentDecodingLevel && (
          <div className="px-6 py-2 bg-slate-800/50 border-b border-slate-700">
            <div className="flex items-center gap-2">
              {DECODING_LEVELS.map((l) => {
                const levelData = decodingResult?.levels?.[l.id];
                const isCurrent = currentDecodingLevel === l.id;
                const isPast = levelData?.completed;
                return (
                  <div
                    key={l.id}
                    className={cn(
                      'px-3 py-1 rounded-md text-xs font-medium border',
                      isCurrent ? 'bg-indigo-500 text-white border-indigo-500' :
                      isPast ? 'bg-slate-700 text-slate-300 border-slate-600' :
                      'bg-slate-800 text-slate-500 border-slate-700'
                    )}
                  >
                    {l.id}
                    {isPast && levelData.accuracy !== undefined && (
                      <span className="ml-1 opacity-70">
                        {Math.round(levelData.accuracy * 100)}%
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Progress bar */}
        <div className="h-1.5 bg-slate-800">
          <div
            className="h-full bg-indigo-500 transition-all duration-300"
            style={{ width: `${progress}%` }}
          />
        </div>

        {/* Big item display */}
        <div className="flex-1 flex flex-col items-center justify-center relative">
          {isDone ? (
            <div className="text-center">
              <div className="text-6xl mb-4">✅</div>
              <p className="text-white text-2xl font-bold">All done!</p>
              <p className="text-slate-400 mt-2">
                {correctCount} correct · {incorrectCount} incorrect
              </p>
              {assessmentType === 'decoding' && decodingResult && (
                <div className="mt-4 space-y-1">
                  {DECODING_LEVELS.map((l) => {
                    const ld = decodingResult.levels?.[l.id];
                    if (!ld) return null;
                    return (
                      <p key={l.id} className="text-sm text-slate-400">
                        {l.id}: {ld.correct?.length || 0}/{ld.item_order?.length || 0} correct
                        {ld.accuracy !== undefined && ` (${Math.round(ld.accuracy * 100)}%)`}
                      </p>
                    );
                  })}
                </div>
              )}
              <div className="mt-6">
                <p className="text-slate-400 text-sm mb-3">Pick the next assessment above or:</p>
                <button
                  onClick={() => { setAssessingStudentId(null); setLastMark(null); setTeacherNote(''); }}
                  className="px-4 py-2 rounded-lg text-sm font-bold bg-amber-500/20 text-amber-400 border-2 border-amber-500 hover:bg-amber-500/30 transition-colors"
                >
                  Back to list
                </button>
              </div>
            </div>
          ) : (
            <>
              <div
                className={cn(
                  'text-[180px] font-bold leading-none transition-colors',
                  lastMark?.sound === 'suave' ? 'text-teal-400' :
                  lastMark?.correct ? 'text-green-400' : lastMark ? 'text-red-400' : 'text-white'
                )}
                style={{ fontFamily: assessmentType === 'decoding' || assessmentType === 'sight_words' ? "'Andika', sans-serif" : "'Teachers', sans-serif" }}
              >
                {currentItem}
              </div>
              {lastMark && (
                <div className={cn(
                  'absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-8xl animate-ping',
                  lastMark.sound === 'suave' ? 'text-teal-400' :
                  lastMark.correct ? 'text-green-400' : 'text-red-400'
                )}>
                  {lastMark.sound ? (lastMark.sound === 'suave' ? 'S' : 'F') : (lastMark.correct ? '✓' : '✗')}
                </div>
              )}
            </>
          )}
        </div>

        {/* Teacher note input */}
        {!isDone && (
          <div className="px-6 py-2 bg-slate-800/50">
            <input
              type="text"
              value={teacherNote}
              onChange={(e) => setTeacherNote(e.target.value)}
              onKeyDown={(e) => e.stopPropagation()}
              placeholder="Note: what did they say instead? (optional)"
              className="w-full max-w-md mx-auto block bg-slate-700 text-white text-sm rounded-md px-3 py-2 border border-slate-600 focus:border-indigo-400 focus:outline-none placeholder:text-slate-500"
            />
          </div>
        )}

        {/* Bottom controls */}
        {!isDone && (
        <div className="px-6 py-6 bg-slate-800">
          <div className="max-w-2xl mx-auto flex items-center justify-center gap-8">
            {isTwoSoundItem ? (
              <>
                <button
                  onClick={() => handleMark('suave', 'suave')}
                  className="flex flex-col items-center gap-1 text-teal-400 hover:text-teal-300 transition-colors"
                >
                  <div className="w-16 h-16 rounded-full bg-teal-500/20 border-2 border-teal-500 flex items-center justify-center">
                    <span className="text-2xl font-bold">S</span>
                  </div>
                  <span className="text-sm font-medium">Suave (S)</span>
                </button>
                <button
                  onClick={handleEndEarly}
                  className="flex flex-col items-center gap-1 text-amber-400 hover:text-amber-300 transition-colors"
                >
                  <div className="w-16 h-16 rounded-full bg-amber-500/20 border-2 border-amber-500 flex items-center justify-center">
                    <span className="text-2xl font-bold">E</span>
                  </div>
                  <span className="text-sm font-medium">End (E)</span>
                </button>
                <button
                  onClick={() => handleMark('incorrect')}
                  className="flex flex-col items-center gap-1 text-red-400 hover:text-red-300 transition-colors"
                >
                  <div className="w-16 h-16 rounded-full bg-red-500/20 border-2 border-red-500 flex items-center justify-center">
                    <X className="w-8 h-8" />
                  </div>
                  <span className="text-sm font-medium">Neither (←)</span>
                </button>
                <button
                  onClick={() => handleMark('fuerte', 'fuerte')}
                  className="flex flex-col items-center gap-1 text-green-400 hover:text-green-300 transition-colors"
                >
                  <div className="w-16 h-16 rounded-full bg-green-500/20 border-2 border-green-500 flex items-center justify-center">
                    <span className="text-2xl font-bold">F</span>
                  </div>
                  <span className="text-sm font-medium">Fuerte (F)</span>
                </button>
              </>
            ) : (
              <>
                <button
                  onClick={() => handleMark('incorrect')}
                  className="flex flex-col items-center gap-1 text-red-400 hover:text-red-300 transition-colors"
                >
                  <div className="w-16 h-16 rounded-full bg-red-500/20 border-2 border-red-500 flex items-center justify-center">
                    <X className="w-8 h-8" />
                  </div>
                  <span className="text-sm font-medium">Incorrect (←)</span>
                </button>
                <button
                  onClick={handleEndEarly}
                  className="flex flex-col items-center gap-1 text-amber-400 hover:text-amber-300 transition-colors"
                >
                  <div className="w-16 h-16 rounded-full bg-amber-500/20 border-2 border-amber-500 flex items-center justify-center">
                    <span className="text-2xl font-bold">E</span>
                  </div>
                  <span className="text-sm font-medium">End (E)</span>
                </button>
                {assessmentType === 'decoding' && (
                  <button
                    onClick={handleEndSection}
                    className="flex flex-col items-center gap-1 text-indigo-400 hover:text-indigo-300 transition-colors"
                  >
                    <div className="w-16 h-16 rounded-full bg-indigo-500/20 border-2 border-indigo-500 flex items-center justify-center">
                      <ChevronDown className="w-8 h-8" />
                    </div>
                    <span className="text-sm font-medium">Skip Section (↓)</span>
                  </button>
                )}
                <button
                  onClick={() => handleMark('correct')}
                  className="flex flex-col items-center gap-1 text-green-400 hover:text-green-300 transition-colors"
                >
                  <div className="w-16 h-16 rounded-full bg-green-500/20 border-2 border-green-500 flex items-center justify-center">
                    <Check className="w-8 h-8" />
                  </div>
                  <span className="text-sm font-medium">Correct (→)</span>
                </button>
              </>
            )}
          </div>
        </div>
        )}
      </div>
    );
  }

  // ── Student list view ────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b bg-white sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-4 py-3">
          <div className="flex items-center gap-3">
            <Link to="/SmallGroupManager" className="text-slate-400 hover:text-slate-700">
              <ArrowLeft className="w-5 h-5" />
            </Link>
            <h1 className="text-lg font-bold text-slate-800">
              Quick Assessment
            </h1>
            <span className="text-sm text-slate-500">
              {teacher} · Block {block} · {groupLabel} Group
            </span>
            <div className="flex-1" />
            <button
              onClick={handleEndSession}
              className="text-sm font-medium text-red-600 hover:text-red-800 px-3 py-1.5 rounded-lg hover:bg-red-50"
            >
              End Session
            </button>
          </div>

          {/* Assessment type selector */}
          <div className="flex items-center gap-2 mt-3 flex-wrap">
            <span className="text-xs text-slate-500">Assessing:</span>
            {ASSESSMENT_TYPES.map((t) => (
              <button
                key={t.id}
                onClick={() => setAssessmentType(t.id)}
                className={cn(
                  'px-3 py-1.5 rounded-md text-sm font-medium border transition-colors',
                  assessmentType === t.id
                    ? 'bg-slate-800 text-white border-slate-800'
                    : 'bg-white border-slate-300 hover:bg-slate-50'
                )}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-6">
        {groupStudents.length === 0 ? (
          <div className="text-center py-20">
            <AlertCircle className="w-10 h-10 mx-auto text-slate-300 mb-3" />
            <p className="text-sm text-slate-500">
              No students in the {groupLabel} group yet.
            </p>
            <Link
              to={`/SmallGroupManager`}
              className="text-sm text-indigo-600 hover:text-indigo-800 mt-2 inline-block"
            >
              ← Assign students to groups first
            </Link>
          </div>
        ) : (
          <>
            {/* Assessment history modal */}
            {showHistoryFor && studentMap[showHistoryFor] && (
              <AssessmentHistory
                student={studentMap[showHistoryFor]}
                history={studentHistory[showHistoryFor] || []}
                onClose={() => setShowHistoryFor(null)}
              />
            )}

            {/* Recording replay panel */}
            {showRecordingFor && results[showRecordingFor]?.['sight_words']?.recording_url && (
              <div className="mb-6 bg-white rounded-xl border border-slate-200 p-4">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-bold text-slate-800 flex items-center gap-2">
                    <Volume2 className="w-5 h-5 text-indigo-500" />
                    Recording Replay — {parseName(studentMap[showRecordingFor]?.name).first || studentMap[showRecordingFor]?.name}
                  </h3>
                  <button
                    onClick={() => setShowRecordingFor(null)}
                    className="text-slate-400 hover:text-slate-700 text-sm"
                  >
                    Close
                  </button>
                </div>
                {recordingSignedUrls[showRecordingFor] ? (
                  <AssessmentRecordingPlayer
                    recordingUrl={recordingSignedUrls[showRecordingFor]}
                    timeline={results[showRecordingFor]?.['sight_words']?.recording_timeline || []}
                    onNoteChange={(index, note) => handleTimelineNoteChange(showRecordingFor, index, note)}
                  />
                ) : (
                  <button
                    onClick={() => loadRecording(showRecordingFor)}
                    className="text-sm text-indigo-600 hover:text-indigo-800"
                  >
                    Load recording...
                  </button>
                )}
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {groupStudents.map((student) => {
                let statusLabel = 'Not started';
                let statusClass = 'text-slate-400';
                let buttonLabel = 'Start';
                let buttonClass = 'bg-indigo-500 text-white hover:bg-indigo-600';
                let hasRecording = false;

                if (assessmentType === 'decoding') {
                  const r = results[student.id]?.['decoding'];
                  if (r?.completed) {
                    const levels = Object.values(r.levels || {});
                    const totalCorrect = levels.reduce((s, l) => s + (l.correct?.length || 0), 0);
                    const totalItems = levels.reduce((s, l) => s + (l.item_order?.length || 0), 0);
                    const reachedLevel = r.current_level;
                    statusLabel = `Done — reached ${reachedLevel} (${totalCorrect}/${totalItems})`;
                    statusClass = 'text-green-600';
                    buttonLabel = 'Review';
                    buttonClass = 'bg-slate-100 text-slate-600 hover:bg-slate-200';
                  } else if (r) {
                    const level = r.levels?.[r.current_level];
                    if (level && level.current_index > 0) {
                      statusLabel = `${r.current_level}: ${level.current_index}/${level.item_order.length} — in progress`;
                      statusClass = 'text-amber-600';
                      buttonLabel = 'Continue';
                      buttonClass = 'bg-amber-100 text-amber-700 hover:bg-amber-200';
                    }
                  }
                } else {
                  const r = results[student.id]?.[assessmentType];
                  if (r?.completed) {
                    statusLabel = `✓ ${r.correct.length}/${r.item_order.length} correct`;
                    statusClass = 'text-green-600';
                    buttonLabel = 'Review';
                    buttonClass = 'bg-slate-100 text-slate-600 hover:bg-slate-200';
                    hasRecording = assessmentType === 'sight_words' && !!r.recording_url;
                  } else if (r && !r.completed && r.current_index > 0) {
                    statusLabel = `${r.current_index}/${r.item_order.length} — in progress`;
                    statusClass = 'text-amber-600';
                    buttonLabel = 'Continue';
                    buttonClass = 'bg-amber-100 text-amber-700 hover:bg-amber-200';
                  }
                }

                // If no current-round results, check history for past attempts → "Reassess"
                if (buttonLabel === 'Start') {
                  const pastAttempts = (studentHistory[student.id] || []).filter((h) => h.type === assessmentType);
                  if (pastAttempts.length > 0) {
                    statusLabel = `${pastAttempts.length} past attempt${pastAttempts.length > 1 ? 's' : ''}`;
                    statusClass = 'text-indigo-600';
                    buttonLabel = 'Reassess';
                    buttonClass = 'bg-indigo-100 text-indigo-700 hover:bg-indigo-200';
                  }
                }
                const hasHistory = (studentHistory[student.id] || []).length > 0;

                const { first } = parseName(student.name);

                return (
                  <div
                    key={student.id}
                    className="bg-white rounded-xl border border-slate-200 p-4 flex flex-col gap-3"
                  >
                    <div className="flex items-center gap-3">
                      {student.photo_url ? (
                        <img src={student.photo_url} alt="" className="w-12 h-12 rounded-full object-cover" />
                      ) : (
                        <div className="w-12 h-12 rounded-full bg-slate-200 flex items-center justify-center text-sm font-bold text-slate-500">
                          {student.name?.[0] || '?'}
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="font-bold text-slate-800 truncate">{first || student.name}</p>
                        <p className={cn('text-xs font-medium', statusClass)}>{statusLabel}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => startAssessment(student)}
                        className={cn(
                          'flex-1 px-3 py-1.5 rounded-lg text-sm font-bold transition-colors',
                          buttonClass
                        )}
                      >
                        {buttonLabel}
                      </button>
                      {hasHistory && (
                        <button
                          onClick={() => setShowHistoryFor(student.id)}
                          className="px-3 py-1.5 rounded-lg text-sm font-bold bg-slate-100 text-slate-600 hover:bg-slate-200 transition-colors"
                          title="View assessment history"
                        >
                          <BarChart3 className="w-4 h-4" />
                        </button>
                      )}
                      {hasRecording && (
                        <button
                          onClick={() => {
                            setShowRecordingFor(student.id);
                            if (!recordingSignedUrls[student.id]) loadRecording(student.id);
                          }}
                          className="px-3 py-1.5 rounded-lg text-sm font-bold bg-indigo-50 text-indigo-600 hover:bg-indigo-100 transition-colors"
                          title="Listen to recording"
                        >
                          <Play className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}

        {session && groupStudents.length > 0 && (
          <div className="mt-6 bg-indigo-50 rounded-xl border border-indigo-100 p-4 text-sm text-indigo-800">
            <p className="font-bold mb-1">Student iPad link</p>
            <p className="text-xs text-indigo-600">
              Students go to: <code className="bg-white px-1.5 py-0.5 rounded">
                /SmallGroupAssessmentStudent?class={teacher}&number=2
              </code> — using the same class+number URL params they already use to log in.
              The page auto-discovers the active session and locks to it.
            </p>
          </div>
        )}
      </main>
    </div>
  );
}