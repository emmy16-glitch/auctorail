import asyncio
import json
from pathlib import Path

from playwright.async_api import async_playwright, expect

BASE_URL = "http://127.0.0.1:4173"
ARTIFACTS = Path("playwright-artifacts")
ARTIFACTS.mkdir(exist_ok=True)

VENDOR = "0xB38d0405DF1b15961aEf29C7c45f2ED285822c14"
FREEZE = "0x" + "f" * 64
ACTION_HASH = "0x" + "a" * 64
MANDATE_HASH = "0x" + "b" * 64
BUNDLE_HASH = "0x" + "c" * 64
PERMIT_HASH = "0x" + "d" * 64
TX_HASH = "0x" + "e" * 64
RECEIPT_HASH = "0x" + "9" * 64
EXEC_TOKEN = "exec_" + "1" * 48
PERMIT_ID = "permit-qa-001"


def auth_response(*, status, decision, evidence_status="NOT_REQUESTED", amount="1.00", with_execution=False):
    body = {
        "status": status,
        "decision": decision,
        "reason": "external_intelligence_required" if decision is None else (
            "adaptive_policy_allow" if decision == "ALLOW" else "adaptive_policy_block"
        ),
        "riskTier": "LOW",
        "policyId": "payments.adaptive.v1",
        "policyVersion": 1,
        "freezeFingerprint": FREEZE,
        "routing": {"mode": "TELEGRAPH_AUTO_INTENT", "endpoint": "/v1/ask"},
        "action": {
            "id": "act_track3_qa",
            "hash": ACTION_HASH,
            "amount": amount,
            "amountRaw": str(int(float(amount) * 1_000_000)),
            "recipient": VENDOR,
            "chainId": 84532,
            "chain": "Base Sepolia",
            "asset": "USDC",
            "reason": "Supplier invoice #4471",
            "reference": "INV-4471",
        },
        "mandate": {
            "id": "proofgate-live-mandate",
            "hash": MANDATE_HASH,
            "maxPerAction": "5.00",
            "expiresAt": "2026-09-04T12:00:00.000Z",
        },
        "evidence": {
            "status": evidence_status,
            "code": "adaptive_evidence_complete" if evidence_status == "COMPLETE" else None,
            "spendRaw": "1000" if evidence_status == "COMPLETE" else "0",
            "bundleHash": BUNDLE_HASH if evidence_status == "COMPLETE" else None,
            "rejectedAttempts": 0,
            "completedIntents": ["FRAUD_DETECTION"] if evidence_status == "COMPLETE" else [],
        },
        "executionAuthorized": False,
        "permit": None,
        "execution": None,
    }
    if with_execution:
        body["executionAuthorized"] = True
        body["permit"] = {
            "id": PERMIT_ID,
            "hash": PERMIT_HASH,
            "actionHash": ACTION_HASH,
            "expiresAt": "2026-09-04T10:15:00.000Z",
            "keyId": "proofgate-web-v1",
            "algorithm": "Ed25519",
        }
        body["execution"] = {
            "status": "READY",
            "token": EXEC_TOKEN,
            "endpoint": "/api/execute",
        }
    return body


