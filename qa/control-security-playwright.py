import asyncio
import json
from pathlib import Path

from playwright.async_api import async_playwright, expect

BASE_URL = "http://127.0.0.1:4173"
ARTIFACTS = Path("playwright-artifacts")
ARTIFACTS.mkdir(exist_ok=True)

REPORT = {
    "schemaVersion": "proofgate.attack-lab.v1",
    "mode": "OFFLINE_DETERMINISTIC",
    "policyId": "payments.attested-vendor.v1",
    "baselineDecision": "ALLOW",
    "passed": 10,
    "total": 10,
    "allPassed": True,
    "scenarios": [
        {"id": "baseline", "attack": "Valid exact permit/action executes once.", "expected": "EXECUTED:1", "observed": "EXECUTED:1", "passed": True},
        {"id": "permit_replay", "attack": "Replay a consumed permit.", "expected": "permit_already_consumed:1", "observed": "permit_already_consumed:1", "passed": True},
        {"id": "amount_mutation", "attack": "Change 1 USDC to 2 USDC after authorization.", "expected": "action_hash_mismatch", "observed": "action_hash_mismatch", "passed": True},
        {"id": "evidence_subject_swap", "attack": "Replace exact vendor evidence with evidence for another address.", "expected": "evidence_binding_mismatch", "observed": "evidence_binding_mismatch", "passed": True},
        {"id": "permit_forgery", "attack": "Forge the permit signature.", "expected": "invalid_permit_signature", "observed": "invalid_permit_signature", "passed": True},
        {"id": "expired_permit", "attack": "Use a permit after its TTL.", "expected": "permit_expired", "observed": "permit_expired", "passed": True},
        {"id": "decision_tamper", "attack": "Alter the authorization decision after permit mint.", "expected": "decision_hash_mismatch", "observed": "decision_hash_mismatch", "passed": True},
        {"id": "mandate_substitution", "attack": "Rebind a permit to another mandate version.", "expected": "mandate_hash_mismatch", "observed": "mandate_hash_mismatch", "passed": True},
        {"id": "negative_miner", "attack": "Give runtime proof but a negative Telegraph verdict.", "expected": "BLOCK:miner_result", "observed": "BLOCK:miner_result", "passed": True},
        {"id": "runtime_attestation_tamper", "attack": "Alter pinned runtime evidence while Telegraph still says ALLOW.", "expected": "BLOCK:vendor_runtime_attestation", "observed": "BLOCK:vendor_runtime_attestation", "passed": True},
        {"id": "receipt_tamper", "attack": "Alter transaction hash inside a completed Proof Receipt.", "expected": "false", "observed": "false", "passed": True},
    ],
}


async def no_overflow(page, label):
    overflow = await page.evaluate("document.documentElement.scrollWidth - document.documentElement.clientWidth")
    assert overflow <= 1, f"{label}: horizontal overflow {overflow}px"


async def target(locator, minimum=44):
    box = await locator.bounding_box()
    assert box is not None
    assert box["width"] >= minimum and box["height"] >= minimum, box


async def install_security_route(page):
    async def security(route):
        assert route.request.method == "POST"
        assert json.loads(route.request.post_data or "{}") == {}
        await asyncio.sleep(0.18)
        await route.fulfill(status=200, content_type="application/json", body=json.dumps(REPORT))
    await page.route("**/api/security-lab", security)


