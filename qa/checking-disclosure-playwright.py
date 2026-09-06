import asyncio
import json
from pathlib import Path

from playwright.async_api import async_playwright, expect

BASE_URL = "http://127.0.0.1:4173"
ARTIFACTS = Path("playwright-artifacts")
ARTIFACTS.mkdir(exist_ok=True)
VENDOR = "0xB38d0405DF1b15961aEf29C7c45f2ED285822c14"
FREEZE = "0x" + ("f" * 64)
ACTION = "0x" + ("a" * 64)
MANDATE = "0x" + ("b" * 64)
BUNDLE = "0x" + ("c" * 64)


def response(*, live=False):
    return {
        "status": "DECIDED" if live else "REQUIRES_INTELLIGENCE",
        "decision": "HOLD" if live else None,
        "reason": "adaptive_required_evidence_missing" if live else "external_intelligence_required",
        "riskTier": "LOW",
        "policyId": "payments.adaptive.v1",
        "policyVersion": 1,
        "freezeFingerprint": FREEZE,
        "routing": {"mode": "TELEGRAPH_AUTO_INTENT", "endpoint": "/v1/ask"},
        "action": {
            "id": "act_hold_disclosure",
            "hash": ACTION,
            "amount": "1.00",
            "amountRaw": "1000000",
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
            "maxPerAction": "5.00",
            "expiresAt": "2026-09-04T18:00:00.000Z",
        },
        "checks": ([
            {
                "name": "adaptive_policy_id",
                "status": "PASS",
                "reason": "Action uses payments.adaptive.v1.",
            },
            {
                "name": "fraud_detection_evidence",
                "status": "HOLD",
                "reason": "Required FRAUD_DETECTION evidence is missing.",
                "code": "adaptive_required_evidence_missing",
            },
        ] if live else []),
        "evidence": {
            "status": "HOLD" if live else "NOT_REQUESTED",
            "code": "adaptive_evidence_incomplete" if live else None,
            "spendRaw": "0",
            "bundleHash": BUNDLE if live else None,
            "rejectedAttempts": 0,
            "completedIntents": [],
            "sources": [],
        },
        "executionAuthorized": False,
        "permit": None,
        "execution": None,
    }


async def no_overflow(page, label):
    overflow = await page.evaluate(
        "document.documentElement.scrollWidth - document.documentElement.clientWidth"
    )
    assert overflow <= 1, f"{label}: horizontal overflow {overflow}px"


async def open_stage(page, number):
    trigger = page.locator(f'[data-stage="{number}"] .timeline-disclosure-trigger')
    await expect(trigger).to_be_visible()
    await trigger.click()
    details = page.get_by_test_id(f"timeline-detail-{number}")
    await expect(details).to_be_visible()
    return details


