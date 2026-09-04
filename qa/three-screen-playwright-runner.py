import asyncio
import importlib.util
from pathlib import Path

from playwright.async_api import expect

MODULE_PATH = Path(__file__).with_name("three-screen-playwright.py")
spec = importlib.util.spec_from_file_location("proofgate_three_screen_qa", MODULE_PATH)
assert spec is not None and spec.loader is not None
qa = importlib.util.module_from_spec(spec)
spec.loader.exec_module(qa)


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

    # The generated Screen 3 reference uses a heavy monospaced execution hero,
    # while Screen 1 intentionally retains its bold editorial sans headline.
    hero_family = await qa.css(page.locator(".execution-hero h1"), "font-family")
    detail_family = await qa.css(page.locator(".execution-details dt").first, "font-family")
    assert "Courier New" in hero_family, f"Screen 3 reference hero must use mono, got {hero_family}"
    assert "Courier New" in detail_family, f"Screen 3 operational data must use mono, got {detail_family}"

    # Flat mint lightning block; never a gradient.
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

    # Buttons stay finger-sized even though the visual language is compact.
    await qa.assert_target(page.get_by_role("button", name="EXECUTION IN PROGRESS"))
    await qa.assert_target(page.get_by_role("button", name="VIEW PROOF"))

    # The production surface must not introduce mock/demo language.
    body = (await page.locator("body").inner_text()).upper()
    for forbidden in ["SANDBOX", "SYNTHETIC", "FAKE MINER", "DEMO MODE"]:
        assert forbidden not in body, f"forbidden production UI label: {forbidden}"


qa.assert_screen3_running = reference_screen3_running

if __name__ == "__main__":
    asyncio.run(qa.main())