async def run_surface_flow(browser, width, height, suffix):
    page = await browser.new_page(viewport={"width": width, "height": height}, device_scale_factor=1)
    errors = []
    page.on("console", lambda msg: errors.append(msg.text) if msg.type == "error" else None)
    await install_security_route(page)
    await page.goto(BASE_URL, wait_until="networkidle")

    # Final mobile IA: four primary product surfaces. SDK remains out of the top tab row.
    for label in ["CHECK", "ACTIVITY", "PERMISSIONS", "SECURITY LAB"]:
        button = page.get_by_role("button", name=label, exact=True)
        await expect(button).to_be_visible()
        await target(button, minimum=30)
    await expect(page.get_by_role("button", name="CONTROL", exact=True)).to_have_count(0)
    await no_overflow(page, f"Primary navigation {width}px")

    # Current request is readable first; editing is explicitly test-only and the amount controls work at 1 USDC.
    request = page.get_by_role("button", name="CURRENT REQUEST", exact=False)
    await request.click()
    await expect(page.get_by_text("AGENT REQUEST", exact=True)).to_be_visible()
    await expect(page.get_by_text("Editing below is only a hackathon/test control.", exact=False)).to_be_visible()
    await expect(page.get_by_test_id("locked-recipient")).to_be_visible()
    await expect(page.get_by_role("combobox", name="Allowed recipient")).to_have_count(0)
    await page.get_by_role("button", name="EDIT TEST REQUEST").click()
    await expect(page.get_by_test_id("test-request-editor")).to_be_visible()
    decrease = page.get_by_role("button", name="Decrease request amount")
    await expect(decrease).to_be_enabled()
    await decrease.click()
    await expect(page.locator("#request-amount")).to_have_value("0.01")
    await page.get_by_role("button", name="Increase request amount").click()
    await expect(page.locator("#request-amount")).to_have_value("1.01")
    await page.locator("#request-amount").fill("1.00")
    await page.get_by_role("button", name="DONE EDITING").click()

    # Permissions is standing authority only; request history is no longer mixed into this screen.
    await page.get_by_role("button", name="PERMISSIONS", exact=True).click()
    await expect(page.get_by_test_id("permissions-screen")).to_be_visible()
    await expect(page.get_by_role("heading", name="Bound invoice-bot.")).to_be_visible()
    await expect(page.get_by_text("STANDING AUTHORITY", exact=True)).to_be_visible()
    await expect(page.get_by_text("AGENT PERMISSION", exact=True)).to_be_visible()
    await expect(page.get_by_text("ALLOWED RECIPIENT", exact=True)).to_be_visible()
    await expect(page.get_by_text("PINNED", exact=True)).to_be_visible()
    await expect(page.get_by_text("RECENT ACTIVITY", exact=True)).to_have_count(0)
    await no_overflow(page, f"Permissions {width}px")

    hero_family = await page.locator(".control-hero h1").evaluate("el => getComputedStyle(el).fontFamily")
    mono_family = await page.locator(".control-card-head strong").evaluate("el => getComputedStyle(el).fontFamily")
    assert "Arial" in hero_family or "Helvetica" in hero_family
    assert "Courier New" in mono_family
    assert await page.locator(".control-state.active").evaluate("el => getComputedStyle(el).backgroundColor") == "rgb(193, 239, 211)"

    edit_buttons = page.get_by_role("button", name="EDIT", exact=True)
    assert await edit_buttons.nth(0).evaluate("el => getComputedStyle(el).backgroundColor") == "rgb(255, 243, 196)"

    # Permission edits change the same React state CHECK consumes; no hidden DOM bridge.
    await edit_buttons.nth(0).click()
    await page.get_by_role("button", name="Increase permission limit").click()
    await expect(page.get_by_test_id("permission-limit-editor").locator("output")).to_have_text("6.00 USDC")
    await edit_buttons.nth(1).click()
    await page.get_by_role("button", name="Extend permission duration").click()
    await expect(page.get_by_test_id("permission-duration-editor").locator("output")).to_have_text("2 hours")

    revoke = page.get_by_role("button", name="REVOKE FOR NEW REQUESTS")
    await target(revoke)
    assert await revoke.evaluate("el => getComputedStyle(el).backgroundColor") == "rgb(255, 240, 240)"
    await revoke.click()
    await expect(page.locator(".control-state.revoked")).to_have_text("REVOKED")
    await page.screenshot(path=str(ARTIFACTS / f"permissions-{suffix}.png"), full_page=True)

    await page.get_by_role("button", name="CHECK", exact=True).click()
    check = page.get_by_role("button", name="CHECK THIS REQUEST")
    await expect(check).to_be_disabled()
    await expect(page.get_by_test_id("limit-value")).to_have_text("6.00 USDC")
    await expect(page.get_by_test_id("duration-value")).to_have_text("2 hours")

    await page.get_by_role("button", name="PERMISSIONS", exact=True).click()
    await page.get_by_role("button", name="RESTORE PERMISSION").click()
    await page.get_by_role("button", name="CHECK", exact=True).click()
    await expect(check).to_be_enabled()

    # Activity is a separate truthful session-history surface.
    await page.get_by_role("button", name="ACTIVITY", exact=True).click()
    await expect(page.get_by_test_id("activity-screen")).to_be_visible()
    await expect(page.get_by_role("heading", name="What happened.")).to_be_visible()
    await expect(page.get_by_text("RECENT ACTIVITY", exact=True)).to_be_visible()
    await expect(page.get_by_text("THIS SESSION", exact=True)).to_be_visible()
    await expect(page.get_by_text("No activity yet.", exact=True)).to_be_visible()
    await expect(page.get_by_text("Session history is not the receipt store.", exact=True)).to_be_visible()
    await expect(page.get_by_text("AGENT PERMISSION", exact=True)).to_have_count(0)
    await no_overflow(page, f"Activity {width}px")
    await page.screenshot(path=str(ARTIFACTS / f"activity-empty-{suffix}.png"), full_page=True)

    # Security Lab remains isolated, real and clear about its offline attack harness.
    await page.get_by_role("button", name="SECURITY LAB", exact=True).click()
    await expect(page.get_by_test_id("security-lab-screen")).to_be_visible()
    await expect(page.get_by_role("heading", name="Try to break ProofGate.")).to_be_visible()
    await expect(page.get_by_text("SECURITY LAB · OFFLINE", exact=True)).to_be_visible()
    await expect(page.get_by_text("0 USDC", exact=True)).to_be_visible()
    await expect(page.get_by_text("NOT CALLED", exact=True)).to_be_visible()
    await expect(page.get_by_text("ATTACK SURFACE", exact=True)).to_be_visible()
    await no_overflow(page, f"Security Lab initial {width}px")

    assert await page.locator(".security-group.purple").evaluate("el => getComputedStyle(el).backgroundColor") == "rgb(230, 213, 255)"
    run = page.get_by_role("button", name="RUN ATTACK SUITE")
    await target(run)
    assert await run.evaluate("el => getComputedStyle(el).backgroundColor") == "rgb(214, 187, 255)"
    await run.click()
    await expect(page.get_by_text("RUNNING ATTACK SUITE...", exact=True)).to_be_visible()
    await expect(page.get_by_text("GATE HELD", exact=True)).to_be_visible(timeout=2500)
    await expect(page.get_by_text("10/10", exact=True)).to_be_visible()
    await expect(page.get_by_test_id("security-baseline")).to_be_visible()
    await expect(page.get_by_text("EXECUTED ONCE", exact=True)).to_be_visible()
    await expect(page.get_by_text("OFFLINE DETERMINISTIC", exact=True)).to_be_visible()
    await expect(page.get_by_text("payments.attested-vendor.v1", exact=True)).to_be_visible()
    await expect(page.get_by_text("STOPPED", exact=True)).to_have_count(10)
    await no_overflow(page, f"Security Lab result {width}px")
    await page.screenshot(path=str(ARTIFACTS / f"security-lab-{suffix}.png"), full_page=True)

    assert not errors, errors
    await page.close()


async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch()
        try:
            await run_surface_flow(browser, 390, 844, "390")
            await run_surface_flow(browser, 320, 800, "320")
            await run_surface_flow(browser, 430, 932, "430")
        finally:
            await browser.close()


if __name__ == "__main__":
    asyncio.run(main())
