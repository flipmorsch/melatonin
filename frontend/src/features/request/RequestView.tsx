import {ReactNode, useEffect, useRef} from 'react';
import {
    Accordion, ActionIcon, Badge, Box, Button, Checkbox, Group,
    NativeSelect, NumberInput, PasswordInput, Stack, Tabs, Text, TextInput,
} from '@mantine/core';
import {SendRequest} from '../../../wailsjs/go/main/App';
import {main} from '../../../wailsjs/go/models';
import {looksJson, METHODS} from '../../lib/kv';
import {CodeEditor} from '../../components/CodeEditor';
import {KVEditor, KVRow, newKVRow, rowsFromKV, rowsToKV} from '../../components/KVEditor';
import {ScriptLog} from '../../components/ScriptLog';
import {ResponseViewer} from './ResponseViewer';
import {TabAction, TabState} from '../../hooks/useTabs';

interface Props {
    tab: TabState;
    dispatch: (action: TabAction) => void;
    /** Active environment's variable names, for {{var}} autocomplete. */
    variables: string[];
    /** Persists a request. Called by the debounced auto-save; there is no Save button. */
    onSave: (colId: string, req: main.SavedRequest) => Promise<unknown>;
    /** Called after every send (success or failure) so the history list refreshes. */
    onSent: () => void;
    /** Set by parent to skip the first auto-save after loading a saved request. */
    justLoadedRef: React.MutableRefObject<boolean>;
}

