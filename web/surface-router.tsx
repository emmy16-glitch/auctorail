import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { ControlScreen, type ControlActivityItem } from "./ControlScreen";
import { SecurityLabScreen } from "./SecurityLabScreen";
import "./surface-router.css";

const API_BASE = (import.meta.env.VITE_PROOFGATE_API_URL ?? "").replace(/\/$/, "");
const DURATIONS = [900, 1800, 3600, 7200, 14400, 28800, 86400] as const;
type Surface = "check" | "control" | "security";

function parseLimitFromPage(): number {
  const value = document.querySelector<HTMLOutputElement>('[data-testid="limit-value"]')?.textContent ?? "5.00";
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 5;
}

function parseDurationFromPage(): number {
  const label = document.querySelector<HTMLOutputElement>('[data-testid="duration-value"]')?.textContent?.trim() ?? "1 hour";
  if (label.endsWith("min")) return Number.parseInt(label, 10) * 60;
  if (label === "1 hour") return 3600;
  if (label.endsWith("hours")) return Number.parseInt(label, 10) * 3600;
  return 86400;
}

function applyAuthorityToCheck(limit: number, duration: number, active: boolean) {
  const limitOutput = document.querySelector<HTMLOutputElement>('[data-testid="limit-value"]');
  const decreaseLimit = document.querySelector<HTMLButtonElement>('button[aria-label="Decrease maximum payment"]');
  const increaseLimit = document.querySelector<HTMLButtonElement>('button[aria-label="Increase maximum payment"]');
  if (limitOutput && decreaseLimit && increaseLimit) {
    let current = Number.parseFloat(limitOutput.textContent ?? "5");
    let guard = 0;
    while (Math.abs(current - limit) > 0.001 && guard++ < 12) {
      (current > limit ? decreaseLimit : increaseLimit).click();
      current = Number.parseFloat(limitOutput.textContent ?? String(limit));
    }
  }

  const durationOutput = document.querySelector<HTMLOutputElement>('[data-testid="duration-value"]');
  const shorter = document.querySelector<HTMLButtonElement>('button[aria-label="Shorten permission duration"]');
  const longer = document.querySelector<HTMLButtonElement>('button[aria-label="Extend permission duration"]');
  if (durationOutput && shorter && longer) {
    let current = parseDurationFromPage();
    let guard = 0;
    while (current !== duration && guard++ < 10) {
      const currentIndex = DURATIONS.indexOf(current as typeof DURATIONS[number]);
      const targetIndex = DURATIONS.indexOf(duration as typeof DURATIONS[number]);
      (currentIndex > targetIndex ? shorter : longer).click();
      current = parseDurationFromPage();
    }
  }

  const check = [...document.querySelectorAll<HTMLButtonElement>("button")].find((button) => button.textContent?.includes("CHECK THIS REQUEST"));
  if (check) {
    if (!active) {
      check.disabled = true;
      check.dataset.revokedByControl = "true";
      check.title = "Authority is revoked. Restore it from CONTROL before checking a request.";
    } else if (check.dataset.revokedByControl === "true") {
      check.disabled = false;
      delete check.dataset.revokedByControl;
      check.removeAttribute("title");
    }
  }
}

function readCurrentActivity(): ControlActivityItem | null {
  const page = document.querySelector(".app-page");
  if (!page) return null;
  const text = page.textContent ?? "";
  const now = new Date();
  const time = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
  const requestText = [...page.querySelectorAll("strong")].map((node) => node.textContent ?? "").find((value) => /USDC\s*→\s*ProofGate Vendor/.test(value));
  const amount = requestText?.match(/([0-9]+(?:\.[0-9]+)?)\s*USDC/)?.[1];

  if (text.includes("PAYMENT EXECUTED")) {
    const tx = text.match(/0x[0-9a-fA-F]{64}/)?.[0];
    return { id: `executed:${tx ?? requestText ?? time}`, status: "EXECUTED", amount: amount ? Number(amount).toFixed(2) : undefined, recipient: "ProofGate Vendor", detail: "Authorized payment confirmed on Base Sepolia.", time, proofAvailable: true };
  }
  if (text.includes("CONFIRMATION UNCERTAIN")) {
    return { id: `uncertain:${requestText ?? time}`, status: "UNCERTAIN", amount: amount ? Number(amount).toFixed(2) : undefined, recipient: "ProofGate Vendor", detail: "Execution was dispatched but confirmation is uncertain. Automatic retry is locked.", time };
  }
  if (text.includes("EXECUTION STOPPED")) {
    return { id: `failed:${requestText ?? time}`, status: "FAILED", amount: amount ? Number(amount).toFixed(2) : undefined, recipient: "ProofGate Vendor", detail: "Protected execution stopped before a trustworthy receipt was produced.", time };
  }
  if (text.includes("BLOCK") && text.includes("DECISION")) {
    return { id: `blocked:${requestText ?? time}`, status: "BLOCKED", amount: amount ? Number(amount).toFixed(2) : undefined, recipient: "ProofGate Vendor", detail: "ProofGate denied the request. No vendor execution was authorized.", time };
  }
  if (text.includes("HOLD") && text.includes("DECISION")) {
    return { id: `held:${requestText ?? time}`, status: "HELD", amount: amount ? Number(amount).toFixed(2) : undefined, recipient: "ProofGate Vendor", detail: "ProofGate held the request because required authorization conditions were not satisfied.", time };
  }
  return null;
}

