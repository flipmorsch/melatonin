/** HTTP method badge. Hues are fixed per method (see DESIGN.md) — they mean
 * the method and nothing else. */
export function MethodBadge({method}: {method: string}) {
    return <span className={`method ${method.toLowerCase()}`}>{method}</span>;
}
