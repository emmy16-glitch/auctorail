const BRAND_REPLACEMENTS: Array<[RegExp, string]> = [
  [/ProofGate Vendor/g, "Auctorail Vendor"],
  [/PROOFGATE/g, "AUCTORAIL"],
  [/ProofGate/g, "Auctorail"],
  [/proofgate/g, "auctorail"],
];

function rebrandText(value: string): string {
  return BRAND_REPLACEMENTS.reduce((text, [pattern, replacement]) => text.replace(pattern, replacement), value);
}

function rebrandNode(node: Node): void {
  if (node.nodeType === Node.TEXT_NODE) {
    const current = node.textContent ?? "";
    const next = rebrandText(current);
    if (next !== current) node.textContent = next;
    return;
  }

  if (!(node instanceof Element)) return;

  for (const attribute of ["aria-label", "title", "placeholder", "alt"]) {
    const current = node.getAttribute(attribute);
    if (!current) continue;
    const next = rebrandText(current);
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
