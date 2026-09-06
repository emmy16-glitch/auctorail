import React, { useEffect, useMemo, useRef, useState } from "react";

export interface AutoTermLine {
  /** The line text. If `cmd` is true, an "auctorail$ " prompt is prefixed. */
  text: string;
  /** Render as a command (prompt prefix). */
  cmd?: boolean;
  /** Tone colour: ok (green) / warn (amber) / bad (red). */
  tone?: "ok" | "warn" | "bad";
  /** Extra pause after this line, in ms (default 320). */
  pause?: number;
}

interface AutoTerminalProps {
  lines: AutoTermLine[];
  /** Title-bar label, e.g. "auctorail — live". */
  label?: string;
  /** Loop the sequence forever (default true). */
  loop?: boolean;
  /** Starting play state (default true). */
  autostart?: boolean;
  /** Milliseconds per character in typing mode (default 26). */
  speed?: number;
  /** Milliseconds per line in calm (reduced-motion) mode (default 1000). */
  lineMs?: number;
  /** Compact variant (smaller padding / font). */
  compact?: boolean;
  /** Accessible name for the terminal. */
  ariaLabel?: string;
}

const LOOP_REST_MS = 2600;

/**
 * A small terminal that runs its lines automatically and (by default) loops.
 * Two modes:
 *  - Typing: characters appear one at a time with a blinking cursor.
 *  - Calm:   when the OS asks for reduced motion, each line still appears on
 *            its own (whole line, gentle fade) so it keeps moving, but without
 *            the rapid char-by-char flicker or the blinking cursor.
 * Click the body to pause / resume.
 */
export function AutoTerminal({
  lines,
  label = "auctorail — live",
  loop = true,
  autostart = true,
  speed = 26,
  lineMs = 1000,
  compact = false,
  ariaLabel
}: AutoTerminalProps) {
  const [playing, setPlaying] = useState(autostart);
  const [lineIdx, setLineIdx] = useState(0);
  const [charCount, setCharCount] = useState(0);
  const reduced = useMemo(
    () =>
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches,
    []
  );

  const lastIdx = lines.length - 1;
  const atEnd = lineIdx >= lastIdx;
  const done = atEnd && (reduced || charCount >= (lines[lastIdx]?.text.length ?? 0));
  const status = !playing ? "PAUSED" : done && !loop ? "DONE" : "RUNNING";

  // Lines to render: everything up to the current line; the current line is
  // partial in typing mode, whole in calm mode.
  const visibleLines = lines.slice(0, lineIdx + 1).map((l, i) => {
    if (i < lineIdx || reduced) return l;
    return { ...l, text: l.text.slice(0, charCount) };
  });

  // Reset when the line set changes.
  const keyRef = useRef("");
  const key = lines.map((l) => l.text).join("\n");
  if (keyRef.current !== key) {
    keyRef.current = key;
    setLineIdx(0);
    setCharCount(0);
  }

  useEffect(() => {
    if (!playing) return;
    if (done) {
      if (!loop) return;
      const t = window.setTimeout(() => {
        setLineIdx(0);
        setCharCount(0);
      }, LOOP_REST_MS);
      return () => window.clearTimeout(t);
    }

    if (reduced) {
      // Calm mode: reveal each whole line on a timer, no char flicker.
      const current = lines[lineIdx];
      const delay = atEnd ? LOOP_REST_MS : (current?.pause ?? lineMs);
      const t = window.setTimeout(() => {
        if (atEnd) {
          // Rest on the finished transcript before looping (handled by `done`).
          return;
        }
        setLineIdx((i) => i + 1);
      }, delay);
      return () => window.clearTimeout(t);
    }

    // Typing mode: reveal characters one at a time.
    const current = lines[lineIdx];
    if (!current) return;
    const finishedLine = charCount >= current.text.length;
    const delay = finishedLine ? (current.pause ?? 340) : speed;
    const t = window.setTimeout(() => {
      if (finishedLine) {
        if (atEnd) {
          setCharCount(current.text.length);
        } else {
          setLineIdx((i) => i + 1);
          setCharCount(0);
        }
      } else {
        setCharCount((c) => c + 1);
      }
    }, delay);
    return () => window.clearTimeout(t);
  }, [playing, done, loop, reduced, atEnd, lineIdx, charCount, lines, speed, lineMs]);

  const showCursor = !reduced && playing;

  return (
    <div
      className={`auto-term ${compact ? "auto-term-compact" : ""} ${reduced ? "auto-term-calm" : ""} ${playing ? "is-running" : ""}`}
      role="img"
      aria-label={ariaLabel ?? `Live terminal: ${label}`}
      onClick={() => setPlaying((p) => !p)}
      style={{ cursor: "pointer" }}
    >
      <div className="auto-term-title">
        <span className="console-dots" aria-hidden="true"><i /><i /><i /></span>
        <span className="auto-term-label mono">{label}</span>
        <span className={`auto-term-state ${status.toLowerCase()}`}>{status}</span>
      </div>
      <div className="auto-term-body">
        {visibleLines.map((line, i) => (
          <span key={i} className={`wire-line ${line.tone ?? ""} ${line.cmd ? "cmd" : ""}`}>
            <span className={line.cmd ? "wl-cmd" : ""}>{line.text}</span>
            {i === visibleLines.length - 1 && showCursor && (
              <span className="auto-term-cursor" aria-hidden="true" />
            )}
          </span>
        ))}
      </div>
    </div>
  );
}
