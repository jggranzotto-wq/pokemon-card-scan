import sharp from "sharp";

/** 64-bit difference hash, stored as 16 hex characters. */
export async function differenceHash(input: Buffer): Promise<string> {
  const { data, info } = await sharp(input, { failOn: "none" })
    .rotate()
    .resize(9, 8, { fit: "fill" })
    .greyscale()
    .raw()
    .toBuffer({ resolveWithObject: true });
  if (info.width < 9 || info.height < 8) {
    throw new Error("Could not hash that image.");
  }

  let bits = 0n;
  let bit = 0;
  for (let y = 0; y < 8; y++) {
    for (let x = 0; x < 8; x++) {
      const left = data[y * info.width + x];
      const right = data[y * info.width + x + 1];
      if (left > right) bits |= 1n << BigInt(bit);
      bit += 1;
    }
  }
  return bits.toString(16).padStart(16, "0");
}

export function hashDistance(left: string, right: string): number {
  let x = BigInt(`0x${left}`) ^ BigInt(`0x${right}`);
  let count = 0;
  while (x) {
    count += Number(x & 1n);
    x >>= 1n;
  }
  return count;
}
