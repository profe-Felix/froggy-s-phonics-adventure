import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';
import { catalogFor } from './catalog.js';
import { KINDS, LABELS, TOTAL, REQUIRED, PracticeError, normalize, validateConfig, grandfathered,
  makeQuestions, answerCorrect, summarize, validateScope } from './model.js';
import { syllabifyEs, enrichBookCatalog } from './curriculum.generated.js';

const json = value => JSON.stringify(value);
const hash = async value => [...new Uint8Array(await crypto.subtle.digest('SHA-256',
  new TextEncoder().encode(json(value))))].map(b => b.toString(16).padStart(2, '0')).join('');
async function all(entity, query = null) {
  const result = [];
  for (let offset = 0; offset < 10000; offset += 200) {
    const page = query ? await entity.filter(query, 'created_date', 200, offset) : await entity.list('created_date', 200, offset);
    if (!Array.isArray(page)) throw new PracticeError('A practice data response was incomplete.', 503);
    result.push(...page); if (page.length < 200) return result;
  }
  throw new PracticeError('The practice bank needs a teacher review before continuing.', 503);
}
async function responseLedger(entity, runId, receiptIds = []) {
  if (!Array.isArray(receiptIds) || receiptIds.length > 200 ||
      receiptIds.some(id => typeof id !== 'string' || !/^[\w-]{1,100}$/.test(id)))
    throw new PracticeError('The saved answer receipts need to be reloaded.');
  const events = await all(entity, { run_id: runId });
  const found = new Set(events.map(event => event.id));
  const missing = [...new Set(receiptIds)].filter(id => !found.has(id));
  // Filtered reads can lag after a successful write. Acknowledged private
  // receipts are primary-key read back and checked, never client-scored.
  for (let i = 0; i < missing.length; i += 8) {
    const verified = await Promise.all(missing.slice(i, i + 8).map(id => entity.get(id)));
    for (const event of verified) {
      if (event.run_id !== runId) throw new PracticeError('An answer receipt belongs to another round.', 403);
      events.push(event);
    }
  }
  return events;
}
async function bank(client) {
  return Promise.all([
      all(client.entities.BookPracticeIndex), all(client.entities.BookCatalog),
      all(client.entities.BookAssignment), all(client.entities.BookVocabularyReview),
    ]).then(([indexes, books, assignments, reviews]) => ({ indexes, books: enrichBookCatalog(books, assignments), reviews }));
}
Deno.serve(async req => {
  try {
    if (req.method !== 'POST') return Response.json({ error: 'Use POST.' }, { status: 405 });
    const body = await req.json();
    const actions = ['lessons', 'setup', 'saveConfig', 'catalog', 'status', 'session', 'answer', 'hint'];
    if (!actions.includes(body.action)) throw new PracticeError('Unknown practice action.');
    const caller = createClientFromRequest(req), admin = caller.asServiceRole;
    if (body.action === 'lessons') {
      const lessons = (await all(caller.entities.Lesson, { language: 'es' }))
        .filter(l => !['guided', 'side_quest'].includes(l.assignment_type))
        .map(({ id, title, lesson_number, class_name }) => ({ id, title, lesson_number, class_name }))
        .sort((a, b) => a.lesson_number - b.lesson_number || String(a.class_name).localeCompare(String(b.class_name)));
      return Response.json({ lessons });
    }
    const Runs = admin.entities.BuildingPracticeRun, Responses = admin.entities.BuildingPracticeResponse;
    let student = null, baseScope = null, runs = [], progress = [];
    if (!['setup', 'saveConfig'].includes(body.action)) {
      if (body.studentId) {
        try { student = await caller.entities.Student.get(body.studentId); } catch {}
      } else if (body.className && Number.isInteger(body.studentNumber) && body.studentNumber >= 1 && body.studentNumber <= 30) {
        const matches = await caller.entities.Student.filter({ class_name: body.className,
          student_number: body.studentNumber, school_year: body.schoolYear }, '-created_date', 2);
        if (matches.length === 1) student = matches[0];
      }
      if (!student?.id || !Number.isInteger(student.student_number) || student.student_number < 1 ||
          student.student_number > 30 || !student.class_name || !student.school_year)
        throw new PracticeError('Choose an existing student. No new student was created.', 403);
      baseScope = { student_id: student.id, class_name: student.class_name, school_year: student.school_year };
      if (!['answer', 'hint'].includes(body.action)) [runs, progress] = await Promise.all([all(Runs, baseScope),
        all(caller.entities.LessonProgress, { student_number: student.student_number,
          class_name: student.class_name, school_year: student.school_year })]);
      if (body.action === 'status') {
        const levels = {};
        for (const id of new Set([...progress.map(r => r.lesson_id), ...runs.map(r => r.lesson_id)])) {
          const gate = runs.find(r => r.lesson_id === id && r.kind === 'gate');
          const requiredKinds = gate ? JSON.parse(gate.required_kinds_data) : [];
          const passedKinds = KINDS.filter(k => runs.some(r => r.lesson_id === id && r.kind === k && r.status === 'passed'));
          const grandfather = gate?.grandfathered === true || grandfathered(progress, id);
          levels[id] = { requiredKinds, passedKinds, grandfather,
            canAdvance: grandfather || !!gate && requiredKinds.every(k => passedKinds.includes(k)) };
        }
        return Response.json({ levels });
      }
    }
    if (typeof body.lessonId !== 'string' || !/^[\w-]{12,100}$/.test(body.lessonId))
      throw new PracticeError('Choose a saved lesson level.');
    let lesson;
    try { lesson = await caller.entities.Lesson.get(body.lessonId); } catch {}
    if (!lesson?.id || lesson.language !== 'es' || ['guided', 'side_quest'].includes(lesson.assignment_type))
      throw new PracticeError('Choose a Spanish pathway level.', 404);
    const answering = ['answer', 'hint'].includes(body.action);
    const data = answering ? null : await bank(caller);
    let catalog = answering ? null : catalogFor(lesson, data.indexes, data.books, data.reviews);
    if (body.action === 'saveConfig') {
      const teacher = await caller.auth.me().catch(() => null);
      if (!teacher?.id)
        throw new PracticeError('Saving requires your existing Lesson Editor teacher access. Your changes have not been saved.', 403);
      const priorHash = await hash(catalog.config);
      if (body.configHash !== priorHash) throw new PracticeError('Targets changed in another window. Reload before saving.', 409);
      const config = validateConfig(body.config);
      // Use caller permissions for teacher edits, not service-role escalation.
      try {
        lesson = await caller.entities.Lesson.update(lesson.id, { building_practice_data: json(config) });
      } catch (error) {
        if ([401, 403].includes(error?.status || error?.statusCode || error?.response?.status) ||
            /permission|forbidden|not authorized|unauthorized/i.test(error?.message || ''))
          throw new PracticeError('Saving requires your existing Lesson Editor teacher access. Your changes have not been saved.', 403);
        throw error;
      }
      catalog = catalogFor(lesson, data.indexes, data.books, data.reviews);
    }
    if (['setup', 'saveConfig'].includes(body.action))
      return Response.json({ lesson: { id: lesson.id, title: lesson.title, lesson_number: lesson.lesson_number,
        class_name: lesson.class_name }, ...catalog, configHash: await hash(catalog.config) });
    const scope = validateScope(student, lesson);
    let scopedRun;
    if (answering) {
      try { scopedRun = await Runs.get(body.runId); } catch {}
      if (!scopedRun || Object.entries(scope).some(([key, value]) => scopedRun[key] !== value) ||
          scopedRun.kind !== body.kind || !KINDS.includes(scopedRun.kind))
        throw new PracticeError('This round belongs to another student or level.', 403);
    }
    let gate = answering ? await Runs.get(scopedRun.gate_id) : runs.find(r => r.lesson_id === lesson.id && r.kind === 'gate');
    if (!gate) {
      const created = await Runs.create({ ...scope, kind: 'gate', status: 'enrolled',
        required_kinds_data: json(catalog.requiredKinds), grandfathered: grandfathered(progress, lesson.id) });
      // Choose the same canonical enrollment if two tabs open together.
      // A just-created row can briefly be absent from a filtered read.
      gate = (await Runs.filter({ ...scope, kind: 'gate' }, 'created_date', 20))[0] || created;
      runs.push(gate);
    }
    if (!answering && gate.grandfathered !== true && !progress.some(p => p.lesson_id === lesson.id && p.completed) &&
        json(catalog.requiredKinds) !== gate.required_kinds_data) {
      gate = await Runs.update(gate.id, { required_kinds_data: json(catalog.requiredKinds) });
    }
    const requiredKinds = JSON.parse(gate.required_kinds_data);
    const passedKinds = KINDS.filter(k => runs.some(r => r.lesson_id === lesson.id && r.kind === k && r.status === 'passed'));
    const mastered = passedKinds.includes(body.kind) || gate.grandfathered === true;
    const status = { requiredKinds, passedKinds, grandfather: gate.grandfathered === true,
      canAdvance: gate.grandfathered === true || requiredKinds.every(k => passedKinds.includes(k)) };
    if (body.action === 'catalog') return Response.json({ lessonId: lesson.id, ...status,
      availableKinds: catalog.requiredKinds, counts: Object.fromEntries(KINDS.map(k => [k, catalog.pools[k].length])), labels: LABELS });
    if (!KINDS.includes(body.kind)) throw new PracticeError('Choose a building activity.');
    const pool = catalog?.pools[body.kind], catalogHash = pool ? await hash(pool) : null;
    let run;
    if (body.action === 'session') {
      if (mastered && !body.restart) return Response.json({ mastered: true, round: null, item: null });
      if (!body.restart) run = [...runs].reverse().find(r => r.lesson_id === lesson.id && r.kind === body.kind &&
        r.catalog_hash === catalogHash && r.status === 'in_progress');
      if (!run) {
        const questions = makeQuestions(pool, body.kind, syllabifyEs);
        run = await Runs.create({ ...scope, kind: body.kind, gate_id: gate.id, catalog_hash: catalogHash,
          status: 'in_progress', questions_data: json(questions), correct_first: 0, answered_count: 0 });
      }
    } else {
      run = scopedRun;
      if (!run || Object.entries(scope).some(([key, value]) => run[key] !== value) || run.kind !== body.kind || run.kind === 'gate')
        throw new PracticeError('This round belongs to another student or level.', 403);
      // Each scored round uses its original server-owned twenty-item snapshot.
      // New rounds/resumes load the latest teacher-vetted pool.
    }
    const questions = JSON.parse(run.questions_data);
    let events = await responseLedger(Responses, run.id, body.receiptIds), state = summarize(questions, events), feedback, createdEvent;
    if (['answer', 'hint'].includes(body.action)) {
      if (typeof body.requestId !== 'string' || !/^[\w-]{12,100}$/.test(body.requestId))
        throw new PracticeError('This answer needs a retry identifier.');
      const previous = events.find(e => e.request_id === body.requestId);
      if (!previous) {
        if (!Number.isInteger(body.itemIndex) || body.itemIndex !== state.cursor)
          throw new PracticeError('This item has already changed. Reload to continue from saved work.', 409);
        const question = questions[state.cursor];
        const correct = body.action === 'answer' ? answerCorrect(question, body.tileIds) : false;
        createdEvent = await Responses.create({ run_id: run.id, request_id: body.requestId, item_index: state.cursor,
          event_type: body.action, answer_data: json(body.action === 'answer' ? body.tileIds : []) });
        feedback = { correct, message: body.action === 'hint' ? 'Mira el modelo y vuelve a intentarlo. Cuenta como práctica.'
          : correct ? '¡Correcto!' : 'Escucha y vuelve a intentarlo. Tu primer intento quedó guardado.',
          ...(body.action === 'hint' ? { hintText: question.text } : {}) };
      } else {
        if (previous.item_index !== body.itemIndex || previous.event_type !== body.action ||
            previous.answer_data !== json(body.action === 'answer' ? body.tileIds : []))
          throw new PracticeError('A retry cannot change an earlier answer.', 409);
        feedback = { correct: previous.event_type === 'answer' && answerCorrect(questions[previous.item_index], JSON.parse(previous.answer_data)),
          message: 'Tu respuesta ya está guardada.',
          ...(previous.event_type === 'hint' ? { hintText: questions[previous.item_index].text } : {}) };
      }
      // Preserve the verified prefix even if the next filtered read is stale.
      const refreshed = await all(Responses, { run_id: run.id });
      const ids = new Set(refreshed.map(event => event.id));
      for (const event of events) if (!ids.has(event.id)) refreshed.push(event);
      events = refreshed;
      if (createdEvent && !events.some(event => event.id === createdEvent.id)) events.push(createdEvent);
      state = summarize(questions, events);
    }
    if (state.passed && run.status !== 'passed') await Runs.update(run.id,
      { status: 'passed', correct_first: state.correctFirst, answered_count: TOTAL });
    else if (state.needsPractice && run.status !== 'passed') await Runs.update(run.id,
      { status: 'needs_practice', correct_first: state.correctFirst, answered_count: TOTAL });
    const q = state.cursor < 0 ? null : questions[state.cursor];
    return Response.json({ mastered: state.passed || mastered, feedback,
      receiptIds: [...new Set(events.map(event => event.id))].slice(-200),
      round: { id: run.id, kind: run.kind, total: TOTAL, required: REQUIRED, answered: state.answered,
        correctFirst: state.correctFirst, passed: state.passed, needsPractice: state.needsPractice },
      item: q ? { index: q.index, audioText: q.text, imageUrl: q.imageUrl, tiles: q.tiles, unit: q.unit,
        ...(state.states[q.index].hinted ? { hintText: q.text } : {}) } : null });
  } catch (error) {
    if (error instanceof PracticeError) return Response.json({ error: error.message }, { status: error.status });
    console.error('building_practice_failed', error?.name || 'UnknownError');
    return Response.json({ error: 'Building practice could not load or save. Your saved answers are kept. Please retry.' }, { status: 503 });
  }
});
