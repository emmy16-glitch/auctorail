import asyncio
import importlib.util
from pathlib import Path

from playwright.async_api import async_playwright

MODULE_PATH = Path(__file__).with_name("first-screen-playwright.py")
spec = importlib.util.spec_from_file_location("proofgate_first_screen_qa", MODULE_PATH)
assert spec is not None and spec.loader is not None
qa = importlib.util.module_from_spec(spec)
spec.loader.exec_module(qa)


async def responsive_fit(browser, width: int, height: int, artifact_name: str):
    page = await browser.new_page(viewport={"width": width, "height": height}, device_scale_factor=1)
    await page.goto(qa.BASE_URL, wait_until="networkidle")

    overflow = await page.evaluate("document.documentElement.scrollWidth - document.documentElement.clientWidth")
    assert overflow <= 1, f"{width}px viewport overflow: {overflow}px"

    shell = page.locator(".app-page")
    shell_box = await shell.bounding_box()
    assert shell_box is not None

    if width >= 700:
        assert 458 <= shell_box["width"] <= 462, f"desktop mobile canvas width drifted: {shell_box}"
    else:
        assert shell_box["width"] <= width + 1, f"mobile canvas exceeds viewport: {shell_box}"

    await qa.assert_two_line_block(page.locator(".hero-block h1"), slack=2.35)
    authority_box = await page.locator(".authority-panel").bounding_box()
    request_box = await page.locator(".request-panel").bounding_box()
    assert authority_box is not None and authority_box["height"] >= 250, f"permission card over-compacted: {authority_box}"
    assert request_box is not None and request_box["height"] >= 92, f"request card over-compacted: {request_box}"

    for control in [
        page.get_by_role("button", name="Open menu"),
        page.get_by_role("button", name="Decrease maximum payment"),
        page.get_by_role("button", name="Increase maximum payment"),
        page.get_by_role("button", name="Shorten permission duration"),
        page.get_by_role("button", name="Extend permission duration"),
        page.get_by_role("button", name="CHECK THIS REQUEST"),
    ]:
        await qa.assert_tap_target(control)

    await page.screenshot(path=str(qa.ARTIFACTS / artifact_name), full_page=True)
    await page.close()


async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch()
        try:
            # Full first-screen fidelity + the wired Screen 1 → Screen 2 flow.
            await qa.mobile_flow(browser)

            # Verify the unpaid policy preflight blocks before any live Miner/x402 call.
            await qa.policy_block_short_circuit(browser)

            # Responsive coverage for both the setup screen and the live checking screen.
            await qa.narrow_mobile_fit(browser)
            await qa.narrow_checking_fit(browser)
            await responsive_fit(browser, 360, 800, "first-screen-360-mobile.png")
            await responsive_fit(browser, 430, 932, "first-screen-430-mobile.png")
            await responsive_fit(browser, 1024, 1100, "first-screen-idle-desktop.png")
        finally:
            await browser.close()


if __name__ == "__main__":
    asyncio.run(main())
