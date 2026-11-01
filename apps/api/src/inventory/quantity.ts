export function quantity(value: unknown, allowNegative = false): string {
  const input = String(value).trim();
  if (!/^-?\d+(\.\d{1,2})?$/.test(input) || (!allowNegative && input.startsWith('-')) || BigInt(input.startsWith('-') ? input.slice(1).split('.')[0] : input.split('.')[0]) > 9999999999n) throw Object.assign(new Error('数量格式无效。'), { code: 'INVALID_QUANTITY' });
  const negative = input.startsWith('-'); const [whole, fraction = ''] = (negative ? input.slice(1) : input).split('.');
  return `${negative ? '-' : ''}${whole}.${fraction.padEnd(2, '0')}`;
}
export function cents(value: unknown): bigint { const v = quantity(value, true); const neg = v.startsWith('-'); const [w, f] = (neg ? v.slice(1) : v).split('.'); const n = BigInt(w) * 100n + BigInt(f); return neg ? -n : n; }
export function decimal(value: bigint): string { const neg = value < 0n; const n = neg ? -value : value; return `${neg ? '-' : ''}${n / 100n}.${String(n % 100n).padStart(2, '0')}`; }
