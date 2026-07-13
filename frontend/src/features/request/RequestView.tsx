import {ReactNode, useEffect, useRef, useState} from 'react';
import {
    Accordion, ActionIcon, Badge, Button, Checkbox, Group,
    NativeSelect, NumberInput, PasswordInput, Stack, Tabs, Text, TextInput,
} from '@mantine/core';
import {SendRequest} from '../../../wailsjs/go/main/App';
import {main} from '../../../wailsjs/go/models';
import {looksJson, METHODS} from '../../lib/kv';
import {CodeEditor} from '../../components/CodeEditor';
import {KVEditor, KVRow, newKVRow, rowsFromKV, rowsToKV} from '../../components/KVEditor';
import {ScriptLog} from '../../components/ScriptLog';
import {ResponseViewer} from './ResponseViewer';

interface Props {
    /** Currently selected saved request, or null for the scratch editor. */
    selected: {colId: string, req: main.SavedRequest} | null;
    /** History entry to load into the scratch editor, or null. */
    replay: main.HistoryEntry | null;
    /** Active environment's variable names, for {{var}} autocomplete. */
    variables: string[];
    /** Persists a request. Called by the debounced auto-save; there is no Save button. */
    onSave: (colId: string, req: main.SavedRequest) => Promise<unknown>;
    /** Called after every send (success or failure) so the history list refreshes. */
    onSent: () => void;
}