def execution_response(*, status="EXECUTED", tx_status="CONFIRMED", amount="1.00", recipient=VENDOR,
                       action_hash=ACTION_HASH, permit_hash=PERMIT_HASH, transaction_hash=TX_HASH,
                       error=None):
    confirmed = status == "EXECUTED" and tx_status == "CONFIRMED"
    body = {
        "status": status,
        "code": "executed" if confirmed else (
            "execution_ambiguous" if status == "AMBIGUOUS" else "execution_failed"
        ),
        "actionHash": action_hash,
        "freezeFingerprint": FREEZE,
        "permit": {
            "id": PERMIT_ID,
            "hash": permit_hash,
            "expiresAt": "2026-09-04T10:15:00.000Z",
        },
        "network": {"chain": "Base Sepolia", "chainId": 84532, "asset": "USDC"},
        "payment": {
            "amount": amount,
            "amountRaw": str(int(float(amount) * 1_000_000)),
            "recipient": recipient,
            "recipientLabel": "ProofGate Vendor",
            "reference": "INV-4471",
        },
        "transaction": {
            "status": tx_status,
            "transactionHash": transaction_hash,
            "blockNumber": 46310001 if confirmed else None,
            "confirmedAt": "2026-09-04T09:35:22.000Z" if confirmed else None,
            "confirmedVia": "https://sepolia.base.org" if confirmed else None,
            "sender": "0x1111111111111111111111111111111111111111",
            "nonce": 7,
            "operationId": "op-track3-qa",
            "automaticRetry": False,
        },
        "evidence": {"bundleHash": BUNDLE_HASH, "spendRaw": "1000"},
        "receipt": {
            "id": "receipt-track3-qa",
            "hash": RECEIPT_HASH,
            "schemaVersion": "proofgate.receipt.v3",
            "createdAt": "2026-09-04T09:35:22.000Z",
        },
    }
    if error:
        body["error"] = error
    return body


async def css(locator, prop):
    return await locator.evaluate("(el, prop) => getComputedStyle(el).getPropertyValue(prop)", prop)


async def box(locator):
    value = await locator.bounding_box()
    assert value is not None, f"expected visible element: {locator}"
    return value


async def assert_no_overflow(page, label):
    overflow = await page.evaluate("document.documentElement.scrollWidth - document.documentElement.clientWidth")
    assert overflow <= 1, f"{label}: horizontal overflow {overflow}px"


async def assert_target(locator, minimum=44):
    bounds = await box(locator)
    assert bounds["width"] >= minimum and bounds["height"] >= minimum, f"undersized tap target: {bounds}"


async def install_happy_routes(page, *, live_delay=0.55, execute_delay=0.75, amount="1.00"):
    calls = []

    async def authorize(route):
        payload = json.loads(route.request.post_data or "{}")
        mode = payload["mode"]
        calls.append(("authorize", mode))
        assert payload["agentId"] == "invoice-bot"
        assert payload["destination"].lower() == VENDOR.lower()
        assert payload["amount"] == amount
        assert payload["limit"] == "5.00"
        assert payload["durationSeconds"] == 3600
        assert payload["reason"] == "Supplier invoice #4471"
        assert payload["reference"] == "INV-4471"
        if mode == "policy":
            assert "freezeFingerprint" not in payload
            await asyncio.sleep(0.08)
            await route.fulfill(
                status=200,
                content_type="application/json",
                body=json.dumps(auth_response(status="REQUIRES_INTELLIGENCE", decision=None, amount=amount)),
            )
            return
        assert mode == "live"
        assert payload["freezeFingerprint"] == FREEZE
        assert route.request.headers.get("idempotency-key")
        await asyncio.sleep(live_delay)
        await route.fulfill(
            status=200,
            content_type="application/json",
            body=json.dumps(auth_response(
                status="DECIDED", decision="ALLOW", evidence_status="COMPLETE", amount=amount, with_execution=True
            )),
        )

    async def execute(route):
        payload = json.loads(route.request.post_data or "{}")
        calls.append(("execute", "protected"))
        assert payload == {"executionToken": EXEC_TOKEN}
        assert route.request.headers.get("idempotency-key")
        await asyncio.sleep(execute_delay)
        await route.fulfill(
            status=200,
            content_type="application/json",
            body=json.dumps(execution_response(amount=amount)),
        )

    await page.route("**/api/authorize", authorize)
    await page.route("**/api/execute", execute)
    return calls


