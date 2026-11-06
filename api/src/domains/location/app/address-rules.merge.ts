import { getCountryData } from 'lib-address/lite';
import type {
  AddressRuleControl,
  AddressRuleField,
  AddressRuleFieldKey,
  CountryAddressRuleOverride,
  CountryAddressRules,
} from './location.types';

interface FieldMeta {
  label: string;
  control: AddressRuleControl;
  autocomplete: string;
}

interface CountrySubRegion {
  key: string;
  name: string;
  zip: string | null;
}

/**
 * The `lite` entrypoint only exposes the Latin format (`lfmt`). Local-script
 * formats (`fmt`) are not included, so countries whose local order differs
 * carry an explicit order in the Arc override file.
 */
interface CountryMetadata {
  code: string;
  lfmt?: string | null;
  zip: string | null;
  require: string | null;
  // Mirrors the library payload key.
  sub_regions: CountrySubRegion[];
}

const DEFAULT_FIELD_META: Record<AddressRuleFieldKey, FieldMeta> = {
  full_name: {
    label: 'Full Name',
    control: 'text',
    autocomplete: 'name',
  },
  address_1: {
    label: 'Street',
    control: 'text',
    autocomplete: 'address-line1',
  },
  address_2: {
    label: 'Apt / Suite / Other',
    control: 'text',
    autocomplete: 'address-line2',
  },
  city: {
    label: 'City',
    control: 'text',
    autocomplete: 'address-level2',
  },
  subdivision: {
    label: 'State/Province',
    control: 'text',
    autocomplete: 'address-level1',
  },
  zip: {
    label: 'Zip/Postal code',
    control: 'text',
    autocomplete: 'postal-code',
  },
  phone: {
    label: 'Phone',
    control: 'tel',
    autocomplete: 'tel',
  },
};

/** Legacy hard-coded order, used when neither metadata nor an override exists. */
const LEGACY_ORDER: AddressRuleFieldKey[] = [
  'full_name',
  'address_1',
  'address_2',
  'city',
  'subdivision',
  'zip',
  'phone',
];

/** Fields the API contract always requires, even when a format omits them. */
const ALWAYS_REQUIRED: AddressRuleFieldKey[] = [
  'full_name',
  'address_1',
  'city',
];

const FORMAT_TOKEN_TO_FIELD: Record<string, AddressRuleFieldKey | undefined> = {
  '%N': 'full_name',
  '%A': 'address_1',
  '%C': 'city',
  '%S': 'subdivision',
  '%Z': 'zip',
  // `%O` (organisation), `%D` (dependent locality) and `%X` (sorting code)
  // have no equivalent in the persisted contract and are dropped.
};

function loadCountryMetadata(
  countryCode: string,
): CountryMetadata | null {
  try {
    return getCountryData(countryCode) as CountryMetadata | null;
  }
  catch {
    return null;
  }
}

function pushField(order: AddressRuleFieldKey[], key: AddressRuleFieldKey): void {
  if (order.includes(key)) {
    return;
  }

  if (key === 'address_1') {
    order.push('address_1');
    if (!order.includes('address_2')) {
      order.push('address_2');
    }
    return;
  }

  order.push(key);
}

function getFormatFields(
  metadata: CountryMetadata | null,
): Set<AddressRuleFieldKey> {
  const fields = new Set<AddressRuleFieldKey>();

  for (const token of metadata?.lfmt?.match(/%[A-Za-z]/g) ?? []) {
    const field = FORMAT_TOKEN_TO_FIELD[token];
    if (field) {
      fields.add(field);
    }
  }

  return fields;
}

function insertBefore(
  order: AddressRuleFieldKey[],
  key: AddressRuleFieldKey,
  beforeKey: AddressRuleFieldKey,
): void {
  if (order.includes(key)) {
    return;
  }

  const index = order.indexOf(beforeKey);
  if (index === -1) {
    order.push(key);
  }
  else {
    order.splice(index, 0, key);
  }
}

function getFieldOrder(
  metadata: CountryMetadata | null,
  override: CountryAddressRuleOverride | undefined,
): AddressRuleFieldKey[] {
  if (!metadata && !override) {
    return [...LEGACY_ORDER];
  }

  const order: AddressRuleFieldKey[] = [];

  if (override?.order) {
    for (const key of override.order) {
      pushField(order, key);
    }
  }
  else if (metadata) {
    for (const field of getFormatFields(metadata)) {
      pushField(order, field);
    }
  }
  else {
    for (const key of LEGACY_ORDER) {
      pushField(order, key);
    }
  }

  // Contract fields stay in the list even when a country format omits a
  // token, so consumers can always read every persisted field.
  for (const key of ALWAYS_REQUIRED) {
    pushField(order, key);
  }

  // Hidden fields keep their legacy position so ordering stays stable.
  insertBefore(order, 'subdivision', 'zip');
  pushField(order, 'zip');
  pushField(order, 'phone');

  return order;
}

function isVisible(
  key: AddressRuleFieldKey,
  metadata: CountryMetadata | null,
  hasAdministrativeAreas: boolean,
  hidden: ReadonlySet<AddressRuleFieldKey>,
): boolean {
  if (hidden.has(key)) {
    return false;
  }

  const formatFields = getFormatFields(metadata);

  switch (key) {
    case 'subdivision':
      return !metadata
        || formatFields.has('subdivision')
        || hasAdministrativeAreas;
    case 'zip':
      return !metadata || formatFields.has('zip');
    case 'full_name':
    case 'address_1':
    case 'address_2':
    case 'city':
    case 'phone':
      return true;
    default:
      return true;
  }
}

function isRequired(
  key: AddressRuleFieldKey,
  visible: boolean,
  hasAdministrativeAreas: boolean,
  postalCodeRequired: boolean,
): boolean {
  if (!visible) {
    return false;
  }

  switch (key) {
    case 'address_2':
      return false;
    case 'subdivision':
      return hasAdministrativeAreas;
    case 'zip':
      return postalCodeRequired;
    case 'full_name':
    case 'address_1':
    case 'city':
    case 'phone':
      return true;
    default:
      return true;
  }
}

/**
 * Merges `lib-address/lite` country metadata, Arc's override row, and Arc
 * country flags into the ordered field rules served to clients. The result is
 * derived per request; generated defaults are never persisted.
 */
export function mergeCountryAddressRules(input: {
  countryCode: string;
  hasAdministrativeAreas: boolean;
  postalCodeRequired: boolean;
  override?: CountryAddressRuleOverride | null;
}): CountryAddressRules {
  const countryCode = input.countryCode.trim().toUpperCase();
  const metadata = loadCountryMetadata(countryCode);
  const override = input.override ?? undefined;
  const hidden = new Set(override?.hidden ?? []);
  const labels = override?.labels ?? {};

  const fields = getFieldOrder(metadata, override).map((key): AddressRuleField => {
    const meta = DEFAULT_FIELD_META[key];
    const visible = isVisible(
      key,
      metadata,
      input.hasAdministrativeAreas,
      hidden,
    );

    return {
      key,
      label: labels[key] ?? meta.label,
      visible,
      required: isRequired(
        key,
        visible,
        input.hasAdministrativeAreas,
        input.postalCodeRequired,
      ),
      control: key === 'subdivision' && input.hasAdministrativeAreas
        ? 'select'
        : meta.control,
      autocomplete: meta.autocomplete,
    };
  });

  return { countryCode, fields };
}
