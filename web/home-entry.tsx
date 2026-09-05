import React, { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { HomeLandingScreen } from "./HomeLandingScreen";
import { GuidedDemoScreen } from "./GuidedDemoScreen";
import { SdkScreen } from "./SdkScreen";
import { ContentTrustScreen } from "./ContentTrustScreen";
import { VerifyScreen } from "./VerifyScreen";
import "./home-entry.css";

function rebrandLiveSurface() {
  const root = document.getElementById("root");
  if (!root) return;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const nodes: Text[] = [];
  while (walker.nextNode()) nodes.push(walker.currentNode as Text);
  for (const node of nodes) {
    const value = node.nodeValue ?? "";
    if (/proofgate/i.test(value)) {
      node.nodeValue = value
        .replace(/PROOFGATE/g, "AUCTORAIL")
        .replace(/ProofGate/g, "Auctorail")
        .replace(/proofgate/g, "auctorail");
    }
  }
  root.querySelectorAll<HTMLElement>("[aria-label]").forEach((el) => {
    const label = el.getAttribute("aria-label");
    if (label && /proofgate/i.test(label)) {
      el.setAttribute(
        "aria-label",
        label
          .replace(/PROOFGATE/g, "AUCTORAIL")
          .replace(/ProofGate/g, "Auctorail")
          .replace(/proofgate/g, "auctorail")
      );
    }
  });
}

function clickLiveSurface(label: "CHECK" | "ACTIVITY" | "PERMISSIONS" | "SECURITY LAB") {
  const root = document.getElementById("root");
  const home = document.getElementById("auctorail-home-root");
  if (home) home.style.display = "none";
  if (root) root.style.display = "";
  requestAnimationFrame(() => {
    rebrandLiveSurface();
    const button = [...document.querySelectorAll<HTMLButtonElement>("#root .top-tabs button")]
      .find((item) => item.textContent?.trim() === label);
    button?.click();
    requestAnimationFrame(rebrandLiveSurface);
    window.scrollTo({ top: 0, behavior: "instant" as ScrollBehavior });
  });
}

function showHome() {
  const root = document.getElementById("root");
  const home = document.getElementById("auctorail-home-root");
  if (root) root.style.display = "none";
  if (home) home.style.display = "";
  window.dispatchEvent(new CustomEvent("auctorail:home"));
  window.scrollTo({ top: 0, behavior: "instant" as ScrollBehavior });
}

function installHomeButton() {
  const nav = document.querySelector<HTMLElement>("#root .top-tabs");
  if (!nav || nav.querySelector(".pg-home-tab")) return;
  nav.classList.add("pg-five-tabs");
  const button = document.createElement("button");
  button.type = "button";
  button.className = "pg-home-tab";
  button.textContent = "HOME";
  button.addEventListener("click", showHome);
  nav.prepend(button);
}

type HomeView = "landing" | "demo" | "sdk" | "content" | "verify";

function HomeEntry() {
  const shellRef = useRef<HTMLDivElement>(null);
  const [view, setView] = useState<HomeView>("landing");
  const [verifyInput, setVerifyInput] = useState("");

  useEffect(() => {
    const root = document.getElementById("root");
    if (root) root.style.display = "none";
    installHomeButton();
    rebrandLiveSurface();
    const observer = new MutationObserver(() => {
      installHomeButton();
      rebrandLiveSurface();
    });
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
    const handleHome = () => setView("landing");
    window.addEventListener("auctorail:home", handleHome);
    return () => {
      observer.disconnect();
      window.removeEventListener("auctorail:home", handleHome);
    };
  }, []);

  useEffect(() => {
    const fitSurface = () => {
      const shell = shellRef.current;
      if (!shell) return;
      const width = window.innerWidth;
      const referenceSurface = view === "landing" || view === "demo";
      if (referenceSurface && width > 900 && width < 1536) {
        shell.style.width = "1536px";
        shell.style.minWidth = "1536px";
        shell.style.maxWidth = "1536px";
        shell.style.zoom = String(width / 1536);
      } else {
        shell.style.width = "100%";
        shell.style.minWidth = "0";
        shell.style.maxWidth = "none";
        shell.style.zoom = "1";
      }
    };
    fitSurface();
    window.addEventListener("resize", fitSurface);
    return () => window.removeEventListener("resize", fitSurface);
  }, [view]);

  function setHomeView(next: HomeView) {
    setView(next);
    window.scrollTo({ top: 0, behavior: "instant" as ScrollBehavior });
  }
  function goHome() { setHomeView("landing"); }
  function startDemo() { setHomeView("demo"); }
  function openSdk() { setHomeView("sdk"); }
  function openContent() { setHomeView("content"); }
  function openVerify(input = "") {
    setVerifyInput(input);
    setHomeView("verify");
  }

  return (
    <div className={`home-shell home-shell-${view}`} ref={shellRef}>
      <div className="home-status-strip">
        <div>
          <span className="home-status-dot" /> <strong>OFFLINE MODE (SAFE DEMO)</strong><i>·</i><span>BASE SEPOLIA</span><i>·</i><span>DETERMINISTIC RESULTS</span>
        </div>
        <span>REAL AUTHORIZATION. PROVABLE SECURITY.</span>
      </div>

      <header className="home-nav-header">
        <button className="home-brand" type="button" onClick={goHome} aria-label="Auctorail home">
          <svg className="home-brand-shield" viewBox="0 0 48 56" aria-hidden="true"><path d="M24 3 43 10v15c0 12-7.6 22.4-19 28C12.6 47.4 5 37 5 25V10z" /></svg>
          <span><strong>AUCTORAIL</strong><small>Authorization rails</small></span>
        </button>
        <nav aria-label="Auctorail navigation">
          <button className={view === "landing" ? "active" : ""} type="button" onClick={goHome}>HOME</button>
          <button type="button" onClick={() => clickLiveSurface("CHECK")}>CHECK</button>
          <button type="button" onClick={() => clickLiveSurface("ACTIVITY")}>ACTIVITY</button>
          <button type="button" onClick={() => clickLiveSurface("PERMISSIONS")}>PERMISSIONS</button>
          <button type="button" onClick={() => clickLiveSurface("SECURITY LAB")}>SECURITY LAB</button>
        </nav>
        <div className="home-header-actions">
          <button className={view === "verify" ? "active" : ""} type="button" onClick={() => openVerify()}>VERIFY</button>
          <button className="home-docs-link" type="button" onClick={openSdk}>DOCS ↗</button>
        </div>
      </header>

      {view === "landing" && (
        <HomeLandingScreen
          onDemo={startDemo}
          onLive={() => clickLiveSurface("CHECK")}
          onContent={openContent}
          onVerify={() => openVerify()}
        />
      )}
      {view === "demo" && (
        <GuidedDemoScreen
          onBack={goHome}
          onLive={() => clickLiveSurface("CHECK")}
          onActivity={() => clickLiveSurface("ACTIVITY")}
          onPermissions={() => clickLiveSurface("PERMISSIONS")}
          onSecurityLab={() => clickLiveSurface("SECURITY LAB")}
        />
      )}
      {view === "sdk" && <SdkScreen />}
      {view === "content" && <ContentTrustScreen onVerifyReceipt={openVerify} />}
      {view === "verify" && <VerifyScreen initialInput={verifyInput} />}
    </div>
  );
}

const mount = document.getElementById("auctorail-home-root");
if (mount) {
  createRoot(mount).render(
    <React.StrictMode>
      <HomeEntry />
    </React.StrictMode>
  );
}
