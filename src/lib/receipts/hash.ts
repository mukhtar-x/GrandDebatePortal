import { createHash } from "node:crypto";
import sharp from "sharp";

export function sha256Hex(buffer: Buffer): string {
    return createHash("sha256").update(buffer).digest("hex");
}

/**
 * 64-bit difference hash as 16 hex characters: shrink to 9x8 greyscale and compare each
 * pixel with its right neighbour. Recompressed, resized or lightly cropped copies of an
 * image produce hashes within a small Hamming distance of the original.
 */
export async function dHash(image: Buffer): Promise<string> {
    const pixels = await sharp(image)
        .grayscale()
        .resize(9, 8, { fit: "fill" })
        .raw()
        .toBuffer();

    let hex = "";
    let nibble = 0;
    for (let bit = 0; bit < 64; bit++) {
        const row = Math.floor(bit / 8);
        const col = bit % 8;
        nibble = (nibble << 1) | (pixels[row * 9 + col] > pixels[row * 9 + col + 1] ? 1 : 0);
        if (bit % 4 === 3) {
            hex += nibble.toString(16);
            nibble = 0;
        }
    }
    return hex;
}

export function hammingDistance(a: string, b: string): number {
    let count = 0;
    for (let i = 0; i < Math.min(a.length, b.length); i++) {
        let diff = parseInt(a[i], 16) ^ parseInt(b[i], 16);
        while (diff) {
            count += diff & 1;
            diff >>= 1;
        }
    }
    return count;
}
