export type CanonicalFacetOption = {
  optionKey: string;
  value: string;
};

const SHOE_SIZE_GROUPS = [
  {
    canonicalKey: 'us_6_eu_38_5',
    displayValue: 'US 6 / EU 38.5',
    aliases: ['us_6', 'eu_38_5'],
  },
  {
    canonicalKey: 'us_6_5_eu_39',
    displayValue: 'US 6.5 / EU 39',
    aliases: ['us_6_5', 'eu_39'],
  },
  {
    canonicalKey: 'us_7_eu_40',
    displayValue: 'US 7 / EU 40',
    aliases: ['us_7', 'eu_40'],
  },
  {
    canonicalKey: 'us_8_eu_41',
    displayValue: 'US 8 / EU 41',
    aliases: ['us_8', 'eu_41'],
  },
  {
    canonicalKey: 'us_9_eu_42',
    displayValue: 'US 9 / EU 42',
    aliases: ['us_9', 'eu_42'],
  },
  {
    canonicalKey: 'us_10_eu_43',
    displayValue: 'US 10 / EU 43',
    aliases: ['us_10', 'eu_43'],
  },
  {
    canonicalKey: 'us_11_eu_44',
    displayValue: 'US 11 / EU 44',
    aliases: ['us_11', 'eu_44'],
  },
] as const;

type ShoeSizeGroup = typeof SHOE_SIZE_GROUPS[number];

const SHOE_SIZE_ALIAS_TO_GROUP = new Map<string, ShoeSizeGroup>(
  SHOE_SIZE_GROUPS.flatMap((group) =>
    group.aliases.map((alias) => [alias, group] as const)
  )
);

const SHOE_SIZE_CANONICAL_KEY_TO_GROUP = new Map<string, ShoeSizeGroup>(
  SHOE_SIZE_GROUPS.map((group) => [group.canonicalKey, group] as const)
);

export function expandShoeSizeOptionKeys(optionKeys: string[]): string[] {
  return Array.from(new Set(optionKeys.flatMap((optionKey) => {
    const group = SHOE_SIZE_ALIAS_TO_GROUP.get(optionKey) ?? SHOE_SIZE_CANONICAL_KEY_TO_GROUP.get(optionKey);

    return group
      ? [...group.aliases, group.canonicalKey]
      : [optionKey];
  })));
}

export function expandShoeSizeOptionValues(optionValues: string[]): string[] {
  return Array.from(new Set(optionValues.flatMap((optionValue) => {
    const optionKey = toFacetKey(optionValue);
    const group = SHOE_SIZE_ALIAS_TO_GROUP.get(optionKey) ?? SHOE_SIZE_CANONICAL_KEY_TO_GROUP.get(optionKey);

    return group
      ? [group.displayValue, ...group.aliases.map(toDisplayValue)]
      : [optionValue];
  })));
}

export function toCanonicalFacetOption(
  facetKey: string,
  optionValue: string
): CanonicalFacetOption {
  if (facetKey !== 'shoe_size') {
    return {
      optionKey: toFacetKey(optionValue),
      value: optionValue,
    };
  }

  const optionKey = toFacetKey(optionValue);
  const group = SHOE_SIZE_ALIAS_TO_GROUP.get(optionKey) ?? SHOE_SIZE_CANONICAL_KEY_TO_GROUP.get(optionKey);

  if (!group) {
    return {
      optionKey,
      value: optionValue,
    };
  }

  return {
    optionKey: group.canonicalKey,
    value: group.displayValue,
  };
}

function toFacetKey(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function toDisplayValue(optionKey: string): string {
  const segments = optionKey.split('_');
  const unit = segments.shift();

  if (!unit) {
    return optionKey;
  }

  const size = segments.length > 1
    ? `${segments[0]}.${segments.slice(1).join('')}`
    : segments[0] ?? '';

  return `${unit.toUpperCase()} ${size}`.trim();
}
