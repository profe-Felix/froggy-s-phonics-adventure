import { useMemo, useState } from 'react';
import {
  BookOpen,
  Check,
  ExternalLink,
} from 'lucide-react';

function expandCustomPages(
  customPages,
  maxPage
) {
  const pages = new Set();

  String(customPages || '')
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean)
    .forEach((part) => {
      if (part.includes('-')) {
        const [rawStart, rawEnd] =
          part.split('-');

        const start = Number(rawStart);
        const end = Number(rawEnd);

        if (
          Number.isInteger(start) &&
          Number.isInteger(end)
        ) {
          const first = Math.max(
            1,
            Math.min(start, end)
          );

          const last = Math.min(
            maxPage,
            Math.max(start, end)
          );

          for (
            let page = first;
            page <= last;
            page += 1
          ) {
            pages.add(page);
          }
        }

        return;
      }

      const page = Number(part);

      if (
        Number.isInteger(page) &&
        page >= 1 &&
        page <= maxPage
      ) {
        pages.add(page);
      }
    });

  return Array.from(pages).sort(
    (a, b) => a - b
  );
}

function getSelectedPages(config) {
  const maxPage = Math.max(
    1,
    Number(
      config?.assignmentPageCount
    ) || 1
  );

  const selection =
    config?.pageSelection || 'single';

  if (selection === 'all') {
    return Array.from(
      { length: maxPage },
      (_, index) => index + 1
    );
  }

  if (selection === 'range') {
    const first = Math.max(
      1,
      Number(config?.pageStart) || 1
    );

    const last = Math.min(
      maxPage,
      Math.max(
        first,
        Number(config?.pageEnd) ||
          first
      )
    );

    return Array.from(
      {
        length:
          last - first + 1,
      },
      (_, index) => first + index
    );
  }

  if (selection === 'custom') {
    const customPages =
      expandCustomPages(
        config?.customPages,
        maxPage
      );

    return customPages.length > 0
      ? customPages
      : [1];
  }

  return [
    Math.min(
      maxPage,
      Math.max(
        1,
        Number(config?.pageStart) || 1
      )
    ),
  ];
}

export default function DigitalNotebookStep({
  stepConfig,
  studentNumber,
  className,
  onComplete,
}) {
  const [completing, setCompleting] =
    useState(false);

  const selectedPages = useMemo(
    () => getSelectedPages(stepConfig),
    [stepConfig]
  );

  const assignmentTitle =
    stepConfig?.assignmentTitle || '';

  const firstPage =
    selectedPages[0] || 1;

  const notebookUrl = useMemo(() => {
    if (
      !assignmentTitle ||
      !className ||
      !studentNumber
    ) {
      return '';
    }

    const params =
      new URLSearchParams();

    params.set(
      'assignment',
      assignmentTitle
    );

    params.set('class', className);

    params.set(
      'number',
      String(studentNumber)
    );

    params.set(
      'page',
      String(firstPage)
    );

    params.set(
      'lessonPages',
      selectedPages.join(',')
    );

    return `/DigitalNotebook?${params.toString()}`;
  }, [
    assignmentTitle,
    className,
    studentNumber,
    firstPage,
    selectedPages,
  ]);

  if (!assignmentTitle) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-3 p-8 text-center bg-indigo-50">
        <div className="text-5xl">
          📓
        </div>

        <p className="font-black text-indigo-950 text-lg">
          No notebook assignment selected
        </p>

        <p className="text-sm text-indigo-700">
          Ask your teacher for help.
        </p>
      </div>
    );
  }

  if (
    !className ||
    !studentNumber
  ) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-3 p-8 text-center bg-indigo-50">
        <div className="text-5xl">
          📓
        </div>

        <p className="font-black text-indigo-950 text-lg">
          Student information is missing
        </p>

        <p className="text-sm text-indigo-700">
          Return to the student page and open the lesson again.
        </p>
      </div>
    );
  }

  const pageDescription =
    selectedPages.length === 1
      ? `Page ${selectedPages[0]}`
      : `Pages ${selectedPages.join(
          ', '
        )}`;

  return (
    <div className="h-full flex flex-col bg-indigo-50">
      <div className="shrink-0 bg-white border-b border-indigo-100 px-3 py-2 flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <BookOpen className="w-5 h-5 text-indigo-600 shrink-0" />

          <div className="min-w-0">
            <p className="font-black text-indigo-950 text-sm truncate">
              {assignmentTitle}
            </p>

            <p className="text-[11px] text-indigo-600 truncate">
              {pageDescription}
            </p>
          </div>
        </div>

        <a
          href={notebookUrl}
          target="_blank"
          rel="noreferrer"
          className="px-3 py-2 rounded-xl bg-indigo-100 text-indigo-700 font-bold text-xs inline-flex items-center gap-1"
        >
          <ExternalLink className="w-4 h-4" />
          Open full screen
        </a>

        <button
          type="button"
          disabled={completing}
          onClick={() => {
            if (completing) return;

            setCompleting(true);

            onComplete?.({
              correctCount:
                selectedPages.length,
              totalItems:
                selectedPages.length,
              pages: selectedPages,
            });
          }}
          className="px-4 py-2 rounded-xl bg-green-500 text-white font-black text-xs inline-flex items-center gap-1 disabled:opacity-60"
        >
          <Check className="w-4 h-4" />

          {completing
            ? 'Done!'
            : 'Finish notebook'}
        </button>
      </div>

      <div className="flex-1 min-h-0 p-2">
        <iframe
          src={notebookUrl}
          title={
            assignmentTitle ||
            'Digital Notebook'
          }
          className="w-full h-full border-0 rounded-xl bg-white"
          allow="microphone; camera"
        />
      </div>
    </div>
  );
}
