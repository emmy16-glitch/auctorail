import React, { useEffect, useMemo, useState } from "react";

type RunState = "idle" | "running" | "done";
type RunKind = "valid" | "attack";

type DemoSpec = {
  kind: RunKind;
  title: string;
  subtitle: string;
  amountLabel: string;
  amountValue: string;
  button: string;
  result: string;
  resultCopy: string;
  steps: string[];
};

const demoSpecs: Record<RunKind, DemoSpec> = {
  valid: {
    kind: "valid",
    title: "TRY THE SDK (VALID REQUEST)",
    subtitle: "DEMO 1 / 2",
    amountLabel: "Amount",
    amountValue: "1.00 USDC",
    button: "RUN REQUEST",
    result: "ALLOW",
    resultCopy: "Authorization issued. Action can be executed.",
    steps: ["Request captured", "Rules checked", "Evidence verified", "Permit issued", "Execution simulated"]
  },
  attack: {
    kind: "attack",
    title: "TRY AN ATTACK (MODIFIED AMOUNT)",
    subtitle: "DEMO 2 / 2",
    amountLabel: "Modified amount",
    amountValue: "2.00 USDC (was 1.00)",
    button: "RUN ATTACK",
    result: "BLOCKED",
    resultCopy: "Action no longer matches the authorized request.",
    steps: ["Request captured", "Rules checked", "Amount modified", "Binding mismatch", "Execution blocked"]
  }
};

function copy(text: string) {
  if (navigator.clipboard) void navigator.clipboard.writeText(text);
}

function MiniSdkDemo({ kind }: { kind: RunKind }) {
  const spec = demoSpecs[kind];
  const [state, setState] = useState<RunState>("idle");
  const [step, setStep] = useState(-1);

  useEffect(() => {
    if (state !== "running") return;
    const timer = window.setTimeout(() => {
      if (step < spec.steps.length - 1) setStep((v) => v + 1);
      else setState("done");
    }, step < 0 ? 240 : 430);
    return () => window.clearTimeout(timer);
  }, [state, step, spec.steps.length]);

  function run() { setStep(-1); setState("running"); }
  const status = state === "idle" ? "READY" : state === "running" ? "RUNNING" : spec.result;

  return (
    <section className={`sdk-demo sdk-demo-${kind}`}>
      <header className="sdk-demo-head"><strong>{spec.title}</strong><span>{spec.subtitle}</span></header>
      <div className="sdk-demo-request">
        <dl>
          <div><dt>Request</dt><dd>{kind === "attack" ? "Modified amount" : "transfer"}</dd></div>
          <div><dt>{spec.amountLabel}</dt><dd className={kind === "attack" ? "sdk-danger-text" : ""}>{spec.amountValue}</dd></div>
          <div><dt>Recipient</dt><dd>0x742d...9f3a</dd></div>
          <div><dt>Agent</dt><dd>invoice-bot</dd></div>
        </dl>
        <button className="btn btn-primary btn-sm" type="button" onClick={run}>{spec.button} <span aria-hidden="true">→</span></button>
      </div>
      <ol className="sdk-steps">
        {spec.steps.map((item, index) => {
          const complete = state === "done" || index < step;
          const active = state === "running" && index === step;
          const failed = kind === "attack" && (item === "Binding mismatch" || item === "Execution blocked") && (active || complete);
          return (
            <li key={item} className={`${complete ? "complete" : ""} ${active ? "active" : ""} ${failed ? "failed" : ""}`}>
              <span className="sdk-step-dot" /><span>{item}</span>
              <small>{state === "idle" && index > 0 ? "—" : `${120 + index * 70}ms`}</small>
            </li>
          );
        })}
      </ol>
      <div className={`sdk-demo-result ${state === "done" ? "done" : ""} ${kind === "attack" ? "fail-tone" : ""}`}>
        <span className="sdk-result-symbol">{state === "done" ? (kind === "valid" ? "✓" : "×") : "·"}</span>
        <div>
          <b>{state === "done" ? spec.result : status}</b>
          <small>{state === "done" ? spec.resultCopy : state === "running" ? "Auctorail is checking the request." : "Run the deterministic SDK example."}</small>
        </div>
      </div>
    </section>
  );
}

