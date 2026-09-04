import asyncio
import json

from playwright.async_api import async_playwright, expect

BASE_URL = "http://127.0.0.1:4173"
FREEZE = "0x" + ("f" * 64)
VENDOR = "0xB38d0405DF1b15961aEf29C7c45f2ED285822c14"


def reply(*, fingerprint=FREEZE, status="REQUIRES_INTELLIGENCE", decision=None, evidence="NOT_REQUESTED"):
    return {
        "status": status,
        "decision": decision,
        "reason": "external_intelligence_required" if decision is None else "adaptive_policy_allow",
        "riskTier": "MEDIUM",
        "policyId": "payments.adaptive.v1",
        "policyVersion": 1,
        "freezeFingerprint": fingerprint,
        "action": {
            "id": "act_error_state",
            "hash": "0x" + ("a" * 64),
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
            "hash": "0x" + ("b" * 64),
            "maxPerAction": "5.00",
            "expiresAt": "2026-09-04T04:00:00.000Z",
        },
        "evidence": {"status": evidence, "spendRaw": "0"},
    }


async def assert_no_overflow(page, label):
    overflow = await page.evaluate(
        "document.documentElement.scrollWidth - document.documentElement.clientWidth"
    )
    assert overflow <= 1, f"{label} overflow: {overflow}px"


async def miner_result_mismatch(browser):
    page = await browser.new_page(viewport={"width": 390, "height": 844})

    async def authorize(route):
        payload = json.loads(route.request.post_data or "{}")
        if payload["mode"] == "policy":
            await route.fulfill(
                status=200,
                content_type="application/json",
                body=json.dumps(reply()),
            )
            return

        # A favorable-looking response is deliberately bound to the wrong
        # preflight fingerprint. The UI must fail closed and describe the
        # Miner stage as stopped, never as still running or waiting on rules.
        await route.fulfill(
            status=200,
            content_type="application/json",
            body=json.dumps(
                reply(
                    fingerprint="0x" + ("e" * 64),
                    status="DECIDED",
                    decision="ALLOW",
                    evidence="COMPLETE",
                )
            ),
        )

    await page.route("**/api/authorize", authorize)
    await page.goto(BASE_URL, wait_until="networkidle")
    await page.get_by_role("button", name="CHECK THIS REQUEST").click()

    await expect(page.get_by_text("Stopped safely.", exact=True)).to_be_visible(timeout=2500)
    await expect(page.get_by_text("RULES CHECKED", exact=True)).to_be_visible()
    await expect(page.get_by_text("REAL CHECKS STOPPED", exact=True)).to_be_visible()
    await expect(
        page.get_by_text("Live Miner verification did not produce a trusted result", exact=True)
    ).to_be_visible()
    await expect(page.get_by_text("REAL CHECKS RUNNING", exact=True)).to_have_count(0)
    await expect(page.get_by_text("Waiting for authorization rules", exact=True)).to_have_count(0)
    await expect(page.get_by_text("ALLOW", exact=True)).to_have_count(0)
    await assert_no_overflow(page, "Miner-error state")
    await page.screenshot(path="playwright-artifacts/ui-fidelity-error-390.png", full_page=True)
    await page.close()


async def policy_failure_before_miners(browser):
    page = await browser.new_page(viewport={"width": 390, "height": 844})
    modes = []

    async def authorize(route):
        payload = json.loads(route.request.post_data or "{}")
        modes.append(payload["mode"])
        assert payload["mode"] == "policy", "a failed policy preflight must never dispatch a live Miner request"
        await route.fulfill(
            status=503,
            content_type="application/json",
            body=json.dumps({"error": "policy_backend_unavailable"}),
        )

    await page.route("**/api/authorize", authorize)
    await page.goto(BASE_URL, wait_until="networkidle")
    await page.get_by_role("button", name="CHECK THIS REQUEST").click()

    await expect(page.get_by_text("Stopped safely.", exact=True)).to_be_visible(timeout=2500)
    await expect(page.get_by_text("RULES STOPPED", exact=True)).to_be_visible()
    await expect(page.get_by_text("Authorization rules did not complete", exact=True)).to_be_visible()
    await expect(page.get_by_text("REAL CHECKS NOT STARTED", exact=True)).to_be_visible()
    await expect(page.get_by_text("Rules did not complete, so no Miner call was made", exact=True)).to_be_visible()
    await expect(page.get_by_text("RULES CHECKED", exact=True)).to_have_count(0)
    await expect(page.get_by_text("REAL CHECKS RUNNING", exact=True)).to_have_count(0)
    assert modes == ["policy"], f"live call dispatched after policy failure: {modes}"
    await assert_no_overflow(page, "policy-error state")
    await page.screenshot(path="playwright-artifacts/ui-fidelity-policy-error-390.png", full_page=True)
    await page.close()


async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch()
        try:
            await miner_result_mismatch(browser)
            await policy_failure_before_miners(browser)
        finally:
            await browser.close()


if __name__ == "__main__":
    asyncio.run(main())