async def assert_screen1_fidelity(page):
    await expect(page.get_by_role("heading", name="Control what an agent can do.")).to_be_visible()
    assert await css(page.locator(".live-strip"), "background-color") == "rgb(193, 239, 211)"
    assert await css(page.locator(".check-button"), "background-color") == "rgb(255, 199, 44)"
    assert await css(page.locator(".app-page"), "background-color") == "rgb(250, 250, 250)"
    hero_family = await css(page.locator(".hero-block h1"), "font-family")
    mono_family = await css(page.locator(".agent-name"), "font-family")
    assert "Arial" in hero_family or "Helvetica" in hero_family
    assert "Courier New" in mono_family
    await assert_no_overflow(page, "Screen 1")
    for control in [
        page.get_by_role("button", name="Open menu"),
        page.get_by_role("button", name="Decrease maximum payment"),
        page.get_by_role("button", name="Increase maximum payment"),
        page.get_by_role("button", name="Shorten permission duration"),
        page.get_by_role("button", name="Extend permission duration"),
        page.get_by_role("button", name="CHECK THIS REQUEST"),
        page.get_by_role("button", name="Current request"),
    ]:
        await assert_target(control)


async def assert_screen2_running(page):
    await expect(page.get_by_role("heading", name="CHECKING REQUEST")).to_be_visible()
    await expect(page.get_by_text("REQUEST RECEIVED", exact=True)).to_be_visible()
    await expect(page.get_by_text("RULES CHECKED", exact=True)).to_be_visible()
    await expect(page.get_by_text("REAL CHECKS RUNNING", exact=True)).to_be_visible()
    await expect(page.get_by_text("DECISION", exact=True)).to_be_visible()
    await expect(page.get_by_text("Telegraph is routing the required intelligence to real Miners", exact=False)).to_be_visible()
    await expect(page.get_by_text("vendor payment has not started", exact=False)).to_be_visible()
    await assert_no_overflow(page, "Screen 2")
    heading_family = await css(page.get_by_role("heading", name="CHECKING REQUEST"), "font-family")
    assert "Courier New" in heading_family
    spinner = page.locator(".status-spinner")
    await expect(spinner).to_be_visible()
    assert (await css(spinner, "animation-name")).strip() == "proofgate-spin"
    cancel = page.get_by_role("button", name="CANCEL CHECK")
    await expect(cancel).to_be_disabled()
    await assert_target(cancel)

    for stage in ["01", "02", "03", "04"]:
        trigger = page.locator(f'[data-stage="{stage}"] .timeline-disclosure-trigger')
        await expect(trigger).to_be_visible()
        await expect(trigger).to_have_attribute("aria-expanded", "false")


async def assert_screen3_running(page):
    screen = page.get_by_test_id("execution-screen")
    await expect(screen).to_be_visible()
    await expect(page.get_by_role("heading", name="EXECUTING REQUEST")).to_be_visible()
    await expect(page.get_by_text("STEP 3 OF 3", exact=True)).to_be_visible()
    await expect(page.get_by_text("AUTHORIZATION PASSED", exact=True)).to_be_visible()
    await expect(page.get_by_text("PERMIT ISSUED", exact=True)).to_be_visible()
    await expect(page.get_by_text("EXECUTING ON BASE SEPOLIA", exact=True)).to_be_visible()
    await expect(page.get_by_text("CONFIRMATION PENDING", exact=True)).to_be_visible()
    await expect(page.get_by_text("1.00 USDC → ProofGate Vendor", exact=True)).to_be_visible()
    await expect(page.get_by_role("button", name="EXECUTION IN PROGRESS")).to_be_disabled()
    await expect(page.get_by_role("button", name="VIEW PROOF")).to_be_disabled()
    await expect(page.get_by_role("button", name="EXECUTE", exact=True)).to_have_count(0)
    await assert_no_overflow(page, "Screen 3 executing")

    hero_family = await css(page.locator(".execution-hero h1"), "font-family")
    detail_family = await css(page.locator(".execution-details dt").first, "font-family")
    assert "Arial" in hero_family or "Helvetica" in hero_family, f"Screen 3 hero must use bold sans, got {hero_family}"
    assert "Courier New" in detail_family, f"Screen 3 operational data must use mono, got {detail_family}"
    assert "gradient" not in (await css(page.locator(".execution-hero-mark"), "background-image")).lower()

    for stage in ["01", "02", "03", "04"]:
        row = page.locator(f'[data-execution-stage="{stage}"]')
        await expect(row).to_be_visible()
        num = await box(row.locator(".execution-number"))
        assert num["width"] >= 32 and num["height"] >= 29

    spinner = page.locator(".execution-spinner")
    await expect(spinner).to_be_visible()
    assert (await css(spinner, "animation-name")).strip() == "execution-spin"


