import React, { useState } from "react";
import { ContentTrustScreen } from "./ContentTrustScreen";
import { VerifyScreen } from "./VerifyScreen";

type TrustTab = "content" | "verify";

export function TrustScreen({ initialTab = "content" }: { initialTab?: TrustTab }) {
  const [tab, setTab] = useState<TrustTab>(initialTab);
  const [receiptInput, setReceiptInput] = useState("");

  return (
    <div className="trust-screen" data-testid="trust-screen">
      <div className="trust-tabs" role="tablist" aria-label="Auctorail trust">
        <button
          type="button"
          role="tab"
          aria-selected={tab === "content"}
          className={`trust-tab ${tab === "content" ? "active" : ""}`}
          onClick={() => setTab("content")}
        >
          <span className="tt-num" aria-hidden="true">01</span>
          CHECK CONTENT
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === "verify"}
          className={`trust-tab ${tab === "verify" ? "active" : ""}`}
          onClick={() => setTab("verify")}
        >
          <span className="tt-num" aria-hidden="true">02</span>
          VERIFY RECEIPT
        </button>
      </div>
      {tab === "content" ? (
        <ContentTrustScreen
          onVerifyReceipt={(input) => {
            setReceiptInput(input);
            setTab("verify");
          }}
        />
      ) : (
        <VerifyScreen initialInput={receiptInput} />
      )}
    </div>
  );
}
