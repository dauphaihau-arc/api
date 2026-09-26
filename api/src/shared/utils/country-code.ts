/**
 * Canonical ISO 3166-1 alpha-2 country codes.
 *
 * Buyers capture a country as a display name ("Australia", "United States"),
 * while sellers configure destination rates with country codes ("AU", "US").
 * Matching two different vocabularies silently rejects valid destinations, so
 * every destination or rate value is canonicalized through this module before
 * comparison.
 */
const ISO_ALPHA2_CODES =
  'AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BV BW BY BZ CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ DE DJ DK DM DO DZ EC EE EG EH ER ES ET FI FJ FK FM FO FR GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW GY HK HM HN HR HT HU ID IE IL IM IN IO IQ IR IS IT JE JM JO JP KE KG KH KI KM KN KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT MU MV MW MX MY MZ NA NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM PN PR PS PT PW PY QA RE RO RS RU RW SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ TC TD TF TG TH TJ TK TL TM TN TO TR TT TV TW TZ UA UG UM US UY UZ VA VC VE VG VI VN VU WF WS YE YT ZA ZM ZW';

const ALPHA2_CODE_BY_CODE: Record<string, true> = Object.fromEntries(
  ISO_ALPHA2_CODES.split(' ').map((code) => [code, true as const]),
);

/**
 * Non-CLDR country names that buyer-facing country pickers and stored addresses
 * still produce. Written keys are lowercase.
 */
const COUNTRY_CODE_ALIASES: Record<string, string> = {
  america: 'US',
  'bosnia and herzegovina': 'BA',
  burma: 'MM',
  'cape verde': 'CV',
  congo: 'CG',
  'czech republic': 'CZ',
  'democratic republic of the congo': 'CD',
  'east timor': 'TL',
  england: 'GB',
  'great britain': 'GB',
  holland: 'NL',
  'hong kong sar': 'HK',
  iran: 'IR',
  'ivory coast': 'CI',
  korea: 'KR',
  laos: 'LA',
  macedonia: 'MK',
  moldova: 'MD',
  'north korea': 'KP',
  palestine: 'PS',
  russia: 'RU',
  scotland: 'GB',
  'south korea': 'KR',
  swaziland: 'SZ',
  syria: 'SY',
  taiwan: 'TW',
  tanzania: 'TZ',
  'the bahamas': 'BS',
  'the gambia': 'GM',
  turkey: 'TR',
  'united arab emirates': 'AE',
  'united kingdom': 'GB',
  'united states of america': 'US',
  venezuela: 'VE',
  'viet nam': 'VN',
  wales: 'GB',
};

let displayNameByCountryCode: Map<string, string> | undefined;

function buildDisplayNameIndex(): Map<string, string> {
  if (displayNameByCountryCode) {
    return displayNameByCountryCode;
  }

  const index = new Map<string, string>();
  const regionNames = new Intl.DisplayNames(['en'], { type: 'region' });

  for (const code of Object.keys(ALPHA2_CODE_BY_CODE)) {
    const displayName = regionNames.of(code);

    if (displayName) {
      index.set(displayName.trim().toLowerCase(), code);
    }
  }

  displayNameByCountryCode = index;

  return index;
}

/**
 * Resolves a country code or display name to its canonical alpha-2 code.
 * Unknown values are returned trimmed and uppercased, because guessing an
 * unmapped value would price the wrong destination.
 */
export function resolveCountryCode(value: string | undefined): string {
  const normalized = value?.trim() ?? '';

  if (!normalized) {
    return '';
  }

  const upperCased = normalized.toUpperCase();

  if (ALPHA2_CODE_BY_CODE[upperCased]) {
    return upperCased;
  }

  const lowerCased = normalized.toLowerCase();
  const alias = COUNTRY_CODE_ALIASES[lowerCased];

  if (alias) {
    return alias;
  }

  return buildDisplayNameIndex().get(lowerCased) ?? upperCased;
}
