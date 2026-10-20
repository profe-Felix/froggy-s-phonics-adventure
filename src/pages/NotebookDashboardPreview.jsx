// Standalone, read-only overview of digital notebook assignments.
// Never starts sessions, never moves student pages, never writes Base44 entities.
import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { useClassNames } from "@/hooks/useClassNames";
import { ACTIVE_SCHOOL_YEAR } from "@/lib/schoolYear";
import { EXTERNAL_NOTEBOOK_CONFIG } from "@/lib/external-notebook/config";
import { buildPreviewCatalog, previewNotebookContext, previewClassSelection } from "@/lib/external-notebook/dashboard-preview-model.js";
import NotebookDashboardMonitor from "@/components/external-notebook/NotebookDashboardMonitor";

const ASSIGNMENT_LIMIT = 500;
const ROSTER_LIMIT = 100;
const SEATS = 30;
const APPROVED = new Set(EXTERNAL_NOTEBOOK_CONFIG.catalogClasses || []);
// This existing shared launch identity is verified to contain current work in
// every enabled class. Other historical copies retain their class-specific IDs.
const SELECTION = { sharedAssignmentIds: [EXTERNAL_NOTEBOOK_CONFIG.assignmentId] };

const card = "rounded-2xl border border-slate-200 bg-white/90 p-4 shadow-sm";
const btn = "rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50";

function ErrorBox({ children, onRetry, testId }) {
  return (
    <div role="alert" data-testid={testId} className="flex flex-wrap items-center gap-3 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
      <span className="flex-1">{children}</span>
      {onRetry && <button type="button" className={btn} onClick={onRetry} data-testid={`${testId}-retry`}>Retry</button>}
    </div>
  );
}

function Skeleton({ rows = 3 }) {
  return (
    <div className="space-y-2" aria-busy="true">
      {Array.from({ length: rows }, (_, i) => <div key={i} className="h-10 animate-pulse rounded-lg bg-slate-100" />)}
    </div>
  );
}

