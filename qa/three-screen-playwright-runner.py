import asyncio
import importlib.util
import json
from pathlib import Path

from playwright.async_api import async_playwright, expect

MODULE_PATH = Path(__file__).with_name("three-screen-playwright.py")
spec = importlib.util.spec_from_file_location("proofgate_three_screen_qa", MODULE_PATH)
assert spec is not None and spec.loader is not None
qa = importlib.util.module_from_spec(spec)
spec.loader.exec_module(qa)

ORIGINAL_AUTH_RESPONSE = qa.auth_response


def auth_response_with_sources(*args, **kwargs):
    body = ORIGINAL_AUTH_RESPONSE(*args, **kwargs)
    if body["evidence"]["status"] == "COMPLETE":
        body["evidence"]["sources"] = [
            {
                "id": "95822412",
                "name": "Refut On-Chain Risk",
                "slug": "refut-on-chain-risk",
                "intents": ["FRAUD_DETECTION"],
            }
        ]
    return body


qa.auth_response = auth_response_with_sources


async def font_px(locator):
    return float((await qa.css(locator, "font-size")).replace("px", ""))


async def reference_screen3_running(page):
    screen = page.get_by_test_id("execution-screen")
    await expect(screen).to_be_visible()
    await expect(page.get_by_role("heading", name="EXECUTING REQUEST")).to_be_visible()
    await expect(page.get_by_text("STEP 3 OF 3", exact=True)).to_be_visible()
    await expect(page.get_by_text("REQUEST", exact=True)).to_be_visible()
    await expect(page.get_by_text("AUTHORIZATION PASSED", exact=True)).to_be_visible()
    await expect(page.get_by_text("PERMIT ISSUED", exact=True)).to_be_visible()
    await expect(page.get_by_text("EXECUTING ON BASE SEPOLIA", exact=True)).to_be_visible()
    await expect(page.get_by_text("CONFIRMATION PENDING", exact=True)).to_be_visible()
    await expect(page.get_by_text("1.00 USDC → ProofGate Vendor", exact=True)).to_be_visible()
    await expect(page.get_by_text("Policy and Miner checks completed.", exact=True)).to_be_visible()
    await expect(page.get_by_text("Execution permit generated and signed.", exact=True)).to_be_visible()
    await expect(page.get_by_text("Sending the authorized transaction to the network...", exact=True)).to_be_visible()
    await expect(page.get_by_text("Waiting for network confirmation...", exact=True)).to_be_visible()
    await expect(page.get_by_role("button", name="EXECUTION IN PROGRESS")).to_be_disabled()
    await expect(page.get_by_role("button", name="VIEW PROOF")).to_be_disabled()
    await expect(page.get_by_role("button", name="EXECUTE", exact=True)).to_have_count(0)
    await qa.assert_no_overflow(page, "Screen 3 executing")

    hero_family = await qa.css(page.locator(".execution-hero h1"), "font-family")
    detail_family = await qa.css(page.locator(".execution-details dt").first, "font-family")
    assert "Courier New" in hero_family, f"Screen 3 reference hero must use mono, got {hero_family}"
    assert "Courier New" in detail_family, f"Screen 3 operational data must use mono, got {detail_family}"

    mark = page.locator(".execution-hero-mark")
    assert await qa.css(mark, "background-color") == "rgb(193, 239, 211)"
    assert "gradient" not in (await qa.css(mark, "background-image")).lower()

    for stage in ["01", "02", "03", "04"]:
        row = page.locator(f'[data-execution-stage="{stage}"]')
        await expect(row).to_be_visible()
        num = await qa.box(row.locator(".execution-number"))
        assert num["width"] >= 32 and num["height"] >= 29

    spinner = page.locator(".execution-spinner")
    await expect(spinner).to_be_visible()
    assert (await qa.css(spinner, "animation-name")).strip() == "execution-spin"

    await qa.assert_target(page.get_by_role("button", name="EXECUTION IN PROGRESS"))
    await qa.assert_target(page.get_by_role("button", name="VIEW PROOF"))

    body = (await page.locator("body").inner_text()).upper()
    for forbidden in ["SANDBOX", "SYNTHETIC", "FAKE MINER", "DEMO MODE"]:
        assert forbidden not in body, f"forbidden production UI label: {forbidden}"


qa.assert_screen3_running = reference_screen3_running