async def assert_screen3_executed(page):
    await expect(page.get_by_role("heading", name="PAYMENT EXECUTED")).to_be_visible()
    await expect(page.get_by_text("Payment confirmed.", exact=True)).to_be_visible()
    await expect(page.get_by_text("EXECUTED ON BASE SEPOLIA", exact=True)).to_be_visible()
    await expect(page.get_by_text("CONFIRMED", exact=True)).to_be_visible()
    await expect(page.get_by_text("0.001 USDC", exact=True)).to_be_visible()
    await expect(page.get_by_text("/v1/ask · auto-ranked", exact=True)).to_be_visible()
    new_request = page.get_by_role("button", name="NEW REQUEST")
    proof = page.get_by_role("button", name="VIEW PROOF")
    await expect(new_request).to_be_enabled()
    await expect(proof).to_be_enabled()
    await assert_target(new_request)
    await assert_target(proof)
    await assert_no_overflow(page, "Screen 3 executed")

    await proof.click()
    drawer = page.get_by_test_id("proof-drawer")
    await expect(drawer).to_be_visible()
    text = (await drawer.inner_text()).upper()
    for required in ["VERIFIABLE RECEIPT", "REAL", "DECISION", "ALLOW", "TELEGRAPH", "/V1/ASK", "X402 SPEND", "TRANSACTION"]:
        assert required in text, f"proof drawer missing {required}"


async def happy_end_to_end(browser):
    page = await browser.new_page(viewport={"width": 390, "height": 844}, device_scale_factor=1)
    errors = []
    page.on("console", lambda msg: errors.append(msg.text) if msg.type == "error" else None)
    calls = await install_happy_routes(page)
    await page.goto(BASE_URL, wait_until="networkidle")

    await assert_screen1_fidelity(page)
    await page.screenshot(path=str(ARTIFACTS / "screen1-390.png"), full_page=True)
    await page.get_by_role("button", name="CHECK THIS REQUEST").click()

    await expect(page.get_by_text("REAL CHECKS RUNNING", exact=True)).to_be_visible(timeout=2500)
    await assert_screen2_running(page)
    await page.screenshot(path=str(ARTIFACTS / "screen2-checking-390.png"), full_page=True)

    await expect(page.get_by_role("heading", name="EXECUTING REQUEST")).to_be_visible(timeout=3500)
    await assert_screen3_running(page)
    await page.screenshot(path=str(ARTIFACTS / "screen3-executing-390.png"), full_page=True)

    await expect(page.get_by_role("heading", name="PAYMENT EXECUTED")).to_be_visible(timeout=4000)
    await assert_screen3_executed(page)
    await page.screenshot(path=str(ARTIFACTS / "screen3-executed-390.png"), full_page=True)
    await page.screenshot(path=str(ARTIFACTS / "screen3-proof-390.png"), full_page=True)

    assert calls == [("authorize", "policy"), ("authorize", "live"), ("execute", "protected")], calls
    assert not errors, f"browser console errors: {errors}"

    await page.get_by_role("button", name="NEW REQUEST").click()
    await expect(page.get_by_role("heading", name="Control what an agent can do.")).to_be_visible()
    await page.close()


async def policy_block_never_executes(browser):
    page = await browser.new_page(viewport={"width": 390, "height": 844})
    calls = []

    async def authorize(route):
        payload = json.loads(route.request.post_data or "{}")
        calls.append(("authorize", payload["mode"]))
        assert payload["mode"] == "policy"
        await route.fulfill(status=200, content_type="application/json", body=json.dumps(
            auth_response(status="BLOCKED", decision="BLOCK")
        ))

    async def execute(route):
        calls.append(("execute", "BUG"))
        await route.abort()

    await page.route("**/api/authorize", authorize)
    await page.route("**/api/execute", execute)
    await page.goto(BASE_URL, wait_until="networkidle")
    await page.get_by_role("button", name="CHECK THIS REQUEST").click()
    await expect(page.get_by_text("REAL CHECKS NOT NEEDED", exact=True)).to_be_visible(timeout=2000)
    await expect(page.get_by_text("BLOCK", exact=True)).to_be_visible()
    assert calls == [("authorize", "policy")], f"policy block reached paid/live execution path: {calls}"
    await page.close()


