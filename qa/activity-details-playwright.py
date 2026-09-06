import asyncio
import json

from playwright.async_api import async_playwright, expect

BASE_URL = "http://127.0.0.1:4173"
VENDOR = "0xB38d0405DF1b15961aEf29C7c45f2ED285822c14"
FREEZE = "0x" + "f" * 64
ACTION = "0x" + "a" * 64
MANDATE = "0x" + "b" * 64
BUNDLE = "0x" + "c" * 64


def authorization(*, live=False):
    return {
        "status": "DECIDED" if live else "REQUIRES_INTELLIGENCE",
        "decision": "HOLD" if live else None,
        "reason": "adaptive_quorum_insufficient_diversity" if live else "external_intelligence_required",
        "riskTier": "MEDIUM",
        "policyId": "payments.adaptive.v1",
        "policyVersion": 1,
        "freezeFingerprint": FREEZE,
        "routing": {"mode": "TELEGRAPH_AUTO_INTENT", "endpoint": "/v1/ask"},
        "action": {
            "id": "act_activity_qa",
            "hash": ACTION,
            "amount": "6.00",
            "amountRaw": "6000000",
            "recipient": VENDOR,
            "chainId": 84532,
            "chain": "Base Sepolia",
            "asset": "USDC",
            "reason": "Supplier invoice #4471",
            "reference": "INV-4471",
        },
        "mandate": {
            "id": "proofgate-live-mandate",
            "hash": MANDATE,
            "maxPerAction": "6.00",
            "expiresAt": "2026-09-04T15:00:00.000Z",
        },
        "checks": ([
            {
                "name": "fraud_detection_distinct_miners",
                "status": "HOLD",
                "reason": "Only 1 distinct Miner identity was obtained; 2 are required. Duplicate routes never count as independent providers.",
                "code": "adaptive_quorum_insufficient_diversity",
            }
        ] if live else []),
        "evidence": {
            "status": "HOLD" if live else "NOT_REQUESTED",
            "code": "adaptive_evidence_incomplete" if live else None,
            "spendRaw": "1250" if live else "0",
            "bundleHash": BUNDLE if live else None,
            "rejectedAttempts": 1 if live else 0,
            "completedIntents": ["FRAUD_DETECTION"] if live else [],
            "sources": [
                {
                    "id": "95822412",
                    "name": "Refut On-Chain Risk",
                    "slug": "refut-on-chain-risk",
                    "intents": ["FRAUD_DETECTION"],
                }
            ] if live else [],
        },
        "executionAuthorized": False,
        "permit": None,
        "execution": None,
    }


async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch()
        page = await browser.new_page(viewport={"width": 390, "height": 844})
        execute_calls = 0

        async def authorize(route):
            payload = json.loads(route.request.post_data or "{}")
            assert payload["amount"] == "6.00"
            assert payload["limit"] == "6.00"
            if payload["mode"] == "policy":
                await route.fulfill(status=200, content_type="application/json", body=json.dumps(authorization(live=False)))
                return
            assert payload["freezeFingerprint"] == FREEZE
            await route.fulfill(status=200, content_type="application/json", body=json.dumps(authorization(live=True)))

        async def execute(route):
            nonlocal execute_calls
            execute_calls += 1
            await route.fulfill(status=500, content_type="application/json", body=json.dumps({"error": "must_not_execute"}))

        await page.route("**/api/authorize", authorize)
        await page.route("**/api/execute", execute)
        await page.goto(BASE_URL, wait_until="networkidle")

        # Put the proposal truthfully inside the current MEDIUM evidence band (>5 USDC).
        await page.get_by_role("button", name="Increase maximum payment").click()
        await expect(page.get_by_test_id("limit-value")).to_have_text("6.00 USDC")
        await page.get_by_role("button", name="CURRENT REQUEST", exact=False).click()
        await page.get_by_role("button", name="EDIT TEST REQUEST").click()
        await page.locator("#request-amount").fill("6.00")
        await page.get_by_role("button", name="DONE EDITING").click()

        await page.get_by_role("button", name="CHECK THIS REQUEST").click()
        await expect(page.get_by_text("HOLD.", exact=True)).to_be_visible(timeout=2500)
        await expect(page.get_by_text("EVIDENCE INCOMPLETE", exact=True)).to_be_visible()
        assert execute_calls == 0, "HOLD must never call the protected executor"

        await page.get_by_role("button", name="ACTIVITY", exact=True).click()
        await expect(page.get_by_test_id("activity-screen")).to_be_visible()
        activity = page.locator(".activity-card")
        await expect(activity.get_by_text("RECENT ACTIVITY", exact=True)).to_be_visible()
        await expect(activity.get_by_text("6.00 USDC → Auctorail Vendor", exact=True)).to_be_visible()
        await expect(activity.get_by_text("HELD", exact=True)).to_be_visible()

        summary = activity.locator(".activity-summary").first
        await summary.click()
        explanation = activity.locator(".plain-explanation").first
        await expect(explanation.get_by_text("WHAT HAPPENED", exact=True)).to_be_visible()
        await expect(explanation.get_by_text("Only 1 distinct Miner identity was obtained", exact=False)).to_be_visible()
        await expect(explanation.get_by_text("issued no execution permit", exact=False)).to_be_visible()
        await expect(explanation.get_by_text("sent no vendor payment", exact=False)).to_be_visible()

        technical = activity.get_by_role("button", name="VIEW TECHNICAL DETAILS ↓")
        await technical.click()
        drawer = activity.locator(".activity-technical").first
        await expect(drawer).to_be_visible()
        text = (await drawer.inner_text()).upper()
        for required in [
            "DECISION", "HOLD", "ADAPTIVE_QUORUM_INSUFFICIENT_DIVERSITY", "POLICY", "PAYMENTS.ADAPTIVE.V1",
            "RISK TIER", "MEDIUM", "ACTION HASH", "FREEZE FINGERPRINT", "EVIDENCE BUNDLE",
            "REFUT ON-CHAIN RISK", "TELEGRAPH ROUTE", "/V1/ASK", "X402 SPEND", "0.00125 USDC",
            "PERMIT ISSUED", "NO", "EXECUTION AUTHORIZED"
        ]:
            assert required in text, f"technical activity detail missing {required}"

        overflow = await page.evaluate("document.documentElement.scrollWidth - document.documentElement.clientWidth")
        assert overflow <= 1, f"activity detail overflow: {overflow}px"
        await page.screenshot(path="playwright-artifacts/activity-detail-390.png", full_page=True)
        await browser.close()


if __name__ == "__main__":
    asyncio.run(main())
