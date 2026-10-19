import { savedLessonSteps } from "./externalNotebookLessonPolicy.mjs";

const APP = "6972eada24fac6b62ccbab8e";
const PILOT = "69d650c08c922889cd55c561";
const reading = new Map(), registering = new Map(), readyMappings = new Map();
function sharePending(map, key, work) {
  if (map.has(key)) return map.get(key);
  const pending = Promise.resolve().then(work).finally(() => {
    if (map.get(key) === pending) map.delete(key);
  });
  map.set(key, pending); return pending;
}
export async function prepareNotebookRequest(client, body, root, rootKey, origin) {
  if (root.appId !== APP) return { client, config: root, credential: rootKey };
  // One consistent fresh snapshot per request, not duplicate roster reads.
  const service = client.asServiceRole, reads = new Map();
  const entities = new Proxy(service.entities, { get(target, name) {
    const api = target[name];
    if (!api) return api;
    return new Proxy(api, { get(target, method) {
      if (method !== "get") return target[method];
      return id => {
        const key = `${String(name)}:${id}`;
        if (!reads.has(key)) reads.set(key, sharePending(reading, `${root.appId}:${key}`, () => api.get(id)));
        return reads.get(key);
      };
    } });
  } });
  const cached = { auth: client.auth, asServiceRole: { entities } };
  let className = root.className, schoolYear = root.schoolYear, assignmentId = root.assignmentId;
  if (body.action === "verifyTeacher") {
    className = body.className || className;
    schoolYear = body.schoolYear || schoolYear;
    assignmentId = body.assignmentId || assignmentId;
  } else if (body.kind === "assignment") {
    const student = await entities.Student.get(body.studentId);
    className = student?.class_name; schoolYear = student?.school_year; assignmentId = body.sourceId;
  } else {
    const source = await (body.kind === "lesson" ? entities.LiveLessonSession : entities.LiveNotebookAssessment).get(body.sourceId);
    className = source?.class_name; schoolYear = source?.school_year; assignmentId = source?.assignment_id;
    if (body.kind === "lesson") {
      const lesson = await (source?.lesson_source === "small_group" ? entities.SmallGroupLesson : entities.Lesson).get(source?.lesson_id);
      const steps = savedLessonSteps(lesson, source?.lesson_day || "");
      const step = steps[Number(body.stepId ?? source?.current_step ?? 0)];
      assignmentId = step?.mode === "digital_notebook" ? step.config?.assignmentId : undefined;
    }
  }
  if (!["Felix", "Valero", "Campos", "Gutierrez"].includes(className) ||
      schoolYear !== root.schoolYear || schoolYear !== "26-27" || typeof assignmentId !== "string" || !assignmentId) {
    throw new Error("The notebook source scope could not be verified.");
  }
  const pilot = className === "Felix" && assignmentId === PILOT;
  const config = { ...root, className, schoolYear, assignmentId };
  if (pilot) return { client: cached, config, credential: rootKey };
  const assignment = await entities.DigitalNotebookAssignment.get(assignmentId);
  if (assignment?.id !== assignmentId || assignment.shared_across_classes !== true ||
      !["draft", "active", "closed"].includes(assignment.status)) {
    throw new Error("The selected assignment is not a saved global notebook.");
  }
  const mapping = { appId: root.appId, className, schoolYear, assignmentId };
  const mappingKey = JSON.stringify(mapping) + rootKey;
  const cachedMapping = readyMappings.get(mappingKey);
  const ready = cachedMapping?.until > Date.now() ? cachedMapping.value : await sharePending(registering, mappingKey, async () => {
    const response = await fetch(`${origin}/api/notebook/base44/catalog`, {
      method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${rootKey}` },
      body: JSON.stringify(mapping), redirect: "manual", signal: AbortSignal.timeout(25000),
    });
    if (!response.ok) throw new Error("The notebook catalog backend is unavailable. Its update must be published.");
    const value = await response.json();
    if (value.ready === true) {
      if (readyMappings.size >= 512) readyMappings.delete(readyMappings.keys().next().value);
      readyMappings.set(mappingKey, { value, until: Date.now() + 300000 });
    }
    return value;
  });
  if (ready.ready !== true) {
    if (ready.status === "error") throw new Error("The PDF image conversion failed. Existing student work was retained.");
    const error = new Error("The PDF's image pages are preparing. Keep this page open and retry.");
    error.code = "notebook_images_preparing"; throw error;
  }
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(rootKey), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const payload = "base44-catalog-v1:" + JSON.stringify([root.appId, className, schoolYear, assignmentId]);
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload));
  const credential = "nbb_" + [...new Uint8Array(signature)].map(value => value.toString(16).padStart(2, "0")).join("");
  return { client: cached, config: { ...config, globalAssignmentVerified: true }, credential };
}
