import asyncio

from playwright.async_api import async_playwright, expect

BASE_URL = "http://127.0.0.1:4173"


async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch()
        page = await browser.new_page(viewport={"width": 390, "height": 844})
        await page.goto(BASE_URL, wait_until="networkidle")

        await page.get_by_role("button", name="CURRENT REQUEST", exact=False).click()
        await expect(page.get_by_text("AGENT REQUEST", exact=True)).to_be_visible()
        await page.get_by_role("button", name="EDIT TEST REQUEST").click()
        amount = page.locator("#request-amount")
        await amount.fill("6.00")
        await page.get_by_role("button", name="DONE EDITING").click()

        warning = page.get_by_text(
            "This request is above the current maximum. ProofGate will block it locally before any Miner is paid.",
            exact=True,
        )
        await expect(warning).to_be_visible()
        await expect(page.get_by_text("Nothing is sent yet.", exact=True)).to_be_visible()

        metrics = await warning.evaluate(
            """el => ({
              fontSize: parseFloat(getComputedStyle(el).fontSize),
              lineHeight: parseFloat(getComputedStyle(el).lineHeight),
              width: el.getBoundingClientRect().width,
              height: el.getBoundingClientRect().height,
              scrollWidth: el.scrollWidth,
              clientWidth: el.clientWidth
            })"""
        )
        assert metrics["fontSize"] >= 9, f"warning typography became unreadably small: {metrics}"
        assert metrics["scrollWidth"] <= metrics["clientWidth"] + 1, f"warning clipped: {metrics}"
        assert metrics["height"] >= metrics["lineHeight"], f"warning did not render normally: {metrics}"

        overflow = await page.evaluate(
            "document.documentElement.scrollWidth - document.documentElement.clientWidth"
        )
        assert overflow <= 1, f"over-limit state overflow: {overflow}px"

        await page.screenshot(path="playwright-artifacts/ui-fidelity-over-limit-390.png", full_page=True)
        await browser.close()


if __name__ == "__main__":
    asyncio.run(main())
