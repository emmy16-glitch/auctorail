import asyncio
import json

from playwright.async_api import async_playwright, expect

BASE_URL = "http://127.0.0.1:4173"
FREEZE = "0x" + ("f" * 64)
VENDOR = "0xB38d0405DF1b15961aEf29C7c45f2ED285822c14"


def reply(*, fingerprint=FREEZE, status="REQUIRES_INTELLIGENCE", decision=None, evidence="NOT_REQUESTED"):
    return {
        "status": status,
        "decision": decision,
        "reason": "external_intelligence_required" if decision is None else "adaptive_policy_allow",
        "riskTier": "MEDIUM",
        "policyId": "payments.adaptive.v1",
        "policyVersion": 1,
        "freezeFingerprint": fingerprint,
        "action": {
            "id": "act_error_state",
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
        "evidence": {"status": evidence, "spendRaw": "0"},
    }


async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch()
        page = await browser.new_page(viewport={"width": 390, "height": 844})

        async def authorize(route):
            payload = json.loads(route.request.post_data or "{}")
            if payload["mode"] == "policy":
                await route.fulfill(
                    status=200,
                    content_type="application/json",
                    body=json.dumps(reply()),
                )
                return

            # A favorable-looking response is deliberately bound to the wrong
            # preflight fingerprint. The UI must fail closed and describe the
            # Miner stage as stopped, never as still running or waiting on rules.
            await route.fulfill(
                status=200,
                content_type="application/json",
                body=json.dumps(
                    reply(
                        fingerprint="0x" + ("e" * 64),
                        status="DECIDED",
                        decision="ALLOW",
                        evidence="COMPLETE",
                    )
                ),
            )

        await page.route("**/api/authorize", authorize)
        await page.goto(BASE_URL, wait_until="networkidle")
        await page.get_by_role("button", name="CHECK THIS REQUEST").click()

        await expect(page.get_by_text("Stopped safely.", exact=True)).to_be_visible(timeout=2500)
        await expect(page.get_by_text("REAL CHECKS STOPPED", exact=True)).to_be_visible()
        await expect(
            page.get_by_text("Live Miner verification did not produce a trusted result", exact=True)
        ).to_be_visible()
        await expect(page.get_by_text("REAL CHECKS RUNNING", exact=True)).to_have_count(0)
        await expect(page.get_by_text("Waiting for authorization rules", exact=True)).to_have_count(0)
        await expect(page.get_by_text("ALLOW", exact=True)).to_have_count(0)

        overflow = await page.evaluate(
            "document.documentElement.scrollWidth - document.documentElement.clientWidth"
        )
        assert overflow <= 1, f"error-state screen overflow: {overflow}px"

        await page.screenshot(path="playwright-artifacts/ui-fidelity-error-390.png", full_page=True)
        await browser.close()


if __name__ == "__main__":
    asyncio.run(main())