export default function NotebookDashboardPreview() {
  const [params, setParams] = useSearchParams();
  const className = params.get("class") || "";
  const assignmentId = params.get("assignment") || "";
  const pageParam = Number(params.get("page"));
  const page = Number.isInteger(pageParam) && pageParam > 0 ? pageParam : undefined;
  const [search, setSearch] = useState("");

  const { classList, isLoading: classesLoading, error: classesError, retry: retryClasses } = useClassNames();
  const classApproved = !!className && APPROVED.has(className);

  const setFilters = (next) => {
    const p = new URLSearchParams();
    const merged = { class: className, assignment: assignmentId, page: page ? String(page) : "", ...next };
    Object.entries(merged).forEach(([k, v]) => { if (v) p.set(k, v); });
    setParams(p, { replace: false });
  };

  const assignmentsQ = useQuery({
    queryKey: ["notebook-preview", "assignments"],
    queryFn: () => base44.entities.DigitalNotebookAssignment.list("-updated_date", ASSIGNMENT_LIMIT),
  });
  const rosterQ = useQuery({
    queryKey: ["notebook-preview", "roster", className, ACTIVE_SCHOOL_YEAR],
    queryFn: () => base44.entities.Student.filter({ class_name: className, school_year: ACTIVE_SCHOOL_YEAR }, "-updated_date", ROSTER_LIMIT),
    enabled: classApproved,
  });

  const assignments = assignmentsQ.data || [];
  const assignmentsTruncated = assignments.length >= ASSIGNMENT_LIMIT;
  const roster = rosterQ.data || [];
  const rosterTruncated = roster.length >= ROSTER_LIMIT;

  const catalog = useMemo(
    () => (classApproved && !assignmentsTruncated ? buildPreviewCatalog(assignments, className, SELECTION) : []),
    [assignments, className, classApproved, assignmentsTruncated],
  );
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return q ? catalog.filter(a => `${a.title} ${a.id}`.toLowerCase().includes(q)) : catalog;
  }, [catalog, search]);
  const selected = useMemo(
    () => catalog.find(a => a.id === assignmentId || (a.aliases || []).includes(assignmentId)) || null,
    [catalog, assignmentId],
  );
  const rawAssignment = useMemo(
    () => (selected ? assignments.find(a => a.id === assignmentId) || assignments.find(a => a.id === selected.id) || null : null),
    [assignments, selected, assignmentId],
  );
  const context = useMemo(
    () => (selected && rawAssignment ? previewNotebookContext({ assignment: rawAssignment, className, schoolYear: ACTIVE_SCHOOL_YEAR, page }) : null),
    [selected, rawAssignment, className, page],
  );

  const allClasses = useMemo(() => Array.from(new Set([...(classList || []), ...APPROVED])), [classList]);
  const ready = context && rosterQ.isSuccess && !rosterTruncated;

  return (
    <div className="min-h-[100dvh] bg-gradient-to-b from-sky-50 to-amber-50/40 px-4 py-6 md:px-8">
      <div className="mx-auto max-w-7xl space-y-5">
        <header className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-sky-700">Digital notebooks</p>
            <h1 className="text-2xl font-bold text-slate-800 md:text-3xl" data-testid="text-page-title">Notebook overview</h1>
            <p className="text-sm text-slate-600">School year {ACTIVE_SCHOOL_YEAR} · up to {SEATS} seats per class</p>
          </div>
          <span className="rounded-full bg-slate-800 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-white" data-testid="status-view-only">View only</span>
        </header>

        <section className="rounded-2xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-900" data-testid="text-view-only-notice">
          <strong>This page only looks.</strong> It does not start a live session, does not move students to a page,
          and does not change the original notebook dashboard. Ink written only in the old notebook system is not shown here;
          open the original dashboard to see it.
        </section>

        <div className="grid gap-5 md:grid-cols-[280px_1fr]">
          <aside className="space-y-5">
            <section className={card}>
              <h2 className="mb-3 text-sm font-semibold text-slate-700">Class</h2>
              {classesError && <ErrorBox testId="error-classes" onRetry={retryClasses}>Class list could not load.</ErrorBox>}
              {classesLoading ? <Skeleton rows={4} /> : (
                <ul className="space-y-1.5">
                  {allClasses.map(name => {
                    const ok = APPROVED.has(name);
                    const active = name === className;
                    return (
                      <li key={name}>
                        <button type="button" disabled={!ok} data-testid={`button-class-${name}`}
                          onClick={() => {
                            if (active) return;
                            setSearch("");
                            setFilters(previewClassSelection(assignments, rawAssignment, name, context?.page || page || 1, SELECTION));
                          }}
                          className={`w-full rounded-lg px-3 py-2 text-left text-sm transition ${active ? "bg-sky-700 text-white" : ok ? "bg-slate-50 text-slate-700 hover:bg-sky-100" : "cursor-not-allowed bg-slate-50 text-slate-400"}`}>
                          <span className="font-medium">{name}</span>
                          {!ok && <span className="block text-xs">Not enabled for new notebooks yet</span>}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>

            {classApproved && (
              <section className={card}>
                <h2 className="mb-1 text-sm font-semibold text-slate-700">Roster</h2>
                {rosterQ.isLoading ? <Skeleton rows={1} />
                  : rosterQ.isError ? <ErrorBox testId="error-roster" onRetry={() => rosterQ.refetch()}>Roster could not load.</ErrorBox>
                  : rosterTruncated ? <ErrorBox testId="error-roster-limit">This class returned {ROSTER_LIMIT} or more student records, more than this page can show safely. Nothing was hidden; the monitor is paused.</ErrorBox>
                  : <p className="text-sm text-slate-600" data-testid="text-roster-count">{roster.length} students of {SEATS} seats</p>}
              </section>
            )}
          </aside>

          <main className="space-y-5">
            {className && !classApproved ? (
              <ErrorBox testId="error-class-unsupported">Class "{className}" is not approved for new notebooks, so it was not opened. Use the original dashboard for this class.</ErrorBox>
            ) : !className ? (
              <div className={`${card} py-12 text-center text-slate-600`} data-testid="text-empty-class">Choose a class to see its notebook assignments.</div>
            ) : (
              <section className={card}>
                <div className="mb-3 flex flex-wrap items-center gap-3">
                  <h2 className="text-sm font-semibold text-slate-700">Assignments for {className}</h2>
                  <input type="search" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by title"
                    data-testid="input-search-assignment" aria-label="Search assignments"
                    className="ml-auto w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm md:w-64" />
                </div>
                {assignmentsQ.isLoading ? <Skeleton rows={4} />
                  : assignmentsQ.isError ? <ErrorBox testId="error-assignments" onRetry={() => assignmentsQ.refetch()}>Assignments could not load.</ErrorBox>
                  : assignmentsTruncated ? <ErrorBox testId="error-assignments-limit" onRetry={() => assignmentsQ.refetch()}>There are {ASSIGNMENT_LIMIT} or more assignment records, more than this page reads at once. The list is not shown so nothing is silently missing.</ErrorBox>
                  : !catalog.length ? <p className="py-6 text-center text-sm text-slate-600" data-testid="text-empty-catalog">No notebook assignments are available for {className} yet.</p>
                  : !filtered.length ? <p className="py-6 text-center text-sm text-slate-600">Nothing matches "{search}".</p>
                  : (
                    <ul className="grid max-h-72 gap-2 overflow-auto sm:grid-cols-2">
                      {filtered.map(a => (
                        <li key={a.id}>
                          <button type="button" data-testid={`button-assignment-${a.id}`}
                            onClick={() => setFilters({ assignment: a.id, page: "" })}
                            className={`w-full rounded-lg border px-3 py-2 text-left text-sm transition ${selected?.id === a.id ? "border-sky-600 bg-sky-50" : "border-slate-200 hover:border-sky-300"}`}>
                            <span className="block font-medium text-slate-800">{a.title}</span>
                            <span className="text-xs text-slate-500">{a.pageCount ? `${a.pageCount} pages` : "Pages unknown"}{a.status ? ` · ${a.status}` : ""}</span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                {assignmentId && assignmentsQ.isSuccess && !assignmentsTruncated && !selected && (
                  <div className="mt-3"><ErrorBox testId="error-assignment-missing">The linked assignment is not available for {className}. Choose another one above.</ErrorBox></div>
                )}
              </section>
            )}

            {ready && (
              <section className="space-y-2" data-testid="section-monitor">
                <p className="text-sm font-medium text-slate-700">
                  {rawAssignment.id !== selected.id ? "Older assignment copy" :
                    selected.scope === "shared" ? "Shared assignment" : `Class assignment · ${className}`}
                  <span className="ml-2 text-xs font-normal text-slate-500">Viewing {className} students only</span>
                </p>
                {selected.aliases.length > 1 && <details key={`copies:${className}:${selected.id}`}
                  className="rounded-xl border border-slate-200 bg-white p-3 text-sm text-slate-700">
                  <summary className="cursor-pointer font-medium">Advanced: older assignment copies</summary>
                  <label className="mt-3 block">
                    Assignment record
                    <select aria-label="Assignment record" className="ml-3 rounded-lg border border-slate-300 px-2 py-1"
                      value={rawAssignment.id} onChange={e => setFilters({ assignment: e.target.value })}>
                      {selected.aliases.map(id => {
                        const copy = assignments.find(a => a.id === id);
                        const label = id === selected.id
                          ? selected.scope === "shared" ? "Shared assignment (recommended)" : `${className} class assignment (recommended)`
                          : `Older copy created for ${copy?.class_name || "another class"} · ${id.slice(-6)}`;
                        return <option key={id} value={id}>{label}</option>;
                      })}
                    </select>
                  </label>
                  <span className="mt-2 block text-xs text-slate-500">
                    Normally leave the recommended assignment selected. These records use the same PDF but keep separate work.
                    The class buttons—not the copy's creator—choose whose students you are viewing.
                  </span>
                </details>}
                <p className="text-xs text-slate-500">If a page shows no ink, there is no new-notebook work on that page. Work done in the old notebook remains in the original dashboard.</p>
                <NotebookDashboardMonitor key={`monitor:${className}:${context.assignmentId}`} context={context}
                  onPageChange={next => setFilters({ page: String(next) })} />
              </section>
            )}
          </main>
        </div>
      </div>
    </div>
  );
}
