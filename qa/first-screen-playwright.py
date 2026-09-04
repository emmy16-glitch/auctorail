import asyncio
import json
from pathlib import Path

from playwright.async_api import async_playwright, expect

BASE_URL = "http://127.0.0.1:4173"
ARTIFACTS = Path("playwright-artifacts")
ARTIFACTS.mkdir(exist_ok=True)

EXPECTED_VENDOR = "0xB38d0405DF1b15961aEf29C7c45f2ED285822c14"


def common_response(*, status, decision, amount="2.00", evidence_status="NOT_REQUESTED"):
    return {
        "status": status,
        "decision": decision,
        "reason": "external_intelligence_required" if decision is None else "adaptive_policy_allow",
        "riskTier": "MEDIUM",
        "policyId": "payments.adaptive.v1",
        "policyVersion": 1,
        "routing": {"mode": "TELEGRAPH_AUTO_INTENT", "endpoint": "/v1/ask"},
        "action": {
            "id": "act_qa",
            "hash": "0xqa",
            "amount": amount,
            "amountRaw": str(int(float(amount) * 1_000_000)),
            "recipient": EXPECTED_VENDOR,
            "chainId": 84532,
            "chain": "Base Sepolia",
            "asset": "USDC",
            "reason": "Supplier invoice #4471",
            "reference": "INV-4471",
        },
        "mandate": {
            "id": "proofgate-live-mandate",
            "hash": "0xmandate",
            "maxPerAction": "5.00",
            "expiresAt": "2026-09-04T03:00:00.000Z",
        },
        "evidence": {
            "status": evidence_status,
            "code": "adaptive_evidence_complete" if evidence_status == "COMPLETE" else None,
            "spendRaw": "1000" if evidence_status == "COMPLETE" else "0",
            "bundleHash": "0xbundle" if evidence_status == "COMPLETE" else None,
            "rejectedAttempts": 0,
            "completedIntents": ["FRAUD_DETECTION"] if evidence_status == "COMPLETE" else [],
        },
    }


async def assert_tap_target(locator, minimum=44):
    box = await locator.bounding_box()
    assert box is not None, "expected visible control"
    assert box["width"] >= minimum, f"tap target too narrow: {box}"
    assert box["height"] >= minimum, f"tap target too short: {box}"


async def assert_box(locator, *, width=None, height=None, tolerance=2):
    box = await locator.bounding_box()
    assert box is not None, "expected visible element"
    if width is not None:
        assert abs(box["width"] - width) <= tolerance, f"unexpected width {box}; expected ~{width}px"
    if height is not None:
        assert abs(box["height"] - height) <= tolerance, f"unexpected height {box}; expected ~{height}px"
    return box


async def assert_two_line_block(locator, slack=2.25):
    metrics = await locator.evaluate(
        """el => {
            const style = getComputedStyle(el);
            return {
              height: el.getBoundingClientRect().height,
              lineHeight: parseFloat(style.lineHeight),
              fontSize: parseFloat(style.fontSize)
            };
        }"""
    )
    assert metrics["height"] <= metrics["lineHeight"] * slack, (
        f"text soft-wrapped beyond two lines: {metrics}"
    )


