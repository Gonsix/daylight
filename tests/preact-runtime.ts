import * as preact from 'preact';
import * as compat from 'preact/compat';
import * as hooks from 'preact/hooks';
import * as client from 'preact/compat/client';
import * as jsx from 'preact/jsx-runtime';

// VM bundles and the SSR renderer must share the same Preact hooks and options.
const modules: Record<string, unknown> = {
  preact, 'preact/compat': compat, 'preact/hooks': hooks,
  'preact/compat/client': client, 'preact/jsx-runtime': jsx,
};
export function uiRequire(id: string, fallback: (id: string) => unknown): unknown {
  return Object.hasOwn(modules, id) ? modules[id] : fallback(id);
}
