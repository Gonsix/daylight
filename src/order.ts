import { Item } from './model';

export function orderedTasks(items: Item[]): Item[] {
  return [...items].sort((a,b) => {
    const x = a.sortOrder, y = b.sortOrder;
    if (x != null && y != null && x !== y) return x-y;
    if (x != null && y == null) return -1;
    if (x == null && y != null) return 1;
    return (a.start ?? Infinity)-(b.start ?? Infinity) || a.title.localeCompare(b.title) || a.path.localeCompare(b.path);
  });
}
export function orderBetween(before: number | null, after: number | null, gap: number): number {
  const value = before === null ? (after === null ? gap : after-gap) : after === null ? before+gap : before+Math.floor((after-before)/2);
  if (!Number.isSafeInteger(value) || (before !== null && value <= before) || (after !== null && value >= after)) throw new Error('並び順の間隔が不足しています。近くのタスクのsort_orderを調整してください。');
  return value;
}
