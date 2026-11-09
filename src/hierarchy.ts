import { Item } from './model';

export function childTasks(items: Item[]): Map<string, Item[]> {
  const children = new Map<string, Item[]>();
  for (const item of items) {
    if (item.kind !== 'task' || !item.parentTaskPath || item.parentTaskPath === item.path) continue;
    const rows = children.get(item.parentTaskPath) ?? [];
    rows.push(item); children.set(item.parentTaskPath, rows);
  }
  for (const rows of children.values()) rows.sort((a,b) => a.title.localeCompare(b.title,'ja'));
  return children;
}
export function canParent(items: Item[], childPath: string, parentPath: string): boolean {
  const tasks = new Map(items.filter(i=>i.kind==='task').map(i=>[i.path,i]));
  const seen = new Set([childPath]);
  let path: string | null | undefined = parentPath;
  while (path) {
    if (seen.has(path) || !tasks.has(path)) return false;
    seen.add(path); path=tasks.get(path)?.parentTaskPath;
  }
  return true;
}
