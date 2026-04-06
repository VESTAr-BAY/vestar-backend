export function toOptionalBigInt(value?: string): bigint | undefined {
  if (value === undefined || value === null || value === '') {
    return undefined;
  }

  return BigInt(value);
}

