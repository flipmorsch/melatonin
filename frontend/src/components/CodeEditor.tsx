import {CSSProperties, useEffect, useRef} from 'react';
import {Compartment, EditorState, Transaction} from '@codemirror/state';
import {EditorView, keymap, placeholder as cmPlaceholder} from '@codemirror/view';
import {defaultKeymap, history, historyKeymap} from '@codemirror/commands';
import {
    autocompletion, closeBrackets, closeBracketsKeymap, CompletionContext, completionKeymap,
} from '@codemirror/autocomplete';
import {json, jsonParseLinter} from '@codemirror/lang-json';
import {javascript} from '@codemirror/lang-javascript';
import {linter} from '@codemirror/lint';
import {foldGutter, HighlightStyle, syntaxHighlighting} from '@codemirror/language';
import {tags as t} from '@lezer/highlight';

// Shared tokens for JSON and JS in the night palette (DESIGN.md).
// JS-specific tags (keyword, comment, etc.) are never emitted by the JSON parser.
const nightHighlight = HighlightStyle.define([
    // Shared: JSON keys, JS property access
    {tag: t.propertyName, color: 'var(--mantine-color-violet-2)'},
    {tag: t.string, color: 'var(--m-get)'},
    {tag: t.number, color: 'var(--m-put)'},
    {tag: [t.bool, t.null], color: 'var(--m-patch)'},
    {tag: [t.punctuation, t.separator, t.bracket, t.operator], color: 'var(--mantine-color-dark-1)'},
    // JavaScript-only tokens
    {tag: [t.keyword, t.controlKeyword, t.operatorKeyword, t.moduleKeyword, t.self], color: 'var(--mantine-color-violet-2)'},
    {tag: t.comment, color: 'var(--mantine-color-dark-2)', fontStyle: 'italic'},
    {tag: t.function(t.variableName), color: 'var(--m-post)'},
    {tag: t.regexp, color: 'var(--m-delete)'},
    {tag: t.escape, color: 'var(--m-patch)'},
    {tag: t.typeName, color: 'var(--m-post)'},
    {tag: t.special(t.string), color: 'var(--m-get)'},
]);

const chrome = (variant: 'input' | 'fill', minHeight: number) => EditorView.theme({
    '&': {
        fontSize: 'var(--mantine-font-size-sm)',
        color: 'var(--mantine-color-dark-0)',
        ...(variant === 'input' ? {
            backgroundColor: 'var(--mantine-color-dark-6)',
            border: '1px solid var(--mantine-color-dark-4)',
            borderRadius: 'var(--mantine-radius-sm)',
        } : {height: '100%'}),
    },
    '&.cm-focused': {
        outline: 'none',
        ...(variant === 'input' ? {borderColor: 'var(--mantine-color-violet-4)'} : {}),
    },
    '.cm-scroller': {
        fontFamily: 'var(--mantine-font-family-monospace)',
        lineHeight: '1.55',
        overflow: 'auto',
        ...(variant === 'input' ? {maxHeight: '320px'} : {}),
    },
    '.cm-content': {
        caretColor: 'var(--mantine-color-dark-0)',
        padding: '6px 0',
        minHeight: `${minHeight}px`,
    },
    '.cm-line': {padding: '0 10px'},
    '.cm-cursor': {borderLeftColor: 'var(--mantine-color-dark-0)'},
    '.cm-activeLine, .cm-activeLineGutter': {backgroundColor: 'transparent'},
    // dark.2 (not dark.3): gutter marks and placeholder text must clear ≥4.5:1 (DESIGN.md).
    '.cm-gutters': {backgroundColor: 'transparent', border: 'none', color: 'var(--mantine-color-dark-2)'},
    '.cm-placeholder': {color: 'var(--mantine-color-dark-2)'},
    '.cm-tooltip': {
        backgroundColor: 'var(--mantine-color-dark-5)',
        border: '1px solid var(--mantine-color-dark-4)',
        color: 'var(--mantine-color-dark-0)',
    },
    '.cm-tooltip-autocomplete ul li[aria-selected]': {
        backgroundColor: 'var(--mantine-color-violet-4)',
        color: 'var(--mantine-color-dark-0)',
    },
}, {dark: true});

/** Script API surface exposed to pre-request and post-response scripts.
 *  Matches the globals injected by script.go:injectGlobals. */