const installCommand = "npm install ./packages/sdk";
const sdkCode = `import { Auctorail } from "@auctorail/sdk";

const rail = new Auctorail({
  baseUrl: "http://127.0.0.1:8787"
});

const auth = await rail.authorize({
  agent: "invoice-bot",
  amount: "1.00",
  recipient: "0xB38d...22c14",
  reason: "Supplier invoice #4471",
  reference: "INV-4471"
});

console.log(auth.decision); // "ALLOW" | "HOLD" | "BLOCK"

if (auth.allowed && auth.executionToken) {
  const receipt = await rail.execute(auth);
  console.log(receipt);
}`;

export function SdkScreen() {
  const [step, setStep] = useState(0);
  const lines = useMemo(() => sdkCode.split("\n"), []);

  return (
    <main data-testid="sdk-screen">
      <div className="sdk-meta-row">
        <span>DOCS / SDK</span>
        <span>REPO-LOCAL PACKAGE · DEMO MODE</span>
      </div>

      <div className="screen-head">
        <h1>BUILD WITH AUCTORAIL</h1>
        <p>Authorize an agent action in a few lines of code. The SDK talks to the Auctorail authorization API and only hands back execution authority when the exact action is allowed.</p>
      </div>

      <div className="sdk-install">
        <code>$ {installCommand}</code>
        <button type="button" className="btn btn-sm" onClick={() => copy(installCommand)}>COPY</button>
      </div>

      <div className="sdk-workbench">
        <article className="sdk-code-card">
          <header><strong>JAVASCRIPT</strong><button type="button" className="btn btn-ghost btn-sm" onClick={() => copy(sdkCode)}>COPY CODE</button></header>
          <pre>{lines.map((line, index) => <span key={index}><i>{String(index + 1).padStart(2, "0")}</i>{line || " "}</span>)}</pre>
        </article>

        <div>
          <nav aria-label="SDK steps" style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 8, marginBottom: 18 }}>
            {["INITIALIZE", "AUTHORIZE", "EXECUTE"].map((item, index) => (
              <button key={item} type="button" className={`sdk-step-tab ${step === index ? "active" : ""}`} onClick={() => setStep(index)}>
                <b>0{index + 1}</b>
                <span>{item}</span>
              </button>
            ))}
          </nav>
          <MiniSdkDemo kind="valid" />
          <MiniSdkDemo kind="attack" />
        </div>
      </div>

      <div className="card card-pad" style={{ marginTop: 20 }}>
        <span className="eyebrow" style={{ display: "block", marginBottom: 16 }}>HOW IT WORKS</span>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14 }}>
          {[
            { t: "YOUR AGENT", c: "Sends the exact proposed action" },
            { t: "AUCTORAIL SDK", c: "Runs policy + live evidence flow" },
            { t: "AUCTORAIL API", c: "Telegraph, permits, execution" },
            { t: "EXECUTION", c: "Bound external effect, once" }
          ].map((node, index) => (
            <div key={node.t} style={{ position: "relative" }}>
              <span className="mono" style={{ fontSize: 11, color: "var(--accent)" }}>0{index + 1}</span>
              <strong style={{ display: "block", margin: "6px 0 4px", fontSize: 13.5 }}>{node.t}</strong>
              <span style={{ fontSize: 12.5, color: "var(--text-3)" }}>{node.c}</span>
            </div>
          ))}
        </div>
      </div>

      <p style={{ marginTop: 18, fontSize: 12.5, color: "var(--text-3)" }}>
        Public npm release not claimed. <a href="https://github.com/emmy16-glitch/auctorail" target="_blank" rel="noreferrer" style={{ color: "var(--accent)" }}>GitHub ↗</a> · <a href="https://github.com/emmy16-glitch/auctorail#readme" target="_blank" rel="noreferrer" style={{ color: "var(--accent)" }}>Integration guide ↗</a>
      </p>
    </main>
  );
}
