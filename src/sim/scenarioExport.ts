/**
 * A built scenario, as a file you can drop into `src/sim`.
 *
 * It emits a *derivation*, not a dump: `{ ...rechtsafFietspad, world: …, actors: … }`. The base
 * scenario files carry a great deal of Dutch prose explaining why each window and each severity
 * is what it is, and flattening a copy of all that into a generated file would fork the
 * explanation from the thing it explains. Spreading the base keeps one source of truth, and makes
 * the diff small enough that you can see at a glance what you actually changed.
 */
import type { Scenario } from './types';

const IDENT = /^[A-Za-z_$][A-Za-z0-9_$]*$/;

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** Structural equality over the JSON-ish values a scenario is made of. */
export function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((v, i) => deepEqual(v, b[i]));
  }
  if (isPlainObject(a) && isPlainObject(b)) {
    const ka = Object.keys(a);
    const kb = Object.keys(b);
    return ka.length === kb.length && ka.every((k) => k in b && deepEqual(a[k], b[k]));
  }
  return false;
}

/**
 * A value as TypeScript source.
 *
 * Not `JSON.stringify`: quoted keys and double quotes would fail the repo's own formatting the
 * moment the file landed, and the point of this output is that it reads like the files beside it.
 *
 * Numbers go out through `String`, which is the shortest form that reads back as the same double —
 * exactly, always. An earlier version rounded to six decimals to tidy up the float noise a drag
 * leaves behind, and quietly turned 25 km/h (6.944444444444445 m/s) into a different speed. Tidying
 * belongs where the drag is, and that is where it happens: the handle rounds to a decimetre before
 * the value ever reaches the draft. A serialiser's one job is to be faithful.
 */
export function toSource(value: unknown, indent = 0): string {
  const pad = '  '.repeat(indent);
  const inner = '  '.repeat(indent + 1);

  if (typeof value === 'number') return String(value);
  if (typeof value === 'boolean' || value === null) return String(value);
  if (typeof value === 'string') return `'${value.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
  if (Array.isArray(value)) {
    if (value.length === 0) return '[]';
    return `[\n${value.map((v) => inner + toSource(v, indent + 1)).join(',\n')},\n${pad}]`;
  }
  if (isPlainObject(value)) {
    const keys = Object.keys(value).filter((k) => value[k] !== undefined);
    if (keys.length === 0) return '{}';
    const body = keys
      .map((k) => `${inner}${IDENT.test(k) ? k : `'${k}'`}: ${toSource(value[k], indent + 1)}`)
      .join(',\n');
    return `{\n${body},\n${pad}}`;
  }
  return 'undefined';
}

/** Every top-level field of `draft` that differs from `base`. */
export function overridesOf(draft: Scenario, base: Scenario): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(draft) as (keyof Scenario)[]) {
    if (!deepEqual(draft[key], base[key])) out[key] = draft[key];
  }
  // Identity always travels, even in the freak case where nothing else changed: two scenarios
  // sharing an id would collide in the registry and one would silently win.
  out.id = draft.id;
  out.title = draft.title;
  return out;
}

function camel(id: string): string {
  const parts = id.replace(/-v\d+$/, '').split(/[^A-Za-z0-9]+/).filter(Boolean);
  if (parts.length === 0) return 'scenario';
  return parts[0] + parts.slice(1).map((p) => p[0].toUpperCase() + p.slice(1)).join('');
}

export interface ExportedScenario {
  filename: string;
  /** The exported const's name, so the instructions can name it too. */
  binding: string;
  source: string;
}

export function exportScenario(
  draft: Scenario,
  base: Scenario,
  baseModule: string,
  baseBinding: string,
): ExportedScenario {
  const binding = camel(draft.id);
  const overrides = overridesOf(draft, base);
  const body = Object.entries(overrides)
    .map(([k, v]) => `  ${k}: ${toSource(v, 1)},`)
    .join('\n');

  const source = `/**
 * ${draft.title}
 *
 * Gebouwd met de scenario-bouwer, afgeleid van "${base.title}". Alles wat hier niet staat komt
 * daarvandaan — inclusief de reeks, de vensters en de uitleg bij elke fout.
 */
import type { Scenario } from './types';
import { ${baseBinding} } from './${baseModule}';

export const ${binding}: Scenario = {
  ...${baseBinding},
${body}
};
`;

  return { filename: `scenario.${draft.id.replace(/-v\d+$/, '')}.ts`, binding, source };
}
