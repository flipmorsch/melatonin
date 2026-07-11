import {CSSProperties, useEffect, useRef} from 'react';
import {Compartment, EditorState, Transaction} from '@codemirror/state';
import {EditorView, keymap, placeholder as cmPlaceholder} from '@codemirror/view';
import {defaultKeymap, history, historyKeymap} from '@codemirror/commands';
import {
    autocompletion, closeBrackets, closeBracketsKeymap, CompletionContext, completionKeymap,
} from '@codemirror/autocomplete';
import {json, jsonParseLinter} from '@codemirror/lang-json';
import {linter} from '@codemirror/lint';
import {foldGutter, HighlightStyle, syntaxHighlighting} from '@codemirror/language';
import {tags as t} from '@lezer/highlight';

// JSON tokens in the night palette (DESIGN.md): violet keys, method-hue accents.
const nightHighlight = HighlightStyle.define([
    {tag: t.propertyName, color: '#b3a6fa'},
    {tag: t.string, color: '#5bd6a2'},
    {tag: t.number, color: '#eec468'},
    {tag: [t.bool, t.null], color: '#f0995f'},
    {tag: [t.punctuation, t.separator, t.bracket], color: '#a09dbb'},
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
    '.cm-gutters': {backgroundColor: 'transparent', border: 'none', color: 'var(--mantine-color-dark-3)'},
    '.cm-placeholder': {color: 'var(--mantine-color-dark-3)'},
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

interface Props {
    value: string;
    onChange?: (value: string) => void;
    placeholder?: string;
    readOnly?: boolean;
    /** 'input' = bordered well like a Mantine input; 'fill' = bare, fills the parent. */
    variant?: 'input' | 'fill';
    /** JSON mode: syntax colors, and (when editable) the parse-error underline. */
    json?: boolean;
    /** Environment variable names offered after typing {{. */
    variables?: string[];
    /** Fold arrows on objects/arrays (response viewer). */
    fold?: boolean;
    minHeight?: number;
    style?: CSSProperties;
}

// All props except `value`/`onChange`/`variables` are static per call site;
// the view is created once and only the doc and JSON mode are reconfigured.
export function CodeEditor({
    value, onChange, placeholder, readOnly, variant = 'input',
    json: jsonMode, variables, fold, minHeight = 90, style,
}: Props) {
    const hostRef = useRef<HTMLDivElement>(null);
    const viewRef = useRef<EditorView | null>(null);
    const jsonConf = useRef(new Compartment());

    const onChangeRef = useRef(onChange);
    onChangeRef.current = onChange;
    const varsRef = useRef<string[]>([]);
    varsRef.current = variables ?? [];

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

        const view = new EditorView({
            parent: hostRef.current!,
            state: EditorState.create({
                doc: value,
                extensions: [
                    chrome(variant, minHeight),
                    syntaxHighlighting(nightHighlight),
                    EditorView.lineWrapping,
                    jsonConf.current.of([]),
                    fold ? foldGutter() : [],
                    placeholder ? cmPlaceholder(placeholder) : [],
                    readOnly
                        ? [EditorState.readOnly.of(true), EditorView.editable.of(false)]
                        : [
                            history(),
                            closeBrackets(),
                            autocompletion({override: [varSource]}),
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

    return <div ref={hostRef} style={style}/>;
}
