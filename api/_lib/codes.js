const crypto = require('crypto');

const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function generateCodes(quantity, length = 6) {
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 100 || !Number.isInteger(length) || length < 4 || length > 6) {
        throw new Error('Codes must be 4-6 characters; quantity must be between 1 and 100');
    }
    const codes = new Set();
    while (codes.size < quantity) {
        let code = '';
        for (let index = 0; index < length; index++) code += alphabet[crypto.randomInt(alphabet.length)];
        codes.add(code);
    }
    return [...codes];
}

module.exports = { generateCodes };