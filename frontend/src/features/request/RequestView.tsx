import {ReactNode, useEffect, useState} from 'react';
import {
    Accordion, ActionIcon, Autocomplete, Badge, Button, Group, NativeSelect,
    PasswordInput, Stack, Textarea, TextInput,
} from '@mantine/core';
import {SendRequest} from '../../../wailsjs/go/main/App';
import {main} from '../../../wailsjs/go/models';
import {METHODS} from '../../lib/kv';
import {KVEditor, KVRow, newKVRow, rowsFromKV, rowsToKV} from '../../components/KVEditor';
import {ResponseViewer} from './ResponseViewer';

interface Props {
    /** Currently selected saved request, or null for the scratch editor. */
    selected: {colId: string, req: main.SavedRequest} | null;
    /** Existing folder names across collections, for the folder autocomplete. */
    folders: string[];
    onSave: (colId: string, req: main.SavedRequest) => Promise<unknown>;
}

export function RequestView({selected, folders, onSave}: Props) {
    const [name, setName] = useState('');
    const [folder, setFolder] = useState('');
    const [method, setMethod] = useState('GET');
    const [url, setUrl] = useState('');
    const [params, setParams] = useState<KVRow[]>([]);
    const [headers, setHeaders] = useState<KVRow[]>([]);
    const [body, setBody] = useState('');
    const [authType, setAuthType] = useState('');
    const [authToken, setAuthToken] = useState('');
    const [authUser, setAuthUser] = useState('');
    const [authPass, setAuthPass] = useState('');
    const [open, setOpen] = useState<string[]>([]);

    const [response, setResponse] = useState<main.ResponseData | null>(null);
    const [error, setError] = useState('');
    const [sending, setSending] = useState(false);

    useEffect(() => {
        if (!selected) return;
        const r = selected.req;
        setName(r.name);
        setFolder(r.folder ?? '');
        setMethod(r.method);
        setUrl(r.url);
        setParams(rowsFromKV(r.params));
        setHeaders(rowsFromKV(r.headers));
        setBody(r.body);
        setAuthType(r.auth?.type ?? '');
        setAuthToken(r.auth?.token ?? '');
        setAuthUser(r.auth?.username ?? '');
        setAuthPass(r.auth?.password ?? '');
        // non-empty sections start expanded, empty ones collapsed
        setOpen([
            ...(r.params?.length ? ['params'] : []),
            ...(r.headers?.length || r.auth?.type ? ['headers'] : []),
            ...(r.body ? ['body'] : []),
        ]);
        setResponse(null);
        setError('');
    }, [selected?.req.id]);

    const auth = (): main.Auth =>
        ({type: authType, token: authToken, username: authUser, password: authPass});

    async function save() {
        if (!selected) return;
        try {
            await onSave(selected.colId, main.SavedRequest.createFrom({
                id: selected.req.id,
                name,
                folder: folder.trim(),
                method,
                url,
                params: rowsToKV(params),
                headers: rowsToKV(headers),
                body,
                auth: auth(),
            }));
        } catch (e) {
            setError(String(e));
        }
    }

    async function send() {
        setSending(true);
        setError('');
        setResponse(null);
        try {
            setResponse(await SendRequest(main.RequestInput.createFrom({
                method,
                url,
                params: rowsToKV(params),
                headers: rowsToKV(headers),
                body,
                auth: auth(),
            })));
        } catch (e) {
            setError(String(e));
        } finally {
            setSending(false);
        }
    }

    function addRow(section: 'params' | 'headers') {
        setOpen(o => o.includes(section) ? o : [...o, section]);
        (section === 'params' ? setParams : setHeaders)(rows => [...rows, newKVRow()]);
    }

    const hasBody = !['GET', 'HEAD'].includes(method);

    /** Accordion header with a count badge and an add-row action beside the control. */
    const sectionControl = (label: string, count: number, onAdd?: () => void, extra?: ReactNode) => (
        <Group gap={0} wrap="nowrap">
            <Accordion.Control>
                <Group gap="xs">
                    {label}
                    {count > 0 && <Badge size="xs" variant="light" color="gray">{count}</Badge>}
                    {extra}
                </Group>
            </Accordion.Control>
            {onAdd &&
                <ActionIcon size="sm" variant="subtle" color="gray" mx="xs"
                    title={`Add ${label.toLowerCase()} row`} onClick={onAdd}>+</ActionIcon>}
        </Group>
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
                <Autocomplete
                    w={170}
                    value={folder}
                    onChange={setFolder}
                    data={folders}
                    placeholder="Folder (optional)"
                    disabled={!selected}
                />
                <Button onClick={save} disabled={!selected}>Save</Button>
            </Group>

            <form onSubmit={e => { e.preventDefault(); send(); }}>
                <Group gap="xs" wrap="nowrap">
                    <NativeSelect
                        w={110}
                        className="mono-input"
                        value={method}
                        onChange={e => setMethod(e.target.value)}
                        data={METHODS}
                    />
                    <TextInput
                        style={{flex: 1}}
                        className="mono-input"
                        value={url}
                        onChange={e => setUrl(e.target.value)}
                        placeholder="https://api.example.com/path or {{baseUrl}}/path"
                        autoFocus
                    />
                    <Button type="submit" loading={sending} disabled={!url}>Send</Button>
                </Group>
            </form>

            <Accordion multiple value={open} onChange={setOpen} variant="separated"
                styles={{label: {paddingTop: 8, paddingBottom: 8}}}>
                <Accordion.Item value="params">
                    {sectionControl('Query Params', rowsToKV(params).length, () => addRow('params'))}
                    <Accordion.Panel>
                        <KVEditor
                            rows={params} onChange={setParams}
                            keyPlaceholder="page" valuePlaceholder="2 or {{term}}"
                        />
                    </Accordion.Panel>
                </Accordion.Item>

                <Accordion.Item value="headers">
                    {sectionControl('Headers', rowsToKV(headers).length, () => addRow('headers'),
                        authType && <Badge size="xs" variant="light">auth</Badge>)}
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
                        {sectionControl('Body', 0, undefined,
                            body && <Badge size="xs" variant="light" color="gray">{body.length} chars</Badge>)}
                        <Accordion.Panel>
                            <Textarea
                                className="mono-input" autosize minRows={4} maxRows={14}
                                value={body}
                                onChange={e => setBody(e.target.value)}
                                placeholder="Request body"
                            />
                        </Accordion.Panel>
                    </Accordion.Item>}
            </Accordion>

            <ResponseViewer response={response} error={error}/>
        </Stack>
    );
}