function SurfaceRouter() {
  const [surface, setSurface] = useState<Surface>("check");
  const [limit, setLimit] = useState(() => parseLimitFromPage());
  const [duration, setDuration] = useState(() => parseDurationFromPage());
  const [active, setActive] = useState(true);
  const [activities, setActivities] = useState<ControlActivityItem[]>([]);

  const originalContent = useMemo(() => () => {
    const app = document.querySelector(".app-page");
    if (!app) return [] as HTMLElement[];
    return [...app.children].filter((child) => child instanceof HTMLElement && !child.classList.contains("live-strip") && !child.classList.contains("brand-row") && !child.classList.contains("top-tabs") && child.id !== "proofgate-surface-root") as HTMLElement[];
  }, []);

  useEffect(() => {
    const updateVisibility = () => {
      for (const element of originalContent()) element.style.display = surface === "check" ? "" : "none";
      const legacyNav = document.querySelector<HTMLElement>(".app-page > .top-tabs:not(.pg-surface-tabs)");
      if (legacyNav) legacyNav.style.display = "none";
      applyAuthorityToCheck(limit, duration, active);
    };
    updateVisibility();
    const observer = new MutationObserver(updateVisibility);
    const app = document.querySelector(".app-page");
    if (app) observer.observe(app, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [surface, limit, duration, active, originalContent]);

  useEffect(() => {
    const collect = () => {
      const item = readCurrentActivity();
      if (!item) return;
      setActivities((current) => current.some((entry) => entry.id === item.id) ? current : [item, ...current].slice(0, 12));
    };
    collect();
    const app = document.querySelector(".app-page");
    if (!app) return;
    const observer = new MutationObserver(collect);
    observer.observe(app, { childList: true, subtree: true, characterData: true });
    return () => observer.disconnect();
  }, []);

  function updateLimit(next: number) {
    setLimit(next);
    setActivities((current) => [{ id: `limit:${Date.now()}`, status: "UPDATED", detail: `Maximum payment changed to ${next.toFixed(2)} USDC.`, time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) }, ...current].slice(0, 12));
  }

  function updateDuration(next: number) {
    setDuration(next);
    setActivities((current) => [{ id: `duration:${Date.now()}`, status: "UPDATED", detail: "Permission duration changed.", time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) }, ...current].slice(0, 12));
  }

  function toggleActive() {
    setActive((current) => {
      const next = !current;
      setActivities((items) => [{ id: `authority:${Date.now()}`, status: next ? "UPDATED" : "REVOKED", detail: next ? "Authority restored by you." : "Authority revoked by you.", time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) }, ...items].slice(0, 12));
      return next;
    });
  }

  function viewProof() {
    setSurface("check");
    window.setTimeout(() => {
      const proofButton = [...document.querySelectorAll<HTMLButtonElement>("button")].find((button) => button.textContent?.includes("VIEW PROOF"));
      proofButton?.click();
    }, 50);
  }

  return (
    <>
      <nav className="top-tabs pg-surface-tabs" aria-label="ProofGate sections">
        <button type="button" className={surface === "check" ? "active" : ""} aria-current={surface === "check" ? "page" : undefined} onClick={() => setSurface("check")}>CHECK</button>
        <button type="button" className={surface === "control" ? "active" : ""} aria-current={surface === "control" ? "page" : undefined} onClick={() => setSurface("control")}>CONTROL</button>
        <button type="button" className={surface === "security" ? "active" : ""} aria-current={surface === "security" ? "page" : undefined} onClick={() => setSurface("security")}>SECURITY LAB</button>
      </nav>
      {surface === "control" && (
        <ControlScreen
          agentId="invoice-bot"
          active={active}
          limit={limit}
          durationSeconds={duration}
          activities={activities}
          onLimitChange={updateLimit}
          onDurationChange={updateDuration}
          onToggleActive={toggleActive}
          onViewProof={viewProof}
        />
      )}
      {surface === "security" && <SecurityLabScreen apiBase={API_BASE} />}
    </>
  );
}

function mountRouter() {
  const app = document.querySelector(".app-page");
  if (!app) return false;
  if (document.getElementById("proofgate-surface-root")) return true;
  const legacyNav = app.querySelector(":scope > .top-tabs");
  if (!legacyNav) return false;
  legacyNav.setAttribute("aria-hidden", "true");
  (legacyNav as HTMLElement).style.display = "none";
  const rootElement = document.createElement("div");
  rootElement.id = "proofgate-surface-root";
  legacyNav.insertAdjacentElement("afterend", rootElement);
  createRoot(rootElement).render(<SurfaceRouter />);
  return true;
}

if (!mountRouter()) {
  const observer = new MutationObserver(() => {
    if (mountRouter()) observer.disconnect();
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });
}
