export function shuffle<T>(array: T[]): T[] {
    const arr = [...array];
    for (let index = arr.length - 1; index > 0; index--) {
        const randomIndex = Math.floor(Math.random() * (index + 1));
        [arr[index], arr[randomIndex]] = [arr[randomIndex], arr[index]];
    }
    return arr;
}