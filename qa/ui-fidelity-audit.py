import asyncio
import json
from pathlib import Path

from playwright.async_api import async_playwright, expect

BASE_URL = "http://127.0.0.1:4173"
ARTIFACTS = Path("playwright-artifacts")
ARTIFACTS.mkdir(exist_ok=True)

VENDOR = "0xB38d0405DF1b15961aEf29C7c45f2ED285822c14"
FREEZE = "0x" + ("d" * 64)


def response_body(*, status: str, decision, evidence_status="NOT_REQUESTED"):
    return {
        "status": status,
        "decision": decision,
        "reason": "external_intelligence_required" if decision is None else "adaptive_policy_allow",
        "riskTier": "MEDIUM",
        "policyId": "payments.adaptive.v1",
        "policyVersion": 1,
        "freezeFingerprint": FREEZE,
        "routing": {"mode": "TELEGRAPH_AUTO_INTENT", "endpoint": "/v1/ask"},
        "action": {
            "id": "act_fidelity",
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
        "evidence": {
            "status": evidence_status,
            "code": "adaptive_evidence_complete" if evidence_status == "COMPLETE" else None,
            "spendRaw": "1000" if evidence_status == "COMPLETE" else "0",
            "bundleHash": "0x" + ("c" * 64) if evidence_status == "COMPLETE" else None,
            "rejectedAttempts": 0,
            "completedIntents": ["FRAUD_DETECTION"] if evidence_status == "COMPLETE" else [],
        },
    }


async def box(locator):
    value = await locator.bounding_box()
    assert value is not None, f"expected visible element: {locator}"
    return value


async def css(locator, prop: str, pseudo: str | None = None):
    return await locator.evaluate(
        """(el, arg) => getComputedStyle(el, arg.pseudo).getPropertyValue(arg.prop)""",
        {"prop": prop, "pseudo": pseudo},
    )


async def px(locator, prop: str, pseudo: str | None = None):
    raw = (await css(locator, prop, pseudo)).strip()
    assert raw.endswith("px"), f"expected pixel value for {prop}, got {raw!r}"
    return float(raw[:-2])


async def assert_near(actual: float, expected: float, tolerance: float, label: str):
    assert abs(actual - expected) <= tolerance, f"{label}: got {actual}, expected {expected}±{tolerance}"


async def assert_no_overflow(page, label: str):
    amount = await page.evaluate(
        "document.documentElement.scrollWidth - document.documentElement.clientWidth"
    )
    assert amount <= 1, f"{label}: horizontal overflow {amount}px"


async def assert_not_clipped(locator, label: str):
    metrics = await locator.evaluate(
        """el => ({
          sw: el.scrollWidth,
          cw: el.clientWidth,
          sh: el.scrollHeight,
          ch: el.clientHeight,
          overflowX: getComputedStyle(el).overflowX,
          overflowY: getComputedStyle(el).overflowY
        })"""
    )
    if metrics["overflowX"] != "visible":
        assert metrics["sw"] <= metrics["cw"] + 1, f"{label}: clipped horizontally {metrics}"
    if metrics["overflowY"] != "visible":
        assert metrics["sh"] <= metrics["ch"] + 1, f"{label}: clipped vertically {metrics}"


async def first_screen_390(browser):
    page = await browser.new_page(viewport={"width": 390, "height": 844}, device_scale_factor=1)
    console_errors = []
    page.on("console", lambda msg: console_errors.append(msg.text) if msg.type == "error" else None)
    await page.goto(BASE_URL, wait_until="networkidle")
    await assert_no_overflow(page, "390px first screen")

    # Palette and global canvas.
    assert await css(page.locator(".app-page"), "background-color") == "rgb(250, 250, 250)"
    assert await css(page.locator(".live-strip"), "background-color") == "rgb(193, 239, 211)"
    assert await css(page.locator(".check-button"), "background-color") == "rgb(255, 199, 44)"

    # Header/logo typography.
    brand = page.locator(".brand-lockup strong")
    subtitle = page.locator(".brand-lockup span")
    assert "Arial" in await css(brand, "font-family") or "Helvetica" in await css(brand, "font-family")
    assert "Courier New" in await css(subtitle, "font-family")
    await assert_near(await px(brand, "font-size"), 16.5, 0.2, "brand font size")
    await assert_near(await px(subtitle, "font-size"), 9.8, 0.2, "brand subtitle font size")

    brand_shield = await box(page.locator(".brand-shield"))
    await assert_near(brand_shield["width"], 24, 0.5, "brand shield width")
    await assert_near(brand_shield["height"], 30, 0.5, "brand shield height")

    menu = page.get_by_role("button", name="Open menu")
    menu_box = await box(menu)
    assert menu_box["width"] >= 44 and menu_box["height"] >= 44
    menu_icon = await box(menu.locator("svg"))
    await assert_near(menu_icon["width"], 18.5, 0.6, "menu icon width")
    await assert_near(menu_icon["height"], 18.5, 0.6, "menu icon height")

    # The two separators must be geometric dots, not system-font stars/glyphs.
    separators = page.locator(".live-strip i")
    assert await separators.count() == 2
    for index in range(2):
        sep = separators.nth(index)
        assert (await css(sep, "content", "::before")).strip() in ('""', "none")
        await assert_near(await px(sep, "width", "::before"), 3, 0.2, f"live separator {index} width")
        await assert_near(await px(sep, "height", "::before"), 3, 0.2, f"live separator {index} height")
        assert await css(sep, "border-radius", "::before") in ("50%", "1.5px")

    # Navigation dimensions and typography.
    tabs = page.locator(".top-tabs")
    await assert_near((await box(tabs))["height"], 32, 2, "tab strip height")
    for label in ["CHECK", "ACTIVITY", "PERMISSIONS", "SECURITY LAB"]:
        tab = page.get_by_role("button", name=label, exact=True)
        await assert_near(await px(tab, "font-size"), 9.15, 0.2, f"{label} tab font")

    # Hero typography, spacing and icon geometry.
    hero = page.locator(".hero-block h1")
    hero_copy = page.locator(".hero-block p")
    await assert_near(await px(hero, "font-size"), 31, 0.2, "hero font size")
    assert float(await css(hero, "font-weight")) >= 800
    await assert_near(await px(hero_copy, "font-size"), 10.8, 0.2, "hero copy font size")
    hero_box = await box(hero)
    assert 18 <= hero_box["x"] <= 22
    hero_lines = await hero.evaluate(
        """el => el.getBoundingClientRect().height / parseFloat(getComputedStyle(el).lineHeight)"""
    )
    assert 1.8 <= hero_lines <= 2.2, f"hero should stay two lines, got {hero_lines}"

    mark = page.locator(".hero-mark")
    mark_box = await box(mark)
    shield = await box(mark.locator("svg"))
    await assert_near(shield["width"], 36, 0.6, "hero shield width")
    await assert_near(shield["height"], 42, 0.6, "hero shield height")
    corner = mark.locator(".corner").first
    await assert_near(await px(corner, "width"), 11, 0.2, "hero corner width")
    await assert_near(await px(corner, "height"), 11, 0.2, "hero corner height")
    assert mark_box["x"] > hero_box["x"] + hero_box["width"], "hero icon overlaps headline"

    # Cards and internal typography.
    authority = page.locator(".authority-panel")
    request = page.locator(".request-panel")
    authority_box = await box(authority)
    request_box = await box(request)
    assert 250 <= authority_box["height"] <= 285
    assert 92 <= request_box["height"] <= 104
    await assert_near(authority_box["x"], 20, 1, "authority left gutter")
    await assert_near(request_box["x"], 20, 1, "request left gutter")
    await assert_near(await px(page.locator(".agent-name"), "font-size"), 20, 0.2, "agent font")
    await assert_near(await px(page.locator(".request-summary strong"), "font-size"), 15.5, 0.2, "request amount font")

    # All primary mobile targets remain at least 44x44 even where the visual
    # reference draws compact controls.
    for control in [
        menu,
        page.get_by_role("button", name="Decrease maximum payment"),
        page.get_by_role("button", name="Increase maximum payment"),
        page.get_by_role("button", name="Shorten permission duration"),
        page.get_by_role("button", name="Extend permission duration"),
        page.get_by_role("button", name="CHECK THIS REQUEST"),
        page.get_by_role("button", name="Current request"),
    ]:
        target = await box(control)
        assert target["width"] >= 44 and target["height"] >= 44, f"undersized target: {target}"

    # CTA typography and the custom reference-matched arrow.
    cta = page.get_by_role("button", name="CHECK THIS REQUEST")
    await assert_near(await px(cta, "font-size"), 13.5, 0.2, "CTA font size")
    arrow = page.locator(".check-button .arrow")
    arrow_box = await box(arrow)
    await assert_near(arrow_box["width"], 23, 0.5, "CTA arrow width")
    await assert_near(arrow_box["height"], 16, 0.5, "CTA arrow height")
    assert await px(arrow, "font-size") == 0

    # File, dropdown and lock icons must remain within their intended boxes.
    request_icon = await box(page.locator(".request-summary svg"))
    await assert_near(request_icon["width"], 30, 0.6, "request file icon width")
    await assert_near(request_icon["height"], 28, 0.6, "request file icon height")
    chevron = await box(page.locator(".select-shell svg"))
    await assert_near(chevron["width"], 13, 0.5, "recipient chevron width")
    lock = await box(page.locator(".safety-note svg"))
    await assert_near(lock["height"], 29, 0.6, "safety lock height")

    # Keyboard focus remains visible and the menu works without a pointer.
    await page.keyboard.press("Tab")
    await expect(menu).to_be_focused()
    assert float((await css(menu, "outline-width")).replace("px", "")) >= 3
    await page.keyboard.press("Enter")
    await expect(page.get_by_role("menu")).to_be_visible()
    await page.keyboard.press("Enter")
    await expect(page.get_by_role("menu")).to_be_hidden()

    for selector in [
        ".hero-block h1",
        ".hero-block p",
        ".agent-name",
        ".stepper output",
        ".request-summary > div",
        ".safety-note",
    ]:
        await assert_not_clipped(page.locator(selector).first, selector)

    assert not console_errors, f"console errors on first screen: {console_errors}"
    await page.screenshot(path=str(ARTIFACTS / "ui-fidelity-first-390.png"), full_page=True)
    await page.close()


async def checking_screen_390(browser):
    page = await browser.new_page(viewport={"width": 390, "height": 844}, device_scale_factor=1)
    calls = []

    async def authorize(route):
        payload = json.loads(route.request.post_data or "{}")
        calls.append(payload["mode"])
        if payload["mode"] == "policy":
            await asyncio.sleep(0.08)
            await route.fulfill(status=200, content_type="application/json", body=json.dumps(response_body(status="REQUIRES_INTELLIGENCE", decision=None)))
            return
        assert payload["freezeFingerprint"] == FREEZE
        await asyncio.sleep(0.9)
        await route.fulfill(status=200, content_type="application/json", body=json.dumps(response_body(status="DECIDED", decision="ALLOW", evidence_status="COMPLETE")))

    await page.route("**/api/authorize", authorize)
    await page.goto(BASE_URL, wait_until="networkidle")
    await page.get_by_role("button", name="CHECK THIS REQUEST").click()
    await expect(page.get_by_text("REAL CHECKS RUNNING", exact=True)).to_be_visible(timeout=2000)
    await assert_no_overflow(page, "390px checking screen")
    heading = page.get_by_role("heading", name="CHECKING REQUEST")
    await assert_near(await px(heading, "font-size"), 20, 0.3, "checking heading font")
    heading_box = await box(heading)
    assert 19 <= heading_box["x"] <= 22

    request = page.locator(".checking-request-card")
    request_box = await box(request)
    assert 59 <= request_box["height"] <= 67
    await assert_near(request_box["x"], 20, 1, "checking request left gutter")
    strong_size = await px(request.locator("strong"), "font-size")
    assert 14.2 <= strong_size <= 14.9, f"checking request title font drifted: {strong_size}"
    request_icon = await box(request.locator("svg"))
    await assert_near(request_icon["width"], 25, 0.6, "checking file icon width")
    await assert_near(request_icon["height"], 27, 0.6, "checking file icon height")

    timeline = page.locator(".check-timeline")
    await assert_near(await px(timeline, "row-gap"), 21.06, 1.2, "timeline row gap")
    for stage in ["01", "02", "03", "04"]:
        row = page.locator(f'[data-stage="{stage}"]')
        number = await box(row.locator(".timeline-number"))
        await assert_near(number["width"], 38, 0.6, f"{stage} number width")
        await assert_near(number["height"], 38, 0.6, f"{stage} number height")
        status = await box(row.locator(".timeline-status"))
        await assert_near(status["width"], 48, 0.6, f"{stage} status width")
        await assert_near(status["height"], 38, 0.6, f"{stage} status height")
        await assert_not_clipped(row.locator(".timeline-copy"), f"timeline {stage} copy")

    spinner = page.locator(".status-spinner")
    await assert_near(await px(spinner, "width"), 22, 0.6, "spinner width")
    await assert_near(await px(spinner, "height"), 22, 0.6, "spinner height")
    assert await css(spinner, "animation-name") == "proofgate-spin"
    await assert_near(await px(spinner, "border-top-width"), 3, 0.2, "spinner stroke")

    work = page.locator(".checking-work-box")
    work_box = await box(work)
    assert 90 <= work_box["height"] <= 100
    await assert_near(await px(work.locator("strong"), "font-size"), 11.5, 0.2, "working title font")
    assert "BOUNDED X402 VERIFICATION FEES" in (await work.inner_text()).upper()

    cancel = page.get_by_role("button", name="CANCEL CHECK")
    cancel_box = await box(cancel)
    assert cancel_box["height"] >= 44
    await expect(cancel).to_be_disabled()
    assert "real Miner request" in (await cancel.get_attribute("title") or "")

    for selector in [
        ".checking-request-card",
        ".timeline-copy",
        ".checking-work-box",
        ".checking-safety-note",
    ]:
        loc = page.locator(selector)
        for index in range(await loc.count()):
            await assert_not_clipped(loc.nth(index), f"{selector}[{index}]")

    await page.screenshot(path=str(ARTIFACTS / "ui-fidelity-checking-390.png"), full_page=True)
    await expect(page.get_by_text("ALLOW", exact=True)).to_be_visible(timeout=3000)
    assert calls == ["policy", "live"], f"unexpected authorization order: {calls}"
    await assert_no_overflow(page, "390px decision screen")
    back = page.get_by_role("button", name="BACK TO REQUEST")
    back_box = await box(back)
    assert back_box["height"] >= 44
    await page.close()


async def responsive_matrix(browser):
    for width, height in [(320, 800), (360, 800), (430, 932), (1024, 1100)]:
        page = await browser.new_page(viewport={"width": width, "height": height}, device_scale_factor=1)
        await page.goto(BASE_URL, wait_until="networkidle")
        await assert_no_overflow(page, f"{width}px first screen")

        shell = await box(page.locator(".app-page"))
        if width >= 700:
            assert 458 <= shell["width"] <= 462
        else:
            assert shell["width"] <= width + 1

        hero = await box(page.locator(".hero-block h1"))
        mark = await box(page.locator(".hero-mark"))
        assert hero["x"] + hero["width"] <= mark["x"] + 1, f"{width}px hero collision"

        cta = await box(page.get_by_role("button", name="CHECK THIS REQUEST"))
        arrow = await box(page.locator(".check-button .arrow"))
        assert arrow["x"] >= cta["x"] and arrow["x"] + arrow["width"] <= cta["x"] + cta["width"]
        assert cta["height"] >= 44

        request = await box(page.locator(".request-panel"))
        assert request["x"] >= 0 and request["x"] + request["width"] <= width + 1
        await page.close()


async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch()
        try:
            await first_screen_390(browser)
            await checking_screen_390(browser)
            await responsive_matrix(browser)
        finally:
            await browser.close()


if __name__ == "__main__":
    asyncio.run(main())