export function RequestView({tab, dispatch, variables, onSave, onSent, justLoadedRef}: Props) {
    // Flush pending debounced save on unmount
    const pendingRef = useRef<{timer: number; colId: string; req: main.SavedRequest} | null>(null);
    useEffect(() => () => {
        if (pendingRef.current) {
            clearTimeout(pendingRef.current.timer);
            onSave(pendingRef.current.colId, pendingRef.current.req).catch(console.error);
        }
    }, []);

    // Ctrl+Enter / Cmd+Enter sends the request.
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

    // ── Derived helpers ──

    const {
        name, method, url, params, headers, body,
        authType, authToken, authUser, authPass,
        timeoutSec, noRedirects, skipTls,
        preScript, postScript, open,
        response, error, sending, saveState,
        type, colId, reqId,
    } = tab;

    function u(field: string, value: unknown) {
        dispatch({type: 'UPDATE_FIELD', field, value});
    }

    const auth = (): main.Auth =>
        ({type: authType, token: authToken, username: authUser, password: authPass});

    const options = (): main.SendOptions => ({
        timeoutSec: Number(timeoutSec) || 0,
        noFollowRedirects: noRedirects,
        skipTlsVerify: skipTls,
    });

    const optionsCount =
        (Number(timeoutSec) > 0 ? 1 : 0) + (noRedirects ? 1 : 0) + (skipTls ? 1 : 0);

    // ── Auto-save (debounced, 600ms after last edit) ──

    useEffect(() => {
        if (type !== 'saved' || !colId || !reqId) return;
        if (justLoadedRef.current) {
            justLoadedRef.current = false;
            dispatch({type: 'SET_SAVE_STATE', saveState: 'saved'});
            return;
        }
        dispatch({type: 'SET_SAVE_STATE', saveState: 'dirty'});
        if (pendingRef.current) clearTimeout(pendingRef.current.timer);
        const req = main.SavedRequest.createFrom({
            id: reqId,
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
        // 'saving' is flagged when the timer fires, not per keystroke — the
        // reducer bails on the repeated 'dirty' above, so typing costs one render.
        const timer = window.setTimeout(() => {
            pendingRef.current = null;
            dispatch({type: 'SET_SAVE_STATE', saveState: 'saving'});
            onSave(colId, req)
                .then(() => dispatch({type: 'SET_SAVE_STATE', saveState: 'saved'}))
                .catch(e => dispatch({type: 'SET_ERROR', error: String(e)}));
        }, 600);
        pendingRef.current = {timer, colId, req};
    }, [name, method, url, params, headers, body,
        authType, authToken, authUser, authPass, timeoutSec, noRedirects, skipTls, preScript, postScript]);

    async function send() {
        dispatch({type: 'SET_SENDING', sending: true});
        dispatch({type: 'SET_ERROR', error: ''});
        dispatch({type: 'SET_RESPONSE', response: null});
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
            dispatch({type: 'SET_RESPONSE', response: resp});
            // Auto-expand script items when logs came back
            if (resp.preScriptLog?.trim() || resp.postScriptLog?.trim()) {
                const next = [...open];
                if (resp.preScriptLog?.trim() && !next.includes('pre-script')) next.push('pre-script');
                if (resp.postScriptLog?.trim() && !next.includes('post-script')) next.push('post-script');
                dispatch({type: 'SET_ACCORDION', open: next});
            }
        } catch (e) {
            dispatch({type: 'SET_ERROR', error: String(e)});
        } finally {
            dispatch({type: 'SET_SENDING', sending: false});
            onSent();
        }
    }

    function addRow(section: 'params' | 'headers') {
        const key = section === 'params' ? 'params' : 'headers';
        const rows = section === 'params' ? params : headers;
        if (!open.includes(key)) u('open', [...open, key]);
        u(key, [...rows, newKVRow()]);
    }

    function formatBody() {
        try {
            u('body', JSON.stringify(JSON.parse(body), null, 2));
        } catch {
            // invalid JSON — the editor's lint underline points at the problem
        }
    }

    const hasBody = !['GET', 'HEAD'].includes(method);

    /** Accordion header with a count badge and an action beside the control. */
    const sectionControl = (label: string, count: number, extra?: ReactNode, action?: ReactNode) => (
        <Group gap={0} wrap="nowrap">
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
                    onChange={e => u('name', e.target.value)}
                    placeholder={type === 'saved' ? 'Request name' : 'Unsaved scratch request'}
                    disabled={type !== 'saved'}
                />
                {type === 'saved' && saveState !== 'saved' &&
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
                        onChange={e => u('method', e.target.value)}
                        data={METHODS}
                        aria-label="HTTP method"
                    />
                    <TextInput
                        style={{flex: 1}}
                        className="mono-input"
                        value={url}
                        onChange={e => u('url', e.target.value)}
                        placeholder="https://api.example.com/path or {{baseUrl}}/path"
                        autoFocus
                        aria-label="Request URL"
                    />
                    <Button type="submit" loading={sending} disabled={!url}>Send</Button>
                </Group>
            </form>

            {/* Split layout: composer left, response right (accepted live variant) */}
            <Group gap="md" align="stretch" wrap="nowrap" style={{flex: 1, minHeight: 0}}>
            <Box style={{flex: '0 0 50%', minWidth: 0, display: 'flex', flexDirection: 'column'}}>
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
                    <Accordion multiple value={open} onChange={v => u('open', v)} variant="separated"
                        styles={{label: {paddingTop: 8, paddingBottom: 8}}}>
                        <Accordion.Item value="params">
                            {sectionControl('Query Params', rowsToKV(params).length, undefined, addIcon('params'))}
                            <Accordion.Panel>
                                <KVEditor
                                    rows={params} onChange={v => u('params', v)}
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
                                            onChange={e => u('authType', e.target.value)}
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
                                                onChange={e => u('authToken', e.target.value)}
                                                placeholder="Token (or {{token}})"
                                            />}
                                        {authType === 'basic' && <>
                                            <TextInput
                                                style={{flex: 1}} size="xs" className="mono-input"
                                                value={authUser}
                                                onChange={e => u('authUser', e.target.value)}
                                                placeholder="Username"
                                            />
                                            <PasswordInput
                                                style={{flex: 1}} size="xs" className="mono-input"
                                                value={authPass}
                                                onChange={e => u('authPass', e.target.value)}
                                                placeholder="Password"
                                            />
                                        </>}
                                    </Group>
                                    <KVEditor
                                        rows={headers} onChange={v => u('headers', v)}
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
                                        key={tab.tabId + '-body'}
                                        value={body}
                                        onChange={v => u('body', v)}
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
                                        onChange={v => u('timeoutSec', v)}
                                        placeholder="30"
                                        label="Timeout (s)"
                                        styles={{root: {display: 'flex', alignItems: 'center', gap: 8}}}
                                    />
                                    <Checkbox
                                        size="xs"
                                        label="Don't follow redirects"
                                        checked={noRedirects}
                                        onChange={e => u('noRedirects', e.currentTarget.checked)}
                                    />
                                    <Checkbox
                                        size="xs"
                                        label="Skip TLS verify"
                                        checked={skipTls}
                                        onChange={e => u('skipTls', e.currentTarget.checked)}
                                    />
                                </Group>
                            </Accordion.Panel>
                        </Accordion.Item>
                    </Accordion>
                </Tabs.Panel>

                <Tabs.Panel value="scripts" style={{flex: 1, minHeight: 0, overflow: 'auto'}} pt="sm">
                    <Accordion multiple value={open} onChange={v => u('open', v)} variant="separated"
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
                                        key={tab.tabId + '-pre'}
                                        value={preScript}
                                        onChange={v => u('preScript', v)}
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
                                        key={tab.tabId + '-post'}
                                        value={postScript}
                                        onChange={v => u('postScript', v)}
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
            </Box>
            <ResponseViewer response={response} error={error}/>
            </Group>
        </Stack>
    );
}