async def assert_executed_collapsed(page):
    await expect(page.get_by_role("heading", name="PAYMENT EXECUTED")).to_be_visible()
    await expect(page.get_by_text("Payment confirmed.", exact=True)).to_be_visible()
    await expect(page.get_by_text("EXECUTED ON BASE SEPOLIA", exact=True)).to_be_visible()
    await expect(page.get_by_text("CONFIRMED", exact=True)).to_be_visible()
    await expect(page.get_by_text("0.001 USDC", exact=True)).to_be_visible()
    await expect(page.get_by_text("/v1/ask · auto-ranked", exact=True)).to_be_visible()
    await expect(page.get_by_test_id("proof-drawer")).to_have_count(0)

    new_request = page.get_by_role("button", name="NEW REQUEST")
    proof = page.get_by_role("button", name="VIEW PROOF")
    await expect(new_request).to_be_enabled()
    await expect(proof).to_be_enabled()
    await qa.assert_target(new_request)
    await qa.assert_target(proof)
    await qa.assert_no_overflow(page, "Screen 3 executed")


async def open_and_assert_real_proof(page):
    await page.get_by_role("button", name="VIEW PROOF").click()
    drawer = page.get_by_test_id("proof-drawer")
    await expect(drawer).to_be_visible()
    text = (await drawer.inner_text()).upper()
    for required in [
        "VERIFIABLE RECEIPT",
        "REAL",
        "DECISION",
        "ALLOW",
        "POLICY",
        "RISK TIER",
        "LOW",
        "REFUT ON-CHAIN RISK",
        "TELEGRAPH",
        "/V1/ASK",
        "X402 SPEND",
        "TRANSACTION",
    ]:
        assert required in text, f"proof drawer missing {required}"
    assert "COMMITTED IN EVIDENCE BUNDLE" not in text, "real Miner provenance was not surfaced to Screen 3"


async def happy_end_to_end(browser):
    page = await browser.new_page(viewport={"width": 390, "height": 844}, device_scale_factor=1)
    errors = []
    page.on("console", lambda msg: errors.append(msg.text) if msg.type == "error" else None)
    calls = await qa.install_happy_routes(page)
    await page.goto(qa.BASE_URL, wait_until="networkidle")

    await qa.assert_screen1_fidelity(page)
    await page.screenshot(path=str(qa.ARTIFACTS / "screen1-390.png"), full_page=True)
    await page.get_by_role("button", name="CHECK THIS REQUEST").click()

    await expect(page.get_by_text("REAL CHECKS RUNNING", exact=True)).to_be_visible(timeout=2500)
    await qa.assert_screen2_running(page)
    await page.screenshot(path=str(qa.ARTIFACTS / "screen2-checking-390.png"), full_page=True)

    await expect(page.get_by_role("heading", name="EXECUTING REQUEST")).to_be_visible(timeout=3500)
    await reference_screen3_running(page)
    await page.screenshot(path=str(qa.ARTIFACTS / "screen3-executing-390.png"), full_page=True)

    await expect(page.get_by_role("heading", name="PAYMENT EXECUTED")).to_be_visible(timeout=4000)
    await assert_executed_collapsed(page)
    await page.screenshot(path=str(qa.ARTIFACTS / "screen3-executed-390.png"), full_page=True)

    await open_and_assert_real_proof(page)
    await page.screenshot(path=str(qa.ARTIFACTS / "screen3-proof-390.png"), full_page=True)

    assert calls == [("authorize", "policy"), ("authorize", "live"), ("execute", "protected")], calls
    assert not errors, f"browser console errors: {errors}"

    await page.get_by_role("button", name="NEW REQUEST").click()
    await expect(page.get_by_role("heading", name="Control what an agent can do.")).to_be_visible()
    await page.close()


async def prebroadcast_http_error_is_not_called_ambiguous(browser):
    page = await browser.new_page(viewport={"width": 390, "height": 844})
    execution_calls = 0

    async def authorize(route):
        payload = json.loads(route.request.post_data or "{}")
        if payload["mode"] == "policy":
            await route.fulfill(status=200, content_type="application/json", body=json.dumps(
                qa.auth_response(status="REQUIRES_INTELLIGENCE", decision=None)
            ))
            return
        await route.fulfill(status=200, content_type="application/json", body=json.dumps(
            qa.auth_response(status="DECIDED", decision="ALLOW", evidence_status="COMPLETE", with_execution=True)
        ))

    async def execute(route):
        nonlocal execution_calls
        execution_calls += 1
        await route.fulfill(
            status=409,
            content_type="application/json",
            body=json.dumps({"error": "execution_session_expired"}),
        )

    await page.route("**/api/authorize", authorize)
    await page.route("**/api/execute", execute)
    await page.goto(qa.BASE_URL, wait_until="networkidle")
    await page.get_by_role("button", name="CHECK THIS REQUEST").click()

    await expect(page.get_by_role("heading", name="EXECUTION STOPPED")).to_be_visible(timeout=3000)
    await expect(page.get_by_role("heading", name="CONFIRMATION UNCERTAIN")).to_have_count(0)
    await expect(page.get_by_role("button", name="NEW REQUEST")).to_be_enabled()
    await expect(page.get_by_role("button", name="VIEW PROOF")).to_be_disabled()
    assert execution_calls == 1
    await page.close()


