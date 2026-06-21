const INFERRED_FACET_TERMS = {
  color: {
    black: ['black'],
    white: ['white'],
    blue: ['blue'],
    beige: ['beige', 'cream', 'oatmeal', 'tan'],
    green: ['green', 'olive'],
    grey: ['grey', 'gray', 'silver', 'charcoal'],
    brown: ['brown', 'walnut'],
    pink: ['pink'],
  },
  material: {
    cotton: ['cotton'],
    linen: ['linen'],
    canvas: ['canvas'],
    nylon: ['nylon'],
    wood: ['wood', 'oak', 'walnut'],
    leather: ['leather', 'calf leather'],
    metal: ['metal'],
    plastic: ['plastic'],
  },
} as const;

export type InferredFacetKey = keyof typeof INFERRED_FACET_TERMS;

export type InferredFacetSignal = {
  facetKey: InferredFacetKey;
  optionKey: string;
  value: string;
};

export function inferFacetSignalsFromText(input: {
  title?: string;
  description?: string;
}): InferredFacetSignal[] {
  const text = normalizeText([input.title, input.description]);
  const signals: InferredFacetSignal[] = [];

  if (!text) {
    return signals;
  }

  (Object.entries(INFERRED_FACET_TERMS) as Array<
    [InferredFacetKey, Record<string, readonly string[]>]
  >).forEach(([facetKey, options]) => {
    Object.entries(options).forEach(([optionKey, terms]) => {
      if (terms.some((term) => containsWholeWord(text, term))) {
        signals.push({
          facetKey,
          optionKey,
          value: toDisplayValue(optionKey),
        });
      }
    });
  });

  return signals;
}

export function isInferredFacetSupported(facetKey: string): facetKey is InferredFacetKey {
  return facetKey in INFERRED_FACET_TERMS;
}

export function getInferredFacetTerms(
  facetKey: string,
  optionKey: string,
): string[] {
  if (!isInferredFacetSupported(facetKey)) {
    return [];
  }

  return INFERRED_FACET_TERMS[facetKey][optionKey as keyof typeof INFERRED_FACET_TERMS[typeof facetKey]] ?? [];
}

function normalizeText(values: Array<string | undefined>): string {
  return values
    .filter((value): value is string => typeof value === 'string')
    .join(' ')
    .toLowerCase();
}

function containsWholeWord(text: string, term: string): boolean {
  const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').toLowerCase();
  return new RegExp(`(^|[^a-z0-9])${escaped}([^a-z0-9]|$)`, 'i').test(text);
}

function toDisplayValue(optionKey: string): string {
  return optionKey
    .split('_')
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(' ');
}
