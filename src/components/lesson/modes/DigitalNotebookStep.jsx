import {
  useMemo,
  useState,
  useRef,
  useCallback,
} from 'react';

import {
  Check,
} from 'lucide-react';

import StudentNotebookView from '@/components/notebook/StudentNotebookView';

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
        const [
          rawStart,
          rawEnd,
        ] = part.split('-');

        const start =
          Number(rawStart);

        const end =
          Number(rawEnd);

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
    config?.pageSelection ||
    'single';

  if (selection === 'all') {
    return Array.from(
      { length: maxPage },
      (_, index) => index + 1
    );
  }

  if (selection === 'range') {
    const first = Math.min(
      maxPage,
      Math.max(
        1,
        Number(
          config?.pageStart
        ) || 1
      )
    );

    const last = Math.min(
      maxPage,
      Math.max(
        first,
        Number(
          config?.pageEnd
        ) || first
      )
    );

    return Array.from(
      {
        length:
          last - first + 1,
      },
      (_, index) =>
        first + index
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
        Number(
          config?.pageStart
        ) || 1
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

  const notebookSaveRef = useRef(null);
  const [finishError, setFinishError] = useState('');
  const registerNotebookSave = useCallback(save => {
    notebookSaveRef.current = save;
  }, []);

  const selectedPages = useMemo(
    () =>
      getSelectedPages(stepConfig),
    [stepConfig]
  );

  // Lock students to the step's selected pages so they can't wander off.
  // "all" = no lock (student can navigate the whole notebook freely).
  const pageLock = stepConfig?.pageSelection === 'all' ? null : selectedPages;

  const assignmentTitle =
    stepConfig?.assignmentTitle ||
    '';

  const firstPage =
    selectedPages[0] || 1;

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

  const finishButton = (
    <button
      type="button"
      disabled={completing}
      onClick={async () => {
        if (completing) return;
        setCompleting(true);
        setFinishError('');

        try {
          const saved = await notebookSaveRef.current?.();

          if (saved !== true) {
            setFinishError('Your notebook is not saved yet. Keep it open and try Finish again.');
            return;
          }

          await onComplete?.({
            correctCount: selectedPages.length,
            totalItems: selectedPages.length,
            pages: selectedPages,
          });
        } catch (error) {
          setFinishError('The activity could not finish yet. Your notebook stays open; try again.');
        } finally {
          setCompleting(false);
        }
      }}
      className="px-3 py-2 rounded-xl bg-green-500 text-white font-black text-xs inline-flex items-center gap-1 disabled:opacity-60"
    >
      <Check className="w-4 h-4" />

      {completing
        ? 'Saving…'
        : 'Finish notebook'}
    </button>
  );

  return (
    <div className="h-full min-h-0 overflow-hidden">
      <StudentNotebookView
        studentNumber={
          studentNumber
        }
        className={
          className
        }
        directAssignmentName={
          assignmentTitle
        }
        directPage={
          firstPage
        }
        pageLock={
          pageLock
        }
        onBack={() => {}}
        registerSave={registerNotebookSave}
        extraHeaderContent={
          <div className="flex items-center gap-2">
            {finishError && (
              <span role="alert" className="text-xs text-amber-300 max-w-xs">
                {finishError}
              </span>
            )}
            {finishButton}
          </div>
        }
      />
    </div>
  );
}