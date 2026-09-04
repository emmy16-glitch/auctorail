import asyncio
import json
from pathlib import Path

from playwright.async_api import async_playwright, expect

BASE_URL = "http://127.0.0.1:4173"
ARTIFACTS = Path("playwright-artifacts")
ARTIFACTS.mkdir(exist_ok=True)

EXPECTED_VENDOR = "0xB38d0405DF1b15961aEf29C7c45f2ED285822c14"


async def assert_tap_target(locator, minimum=44):
    box = await locator.bounding_box()
    assert box is not None, "expected visible control"
    assert box["width"] >= minimum, f"tap target too narrow: {box}"
    assert box["height"] >= minimum, f"tap target too short: {box}"


async def mobile_flow(browser):
    page = await browser.new_page(viewport={"width": 390, "height": 844}, device_scale_factor=1)
    console_errors = []
    page.on("console", lambda message: console_errors.append(message.text) if message.type == "error" else None)

    async def authorize(route):
        payload = json.loads(route.request.post_data or "{}")
        assert payload["mode"] == "live"
        assert payload["agentId"] == "invoice-bot"
        assert payload["limit"] == "5.00"
        assert payload["amount"] == "2.00"
        assert payload["destination"] == EXPECTED_VENDOR
        assert payload["durationSeconds"] == 3600
        assert payload["reason"] == "Supplier invoice #4471"
        assert payload["reference"] == "INV-4471"
        assert route.request.headers.get("idempotency-key")

        await asyncio.sleep(0.45)
        await route.fulfill(
            status=200,
            content_type="application/json",
            body=json.dumps({
                "status": "DECIDED",
                "decision": "ALLOW",
                "reason": "adaptive_policy_allow",
                "riskTier": "MEDIUM",
                "policyId": "payments.adaptive.v1",
                "policyVersion": 1,
                "routing": {"mode": "TELEGRAPH_AUTO_INTENT", "endpoint": "/v1/ask"},
                "action": {
                    "id": "act_qa",
                    "hash": "0xqa",
                    "amount": "2.00",
                    "amountRaw": "2000000",
                    "recipient": EXPECTED_VENDOR,
                    "chainId": 84532,
                    "chain": "Base Sepolia",
                    "asset": "USDC",
                    "reason": "Supplier invoice #4471",
                    "reference": "INV-4471"
                },
                "mandate": {
                    "id": "proofgate-live-mandate",
                    "hash": "0xmandate",
                    "maxPerAction": "5.00",
                    "expiresAt": "2026-09-04T03:00:00.000Z"
                },
                "evidence": {
                    "status": "COMPLETE",
                    "code": "adaptive_evidence_complete",
                    "spendRaw": "1000",
                    "bundleHash": "0xbundle",
                    "rejectedAttempts": 0,
                    "completedIntents": ["FRAUD_DETECTION"]
                }
            })
        )

    await page.route("**/api/authorize", authorize)
    await page.goto(BASE_URL, wait_until="networkidle")

    await expect(page.get_by_text("LIVE", exact=True)).to_be_visible()
    await expect(page.get_by_text("BASE SEPOLIA", exact=True)).to_be_visible()
    await expect(page.get_by_text("REAL MINERS", exact=True)).to_be_visible()
    await expect(page.get_by_role("heading", name="Control what an agent can do.")).to_be_visible()
    await expect(page.get_by_text("invoice-bot", exact=True)).to_be_visible()
    await expect(page.get_by_text("5.00 USDC", exact=True)).to_be_visible()
    await expect(page.get_by_text("1.00 USDC → ProofGate Vendor", exact=True)).to_be_visible()

    body_text = await page.locator("body").inner_text()
    assert "SANDBOX" not in body_text.upper()
    assert "SYNTHETIC" not in body_text.upper()
    assert "DEMO MODE" not in body_text.upper()

    overflow = await page.evaluate("document.documentElement.scrollWidth - document.documentElement.clientWidth")
    assert overflow <= 1, f"horizontal overflow detected: {overflow}px"

    menu = page.get_by_role("button", name="Open menu")
    check = page.get_by_role("button", name="CHECK THIS REQUEST")
    dec_limit = page.get_by_role("button", name="Decrease maximum payment")
    inc_limit = page.get_by_role("button", name="Increase maximum payment")
    dec_duration = page.get_by_role("button", name="Shorten permission duration")
    inc_duration = page.get_by_role("button", name="Extend permission duration")

    for control in [menu, check, dec_limit, inc_limit, dec_duration, inc_duration]:
        await assert_tap_target(control)

    await dec_limit.click()
    await expect(page.get_by_test_id("limit-value")).to_have_text("4.00 USDC")
    await inc_limit.click()
    await expect(page.get_by_test_id("limit-value")).to_have_text("5.00 USDC")

    await dec_duration.click()
    await expect(page.get_by_test_id("duration-value")).to_have_text("30 min")
    await inc_duration.click()
    await expect(page.get_by_test_id("duration-value")).to_have_text("1 hour")

    request_summary = page.get_by_role("button", name="Current request")
    await request_summary.click()
    await expect(page.get_by_test_id("request-editor")).to_be_visible()
    amount_input = page.locator("#request-amount")
    await amount_input.fill("2.00")
    await page.get_by_role("button", name="DONE").click()
    await expect(page.get_by_text("2.00 USDC → ProofGate Vendor", exact=True)).to_be_visible()

    await menu.click()
    await expect(page.get_by_role("menu")).to_be_visible()
    await expect(page.get_by_role("menuitem", name="View source ↗")).to_be_visible()
    await menu.click()
    await expect(page.get_by_role("menu")).to_be_hidden()

    transition = await check.evaluate("el => getComputedStyle(el).transitionDuration")
    assert transition not in ("0s", "0ms", ""), f"primary CTA has no transition: {transition}"

    await check.click()
    checking = page.get_by_role("button", name="CHECKING REAL MINERS")
    await expect(checking).to_be_visible()
    await expect(page.get_by_text("Checking now…", exact=True)).to_be_visible()
    animation_name = await checking.evaluate("el => getComputedStyle(el, '::after').animationName")
    assert animation_name == "loading-scan", f"loading animation missing: {animation_name}"

    await expect(page.get_by_text("ALLOW — decision ready.", exact=True)).to_be_visible(timeout=4000)
    await expect(page.get_by_text("Real Miner evidence was used.", exact=False)).to_be_visible()
    await expect(page.get_by_role("button", name="CHECK AGAIN")).to_be_visible()

    await page.screenshot(path=str(ARTIFACTS / "first-screen-mobile.png"), full_page=True)
    assert not console_errors, f"browser console errors: {console_errors}"
    await page.close()


async def desktop_fit(browser):
    page = await browser.new_page(viewport={"width": 1024, "height": 900})
    await page.goto(BASE_URL, wait_until="networkidle")
    shell = page.locator(".app-page")
    box = await shell.bounding_box()
    assert box is not None
    assert box["width"] <= 462, f"mobile canvas should remain focused on desktop: {box}"
    overflow = await page.evaluate("document.documentElement.scrollWidth - document.documentElement.clientWidth")
    assert overflow <= 1
    await page.screenshot(path=str(ARTIFACTS / "first-screen-desktop-fit.png"), full_page=True)
    await page.close()


async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch()
        try:
            await mobile_flow(browser)
            await desktop_fit(browser)
        finally:
            await browser.close()


if __name__ == "__main__":
    asyncio.run(main())
