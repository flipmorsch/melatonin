import {main} from '../../wailsjs/go/models';

export const METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'];

const PRETTY_PRINT_LIMIT = 5 * 1024 * 1024;

/** Parses "key: value" lines into a record (used for mock headers and env variables). */
export function parseKV(text: string): Record<string, string> {
    const kv: Record<string, string> = {};
    for (const line of text.split('\n')) {
        const i = line.indexOf(':');
        if (i > 0) kv[line.slice(0, i).trim()] = line.slice(i + 1).trim();
    }
    return kv;
}

export function kvToText(kv: Record<string, string>): string {
    return Object.entries(kv ?? {}).map(([k, v]) => `${k}: ${v}`).join('\n');
}

/** First-char heuristic: does this body text look like JSON? (ADR 0004) */
export const looksJson = (s: string) => /^\s*[{["]/.test(s);

/** JSON responses under the pretty-print cap get colors and folding. */
export function isJsonBody(res: main.ResponseData): boolean {
    const contentType = res.headers['Content-Type']?.[0] ?? '';
    return contentType.includes('json') && res.size < PRETTY_PRINT_LIMIT;
}

export function prettyBody(res: main.ResponseData): string {
    if (isJsonBody(res)) {
        try {
            return JSON.stringify(JSON.parse(res.body), null, 2);
        } catch {
            // not valid JSON after all — show raw
        }
    }
    return res.body;
}

/** Groups a collection's requests by folder; root ('') first, then folders alphabetically. */
export function groupByFolder(reqs: main.SavedRequest[]): [string, main.SavedRequest[]][] {
    const groups = new Map<string, main.SavedRequest[]>();
    for (const r of reqs) {
        const f = r.folder || '';
        if (!groups.has(f)) groups.set(f, []);
        groups.get(f)!.push(r);
    }
    return [...groups.entries()].sort(([a], [b]) =>
        a === '' ? -1 : b === '' ? 1 : a.localeCompare(b));
}

export function headersToLines(headers: Record<string, string[]>): string {
    return Object.entries(headers ?? {})
        .map(([k, vs]) => vs.map(v => `${k}: ${v}`).join('\n'))
        .join('\n');
}
