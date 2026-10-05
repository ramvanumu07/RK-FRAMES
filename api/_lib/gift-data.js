function giftData(body = {}) {
    const groomName = String(body.groomName || '').trim();
    const brideName = String(body.brideName || '').trim();
    const weddingDate = String(body.weddingDate || '');
    if (!groomName || !brideName || groomName.length > 100 || brideName.length > 100 || !/^\d{4}-\d{2}-\d{2}$/.test(weddingDate)) {
        throw new Error('Enter both names (up to 100 characters) and a valid wedding date');
    }
    const [year, month, day] = weddingDate.split('-').map(Number);
    const date = new Date(Date.UTC(year, month - 1, day));
    if (year < 1900 || date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
        throw new Error('Enter a valid wedding date from 1900 onward');
    }
    return { groomName, brideName, weddingDate };
}

module.exports = { giftData };