export function RequestView({selected, replay, variables, onSave, onSent}: Props) {
    const [name, setName] = useState('');
    const [method, setMethod] = useState('GET');
    const [url, setUrl] = useState('');
    const [params, setParams] = useState<KVRow[]>([]);
    const [headers, setHeaders] = useState<KVRow[]>([]);
    const [body, setBody] = useState('');
    const [authType, setAuthType] = useState('');
    const [authToken, setAuthToken] = useState('');
    const [authUser, setAuthUser] = useState('');
    const [authPass, setAuthPass] = useState('');
    const [timeoutSec, setTimeoutSec] = useState<number | string>(0);
    const [noRedirects, setNoRedirects] = useState(false);
    const [skipTls, setSkipTls] = useState(false);
    const [preScript, setPreScript] = useState('');
    const [postScript, setPostScript] = useState('');
    const [open, setOpen] = useState<string[]>([]);

    const [response, setResponse] = useState<main.ResponseData | null>(null);
    const [error, setError] = useState('');
    const [sending, setSending] = useState(false);
    const [saveState, setSaveState] = useState<'saved' | 'dirty' | 'saving'>('saved');

    /** Debounced auto-save not yet written to disk. */
    const pending = useRef<{timer: number, colId: string, req: main.SavedRequest} | null>(null);
    /** Set by loadFields so the field-change effect skips the load itself. */
    const justLoaded = useRef(false);

    /** Writes any pending edit immediately — before switching requests or unmounting,
     * so mid-debounce keystrokes are never lost. */
    function flushPending() {
        if (!pending.current) return;
        clearTimeout(pending.current.timer);
        const {colId, req} = pending.current;
        pending.current = null;
        // switching away — this view's error strip is gone, so failures go to the console
        onSave(colId, req).catch(console.error);
    }

    /** Fills the editor from a saved request or a history entry's request.
     * Non-empty sections start expanded, empty ones collapsed. */
    function loadFields(r: main.SavedRequest | main.RequestInput) {
        justLoaded.current = true;
        setMethod(r.method);
        setUrl(r.url);
        setParams(rowsFromKV(r.params));
        setHeaders(rowsFromKV(r.headers));
        setBody(r.body);
        setAuthType(r.auth?.type ?? '');
        setAuthToken(r.auth?.token ?? '');
        setAuthUser(r.auth?.username ?? '');
        setAuthPass(r.auth?.password ?? '');
        setTimeoutSec(r.options?.timeoutSec || 0);
        setNoRedirects(r.options?.noFollowRedirects ?? false);
        setSkipTls(r.options?.skipTlsVerify ?? false);
        setPreScript(r.preRequestScript ?? '');
        setPostScript(r.postResponseScript ?? '');
        setOpen([
            ...(r.params?.length ? ['params'] : []),
            ...(r.headers?.length || r.auth?.type ? ['headers'] : []),
            ...(r.body ? ['body'] : []),
            ...(r.options?.timeoutSec || r.options?.noFollowRedirects || r.options?.skipTlsVerify
                ? ['options'] : []),
            ...('preRequestScript' in r && (r as main.SavedRequest).preRequestScript ? ['pre-script'] : []),
            ...('postResponseScript' in r && (r as main.SavedRequest).postResponseScript ? ['post-script'] : []),
        ]);
    }

    useEffect(() => {
        flushPending();
        if (!selected) return;
        setName(selected.req.name);
        loadFields(selected.req);
        setResponse(null);
        setError('');
    }, [selected?.req.id]);

    // flush on unmount (e.g. switching to the environments or mock view)
    useEffect(() => flushPending, []);

    useEffect(() => {
        if (!replay) return;
        setName('');
        loadFields(replay.request);
        setResponse(replay.response ?? null);
        setError(replay.error ?? '');
    }, [replay?.id]);

    // Ctrl+Enter / Cmd+Enter sends the request from anywhere in the view.
    // Ref avoids stale closure: the listener is registered once but always calls latest send().
    const sendRef = useRef(send);
    sendRef.current = send;
    useEffect(() => {
        function onKey(e: KeyboardEvent) {
            if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
                e.preventDefault();
                sendRef.current();
            }
        }
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, []);

    const auth = (): main.Auth =>
        ({type: authType, token: authToken, username: authUser, password: authPass});

    const options = (): main.SendOptions => ({
        timeoutSec: Number(timeoutSec) || 0,
        noFollowRedirects: noRedirects,
        skipTlsVerify: skipTls,
    });

    const optionsCount =
        (Number(timeoutSec) > 0 ? 1 : 0) + (noRedirects ? 1 : 0) + (skipTls ? 1 : 0);

    // debounced auto-save: any edit to a saved request persists after 600ms of quiet
    useEffect(() => {
        if (!selected) return;
        if (justLoaded.current) {
            justLoaded.current = false;
            setSaveState('saved');
            return;
        }
        setSaveState('dirty');
        if (pending.current) clearTimeout(pending.current.timer);
        const colId = selected.colId;
        const req = main.SavedRequest.createFrom({
            id: selected.req.id,
            name,
            method,
            url,
            params: rowsToKV(params),
            headers: rowsToKV(headers),
            body,
            auth: auth(),
            options: options(),
            preRequestScript: preScript,
            postResponseScript: postScript,
        });
        setSaveState('saving');
        const timer = window.setTimeout(() => {
            pending.current = null;
            onSave(colId, req)
                .then(() => setSaveState('saved'))
                .catch(e => setError(String(e)));
        }, 600);
    }, [name, method, url, params, headers, body,
        authType, authToken, authUser, authPass, timeoutSec, noRedirects, skipTls, preScript, postScript]);

    async function send() {
        setSending(true);
        setError('');
        setResponse(null);
        try {
            const resp = await SendRequest(main.RequestInput.createFrom({
                method,
                url,
                params: rowsToKV(params),
                headers: rowsToKV(headers),
                body,
                auth: auth(),
                options: options(),
                preRequestScript: preScript,
                postResponseScript: postScript,
            }));
            setResponse(resp);
            // Auto-expand script items when logs came back
            if (resp.preScriptLog?.trim() || resp.postScriptLog?.trim()) {
                setOpen(o => {
                    const next = [...o];
                    if (resp.preScriptLog?.trim() && !next.includes('pre-script')) next.push('pre-script');
                    if (resp.postScriptLog?.trim() && !next.includes('post-script')) next.push('post-script');
                    return next;
                });
            }
        } catch (e) {
            setError(String(e));
        } finally {
            setSending(false);
            onSent();
        }
    }

    function addRow(section: 'params' | 'headers') {
        setOpen(o => o.includes(section) ? o : [...o, section]);
        (section === 'params' ? setParams : setHeaders)(rows => [...rows, newKVRow()]);
    }

    function formatBody() {
        try {
            setBody(JSON.stringify(JSON.parse(body), null, 2));
        } catch {
            // invalid JSON — the editor's lint underline points at the problem
        }
    }

    const hasBody = !['GET', 'HEAD'].includes(method);

    /** Accordion header with a count badge and an action beside the control. */
    const sectionControl = (label: string, count: number, extra?: ReactNode, action?: ReactNode) => (
        <Group gap={0} wrap="nowrap">
            {/* Control defaults to width:100%, which squeezes the action out of the row */}
            <Accordion.Control style={{flex: 1, width: 'auto', minWidth: 0}}>
                <Group gap="xs">
                    {label}
                    {count > 0 && <Badge size="xs" variant="light" color="gray">{count}</Badge>}
                    {extra}
                </Group>
            </Accordion.Control>
            {action && <Group gap={0} wrap="nowrap" style={{flexShrink: 0}}>{action}</Group>}
        </Group>
    );

    const addIcon = (section: 'params' | 'headers') => (
        <ActionIcon size="sm" variant="subtle" color="gray" mx="xs"
            title={`Add ${section === 'params' ? 'param' : 'header'} row`}
            onClick={() => addRow(section)}>+</ActionIcon>
    );

    return (
        <Stack gap="sm" style={{flex: 1, minHeight: 0}}>
            <Group gap="xs" wrap="nowrap">
                <TextInput
                    style={{flex: 1}}
                    value={name}
                    onChange={e => setName(e.target.value)}
                    placeholder={selected ? 'Request name' : 'Unsaved scratch request'}
                    disabled={!selected}
                />
                {selected && saveState !== 'saved' &&
                    <Text size="xs" ff="monospace" c={saveState === 'saving' ? 'dark.2' : 'yellow.4'}
                        title={saveState === 'saving' ? 'Saving…' : 'Modified'}
                        style={{flexShrink: 0, userSelect: 'none'}}>
                        {saveState === 'saving' ? '●' : '○'}
                    </Text>}
            </Group>

            <form onSubmit={e => { e.preventDefault(); send(); }}>
                <Group gap="xs" wrap="nowrap">
                    <NativeSelect
                        w={110}
                        className="mono-input"
                        value={method}
                        onChange={e => setMethod(e.target.value)}
                        data={METHODS}
                        aria-label="HTTP method"
                    />
                    <TextInput
                        style={{flex: 1}}
                        className="mono-input"
                        value={url}
                        onChange={e => setUrl(e.target.value)}
                        placeholder="https://api.example.com/path or {{baseUrl}}/path"
                        autoFocus
                        aria-label="Request URL"
                    />
                    <Button type="submit" loading={sending} disabled={!url}>Send</Button>
                </Group>
            </form>

            <Tabs defaultValue="request" style={{flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column'}}
                styles={{
                    tab: {
                        fontWeight: 600,
                        fontSize: 'var(--mantine-font-size-sm)',
                        padding: '8px 16px',
                        transition: 'color 130ms ease, border-color 130ms ease',
                        '&[data-active]': {
                            color: 'var(--mantine-color-violet-2)',
                            borderColor: 'var(--mantine-color-violet-4)',
                        },
                    },
                }}>
                <Tabs.List>
                    <Tabs.Tab value="request">Request</Tabs.Tab>
                    <Tabs.Tab value="scripts">
                        <Group gap={8} wrap="nowrap">
                            Scripts
                            {(preScript || postScript) &&
                                <Badge size="xs" variant="light" color="violet" tt="none"
                                    style={{fontWeight: 600}}>
                                    {preScript && postScript ? 'pre + post'
                                        : preScript ? 'pre' : 'post'}
                                </Badge>}
                        </Group>
                    </Tabs.Tab>
                </Tabs.List>

                <Tabs.Panel value="request" style={{flex: 1, minHeight: 0, overflow: 'auto'}} pt="sm">
                    <Accordion multiple value={open} onChange={setOpen} variant="separated"
                        styles={{label: {paddingTop: 8, paddingBottom: 8}}}>
                        <Accordion.Item value="params">
                            {sectionControl('Query Params', rowsToKV(params).length, undefined, addIcon('params'))}
                            <Accordion.Panel>
                                <KVEditor
                                    rows={params} onChange={setParams}
                                    keyPlaceholder="page" valuePlaceholder="2 or {{term}}"
                                />
                            </Accordion.Panel>
                        </Accordion.Item>

                        <Accordion.Item value="headers">
                            {sectionControl('Headers', rowsToKV(headers).length,
                                authType && <Badge size="xs" variant="light">auth</Badge>,
                                addIcon('headers'))}
                            <Accordion.Panel>
                                <Stack gap="xs">
                                    <Group gap="xs" wrap="nowrap">
                                        <NativeSelect
                                            w={140}
                                            size="xs"
                                            value={authType}
                                            onChange={e => setAuthType(e.target.value)}
                                            data={[
                                                {value: '', label: 'No auth'},
                                                {value: 'bearer', label: 'Bearer token'},
                                                {value: 'basic', label: 'Basic auth'},
                                            ]}
                                        />
                                        {authType === 'bearer' &&
                                            <TextInput
                                                style={{flex: 1}} size="xs" className="mono-input"
                                                value={authToken}
                                                onChange={e => setAuthToken(e.target.value)}
                                                placeholder="Token (or {{token}})"
                                            />}
                                        {authType === 'basic' && <>
                                            <TextInput
                                                style={{flex: 1}} size="xs" className="mono-input"
                                                value={authUser}
                                                onChange={e => setAuthUser(e.target.value)}
                                                placeholder="Username"
                                            />
                                            <PasswordInput
                                                style={{flex: 1}} size="xs" className="mono-input"
                                                value={authPass}
                                                onChange={e => setAuthPass(e.target.value)}
                                                placeholder="Password"
                                            />
                                        </>}
                                    </Group>
                                    <KVEditor
                                        rows={headers} onChange={setHeaders}
                                        keyPlaceholder="X-Request-Id" valuePlaceholder="abc"
                                        deadTitle={row =>
                                            authType && row.key.trim().toLowerCase() === 'authorization'
                                                ? 'Overridden by the auth helper' : undefined}
                                    />
                                </Stack>
                            </Accordion.Panel>
                        </Accordion.Item>

                        {hasBody &&
                            <Accordion.Item value="body">
                                {sectionControl('Body', 0,
                                    body && <Badge size="xs" variant="light" color="gray" tt="none">{body.length} chars</Badge>,
                                    <Button size="compact-xs" variant="subtle" color="gray" mx="xs"
                                        disabled={!looksJson(body)}
                                        title="Reformat JSON with 2-space indent"
                                        onClick={formatBody}>Format</Button>)}
                                <Accordion.Panel>
                                    <CodeEditor
                                        key={selected?.req.id ?? 'scratch'}
                                        value={body}
                                        onChange={setBody}
                                        json={looksJson(body)}
                                        variables={variables}
                                        placeholder="Request body"
                                    />
                                </Accordion.Panel>
                            </Accordion.Item>}

                        <Accordion.Item value="options">
                            {sectionControl('Options', optionsCount)}
                            <Accordion.Panel>
                                <Group gap="lg" align="center">
                                    <NumberInput
                                        w={150} size="xs" className="mono-input"
                                        min={0} max={600} allowDecimal={false}
                                        value={timeoutSec || ''}
                                        onChange={setTimeoutSec}
                                        placeholder="30"
                                        label="Timeout (s)"
                                        styles={{root: {display: 'flex', alignItems: 'center', gap: 8}}}
                                    />
                                    <Checkbox
                                        size="xs"
                                        label="Don't follow redirects"
                                        checked={noRedirects}
                                        onChange={e => setNoRedirects(e.currentTarget.checked)}
                                    />
                                    <Checkbox
                                        size="xs"
                                        label="Skip TLS verify"
                                        checked={skipTls}
                                        onChange={e => setSkipTls(e.currentTarget.checked)}
                                    />
                                </Group>
                            </Accordion.Panel>
                        </Accordion.Item>
                    </Accordion>
                </Tabs.Panel>

                <Tabs.Panel value="scripts" style={{flex: 1, minHeight: 0, overflow: 'auto'}} pt="sm">
                    <Accordion multiple value={open} onChange={setOpen} variant="separated"
                        styles={{label: {paddingTop: 8, paddingBottom: 8}}}>
                        <Accordion.Item value="pre-script">
                            {sectionControl('Pre-request script', 0,
                                preScript && <Badge size="xs" variant="light" color="violet">pre</Badge>)}
                            <Accordion.Panel>
                                <Stack gap="xs">
                                    <Text size="sm" c="dark.1">
                                        Runs before the HTTP call. Mutate <Text component="code" size="sm" fw={600} c="dark.0">request</Text> to change what gets sent.
                                    </Text>
                                    <CodeEditor
                                        key={(selected?.req.id ?? 'scratch') + '-pre'}
                                        value={preScript}
                                        onChange={setPreScript}
                                        placeholder={'// Set headers, rewrite the body, change the method…'}
                                        variables={variables}
                                        scriptApi
                                        minHeight={160}
                                    />
                                    {response?.preScriptLog && response.preScriptLog.trim() ? (
                                        <ScriptLog text={response.preScriptLog}/>
                                    ) : null}
                                </Stack>
                            </Accordion.Panel>
                        </Accordion.Item>
                        <Accordion.Item value="post-script">
                            {sectionControl('Post-response script', 0,
                                postScript && <Badge size="xs" variant="light" color="violet">post</Badge>)}
                            <Accordion.Panel>
                                <Stack gap="xs">
                                    <Text size="sm" c="dark.1">
                                        Runs after the response arrives. Mutate <Text component="code" size="sm" fw={600} c="dark.0">response</Text> to change what the UI shows,
                                        or call <Text component="code" size="sm" fw={600} c="dark.0">env.set("name", value)</Text> to extract values.
                                    </Text>
                                    <CodeEditor
                                        key={(selected?.req.id ?? 'scratch') + '-post'}
                                        value={postScript}
                                        onChange={setPostScript}
                                        placeholder={'// Inspect the response, set session variables…'}
                                        variables={variables}
                                        scriptApi
                                        minHeight={160}
                                    />
                                    {response?.postScriptLog && response.postScriptLog.trim() ? (
                                        <ScriptLog text={response.postScriptLog}/>
                                    ) : null}
                                </Stack>
                            </Accordion.Panel>
                        </Accordion.Item>
                    </Accordion>
                </Tabs.Panel>
            </Tabs>

            <ResponseViewer response={response} error={error}/>
        </Stack>
    );
}
