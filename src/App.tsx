import { useEffect, useMemo, useState } from 'react';

type TimerStatus = 'idle' | 'running' | 'paused' | 'finished';

type TimerSnapshot = {
  durationSeconds: number;
  remainingMs: number;
  deadlineMs: number | null;
  status: TimerStatus;
};

const STORAGE_KEY = 'pulse-timer-state';
const DEFAULT_DURATION_SECONDS = 4 * 60 * 60;
const MIN_DURATION_SECONDS = 30;
const MAX_DURATION_SECONDS = 24 * 60 * 60;

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

const formatTime = (totalMilliseconds: number) => {
  const safeMilliseconds = Math.max(0, Math.floor(totalMilliseconds));
  const totalSeconds = Math.floor(safeMilliseconds / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  return [hours, minutes, seconds]
    .map((value, index) => String(value).padStart(index === 0 ? 2 : 2, '0'))
    .join(':');
};

const readInitialState = (): TimerSnapshot => {
  if (typeof window === 'undefined') {
    return {
      durationSeconds: DEFAULT_DURATION_SECONDS,
      remainingMs: DEFAULT_DURATION_SECONDS * 1000,
      deadlineMs: null,
      status: 'idle',
    };
  }

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return {
        durationSeconds: DEFAULT_DURATION_SECONDS,
        remainingMs: DEFAULT_DURATION_SECONDS * 1000,
        deadlineMs: null,
        status: 'idle',
      };
    }

    const parsed = JSON.parse(raw) as Partial<TimerSnapshot>;
    const durationSeconds = clamp(
      Number(parsed.durationSeconds ?? DEFAULT_DURATION_SECONDS),
      MIN_DURATION_SECONDS,
      MAX_DURATION_SECONDS,
    );
    const status =
      parsed.status === 'running' ||
      parsed.status === 'paused' ||
      parsed.status === 'finished'
        ? parsed.status
        : 'idle';
    const storedDeadline =
      typeof parsed.deadlineMs === 'number' ? parsed.deadlineMs : null;
    let remainingMs = clamp(
      Number(parsed.remainingMs ?? durationSeconds * 1000),
      0,
      MAX_DURATION_SECONDS * 1000,
    );
    let deadlineMs = storedDeadline;
    let resolvedStatus: TimerStatus = status;

    if (status === 'running' && storedDeadline !== null) {
      remainingMs = Math.max(0, storedDeadline - Date.now());
      if (remainingMs === 0) {
        deadlineMs = null;
        resolvedStatus = 'finished';
      }
    }

    if (resolvedStatus === 'idle') {
      remainingMs = durationSeconds * 1000;
    }

    return {
      durationSeconds,
      remainingMs,
      deadlineMs,
      status: resolvedStatus,
    };
  } catch {
    return {
      durationSeconds: DEFAULT_DURATION_SECONDS,
      remainingMs: DEFAULT_DURATION_SECONDS * 1000,
      deadlineMs: null,
      status: 'idle',
    };
  }
};

