/**
 * One-time optimization: converts the large PNG artwork to WebP, which
 * is dramatically smaller at equivalent visual quality — the two PNGs
 * were 1.5-1.6MB each with no compression tuning, which is what caused
 * the visible "loading in stages" effect over slower connections
 * (e.g. Render's free tier). Re-run this any time the source PNGs
 * change.
 *
 * Usage: node scripts/optimize-images.js
 */
const sharp = require('sharp');
const path = require('path');

const IMAGES = ['screen2.png'];

async function main() {
    for (const file of IMAGES) {
        const input = path.join(__dirname, '..', 'assets', 'source', file);
        const output = path.join(__dirname, '..', 'assets', 'images', file.replace(/\.png$/, '.webp'));
        await sharp(input)
            .webp({ quality: 85 })
            .toFile(output);
        const fs = require('fs');
        const beforeBytes = fs.statSync(input).size;
        const afterBytes = fs.statSync(output).size;
        console.log(
            `${file} -> ${path.basename(output)}: ` +
            `${(beforeBytes / 1024).toFixed(0)}KB -> ${(afterBytes / 1024).toFixed(0)}KB ` +
            `(${(100 - (afterBytes / beforeBytes) * 100).toFixed(0)}% smaller)`
        );
    }
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
