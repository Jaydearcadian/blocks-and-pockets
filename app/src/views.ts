export type ViewId = 'overview' | 'blocks' | 'actions' | 'verify' | 'reference';

export type View = { id: ViewId; label: string; title: string; blurb: string; sections: { id: string; label: string }[] };

export const VIEWS: View[] = [
  {
    id: 'overview',
    label: 'Overview',
    title: 'Vault overview',
    blurb: 'One Bitcoin-backed loan, split into blocks of spending money. The Trove, the balances and where to start.',
    sections: [
      { id: 'start', label: 'Start here' },
      { id: 'trove', label: 'Trove' },
      { id: 'balances', label: 'Balances' },
    ],
  },
  {
    id: 'blocks',
    label: 'Blocks',
    title: 'Blocks and payments',
    blurb: 'Each block, its cash, caps, payees and mandate, and every payment the operator has asked for.',
    sections: [
      { id: 'blocks', label: 'Blocks' },
      { id: 'payments', label: 'Payments' },
    ],
  },
  {
    id: 'actions',
    label: 'Actions',
    title: 'Wallet actions',
    blurb: 'Owner and operator actions on this vault from a connected testnet wallet. Each action is checked with Mezo first, so a refused action sends nothing.',
    sections: [{ id: 'actions', label: 'Actions' }],
  },
  {
    id: 'verify',
    label: 'Verify',
    title: 'Verify',
    blurb: 'The checks every payment runs, the on-chain record, and the tie-outs between the vault books and Mezo.',
    sections: [
      { id: 'guardrails', label: 'Checks' },
      { id: 'record', label: 'Record' },
      { id: 'tieouts', label: 'Tie-outs' },
    ],
  },
  {
    id: 'reference',
    label: 'Reference',
    title: 'Reference',
    blurb: 'The terms this dashboard uses and the contracts it reads.',
    sections: [
      { id: 'glossary', label: 'Glossary' },
      { id: 'contracts', label: 'Contracts' },
    ],
  },
];

export const DEFAULT_VIEW: ViewId = 'overview';

export function viewHref(id: ViewId): string {
  return `#/app/${id}`;
}

// The view that holds a section, so old in-page anchors such as #payments still land somewhere.
export function viewOfSection(section: string): ViewId | undefined {
  return VIEWS.find((v) => v.sections.some((s) => s.id === section))?.id;
}

// Reads the hash: #/app/<view> picks a view; a bare #<section> picks the view that holds it and scrolls to it.
export function parseHash(hash: string): { view: ViewId; section?: string } {
  const h = hash.replace(/^#/, '');
  const m = /^\/app\/([a-z]+)\/?$/.exec(h);
  if (m) {
    const v = VIEWS.find((x) => x.id === m[1]);
    return { view: v ? v.id : DEFAULT_VIEW };
  }
  if (h && !h.startsWith('/')) {
    const v = viewOfSection(h);
    if (v) return { view: v, section: h };
  }
  return { view: DEFAULT_VIEW };
}

export function nextView(id: ViewId): View | undefined {
  const i = VIEWS.findIndex((v) => v.id === id);
  return VIEWS[i + 1];
}

// The record only exists for the demo vault, so other vaults drop it from the Verify view.
export function viewsFor(isDemo: boolean): View[] {
  return VIEWS.map((v) => ({ ...v, sections: v.sections.filter((s) => isDemo || s.id !== 'record') }));
}