async def reference_state_checks(page):
    await expect(page.get_by_text("LIVE", exact=True)).to_be_visible()
    await expect(page.get_by_text("BASE SEPOLIA", exact=True)).to_be_visible()
    await expect(page.get_by_text("REAL MINERS", exact=True)).to_be_visible()
    await expect(page.get_by_role("heading", name="Control what an agent can do.")).to_be_visible()
    await expect(page.get_by_text("invoice-bot", exact=True)).to_be_visible()
    await expect(page.get_by_text("5.00 USDC", exact=True)).to_be_visible()
    await expect(page.get_by_text("1.00 USDC → ProofGate Vendor", exact=True)).to_be_visible()
    await expect(page.get_by_text("Nothing is sent yet.", exact=True)).to_be_visible()

    body_text = await page.locator("body").inner_text()
    assert "SANDBOX" not in body_text.upper()
    assert "SYNTHETIC" not in body_text.upper()
    assert "DEMO MODE" not in body_text.upper()

    overflow = await page.evaluate("document.documentElement.scrollWidth - document.documentElement.clientWidth")
    assert overflow <= 1, f"horizontal overflow detected: {overflow}px"

    live_color = await page.locator(".live-strip").evaluate("el => getComputedStyle(el).backgroundColor")
    cta_color = await page.locator(".check-button").evaluate("el => getComputedStyle(el).backgroundColor")
    paper_color = await page.locator(".app-page").evaluate("el => getComputedStyle(el).backgroundColor")
    assert live_color == "rgb(193, 239, 211)", f"mint mismatch: {live_color}"
    assert cta_color == "rgb(255, 199, 44)", f"yellow mismatch: {cta_color}"
    assert paper_color == "rgb(250, 250, 250)", f"paper mismatch: {paper_color}"

    brand_family = await page.locator(".brand-lockup strong").evaluate("el => getComputedStyle(el).fontFamily")
    mono_family = await page.locator(".brand-lockup span").evaluate("el => getComputedStyle(el).fontFamily")
    assert "Arial" in brand_family or "Helvetica" in brand_family, f"brand should use heavy sans: {brand_family}"
    assert "Courier New" in mono_family, f"subtitle should use reference mono face: {mono_family}"

    await assert_two_line_block(page.locator(".hero-block h1"))
    await assert_two_line_block(page.locator(".hero-block p"))

    await assert_box(page.locator(".live-strip"), height=27, tolerance=1)
    await assert_box(page.locator(".brand-row"), height=60, tolerance=2)
    await assert_box(page.locator(".top-tabs"), height=32, tolerance=2)
    await assert_box(page.get_by_role("button", name="Open menu"), width=44, height=44, tolerance=1)
    await assert_box(page.locator(".check-button"), height=52, tolerance=2)

    hero_box = await page.locator(".hero-block h1").bounding_box()
    assert hero_box is not None and 18 <= hero_box["x"] <= 22, f"hero left gutter drifted: {hero_box}"

    panel_box = await page.locator(".authority-panel").bounding_box()
    request_box = await page.locator(".request-panel").bounding_box()
    assert panel_box is not None and 250 <= panel_box["height"] <= 285, f"permission card scale drifted: {panel_box}"
    assert request_box is not None and 92 <= request_box["height"] <= 104, f"request card scale drifted: {request_box}"

    page_height = await page.evaluate("document.documentElement.scrollHeight")
    assert page_height <= 875, f"reference first screen became vertically stretched: {page_height}px"


async def second_screen_reference_checks(page):
    await expect(page.get_by_role("heading", name="CHECKING REQUEST")).to_be_visible()
    await expect(page.get_by_text("REQUEST RECEIVED", exact=True)).to_be_visible()
    await expect(page.get_by_text("RULES CHECKED", exact=True)).to_be_visible()
    await expect(page.get_by_text("REAL CHECKS RUNNING", exact=True)).to_be_visible()
    await expect(page.get_by_text("DECISION", exact=True)).to_be_visible()
    await expect(page.get_by_text("Independent checks with real miners and policy engine", exact=True)).to_be_visible()
    await expect(page.get_by_text("PENDING", exact=True)).to_be_visible()

    body_text = await page.locator("body").inner_text()
    assert "TEN ORDERED CHECKS" not in body_text.upper(), "UI must not invent a fixed check count"
    assert "NO PAYMENT IS MADE." not in body_text.upper(), "UI must not hide real x402 verification fees"
    assert "BOUNDED X402 VERIFICATION FEES" in body_text.upper(), "live x402 cost disclosure is missing"

    overflow = await page.evaluate("document.documentElement.scrollWidth - document.documentElement.clientWidth")
    assert overflow <= 1, f"second screen overflow detected: {overflow}px"

    await assert_box(page.get_by_test_id("checking-screen"), width=390, tolerance=2)
    for selector in ["01", "02", "03", "04"]:
        number = page.locator(f'[data-stage="{selector}"] .timeline-number')
        box = await number.bounding_box()
        assert box is not None and box["width"] >= 38 and box["height"] >= 38

    spinner = page.locator(".timeline-running .status-spinner")
    await expect(spinner).to_be_visible()
    animation_name = await spinner.evaluate("el => getComputedStyle(el).animationName")
    assert animation_name == "proofgate-spin", f"real-check spinner missing: {animation_name}"


