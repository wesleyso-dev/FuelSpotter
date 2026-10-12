// constants/brands.ts
export type BrandKey = 'red_bull' | 'monster' | 'celsius' | 'other';

export const BRANDS: Record<BrandKey, { label: string; color: string; text: string; initial: string }> = {
  red_bull: { label: 'Red Bull',       color: '#1E3A8A', text: '#FFFFFF', initial: 'R' },
  monster:  { label: 'Monster Energy', color: '#16A34A', text: '#0A0A0A', initial: 'M' },
  celsius:  { label: 'Celsius',        color: '#F97316', text: '#FFFFFF', initial: 'C' },
  other:    { label: 'Other',          color: '#52525B', text: '#FFFFFF', initial: '?' },
};

export const BRAND_KEYS = Object.keys(BRANDS) as BrandKey[];