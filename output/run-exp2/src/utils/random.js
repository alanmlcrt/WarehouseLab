export function createSeededRandom(seed) {
    let state = seed >>> 0;
    const next = () => {
        state += 0x6d2b79f5;
        let value = state;
        value = Math.imul(value ^ (value >>> 15), value | 1);
        value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
        return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
    };
    const api = {
        next,
        float: (min, max) => min + next() * (max - min),
        int: (min, max) => Math.floor(min + next() * (max - min + 1)),
        pick: (items) => items[Math.floor(next() * items.length)] ?? items[0],
        shuffle: (items) => {
            const copy = [...items];
            for (let index = copy.length - 1; index > 0; index -= 1) {
                const swapIndex = Math.floor(next() * (index + 1));
                [copy[index], copy[swapIndex]] = [copy[swapIndex], copy[index]];
            }
            return copy;
        },
    };
    return api;
}
export function weightedRandomChoice(rng, options) {
    const totalWeight = options.reduce((sum, option) => sum + Math.max(0, option.weight), 0);
    if (totalWeight <= 0) {
        return options[0].item;
    }
    let cursor = rng.float(0, totalWeight);
    for (const option of options) {
        cursor -= Math.max(0, option.weight);
        if (cursor <= 0) {
            return option.item;
        }
    }
    return options[options.length - 1].item;
}
export function randomInt(rng, min, max) {
    return rng.int(min, max);
}
export function randomFloat(rng, min, max) {
    return rng.float(min, max);
}