async def mobile_flow(browser):
    page = await browser.new_page(viewport={"width": 390, "height": 844}, device_scale_factor=1)
    console_errors = []
    call_modes = []
    page.on("console", lambda message: console_errors.append(message.text) if message.type == "error" else None)

    async def authorize(route):
        payload = json.loads(route.request.post_data or "{}")
        mode = payload["mode"]
        call_modes.append(mode)
        assert payload["agentId"] == "invoice-bot"
        assert payload["limit"] == "5.00"
        assert payload["amount"] == "2.00"
        assert payload["destination"] == EXPECTED_VENDOR
        assert payload["durationSeconds"] == 3600
        assert payload["reason"] == "Supplier invoice #4471"
        assert payload["reference"] == "INV-4471"

        if mode == "policy":
            assert not route.request.headers.get("idempotency-key")
            await asyncio.sleep(0.12)
            await route.fulfill(
                status=200,
                content_type="application/json",
                body=json.dumps(common_response(status="REQUIRES_INTELLIGENCE", decision=None)),
            )
            return

        assert mode == "live"
        assert route.request.headers.get("idempotency-key")
        await asyncio.sleep(0.75)
        await route.fulfill(
            status=200,
            content_type="application/json",
            body=json.dumps(common_response(status="DECIDED", decision="ALLOW", evidence_status="COMPLETE")),
        )

    await page.route("**/api/authorize", authorize)
    await page.goto(BASE_URL, wait_until="networkidle")

    await reference_state_checks(page)
    await page.screenshot(path=str(ARTIFACTS / "first-screen-idle-mobile.png"), full_page=True)

    menu = page.get_by_role("button", name="Open menu")
    check = page.get_by_role("button", name="CHECK THIS REQUEST")
    dec_limit = page.get_by_role("button", name="Decrease maximum payment")
    inc_limit = page.get_by_role("button", name="Increase maximum payment")
    dec_duration = page.get_by_role("button", name="Shorten permission duration")
    inc_duration = page.get_by_role("button", name="Extend permission duration")
    recipient = page.locator("#allowed-recipient")

    for control in [menu, check, dec_limit, inc_limit, dec_duration, inc_duration, recipient]:
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
    await expect(page.get_by_role("heading", name="CHECKING REQUEST")).to_be_visible()
    await expect(page.get_by_text("RULES CHECKED", exact=True)).to_be_visible(timeout=2500)
    await expect(page.get_by_text("REAL CHECKS RUNNING", exact=True)).to_be_visible(timeout=2500)
    await second_screen_reference_checks(page)

    cancel = page.get_by_role("button", name="CANCEL CHECK")
    await expect(cancel).to_be_disabled()
    assert "real Miner request" in (await cancel.get_attribute("title") or "")

    await page.screenshot(path=str(ARTIFACTS / "second-screen-checking-mobile.png"), full_page=True)

    await expect(page.get_by_text("ALLOW", exact=True)).to_be_visible(timeout=4000)
    await expect(page.get_by_text("REAL CHECKS COMPLETE", exact=True)).to_be_visible()
    await expect(page.get_by_text("All required checks completed", exact=True)).to_be_visible()
    await expect(page.get_by_role("button", name="BACK TO REQUEST")).to_be_enabled()
    await expect(page.get_by_text("The requested payment has not been executed.", exact=False)).to_be_visible()

    await page.screenshot(path=str(ARTIFACTS / "second-screen-decision-mobile.png"), full_page=True)
    assert call_modes == ["policy", "live"], f"expected policy preflight then live Telegraph call, got {call_modes}"

    await page.get_by_role("button", name="BACK TO REQUEST").click()
    await expect(page.get_by_role("heading", name="Control what an agent can do.")).to_be_visible()

    assert not console_errors, f"browser console errors: {console_errors}"
    await page.close()