const SCRIPT_API = [
    // request object
    {label: 'request.method', type: 'property', detail: 'string — GET, POST, …'},
    {label: 'request.url', type: 'property', detail: 'string'},
    {label: 'request.headers', type: 'property', detail: '{key, value}[]'},
    {label: 'request.body', type: 'property', detail: 'string'},
    // response object (post-response only)
    {label: 'response.status', type: 'property', detail: 'number'},
    {label: 'response.statusText', type: 'property', detail: 'string'},
    {label: 'response.headers', type: 'property', detail: 'string → string[]'},
    {label: 'response.body', type: 'property', detail: 'string'},
    {label: 'response.json()', type: 'method', detail: 'parse body as JSON'},
    {label: 'response.finalUrl', type: 'property', detail: 'string'},
    // env
    {label: 'env.get(name)', type: 'method', detail: 'read environment variable'},
    {label: 'env.set(name, value)', type: 'method', detail: 'write session variable'},
    // console
    {label: 'console.log(...)', type: 'method', detail: 'write to script log'},
    {label: 'console.warn(...)', type: 'method', detail: 'write warning to script log'},
    {label: 'console.error(...)', type: 'method', detail: 'write error to script log'},
    // utilities
    {label: 'fetch(url, opts?)', type: 'method', detail: 'async HTTP request → {status, json(), text()}'},
    {label: 'atob(str)', type: 'method', detail: 'base64 decode'},
    {label: 'btoa(str)', type: 'method', detail: 'base64 encode'},
    {label: 'crypto.randomUUID()', type: 'method', detail: 'generate UUID v4'},
    {label: 'sleep(ms)', type: 'method', detail: 'pause script (ms)'},
];
interface Props {
    value: string;
    onChange?: (value: string) => void;
    placeholder?: string;
    readOnly?: boolean;
    /** 'input' = bordered well like a Mantine input; 'fill' = bare, fills the parent. */
    variant?: 'input' | 'fill';
    /** JSON mode: syntax colors, and (when editable) the parse-error underline. */
    json?: boolean;
    /** JavaScript mode: syntax colors, bracket matching, auto-indent, keyword completion. */
    javascript?: boolean;
    /** Environment variable names offered after typing {{. */
    variables?: string[];
    /** Enable script API autocomplete (request, response, env, console, …). */
    scriptApi?: boolean;
    /** Fold arrows on objects/arrays (response viewer). */
    fold?: boolean;
    minHeight?: number;
    style?: CSSProperties;
}

// All props except `value`/`onChange`/`variables` are static per call site;
// the view is created once and only the doc and JSON mode are reconfigured.
export function CodeEditor({
    value, onChange, placeholder, readOnly, variant = 'input',
    json: jsonMode, javascript: jsMode, variables, scriptApi, fold, minHeight = 90, style,
}: Props) {
    const hostRef = useRef<HTMLDivElement>(null);
    const viewRef = useRef<EditorView | null>(null);
    const jsonConf = useRef(new Compartment());
    const jsConf = useRef(new Compartment());

    const onChangeRef = useRef(onChange);
    onChangeRef.current = onChange;
    const varsRef = useRef<string[]>([]);
    varsRef.current = variables ?? [];
    const scriptApiRef = useRef(scriptApi);
    scriptApiRef.current = scriptApi;

    useEffect(() => {
        const varSource = (ctx: CompletionContext) => {
            const word = ctx.matchBefore(/\{\{[\w-]*/);
            if (!word || varsRef.current.length === 0) return null;
            const closed = ctx.state.sliceDoc(ctx.pos, ctx.pos + 2) === '}}';
            return {
                from: word.from + 2,
                options: varsRef.current.map(name => ({
                    label: name,
                    type: 'variable',
                    apply: closed ? name : name + '}}',
                })),
            };
        };
        const apiSource = (ctx: CompletionContext) => {
            if (!scriptApiRef.current) return null;
            const word = ctx.matchBefore(/[\w.]+/);
            if (!word) return null;
            const prefix = word.text.toLowerCase();
            return {
                from: word.from,
                options: SCRIPT_API
                    .filter(c => c.label.toLowerCase().startsWith(prefix))
                    .map(c => ({
                        label: c.label,
                        type: c.type,
                        detail: c.detail,
                    })),
            };
        };


        const view = new EditorView({
            parent: hostRef.current!,
            state: EditorState.create({
                doc: value,
                extensions: [
                    chrome(variant, minHeight),
                    syntaxHighlighting(nightHighlight),
                    EditorView.lineWrapping,
                    jsonConf.current.of([]),
                    jsConf.current.of([]),
                    fold ? foldGutter() : [],
                    placeholder ? cmPlaceholder(placeholder) : [],
                    readOnly
                        ? [EditorState.readOnly.of(true), EditorView.editable.of(false)]
                        : [
                            history(),
                            closeBrackets(),
                            autocompletion({override: [varSource, apiSource]}),
                            keymap.of([
                                ...closeBracketsKeymap, ...defaultKeymap,
                                ...historyKeymap, ...completionKeymap,
                            ]),
                            EditorView.updateListener.of(u => {
                                if (u.docChanged) onChangeRef.current?.(u.state.doc.toString());
                            }),
                        ],
                ],
            }),
        });
        viewRef.current = view;
        return () => view.destroy();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // External value changes (request switch, Format button, new response) are
    // kept out of the undo history so Ctrl+Z can't cross into another document.
    useEffect(() => {
        const view = viewRef.current;
        if (view && value !== view.state.doc.toString()) {
            view.dispatch({
                changes: {from: 0, to: view.state.doc.length, insert: value},
                annotations: Transaction.addToHistory.of(false),
            });
        }
    }, [value]);

    useEffect(() => {
        viewRef.current?.dispatch({effects: jsonConf.current.reconfigure(
            jsonMode ? [json(), ...(readOnly ? [] : [linter(jsonParseLinter())])] : [],
        )});
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [jsonMode]);

    useEffect(() => {
        viewRef.current?.dispatch({effects: jsConf.current.reconfigure(
            jsMode ? javascript() : [],
        )});
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [jsMode]);

    return <div ref={hostRef} style={style}/>;
}
