"""Real local Lab API plus fault injection; never submits a live payment."""
import asyncio
import copy
import json
import os
from pathlib import Path
from playwright.async_api import async_playwright, expect

BASE_URL = os.environ.get("AUCTORAIL_QA_URL", "http://127.0.0.1:4173")

async def open_lab(page):
    await page.goto(BASE_URL, wait_until="networkidle")
    await page.locator(".nav-links").get_by_role("button", name="SECURITY LAB", exact=True).click()
    return page.get_by_test_id("security-lab-screen")

async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch()
        try:
            for width in [320, 390, 1440]:
                page = await browser.new_page(viewport={"width": width, "height": 1000})
                errors = []
                forbidden = []
                page.on("pageerror", lambda error: errors.append(str(error)))
                page.on("console", lambda message: errors.append(message.text) if message.type == "error" else None)
                async def reject_live(route):
                    forbidden.append(route.request.url)
                    await route.abort()
                await page.route("**/api/authorize", reject_live)
                await page.route("**/api/execute", reject_live)
                lab = await open_lab(page)
                for scenario, label, code in [
                    ("permit_replay", "ATTACK BLOCKED", "permit_already_consumed:1"),
                    ("amount_mutation", "ATTACK BLOCKED", "action_hash_mismatch"),
                    ("recipient_mutation", "ATTACK BLOCKED", "BLOCK:mandate_destination_violation:no_permit"),
                    ("expired_permission", "ATTACK BLOCKED", "BLOCK:mandate_expired:no_permit"),
                    ("missing_evidence", "HOLD · NO PERMIT", "HOLD:telegraph_evidence:no_permit"),
                    ("receipt_tamper", "TAMPER DETECTED", "false")
                ]:
                    await lab.get_by_label("Select attack to run").select_option(scenario)
                    await expect(lab.locator(".verdict-display")).to_have_text(label, timeout=10000)
                    await expect(lab.locator(".kv").get_by_text(code, exact=True).first).to_be_visible()
                await lab.get_by_role("button", name="RUN SUITE", exact=True).click()
                await expect(lab.locator(".verdict-display")).to_have_text("RAIL HELD 13/13", timeout=10000)
                assert await page.evaluate("document.documentElement.scrollWidth <= innerWidth + 1"), f"overflow at {width}"
                Path("playwright-artifacts").mkdir(exist_ok=True)
                await page.screenshot(path=f"playwright-artifacts/lab-real-{width}.png", full_page=True)
                assert not errors, errors
                assert not forbidden, forbidden
                await page.close()

            page = await browser.new_page()
            response = await page.request.post(BASE_URL + "/api/security-lab")
            report = await response.json()
            failed = copy.deepcopy(report)
            failed["scenarios"][2].update(observed="unexpected_authority", passed=False)
            failed.update(passed=12, allPassed=False)
            async def failed_report(route):
                await route.fulfill(json=failed)
            await page.route("**/api/security-lab", failed_report)
            lab = await open_lab(page)
            await lab.get_by_role("button", name="RUN SUITE", exact=True).click()
            await expect(lab.locator(".verdict-display")).to_contain_text("BOUNDARY FAILED", timeout=10000)
            assert "RAIL HELD" not in await lab.inner_text()
            await lab.get_by_role("button", name="RUN ATTACK", exact=True).click()
            await expect(lab.locator(".verdict-display")).to_have_text("BOUNDARY FAILED", timeout=10000)
            assert "boundary held at" not in await lab.inner_text()
            await page.unroute("**/api/security-lab")
            for body in [{}, {**report, "allPassed": False}]:
                async def malformed(route):
                    await route.fulfill(json=body)
                await page.route("**/api/security-lab", malformed)
                await lab.get_by_role("button", name="RUN SUITE", exact=True).click()
                await expect(lab.get_by_role("alert")).to_contain_text("security_lab_invalid_report")
                await expect(lab.locator(".verdict-display")).to_have_count(0)
                await page.unroute("**/api/security-lab")
            async def unavailable(route):
                await route.fulfill(status=500, json={"error": "security_lab_failed"})
            await page.route("**/api/security-lab", unavailable)
            await lab.get_by_role("button", name="RUN ATTACK", exact=True).click()
            await expect(lab.get_by_role("alert")).to_contain_text("security_lab_failed")
            await page.unroute("**/api/security-lab")
            # A pending request must release the UI and allow a retry.
            async def hanging(route):
                await asyncio.sleep(17)
                try:
                    await route.abort()
                except Exception:
                    pass
            await page.route("**/api/security-lab", hanging)
            await lab.get_by_role("button", name="RUN ATTACK", exact=True).click()
            await expect(lab.get_by_role("alert")).to_contain_text("timed out", timeout=18000)
            await expect(lab.get_by_role("button", name="RUN ATTACK", exact=True)).to_be_enabled()
            await page.unroute("**/api/security-lab")
            await lab.get_by_role("button", name="RUN SUITE", exact=True).click()
            await expect(lab.locator(".verdict-display")).to_have_text("RAIL HELD 13/13", timeout=10000)
            await page.close()
            page = await browser.new_page(viewport={"width": 390, "height": 844})
            await page.goto(BASE_URL)
            await page.get_by_role("button", name="WATCH THE RAIL HOLD", exact=True).click()
            demo = page.get_by_test_id("guided-demo-screen")
            await demo.get_by_role("button", name="Over Limit", exact=False).click()
            await expect(demo.locator(".verdict-display")).to_have_text("BLOCKED", timeout=8000)
            await expect(demo.get_by_text("5/5 · STEP 5/5", exact=True)).to_be_visible()
            assert await page.evaluate("document.documentElement.scrollWidth <= innerWidth + 1")
            await page.close()
            print("PASS: real Lab API at 320/390/1440px; failures, malformed reports, timeout and retry")
        finally:
            await browser.close()

if __name__ == "__main__":
    asyncio.run(main())