async def receipt_verification_failure_stays_ambiguous(browser):
    page = await browser.new_page(viewport={"width": 390, "height": 844})
    execution_calls = 0

    async def authorize(route):
        payload = json.loads(route.request.post_data or "{}")
        if payload["mode"] == "policy":
            await route.fulfill(status=200, content_type="application/json", body=json.dumps(
                qa.auth_response(status="REQUIRES_INTELLIGENCE", decision=None)
            ))
            return
        await route.fulfill(status=200, content_type="application/json", body=json.dumps(
            qa.auth_response(status="DECIDED", decision="ALLOW", evidence_status="COMPLETE", with_execution=True)
        ))

    async def execute(route):
        nonlocal execution_calls
        execution_calls += 1
        await route.fulfill(
            status=500,
            content_type="application/json",
            body=json.dumps({"error": "proof_receipt_verification_failed"}),
        )

    await page.route("**/api/authorize", authorize)
    await page.route("**/api/execute", execute)
    await page.goto(qa.BASE_URL, wait_until="networkidle")
    await page.get_by_role("button", name="CHECK THIS REQUEST").click()

    await expect(page.get_by_role("heading", name="CONFIRMATION UNCERTAIN")).to_be_visible(timeout=3000)
    await expect(page.get_by_role("button", name="RETRY LOCKED")).to_be_disabled()
    await expect(page.get_by_role("button", name="VIEW PROOF")).to_be_disabled()
    assert execution_calls == 1
    await page.close()


async def responsive_screen_flow(browser, width, height):
    page = await browser.new_page(viewport={"width": width, "height": height}, device_scale_factor=1)
    await qa.install_happy_routes(page, live_delay=0.75, execute_delay=0.9)
    await page.goto(qa.BASE_URL, wait_until="networkidle")

    await qa.assert_no_overflow(page, f"Screen 1 {width}px")
    await qa.assert_screen1_fidelity(page)
    if width == 320:
        assert await font_px(page.get_by_role("button", name="CHECK", exact=True)) >= 8.4
        assert await font_px(page.locator(".safety-note p")) >= 9.8
    await page.screenshot(path=str(qa.ARTIFACTS / f"screen1-{width}.png"), full_page=True)

    await page.get_by_role("button", name="CHECK THIS REQUEST").click()
    await expect(page.get_by_text("REAL CHECKS RUNNING", exact=True)).to_be_visible(timeout=2500)
    await qa.assert_no_overflow(page, f"Screen 2 {width}px")
    if width == 320:
        assert await font_px(page.locator(".timeline-copy span").first) >= 8.8
        assert await font_px(page.locator(".checking-work-box p")) >= 8.8
        assert await font_px(page.locator(".checking-safety-note p")) >= 8.8
    await page.screenshot(path=str(qa.ARTIFACTS / f"screen2-checking-{width}.png"), full_page=True)

    await expect(page.get_by_role("heading", name="EXECUTING REQUEST")).to_be_visible(timeout=3500)
    await reference_screen3_running(page)
    await qa.assert_no_overflow(page, f"Screen 3 {width}px")
    if width == 320:
        assert await font_px(page.locator(".execution-row-copy span").first) >= 8.8
        assert await font_px(page.locator(".execution-details dt").first) >= 8.8
        assert await font_px(page.locator(".execution-safety p")) >= 8.8
    await page.screenshot(path=str(qa.ARTIFACTS / f"screen3-executing-{width}.png"), full_page=True)
    await page.close()


async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch()
        try:
            await happy_end_to_end(browser)
            await qa.policy_block_never_executes(browser)
            await qa.live_hold_never_executes(browser)
            await qa.execution_failed_state(browser)
            await qa.ambiguous_never_retries(browser)
            await qa.mismatched_execution_response_fails_closed(browser)
            await prebroadcast_http_error_is_not_called_ambiguous(browser)
            await receipt_verification_failure_stays_ambiguous(browser)

            for width, height in [(320, 800), (360, 800), (430, 932)]:
                await responsive_screen_flow(browser, width, height)

            await qa.screen3_responsive(browser, 1024, 1100)
        finally:
            await browser.close()


if __name__ == "__main__":
    asyncio.run(main())
