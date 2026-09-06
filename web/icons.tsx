import React from "react";

type SvgProps = React.SVGProps<SVGSVGElement>;

export function ShieldIcon(props: SvgProps) {
  return (
    <svg viewBox="0 0 48 56" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="3.4" {...props}>
      <path d="M24 4 42 10.5v14.2c0 11.6-7.3 21.7-18 27.1C13.3 46.4 6 36.3 6 24.7V10.5L24 4Z" strokeLinejoin="miter" />
    </svg>
  );
}

export function MenuIcon(props: SvgProps) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" {...props}>
      <path d="M4 7h16M4 12h16M4 17h16" strokeLinecap="round" />
    </svg>
  );
}

export function FileIcon(props: SvgProps) {
  return (
    <svg viewBox="0 0 38 44" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2.2" {...props}>
      <path d="M7 2h16l8 8v32H7V2Z" strokeLinejoin="miter" />
      <path d="M23 2v9h8M13 21h12M13 27h12M13 33h8" />
    </svg>
  );
}

export function LockIcon(props: SvgProps) {
  return (
    <svg viewBox="0 0 40 44" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2.4" {...props}>
      <path d="M11 18v-6a9 9 0 0 1 18 0v6" />
      <rect x="6" y="18" width="28" height="23" rx="4" />
      <path d="M20 27v7" />
    </svg>
  );
}

export function CheckIcon(props: SvgProps) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2.4" {...props}>
      <path d="m5 12.5 5 5L20 7" strokeLinecap="round" strokeLinejoin="miter" />
    </svg>
  );
}

export function InfoIcon(props: SvgProps) {
  return (
    <svg viewBox="0 0 38 38" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" {...props}>
      <circle cx="19" cy="19" r="15" />
      <path d="M19 17v11M19 10.5v2" strokeLinecap="round" />
    </svg>
  );
}

export function ReceiptIcon(props: SvgProps) {
  return (
    <svg viewBox="0 0 48 56" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2.4" {...props}>
      <path d="M10 4h28v48l-7-4-7 4-7-4-7 4V4Z" strokeLinejoin="miter" />
      <path d="M16 17h16M16 26h16M16 35h10" />
    </svg>
  );
}

export function BoltIcon(props: SvgProps) {
  return (
    <svg viewBox="0 0 32 40" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2.2" {...props}>
      <path d="M18 2 6 22h10l-2 16 12-22H16l2-14Z" strokeLinejoin="miter" />
    </svg>
  );
}

export function PlayIcon(props: SvgProps) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" {...props}>
      <path d="M8 5.5v13l11-6.5-11-6.5Z" strokeLinejoin="miter" />
    </svg>
  );
}
