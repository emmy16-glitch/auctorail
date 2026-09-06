import asyncio
import importlib.util
import json
from pathlib import Path

from playwright.async_api import async_playwright, expect

BASE_URL = "http://127.0.0.1:4173"
ARTIFACTS = Path("playwright-artifacts")
ARTIFACTS.mkdir(exist_ok=True)

LEGACY_QA_PATH = Path(__file__).with_name("three-screen-playwright.py")
spec = importlib.util.spec_from_file_location("auctorail_legacy_qa_helpers", LEGACY_QA_PATH)
assert spec is not None and spec.loader is not None
legacy = importlib.util.module_from_spec(spec)
spec.loader.exec_module(legacy)

SECURITY_REPORT = {
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

async def visible_target(locator, minimum=40):
    await expect(locator).to_be_visible()
    box = await locator.bounding_box()
    assert box is not None, f"missing box for {locator}"
    assert box["width"] >= minimum and box["height"] >= minimum, f"small target {box}"

async def enter_live(page):
    landing = page.get_by_test_id("home-landing-screen")
    if await landing.count():
        button = landing.get_by_role("button", name="RUN A REAL TESTNET TRANSFER", exact=False)
        await visible_target(button)
        await button.click()
    await expect(page.get_by_role("heading", name="Control what an agent can do.")).to_be_visible(timeout=3000)
    await expect(page.locator("#root .top-nav .brand-lockup strong").filter(has_text="AUCTORAIL")).to_be_visible()

async def landing_and_demo(browser, width, height, suffix):
    page = await browser.new_page(viewport={"width": width, "height": height}, device_scale_factor=1)
    api_calls = []
    page.on("request", lambda request: api_calls.append(request.url) if "/api/" in request.url else None)
    await page.goto(BASE_URL, wait_until="networkidle")
    landing = page.get_by_test_id("home-landing-screen")
    await expect(landing).to_be_visible()
    await expect(landing.get_by_role("heading", name="Prove authority before execution.")).to_be_visible()
    await expect(page.locator("#root .brand-lockup strong").first).to_have_text("AUCTORAIL")
    await expect(landing.get_by_role("heading", name="The same rail. A different threat.")).to_be_visible()

    # Landing/demo deliberately preserve the locked 1536px desktop composition
    # by scaling it into Android Desktop-Site-like widths. On that one viewport
    # the browser itself renders the whole reference surface smaller, so verify
    # visibility/clickability rather than applying the unscaled 40px target rule.
    landing_target_min = 26 if 900 < width < 1536 else 40
    await visible_target(landing.get_by_role("button", name="TRY IT — CHECK SUSPICIOUS CONTENT", exact=False), landing_target_min)
    await visible_target(page.locator(".nav-side").get_by_role("button", name="TRUST", exact=True), landing_target_min)
    demo = landing.get_by_role("button", name="WATCH THE RAIL HOLD", exact=False)
    live = landing.get_by_role("button", name="RUN A REAL TESTNET TRANSFER", exact=False)
    await visible_target(demo, landing_target_min)
    await visible_target(live, landing_target_min)
    await no_overflow(page, f"landing {width}px")
    await page.screenshot(path=str(ARTIFACTS / f"auctorail-landing-{suffix}.png"), full_page=True)
    await demo.click()
    guided = page.get_by_test_id("guided-demo-screen")
    await expect(guided).to_be_visible()
    await expect(guided.get_by_role("heading", name="Watch Auctorail in action.")).to_be_visible()
    await expect(guided.get_by_text("No real payments.", exact=False).first).to_be_visible()
    pause = guided.get_by_role("button", name="Pause demo")
    if await pause.count():
        await pause.click()
    await no_overflow(page, f"guided demo {width}px")
    await page.screenshot(path=str(ARTIFACTS / f"auctorail-demo-{suffix}.png"), full_page=True)
    assert not api_calls, f"deterministic guided demo unexpectedly called APIs: {api_calls}"
    await page.close()

# Live content-check response served to the browser in the QA run: a real,
# server-generated content receipt (deterministic BLOCK for the scam sample)
# with live-mode fields, so the UI contract and the receipt verification both
# execute against a structurally valid response without live credentials.
CONTENT_LIVE_RESPONSE = json.loads(r"""{"mode":"LIVE_TELEGRAPH_X402","realTelegraph":true,"spendRaw":"1000","decision":"BLOCK","reason":"scam_signal_block","subjectHash":"0x7b1aea2cde7fb5420ab6d8aeaa81e3f257ada3c0ae236aed9498c907235e2717","signals":[{"source":"deterministic_demo","kind":"SCAM","minerId":"demo-scam","minerName":"Deterministic demo classifier","intent":"CONTENT_VERIFICATION","label":"scam","confidence":0.94,"subjectHash":"0x7b1aea2cde7fb5420ab6d8aeaa81e3f257ada3c0ae236aed9498c907235e2717","signalHash":"0x7b00b92895304044de7a108eb41599374340cf909fda75e43e3771fe7b6630b9","receivedAt":"2026-09-06T06:11:48.082Z"},{"source":"deterministic_demo","kind":"AI_GENERATED","minerId":"demo-ai","minerName":"Deterministic demo classifier","intent":"AI_DETECTION","label":"human","confidence":0.82,"subjectHash":"0x7b1aea2cde7fb5420ab6d8aeaa81e3f257ada3c0ae236aed9498c907235e2717","signalHash":"0x44ff2ad355c7e9779416a4f148b64aa8ba84d5b48ee55100dca0892ebea48a94","receivedAt":"2026-09-06T06:11:48.082Z"}],"summaryLine":"Auctorail content check: BLOCK — scam_signal_block.","receipt":{"schemaVersion":"auctorail.content-receipt.v1","receiptId":"ff027ccb-b71a-4bcf-9e87-0cc8d4fd3990","subjectHash":"0x7b1aea2cde7fb5420ab6d8aeaa81e3f257ada3c0ae236aed9498c907235e2717","contentKind":"text","proposedAction":"view","authorshipClaim":"unspecified","action":{"schemaVersion":"proofgate.action.v2","actionId":"2a44ce9f-4f1a-44d8-973a-ae0bcb54a45d","actionHash":"0xd3253fb3554c1f59b26a127d6a72c0f1024b12c73a6aef0e7aa8469891e4d324","type":"content.check","target":"content:0x7b1aea2cde7fb5420ab6d8aeaa81e3f257ada3c0ae236aed9498c907235e2717","policyId":"content.strict.v1","policyVersion":1,"canonicalPayload":"{\"parameters\":{\"authorshipClaim\":\"unspecified\",\"contentKind\":\"text\",\"proposedAction\":\"view\"},\"policyId\":\"content.strict.v1\",\"policyVersion\":1,\"target\":\"content:0x7b1aea2cde7fb5420ab6d8aeaa81e3f257ada3c0ae236aed9498c907235e2717\",\"type\":\"content.check\"}"},"evidence":[{"source":"deterministic_demo","kind":"SCAM","minerId":"demo-scam","minerName":"Deterministic demo classifier","intent":"CONTENT_VERIFICATION","label":"scam","confidence":0.94,"subjectHash":"0x7b1aea2cde7fb5420ab6d8aeaa81e3f257ada3c0ae236aed9498c907235e2717","signalHash":"0x7b00b92895304044de7a108eb41599374340cf909fda75e43e3771fe7b6630b9","receivedAt":"2026-09-06T06:11:48.082Z"},{"source":"deterministic_demo","kind":"AI_GENERATED","minerId":"demo-ai","minerName":"Deterministic demo classifier","intent":"AI_DETECTION","label":"human","confidence":0.82,"subjectHash":"0x7b1aea2cde7fb5420ab6d8aeaa81e3f257ada3c0ae236aed9498c907235e2717","signalHash":"0x44ff2ad355c7e9779416a4f148b64aa8ba84d5b48ee55100dca0892ebea48a94","receivedAt":"2026-09-06T06:11:48.082Z"}],"evidenceCommitmentHash":"0xa1d011f141e6cd87fde6ad1d5cc583da91ce0bc741c6cca77449f33f6ad287eb","decision":{"schemaVersion":"proofgate.decision.v2","decision":"BLOCK","reason":"scam_signal_block","decisionHash":"0x9bdd8e2d5c37e93c8daa8119b7a505a7f2049aa22005f203352b70c047be0a40","mandateHash":"0x176d893a37d7d4eeedad83f173ff18c32e8feab37a30921fd51d7549a9c1dc6a","actionHash":"0xd3253fb3554c1f59b26a127d6a72c0f1024b12c73a6aef0e7aa8469891e4d324","policyId":"content.strict.v1","policyVersion":1,"evidenceCommitmentHash":"0xa1d011f141e6cd87fde6ad1d5cc583da91ce0bc741c6cca77449f33f6ad287eb","checks":[{"name":"mandate_integrity","status":"PASS","reason":"Mandate hash and canonical body are intact."},{"name":"action_integrity","status":"PASS","reason":"Action hash and canonical body are intact."},{"name":"mandate_status","status":"PASS","reason":"Mandate is ACTIVE."},{"name":"mandate_time","status":"PASS","reason":"Mandate is active in the current time window."},{"name":"mandate_agent","status":"PASS","reason":"Agent identity matches delegated authority."},{"name":"mandate_action_type","status":"PASS","reason":"Action type content.check is delegated."},{"name":"mandate_target","status":"PASS","reason":"Exact action target is delegated."},{"name":"mandate_policy","status":"PASS","reason":"Action policy matches the delegated policy/version."},{"name":"content_scam_subject","status":"PASS","reason":"SCAM evidence is bound to the exact content hash."},{"name":"content_scam_freshness","status":"PASS","reason":"SCAM evidence is fresh."},{"name":"content_ai_generated_subject","status":"PASS","reason":"AI_GENERATED evidence is bound to the exact content hash."},{"name":"content_ai_generated_freshness","status":"PASS","reason":"AI_GENERATED evidence is fresh."},{"name":"scam_signal","status":"BLOCK","reason":"Scam/phishing evidence is 94% confident.","code":"scam_signal_block"},{"name":"ai_generation_signal","status":"PASS","reason":"AI-generation assessment does not create a policy violation."}],"decidedAt":"2026-09-06T06:11:48.082Z"},"summaryLine":"Auctorail content check: BLOCK — scam_signal_block.","createdAt":"2026-09-06T06:11:48.082Z","receiptHash":"0xff0c5a6868f3e54ef5323dc47c4ca286734d95a2b2c91aa63971fadc3f3877fb"}}""")


async def content_and_receipt_verify(browser, width, height, suffix):
    page = await browser.new_page(viewport={"width": width, "height": height}, device_scale_factor=1)
    forbidden = []

    async def forbid_live(route):
        forbidden.append(route.request.url)
        await route.abort()

    async def mock_content_live(route):
        await route.fulfill(status=200, content_type="application/json", body=json.dumps(CONTENT_LIVE_RESPONSE))

    await page.route("**/api/authorize", forbid_live)
    await page.route("**/api/execute", forbid_live)
    await page.route("**/api/content-check", mock_content_live)
    await page.goto(BASE_URL, wait_until="networkidle")
    landing = page.get_by_test_id("home-landing-screen")
    await landing.get_by_role("button", name="TRY IT — CHECK SUSPICIOUS CONTENT", exact=False).click()
    screen = page.get_by_test_id("content-trust-screen")
    await expect(screen).to_be_visible()
    await expect(screen.get_by_role("heading", name="Check the evidence before you act.")).to_be_visible()
    await expect(screen.get_by_role("button", name="CHECK WITH TELEGRAPH", exact=True)).to_be_visible()
    await screen.get_by_role("button", name="LOAD SCAM SAMPLE").click()
    await screen.get_by_role("button", name="CHECK WITH TELEGRAPH").click()
    await expect(screen.locator(".content-verdict > strong")).to_have_text("BLOCK", timeout=3500)
    await expect(screen.get_by_text("REAL TELEGRAPH · x402 SPEND RAW 1000", exact=True)).to_be_visible()
    await expect(screen.get_by_text("SCAM", exact=True).first).to_be_visible()
    await no_overflow(page, f"Content Trust {width}px")
    await page.screenshot(path=str(ARTIFACTS / f"auctorail-content-{suffix}.png"), full_page=True)
    assert not forbidden, f"Content demo reached protected live endpoints: {forbidden}"

    await screen.get_by_role("button", name="VERIFY RECEIPT").click()
    verifier = page.get_by_test_id("verify-screen")
    await expect(verifier).to_be_visible()
    await verifier.get_by_role("button", name="VERIFY PROOF").click()
    await expect(verifier.locator(".verify-verdict > strong")).to_have_text("VALID", timeout=3500)
    await expect(verifier.get_by_text("CONTENT RECEIPT", exact=True)).to_be_visible()
    await no_overflow(page, f"Content receipt verify {width}px")
    await page.screenshot(path=str(ARTIFACTS / f"auctorail-content-verified-{suffix}.png"), full_page=True)
    await page.close()

async def canonical_verify(browser, width, height, suffix):
    page = await browser.new_page(viewport={"width": width, "height": height}, device_scale_factor=1)
    await page.goto(BASE_URL, wait_until="networkidle")
    verify_button = page.locator(".nav-side").get_by_role("button", name="TRUST", exact=True)
    target_min = 26 if 900 < width < 1536 else 40
    await visible_target(verify_button, target_min)
    await verify_button.click()
    # the merged trust page opens on the content tab; switch to receipt verification
    await page.get_by_role("tab", name="VERIFY RECEIPT").click()
    verifier = page.get_by_test_id("verify-screen")
    await expect(verifier).to_be_visible()
    await expect(verifier.get_by_role("heading", name="Verify the proof, not the screenshot.")).to_be_visible()
    await verifier.get_by_role("button", name="LOAD CANONICAL PROOF").click()
    await expect(verifier.locator(".verify-verdict > strong")).to_have_text("VALID", timeout=3500)
    await expect(verifier.get_by_text("PAYMENT RECEIPT", exact=True)).to_be_visible()
    await expect(verifier.get_by_text("EXECUTED", exact=True).first).to_be_visible()
    await expect(verifier.get_by_role("link", name="OPEN BASESCAN", exact=False)).to_be_visible()
    await no_overflow(page, f"Verify canonical {width}px")
    await page.screenshot(path=str(ARTIFACTS / f"auctorail-verify-{suffix}.png"), full_page=True)
    await page.close()

async def sdk_surface(browser, width, height, suffix):
    page = await browser.new_page(viewport={"width": width, "height": height}, device_scale_factor=1)
    await page.goto(BASE_URL, wait_until="networkidle")
    docs = page.locator(".nav-side").get_by_role("button", name="DOCS", exact=True)
    target_min = 26 if 900 < width < 1536 else 40
    await visible_target(docs, target_min)
    await docs.click()
    sdk = page.get_by_test_id("sdk-screen")
    await expect(sdk).to_be_visible()
    await expect(sdk.get_by_role("heading", name="BUILD WITH AUCTORAIL")).to_be_visible()
    await expect(sdk.get_by_text("npm install ./packages/sdk", exact=False)).to_be_visible()
    body = await sdk.inner_text()
    assert "api.auctorail.dev" not in body, "SDK page must not advertise an undeployed API domain"
    assert "public npm release not claimed" in body.lower(), "SDK page must state that no public npm release is claimed"
    await sdk.get_by_role("button", name="RUN REQUEST", exact=False).click()
    await expect(sdk.locator(".sdk-demo-valid .sdk-demo-result b")).to_have_text("ALLOW", timeout=5000)
    await sdk.get_by_role("button", name="RUN ATTACK", exact=False).click()
    await expect(sdk.locator(".sdk-demo-attack .sdk-demo-result b")).to_have_text("BLOCKED", timeout=5000)
    await no_overflow(page, f"SDK {width}px")
    await page.screenshot(path=str(ARTIFACTS / f"auctorail-sdk-{suffix}.png"), full_page=True)
    await page.close()

async def live_happy_path(browser, width, height, suffix):
    page = await browser.new_page(viewport={"width": width, "height": height}, device_scale_factor=1)
    errors = []
    page.on("console", lambda msg: errors.append(msg.text) if msg.type == "error" else None)
    calls = await legacy.install_happy_routes(page, live_delay=0.22, execute_delay=0.35)
    await page.goto(BASE_URL, wait_until="networkidle")
    await enter_live(page)
    await no_overflow(page, f"live check initial {width}px")
    check = page.get_by_role("button", name="CHECK THIS REQUEST")
    await visible_target(check)
    await check.click()
    await expect(page.get_by_text("REAL CHECKS RUNNING", exact=True)).to_be_visible(timeout=3000)
    await expect(page.get_by_role("heading", name="EXECUTING REQUEST")).to_be_visible(timeout=4000)
    await expect(page.get_by_role("heading", name="PAYMENT EXECUTED")).to_be_visible(timeout=5000)
    await expect(page.get_by_text("Auctorail Vendor", exact=False).first).to_be_visible()
    await no_overflow(page, f"live executed {width}px")
    await page.screenshot(path=str(ARTIFACTS / f"auctorail-live-executed-{suffix}.png"), full_page=True)
    assert calls == [("authorize", "policy"), ("authorize", "live"), ("execute", "protected")], calls
    assert not errors, f"browser console errors: {errors}"
    await page.get_by_role("button", name="ACTIVITY", exact=True).click()
    await expect(page.get_by_test_id("activity-screen")).to_be_visible()
    await expect(page.get_by_text("EXECUTED", exact=True).first).to_be_visible()
    await no_overflow(page, f"Activity {width}px")
    await page.get_by_role("button", name="PERMISSIONS", exact=True).click()
    await expect(page.get_by_test_id("permissions-screen")).to_be_visible()
    await expect(page.get_by_text("STANDING AUTHORITY", exact=True)).to_be_visible()
    await no_overflow(page, f"Permissions {width}px")
    await page.close()

async def security_lab(browser, width, height, suffix):
    page = await browser.new_page(viewport={"width": width, "height": height}, device_scale_factor=1)
    external_calls = []

    async def security(route):
        external_calls.append("security-lab")
        await asyncio.sleep(0.08)
        await route.fulfill(status=200, content_type="application/json", body=json.dumps(SECURITY_REPORT))

    async def forbidden(route):
        external_calls.append("FORBIDDEN-LIVE-CALL")
        await route.abort()

    await page.route("**/api/security-lab", security)
    await page.route("**/api/authorize", forbidden)
    await page.route("**/api/execute", forbidden)
    await page.goto(BASE_URL, wait_until="networkidle")
    await page.locator(".nav-links").get_by_role("button", name="SECURITY LAB", exact=True).click()
    lab = page.get_by_test_id("security-lab-screen")
    await expect(lab).to_be_visible()
    await expect(lab.get_by_role("heading", name="Try to break Auctorail.")).to_be_visible()
    await expect(lab.get_by_text("SAFE · OFFLINE · ZERO REAL PAYMENTS", exact=True)).to_be_visible()
    await expect(lab.get_by_text("No Telegraph/x402 purchase or blockchain write is made.", exact=False)).to_be_visible()
    await lab.get_by_role("button", name="RUN ATTACK", exact=False).click()
    await expect(lab.get_by_text("ATTACK BLOCKED", exact=True)).to_be_visible(timeout=3000)
    await expect(lab.get_by_text("action_hash_mismatch", exact=True).first).to_be_visible()
    await lab.get_by_role("button", name="RUN SUITE", exact=False).click()
    await expect(lab.get_by_text("RAIL HELD", exact=True)).to_be_visible(timeout=3000)
    await expect(lab.get_by_text("10/10", exact=True)).to_be_visible()
    await no_overflow(page, f"Security Lab {width}px")
    await page.screenshot(path=str(ARTIFACTS / f"auctorail-security-lab-{suffix}.png"), full_page=True)
    assert "FORBIDDEN-LIVE-CALL" not in external_calls, external_calls
    await page.close()

async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch()
        try:
            viewports = [
                (390, 844, "mobile-390"),
                (980, 1200, "desktop-site-980"),
                (1440, 1000, "desktop-1440"),
            ]
            for width, height, suffix in viewports:
                await landing_and_demo(browser, width, height, suffix)
                await content_and_receipt_verify(browser, width, height, suffix)
                await canonical_verify(browser, width, height, suffix)
                await sdk_surface(browser, width, height, suffix)
                await security_lab(browser, width, height, suffix)
            await live_happy_path(browser, 390, 844, "mobile-390")
            await live_happy_path(browser, 1440, 1000, "desktop-1440")
        finally:
            await browser.close()

if __name__ == "__main__":
    asyncio.run(main())
