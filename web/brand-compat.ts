const BRAND_REPLACEMENTS: Array<[RegExp, string]> = [
  [/ProofGate Vendor/g, "Auctorail Vendor"],
  [/PROOFGATE/g, "AUCTORAIL"],
  [/ProofGate/g, "Auctorail"],
  [/proofgate/g, "auctorail"],
  [/Telegraph is routing required intelligence to real Miners/g, "Telegraph is routing FRAUD_DETECTION to an eligible Miner. This bounded check stops automatically if trusted evidence is not returned quickly."],
  [/Checking live evidence…/g, "Checking live Telegraph evidence…"],
  [/Checking live evidence\.\.\./g, "Checking live Telegraph evidence..."],
];

function rebrandText(value: string): string {
  return BRAND_REPLACEMENTS.reduce((text, [pattern, replacement]) => text.replace(pattern, replacement), value);
}

function rebrandAttribute(attribute: string, value: string): string {
  let next = rebrandText(value);
  if (attribute === "href") {
    next = next
      .replace("github.com/emmy16-glitch/proof-gate", "github.com/emmy16-glitch/auctorail")
      .replace("github.com/emmy16-glitch/proofgate", "github.com/emmy16-glitch/auctorail");
  }
  return next;
}

function rebrandNode(node: Node): void {
  if (node.nodeType === Node.TEXT_NODE) {
    const current = node.textContent ?? "";
    const next = rebrandText(current);
    if (next !== current) node.textContent = next;
    return;
  }

  if (!(node instanceof Element)) return;

  for (const attribute of ["aria-label", "title", "placeholder", "alt", "href"]) {
    const current = node.getAttribute(attribute);
    if (!current) continue;
    const next = rebrandAttribute(attribute, current);
    if (next !== current) node.setAttribute(attribute, next);
  }

  for (const child of node.childNodes) rebrandNode(child);
}

function applyAuctorailBranding(): void {
  rebrandNode(document.documentElement);
  document.title = rebrandText(document.title);
}

applyAuctorailBranding();

const observer = new MutationObserver((records) => {
  for (const record of records) {
    for (const added of record.addedNodes) rebrandNode(added);
    if (record.type === "characterData") rebrandNode(record.target);
  }
});

observer.observe(document.documentElement, {
  childList: true,
  subtree: true,
  characterData: true,
});