async def policy_block_short_circuit(browser):
    page = await browser.new_page(viewport={"width": 390, "height": 844}, device_scale_factor=1)
    call_modes = []

    async def authorize(route):
        payload = json.loads(route.request.post_data or "{}")
        call_modes.append(payload["mode"])
        assert payload["mode"] == "policy", "blocked preflight must never reach a paid live call"
        body = common_response(status="BLOCKED", decision="BLOCK", amount="1.00")
        body["reason"] = "mandate_destination_not_allowed"
        await route.fulfill(status=200, content_type="application/json", body=json.dumps(body))

    await page.route("**/api/authorize", authorize)
    await page.goto(BASE_URL, wait_until="networkidle")
    await page.get_by_role("button", name="CHECK THIS REQUEST").click()

    await expect(page.get_by_text("REAL CHECKS NOT NEEDED", exact=True)).to_be_visible(timeout=2000)
    await expect(page.get_by_text("Rules blocked this request before any Miner call", exact=True)).to_be_visible()
    await expect(page.get_by_text("BLOCK", exact=True)).to_be_visible()
    assert call_modes == ["policy"], f"paid live call occurred after rules-level block: {call_modes}"
    await page.screenshot(path=str(ARTIFACTS / "second-screen-policy-block-mobile.png"), full_page=True)
    await page.close()


async def narrow_mobile_fit(browser):
    page = await browser.new_page(viewport={"width": 320, "height": 800}, device_scale_factor=1)
    await page.goto(BASE_URL, wait_until="networkidle")
    overflow = await page.evaluate("document.documentElement.scrollWidth - document.documentElement.clientWidth")
    assert overflow <= 1, f"320px viewport overflow: {overflow}px"
    await assert_two_line_block(page.locator(".hero-block h1"), slack=2.35)
    for control in [
        page.get_by_role("button", name="Open menu"),
        page.get_by_role("button", name="Decrease maximum payment"),
        page.get_by_role("button", name="Increase maximum payment"),
        page.get_by_role("button", name="Shorten permission duration"),
        page.get_by_role("button", name="Extend permission duration"),
        page.get_by_role("button", name="CHECK THIS REQUEST"),
    ]:
        await assert_tap_target(control)
    await page.screenshot(path=str(ARTIFACTS / "first-screen-320-mobile.png"), full_page=True)
    await page.close()


async def narrow_checking_fit(browser):
    page = await browser.new_page(viewport={"width": 320, "height": 800}, device_scale_factor=1)

    async def authorize(route):
        payload = json.loads(route.request.post_data or "{}")
        if payload["mode"] == "policy":
            await route.fulfill(
                status=200,
                content_type="application/json",
                body=json.dumps(common_response(status="REQUIRES_INTELLIGENCE", decision=None, amount="1.00")),
            )
            return
        await asyncio.sleep(0.45)
        await route.fulfill(
            status=200,
            content_type="application/json",
            body=json.dumps(common_response(status="DECIDED", decision="ALLOW", amount="1.00", evidence_status="COMPLETE")),
        )

    await page.route("**/api/authorize", authorize)
    await page.goto(BASE_URL, wait_until="networkidle")
    await page.get_by_role("button", name="CHECK THIS REQUEST").click()
    await expect(page.get_by_text("REAL CHECKS RUNNING", exact=True)).to_be_visible(timeout=2000)
    overflow = await page.evaluate("document.documentElement.scrollWidth - document.documentElement.clientWidth")
    assert overflow <= 1, f"320px checking-screen overflow: {overflow}px"
    await page.screenshot(path=str(ARTIFACTS / "second-screen-320-mobile.png"), full_page=True)
    await expect(page.get_by_text("ALLOW", exact=True)).to_be_visible(timeout=3000)
    await page.close()


async def desktop_fit(browser):
    page = await browser.new_page(viewport={"width": 1024, "height": 1100})
    await page.goto(BASE_URL, wait_until="networkidle")
    shell = page.locator(".app-page")
    box = await shell.bounding_box()
    assert box is not None
    assert 458 <= box["width"] <= 462, f"desktop mobile canvas width drifted: {box}"
    overflow = await page.evaluate("document.documentElement.scrollWidth - document.documentElement.clientWidth")
    assert overflow <= 1
    await page.screenshot(path=str(ARTIFACTS / "first-screen-idle-desktop.png"), full_page=True)
    await page.close()


async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch()
        try:
            await mobile_flow(browser)
            await policy_block_short_circuit(browser)
            await narrow_mobile_fit(browser)
            await narrow_checking_fit(browser)
            await desktop_fit(browser)
        finally:
            await browser.close()


if __name__ == "__main__":
    asyncio.run(main())