async def live_hold_never_executes(browser):
    page = await browser.new_page(viewport={"width": 390, "height": 844})
    calls = []

    async def authorize(route):
        payload = json.loads(route.request.post_data or "{}")
        calls.append(("authorize", payload["mode"]))
        if payload["mode"] == "policy":
            await route.fulfill(status=200, content_type="application/json", body=json.dumps(
                auth_response(status="REQUIRES_INTELLIGENCE", decision=None)
            ))
            return
        await route.fulfill(status=200, content_type="application/json", body=json.dumps(
            auth_response(status="DECIDED", decision="HOLD", evidence_status="COMPLETE")
        ))

    async def execute(route):
        calls.append(("execute", "BUG"))
        await route.abort()

    await page.route("**/api/authorize", authorize)
    await page.route("**/api/execute", execute)
    await page.goto(BASE_URL, wait_until="networkidle")
    await page.get_by_role("button", name="CHECK THIS REQUEST").click()
    await expect(page.get_by_text("HOLD", exact=True)).to_be_visible(timeout=2500)
    assert calls == [("authorize", "policy"), ("authorize", "live")], f"HOLD executed: {calls}"
    await page.close()


async def execution_failed_state(browser):
    page = await browser.new_page(viewport={"width": 390, "height": 844})
    calls = await install_happy_routes(page, execute_delay=0.15)

    async def failed_execute(route):
        payload = json.loads(route.request.post_data or "{}")
        calls.append(("execute_failed", "protected"))
        assert payload["executionToken"] == EXEC_TOKEN
        await route.fulfill(status=200, content_type="application/json", body=json.dumps(
            execution_response(status="FAILED", tx_status="FAILED", transaction_hash=None, error="transaction_preparation_failed")
        ))

    await page.unroute("**/api/execute")
    await page.route("**/api/execute", failed_execute)
    await page.goto(BASE_URL, wait_until="networkidle")
    await page.get_by_role("button", name="CHECK THIS REQUEST").click()
    await expect(page.get_by_role("heading", name="EXECUTION STOPPED")).to_be_visible(timeout=3500)
    await expect(page.get_by_text("Execution stopped.", exact=True)).to_be_visible()
    await expect(page.get_by_role("button", name="NEW REQUEST")).to_be_enabled()
    await expect(page.get_by_role("button", name="VIEW PROOF")).to_be_enabled()
    await expect(page.get_by_role("button", name="EXECUTE", exact=True)).to_have_count(0)
    await assert_no_overflow(page, "execution failed")
    await page.close()


async def ambiguous_never_retries(browser):
    page = await browser.new_page(viewport={"width": 390, "height": 844})
    execution_calls = 0

    async def authorize(route):
        payload = json.loads(route.request.post_data or "{}")
        if payload["mode"] == "policy":
            await route.fulfill(status=200, content_type="application/json", body=json.dumps(
                auth_response(status="REQUIRES_INTELLIGENCE", decision=None)
            ))
            return
        await route.fulfill(status=200, content_type="application/json", body=json.dumps(
            auth_response(status="DECIDED", decision="ALLOW", evidence_status="COMPLETE", with_execution=True)
        ))

    async def execute(route):
        nonlocal execution_calls
        execution_calls += 1
        await route.fulfill(status=200, content_type="application/json", body=json.dumps(
            execution_response(
                status="AMBIGUOUS",
                tx_status="CONFIRMATION_UNCERTAIN",
                transaction_hash=TX_HASH,
                error="base_sepolia_payment_confirmation_ambiguous",
            )
        ))

    await page.route("**/api/authorize", authorize)
    await page.route("**/api/execute", execute)
    await page.goto(BASE_URL, wait_until="networkidle")
    await page.get_by_role("button", name="CHECK THIS REQUEST").click()
    await expect(page.get_by_role("heading", name="CONFIRMATION UNCERTAIN")).to_be_visible(timeout=3000)
    await expect(page.get_by_role("button", name="RETRY LOCKED")).to_be_disabled()
    await expect(page.get_by_text("No automatic retry", exact=False)).to_be_visible()
    await asyncio.sleep(0.35)
    assert execution_calls == 1, f"ambiguous execution was automatically retried {execution_calls} times"
    await page.screenshot(path=str(ARTIFACTS / "screen3-ambiguous-390.png"), full_page=True)
    await page.close()