function App() {
  const [initialState] = useState(readInitialState);
  const [durationSeconds, setDurationSeconds] = useState(
    () => initialState.durationSeconds,
  );
  const [remainingMs, setRemainingMs] = useState(
    () => initialState.remainingMs,
  );
  const [deadlineMs, setDeadlineMs] = useState<number | null>(
    () => initialState.deadlineMs,
  );
  const [status, setStatus] = useState<TimerStatus>(
    () => initialState.status,
  );
  const [hoursInput, setHoursInput] = useState(() =>
    String(Math.floor(initialState.durationSeconds / 3600)),
  );
  const [minutesInput, setMinutesInput] = useState(() =>
    String(Math.floor((initialState.durationSeconds % 3600) / 60)),
  );
  const [secondsInput, setSecondsInput] = useState(() =>
    String(initialState.durationSeconds % 60),
  );
  const [isProjectorMode, setIsProjectorMode] = useState(false);

  useEffect(() => {
    const syncFullscreenState = () => {
      setIsProjectorMode(Boolean(document.fullscreenElement));
    };

    document.addEventListener('fullscreenchange', syncFullscreenState);

    return () => {
      document.removeEventListener('fullscreenchange', syncFullscreenState);
    };
  }, []);

  useEffect(() => {
    if (status !== 'running' || deadlineMs === null) {
      return;
    }

    const syncRemaining = () => {
      const nextRemaining = Math.max(0, deadlineMs - Date.now());
      setRemainingMs(nextRemaining);

      if (nextRemaining === 0) {
        setDeadlineMs(null);
        setStatus('finished');
      }
    };

    syncRemaining();

    const intervalId = window.setInterval(syncRemaining, 1000);
    const handleVisibilityChange = () => syncRemaining();

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      window.clearInterval(intervalId);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [deadlineMs, status]);

  useEffect(() => {
    if (status === 'running' && deadlineMs === null) {
      return;
    }

    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ durationSeconds, remainingMs, deadlineMs, status }),
    );
  }, [deadlineMs, durationSeconds, remainingMs, status]);

  const displayTime = useMemo(() => formatTime(remainingMs), [remainingMs]);
  const progress = useMemo(() => {
    const total = Math.max(1, durationSeconds * 1000);
    return clamp((remainingMs / total) * 100, 0, 100);
  }, [durationSeconds, remainingMs]);

  const applyDuration = (seconds: number) => {
    const safeSeconds = clamp(seconds, MIN_DURATION_SECONDS, MAX_DURATION_SECONDS);
    setDurationSeconds(safeSeconds);
    setHoursInput(String(Math.floor(safeSeconds / 3600)));
    setMinutesInput(String(Math.floor((safeSeconds % 3600) / 60)));
    setSecondsInput(String(safeSeconds % 60));

    if (status !== 'running') {
      setRemainingMs(safeSeconds * 1000);
    }
  };

  const commitCustomDuration = () => {
    const parsedHours = Number(hoursInput || '0');
    const parsedMinutes = Number(minutesInput || '0');
    const parsedSeconds = Number(secondsInput || '0');
    const computedSeconds = clamp(
      Math.round(parsedHours * 3600 + parsedMinutes * 60 + parsedSeconds),
      MIN_DURATION_SECONDS,
      MAX_DURATION_SECONDS,
    );

    applyDuration(computedSeconds);
  };

  const handleStart = () => {
    if (status === 'running') {
      return;
    }

    const nextRemaining =
      status === 'paused' ? remainingMs : durationSeconds * 1000;
    const nextDeadline = Date.now() + nextRemaining;

    setRemainingMs(nextRemaining);
    setDeadlineMs(nextDeadline);
    setStatus('running');
  };

  const handlePause = () => {
    if (status !== 'running' || deadlineMs === null) {
      return;
    }

    const nextRemaining = Math.max(0, deadlineMs - Date.now());

    setRemainingMs(nextRemaining);
    setDeadlineMs(null);
    setStatus(nextRemaining === 0 ? 'finished' : 'paused');
  };

  const handleReset = () => {
    setDeadlineMs(null);
    setStatus('idle');
    setRemainingMs(durationSeconds * 1000);
  };

  const toggleProjectorMode = async () => {
    if (document.fullscreenElement) {
      await document.exitFullscreen();
      return;
    }

    await document.documentElement.requestFullscreen();
  };

  const shortcuts = [
    { label: '30 sec', seconds: 30 },
    { label: '5 min', seconds: 5 * 60 },
    { label: '30 min', seconds: 30 * 60 },
    { label: '1 hour', seconds: 60 * 60 },
    { label: '4 hours', seconds: 4 * 60 * 60 },
  ];

  if (isProjectorMode) {
    if (status === 'finished') {
      return (
        <main className="flex min-h-screen items-center justify-center bg-red-600 px-4 text-center text-white">
          <button
            type="button"
            onClick={toggleProjectorMode}
            className="absolute right-4 top-4 rounded-full border border-white/30 px-4 py-2 text-sm font-medium text-white/90 transition hover:bg-white/10"
          >
            Exit
          </button>
          <div className="flex flex-col items-center gap-4">
            <p className="text-[clamp(4rem,18vw,10rem)] font-semibold leading-none tracking-tight sm:text-[clamp(6rem,20vw,12rem)]">
              Time Up!
            </p>
          </div>
        </main>
      );
    }

    return (
      <main className="relative flex min-h-screen items-center justify-center bg-[radial-gradient(circle_at_center,_rgba(148,163,184,0.08),_transparent_60%),linear-gradient(180deg,_#020617_0%,_#020617_100%)] px-4 text-white">
        <button
          type="button"
          onClick={toggleProjectorMode}
          className="absolute right-4 top-4 rounded-full border border-white/15 px-4 py-2 text-sm font-medium text-white/80 transition hover:border-white/30 hover:bg-white/5"
        >
          Exit
        </button>
        <div className="flex w-full max-w-5xl items-center justify-center rounded-[2rem] border border-white/10 bg-slate-950/80 p-6 shadow-glow backdrop-blur-xl sm:p-10">
          <p className="text-[clamp(5rem,22vw,14rem)] font-semibold leading-none tracking-tight text-white">
            {displayTime}
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(56,189,248,0.24),_transparent_38%),linear-gradient(180deg,_#020617_0%,_#0f172a_52%,_#020617_100%)] px-4 py-6 text-slate-100 sm:px-6 lg:px-8">
      <div className="mx-auto flex min-h-[calc(100vh-3rem)] w-full max-w-4xl items-center">
        <section className="grid w-full gap-6 rounded-[2rem] border border-white/10 bg-slate-950/70 p-5 shadow-glow backdrop-blur-xl sm:p-8 lg:grid-cols-[1.2fr_0.8fr]">
          <div className="space-y-4 sm:space-y-6">
            <div className="space-y-3">
              <p className="text-sm uppercase tracking-[0.35em] text-sky-300/80">Timer</p>
            </div>

            <div className="rounded-[1.5rem] border border-white/10 bg-white/5 p-4 sm:rounded-[1.75rem] sm:p-5">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-[clamp(2.6rem,14vw,4.5rem)] font-semibold leading-none tracking-tight text-white">
                    {displayTime}
                  </p>
                </div>
                <div className="h-20 w-20 rounded-full bg-[conic-gradient(from_180deg,_#38bdf8_0%,_#22c55e_60%,_rgba(15,23,42,0.2)_60%)] p-2 sm:h-28 sm:w-28">
                  <div className="flex h-full items-center justify-center rounded-full bg-slate-950 text-center text-xs text-slate-300 sm:text-sm">
                    {Math.round(progress)}%
                  </div>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:flex sm:flex-wrap">
              <button
                type="button"
                onClick={toggleProjectorMode}
                className="rounded-full border border-cyan-400/30 px-5 py-3 text-sm font-medium text-cyan-100 transition hover:border-cyan-300 hover:bg-cyan-400/10"
              >
                Full
              </button>

              {status === 'running' ? (
                <button
                  type="button"
                  onClick={handlePause}
                  className="rounded-full bg-amber-400 px-5 py-3 text-sm font-medium text-slate-950 transition hover:bg-amber-300"
                >
                  Pause
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleStart}
                  className="rounded-full bg-sky-400 px-5 py-3 text-sm font-medium text-slate-950 transition hover:bg-sky-300"
                >
                  Start
                </button>
              )}

              <button
                type="button"
                onClick={handleReset}
                className="rounded-full border border-white/15 px-5 py-3 text-sm font-medium text-white transition hover:border-white/30 hover:bg-white/5"
              >
                Reset
              </button>
            </div>

            <div className="grid grid-cols-2 gap-2 sm:gap-3">
              {shortcuts.map((shortcut) => (
                <button
                  key={shortcut.label}
                  type="button"
                  disabled={status === 'running'}
                  onClick={() => applyDuration(shortcut.seconds)}
                  className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-left text-sm text-slate-200 transition hover:border-sky-400/50 hover:bg-sky-400/10 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <span className="block text-xs uppercase tracking-[0.2em] text-slate-400">
                    Set
                  </span>
                  <span className="mt-1 block text-base font-medium text-white">
                    {shortcut.label}
                  </span>
                </button>
              ))}
            </div>
          </div>

          <aside className="space-y-4 rounded-[1.25rem] border border-white/10 bg-slate-900/70 p-4 sm:space-y-5 sm:rounded-[1.5rem] sm:p-5">
            <div>
              <p className="text-sm uppercase tracking-[0.25em] text-slate-400">Set</p>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 sm:gap-4">
              <label className="space-y-2 text-xs text-slate-300 sm:text-sm">
                <span>Hours</span>
                <input
                  type="number"
                  min={0}
                  max={24}
                  value={hoursInput}
                  disabled={status === 'running'}
                  onChange={(event) => setHoursInput(event.target.value)}
                  className="w-full rounded-2xl border border-white/10 bg-slate-950 px-4 py-3 text-base text-white outline-none transition placeholder:text-slate-500 focus:border-sky-400 disabled:opacity-60 sm:text-lg"
                />
              </label>
              <label className="space-y-2 text-xs text-slate-300 sm:text-sm">
                <span>Minutes</span>
                <input
                  type="number"
                  min={0}
                  max={59}
                  value={minutesInput}
                  disabled={status === 'running'}
                  onChange={(event) => setMinutesInput(event.target.value)}
                  className="w-full rounded-2xl border border-white/10 bg-slate-950 px-4 py-3 text-base text-white outline-none transition placeholder:text-slate-500 focus:border-sky-400 disabled:opacity-60 sm:text-lg"
                />
              </label>
              <label className="space-y-2 text-xs text-slate-300 sm:text-sm">
                <span>Seconds</span>
                <input
                  type="number"
                  min={0}
                  max={59}
                  value={secondsInput}
                  disabled={status === 'running'}
                  onChange={(event) => setSecondsInput(event.target.value)}
                  className="w-full rounded-2xl border border-white/10 bg-slate-950 px-4 py-3 text-base text-white outline-none transition placeholder:text-slate-500 focus:border-sky-400 disabled:opacity-60 sm:text-lg"
                />
              </label>
            </div>

            <button
              type="button"
              onClick={commitCustomDuration}
              disabled={status === 'running'}
              className="w-full rounded-2xl border border-sky-400/40 bg-sky-400/10 px-4 py-3 text-sm font-medium text-sky-100 transition hover:bg-sky-400/15 disabled:cursor-not-allowed disabled:opacity-60"
            >
              Apply duration
            </button>

            <div className="rounded-2xl border border-white/10 bg-black/20 p-4 text-xs leading-5 text-slate-300 sm:text-sm">4h stays accurate.</div>
          </aside>
        </section>
      </div>
    </main>
  );
}

export default App;