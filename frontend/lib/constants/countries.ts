/**
 * ISO 3166-1 numeric code → country name
 * Top 30 most common investor jurisdictions in real-estate tokenisation platforms.
 */
const COUNTRY_MAP: Record<number, string> = {
  36:  'Australia',
  76:  'Brazil',
  124: 'Canada',
  156: 'China',
  208: 'Denmark',
  246: 'Finland',
  250: 'France',
  276: 'Germany',
  344: 'Hong Kong',
  356: 'India',
  372: 'Ireland',
  376: 'Israel',
  380: 'Italy',
  392: 'Japan',
  410: 'South Korea',
  458: 'Malaysia',
  484: 'Mexico',
  528: 'Netherlands',
  554: 'New Zealand',
  578: 'Norway',
  702: 'Singapore',
  710: 'South Africa',
  724: 'Spain',
  752: 'Sweden',
  756: 'Switzerland',
  158: 'Taiwan',
  784: 'United Arab Emirates',
  826: 'United Kingdom',
  840: 'United States',
  999: 'Other',
};

export function countryName(code: number): string {
  return COUNTRY_MAP[code] ?? `Unknown (${code})`;
}

export default COUNTRY_MAP;
