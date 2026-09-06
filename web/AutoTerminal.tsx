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
  /** Milliseconds per character (default 26). */
  speed?: number;
  /** Compact variant (smaller padding / font). */
  compact?: boolean;
  /** Accessible name for the terminal. */
  ariaLabel?: string;
}

/**
 * A small terminal that types its lines automatically, pauses between them,
 * and (by default) loops. Click the body to pause / resume. Honors
 * prefers-reduced-motion by rendering the full transcript statically.
 */
export function AutoTerminal({
  lines,
  label = "auctorail — live",
  loop = true,
  autostart = true,
  speed = 26,
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

  // When reduced motion is requested, show the whole transcript at once.
  const showAll = reduced;
  const visibleLines = showAll
    ? lines
    : lines.slice(0, lineIdx + 1).map((l, i) =>
        i < lineIdx ? l : { ...l, text: l.text.slice(0, charCount) }
      );

  const done = !showAll && lineIdx >= lines.length - 1 && charCount >= lines[lines.length - 1].text.length;
  const status = !playing ? "PAUSED" : done && !loop ? "DONE" : "RUNNING";

  // Reset when the line set changes.
  const keyRef = useRef("");
  const key = lines.map((l) => l.text).join("\n");
  if (keyRef.current !== key) {
    keyRef.current = key;
    setLineIdx(0);
    setCharCount(0);
  }

  useEffect(() => {
    if (showAll || !playing) return;
    if (done) {
      if (!loop) return;
      // Rest between loops, then restart.
      const t = window.setTimeout(() => {
        setLineIdx(0);
        setCharCount(0);
      }, 2600);
      return () => window.clearTimeout(t);
    }
    const current = lines[lineIdx];
    if (!current) return;
    const finishedLine = charCount >= current.text.length;
    const delay = finishedLine ? (current.pause ?? 340) : speed;
    const t = window.setTimeout(() => {
      if (finishedLine) {
        if (lineIdx >= lines.length - 1) {
          setCharCount(current.text.length); // settle last line
        } else {
          setLineIdx((i) => i + 1);
          setCharCount(0);
        }
      } else {
        setCharCount((c) => c + 1);
      }
    }, delay);
    return () => window.clearTimeout(t);
  }, [showAll, playing, done, loop, lineIdx, charCount, lines, speed]);

  return (
    <div
      className={`auto-term ${compact ? "auto-term-compact" : ""} ${playing && !showAll ? "is-running" : ""}`}
      role="img"
      aria-label={ariaLabel ?? `Live terminal: ${label}`}
      onClick={() => !showAll && setPlaying((p) => !p)}
      style={{ cursor: showAll ? "default" : "pointer" }}
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
            {i === visibleLines.length - 1 && !showAll && (
              <span className="auto-term-cursor" aria-hidden="true" />
            )}
          </span>
        ))}
        {showAll && <span className="auto-term-cursor" aria-hidden="true" />}
      </div>
    </div>
  );
}