async def mismatched_execution_response_fails_closed(browser):
    page = await browser.new_page(viewport={"width": 390, "height": 844})

    async def authorize(route):
        payload = json.loads(route.request.post_data or "{}")
        if payload["mode"] == "policy":
            await route.fulfill(status=200, content_type="application/json", body=json.dumps(
                auth_response(status="REQUIRES_INTELLIGENCE", decision=None)
            ))
            return
        await route.fulfill(status=200, content_type="application/json", body=json.dumps(
            auth_response(status="DECIDED", decision="ALLOW", evidence_status="COMPLETE", with_execution=True)
        ))

    async def execute(route):
        await route.fulfill(status=200, content_type="application/json", body=json.dumps(
            execution_response(amount="2.00")
        ))

    await page.route("**/api/authorize", authorize)
    await page.route("**/api/execute", execute)
    await page.goto(BASE_URL, wait_until="networkidle")
    await page.get_by_role("button", name="CHECK THIS REQUEST").click()
    await expect(page.get_by_role("heading", name="CONFIRMATION UNCERTAIN")).to_be_visible(timeout=3000)
    await expect(page.get_by_role("heading", name="PAYMENT EXECUTED")).to_have_count(0)
    await expect(page.get_by_role("button", name="RETRY LOCKED")).to_be_disabled()
    await page.close()


async def screen3_responsive(browser, width, height):
    page = await browser.new_page(viewport={"width": width, "height": height}, device_scale_factor=1)
    await install_happy_routes(page, live_delay=0.08, execute_delay=0.7)
    await page.goto(BASE_URL, wait_until="networkidle")
    await page.get_by_role("button", name="CHECK THIS REQUEST").click()
    await expect(page.get_by_role("heading", name="EXECUTING REQUEST")).to_be_visible(timeout=2500)
    await assert_no_overflow(page, f"Screen 3 {width}px")

    shell = await box(page.locator(".app-page"))
    if width >= 700:
        assert 458 <= shell["width"] <= 462, shell
    else:
        assert shell["width"] <= width + 1, shell

    execution = await box(page.get_by_test_id("execution-screen"))
    assert execution["x"] >= 0 and execution["x"] + execution["width"] <= width + 1
    for control in [
        page.get_by_role("button", name="EXECUTION IN PROGRESS"),
        page.get_by_role("button", name="VIEW PROOF"),
    ]:
        await assert_target(control)

    hero = page.locator(".execution-hero h1")
    hero_size = float((await css(hero, "font-size")).replace("px", ""))
    assert hero_size >= 20, f"Screen 3 hero over-compacted at {width}px: {hero_size}px"
    row_copy_size = float((await css(page.locator(".execution-row-copy span").first, "font-size")).replace("px", ""))
    assert row_copy_size >= 8, f"Screen 3 row copy too small at {width}px: {row_copy_size}px"

    if width in (320, 360, 430):
        await page.screenshot(path=str(ARTIFACTS / f"screen3-executing-{width}.png"), full_page=True)
    await page.close()


async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch()
        try:
            await happy_end_to_end(browser)
            await policy_block_never_executes(browser)
            await live_hold_never_executes(browser)
            await execution_failed_state(browser)
            await ambiguous_never_retries(browser)
            await mismatched_execution_response_fails_closed(browser)
            for width, height in [(320, 800), (360, 800), (430, 932), (1024, 1100)]:
                await screen3_responsive(browser, width, height)
        finally:
            await browser.close()


if __name__ == "__main__":
    asyncio.run(main())