async def run_hold_flow(browser, width, height, suffix):
    page = await browser.new_page(viewport={"width": width, "height": height}, device_scale_factor=1)
    calls = []
    execution_calls = 0

    async def authorize(route):
        payload = json.loads(route.request.post_data or "{}")
        calls.append(payload["mode"])
        if payload["mode"] == "policy":
            assert "freezeFingerprint" not in payload
            await route.fulfill(status=200, content_type="application/json", body=json.dumps(response(live=False)))
            return
        assert payload["freezeFingerprint"] == FREEZE
        assert route.request.headers.get("idempotency-key")
        await asyncio.sleep(0.12)
        await route.fulfill(status=200, content_type="application/json", body=json.dumps(response(live=True)))

    async def execute(route):
        nonlocal execution_calls
        execution_calls += 1
        await route.abort()

    await page.route("**/api/authorize", authorize)
    await page.route("**/api/execute", execute)
    await page.goto(BASE_URL, wait_until="networkidle")
    await page.get_by_role("button", name="CHECK THIS REQUEST").click()

    await expect(page.get_by_text("HOLD", exact=True)).to_be_visible(timeout=3000)
    await expect(page.get_by_text("RULES CHECKED", exact=True)).to_be_visible()
    await expect(page.get_by_text("EVIDENCE INCOMPLETE", exact=True)).to_be_visible()
    await expect(page.get_by_text("Required authorization evidence did not reach the policy threshold", exact=True)).to_be_visible()
    await expect(page.get_by_text("REAL CHECKS COMPLETE", exact=True)).to_have_count(0)
    await expect(page.get_by_text("Independent Miner evidence collected", exact=True)).to_have_count(0)
    assert calls == ["policy", "live"], calls
    assert execution_calls == 0, "HOLD must never reach /api/execute"

    stage03 = page.locator('[data-stage="03"]')
    bg = await stage03.locator(".timeline-status").evaluate("el => getComputedStyle(el).backgroundColor")
    assert bg == "rgb(255, 240, 168)", f"HOLD evidence stage must be amber, got {bg}"

    detail01 = await open_stage(page, "01")
    await expect(detail01.get_by_text("WHAT HAPPENED", exact=True)).to_be_visible()
    await expect(detail01.locator(".timeline-plain").get_by_text("frozen request snapshot", exact=False)).to_be_visible()

    detail02 = await open_stage(page, "02")
    await expect(detail01).to_have_count(0)
    await expect(detail02.get_by_text("WHY IT PASSED", exact=True)).to_be_visible()
    await expect(detail02.locator(".timeline-plain").get_by_text("1.00 USDC is within the 5.00 USDC permission", exact=False)).to_be_visible()

    detail03 = await open_stage(page, "03")
    await expect(detail02).to_have_count(0)
    await expect(detail03.get_by_text("WHY IT DIDN'T PASS", exact=True)).to_be_visible()
    await expect(detail03.locator(".timeline-plain").get_by_text("Required FRAUD_DETECTION evidence is missing.", exact=False)).to_be_visible()
    await detail03.locator("summary").click()
    technical03 = detail03.locator("dl")
    await expect(technical03.get_by_text("Evidence status", exact=True)).to_be_visible()
    await expect(technical03.get_by_text("HOLD", exact=True)).to_be_visible()
    await expect(technical03.get_by_text("Miner sources", exact=True)).to_be_visible()
    await expect(technical03.get_by_text("None recorded", exact=True)).to_be_visible()
    await expect(technical03.get_by_text("x402 spend", exact=True)).to_be_visible()
    await expect(technical03.get_by_text("0 USDC", exact=True)).to_be_visible()
    await expect(technical03.get_by_text("Completed intents", exact=True)).to_be_visible()
    await expect(technical03.get_by_text("None", exact=True)).to_be_visible()
    await expect(technical03.get_by_text("HOLD · Required FRAUD_DETECTION evidence is missing.", exact=True)).to_be_visible()

    detail04 = await open_stage(page, "04")
    await expect(detail03).to_have_count(0)
    await expect(detail04.get_by_text("WHAT HOLD MEANS", exact=True)).to_be_visible()
    await expect(detail04.locator(".timeline-plain").get_by_text("issued no execution permit", exact=False)).to_be_visible()
    await detail04.locator("summary").click()
    await expect(detail04.get_by_text("adaptive_required_evidence_missing", exact=True)).to_be_visible()
    await expect(detail04.get_by_text("Execution authorized", exact=True)).to_be_visible()
    await expect(detail04.get_by_text("NO", exact=True).last).to_be_visible()
    await no_overflow(page, f"expanded HOLD timeline {width}px")
    await page.screenshot(path=str(ARTIFACTS / f"checking-hold-expanded-{suffix}.png"), full_page=True)

    await page.get_by_role("button", name="ACTIVITY", exact=True).click()
    await expect(page.get_by_test_id("activity-screen")).to_be_visible()
    activity = page.locator(".activity-item.status-held").first
    await expect(activity).to_be_visible()
    await expect(activity.get_by_text("1.00 USDC → Auctorail Vendor", exact=True)).to_be_visible()
    await activity.locator(".activity-summary").click()
    await expect(activity.locator(".plain-explanation").get_by_text("Required FRAUD_DETECTION evidence is missing.", exact=False)).to_be_visible()
    await activity.get_by_role("button", name="VIEW TECHNICAL DETAILS ↓").click()
    technical = activity.locator(".activity-technical")
    await expect(technical.get_by_text("adaptive_required_evidence_missing", exact=True)).to_be_visible()
    await expect(technical.get_by_text("Evidence", exact=True)).to_be_visible()
    await expect(technical.locator('dd[title="HOLD"]').first).to_be_visible()
    await expect(technical.get_by_text("Miner sources", exact=True)).to_be_visible()
    await expect(technical.get_by_text("None recorded", exact=True)).to_be_visible()
    await expect(technical.get_by_text("x402 spend", exact=True)).to_be_visible()
    await expect(technical.get_by_text("0 USDC", exact=True)).to_be_visible()
    await expect(technical.get_by_text("Permit issued", exact=True)).to_be_visible()
    await expect(technical.get_by_text("Execution authorized", exact=True)).to_be_visible()
    await no_overflow(page, f"Activity synced HOLD {width}px")
    await page.screenshot(path=str(ARTIFACTS / f"activity-hold-synced-{suffix}.png"), full_page=True)
    await page.close()


async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch()
        try:
            await run_hold_flow(browser, 390, 844, "390")
            await run_hold_flow(browser, 320, 800, "320")
        finally:
            await browser.close()


if __name__ == "__main__":
    asyncio.run(main())
