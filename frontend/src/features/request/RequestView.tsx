import {useEffect, useState} from 'react';
import {Autocomplete, Button, Group, NativeSelect, PasswordInput, Stack, Textarea, TextInput} from '@mantine/core';
import {SendRequest} from '../../../wailsjs/go/main/App';
import {main} from '../../../wailsjs/go/models';
import {kvToText, METHODS, parseKV} from '../../lib/kv';
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
    const [paramsText, setParamsText] = useState('');
    const [headersText, setHeadersText] = useState('');
    const [body, setBody] = useState('');
    const [authType, setAuthType] = useState('');
    const [authToken, setAuthToken] = useState('');
    const [authUser, setAuthUser] = useState('');
    const [authPass, setAuthPass] = useState('');

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
        setParamsText(kvToText(r.params));
        setHeadersText(kvToText(r.headers));
        setBody(r.body);
        setAuthType(r.auth?.type ?? '');
        setAuthToken(r.auth?.token ?? '');
        setAuthUser(r.auth?.username ?? '');
        setAuthPass(r.auth?.password ?? '');
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
                params: parseKV(paramsText),
                headers: parseKV(headersText),
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
                params: parseKV(paramsText),
                headers: parseKV(headersText),
                body,
                auth: auth(),
            })));
        } catch (e) {
            setError(String(e));
        } finally {
            setSending(false);
        }
    }

    const hasBody = !['GET', 'HEAD'].includes(method);

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

            <Group gap="sm" align="stretch" wrap="nowrap">
                <Textarea
                    style={{flex: 1}} className="mono-input" rows={4}
                    value={paramsText}
                    onChange={e => setParamsText(e.target.value)}
                    placeholder={'Query params, one per line:\npage: 2\nsearch: {{term}}'}
                />
                <Textarea
                    style={{flex: 1}} className="mono-input" rows={4}
                    value={headersText}
                    onChange={e => setHeadersText(e.target.value)}
                    placeholder={'Headers, one per line:\nX-Request-Id: abc'}
                />
                {hasBody &&
                    <Textarea
                        style={{flex: 1}} className="mono-input" rows={4}
                        value={body}
                        onChange={e => setBody(e.target.value)}
                        placeholder="Request body"
                    />}
            </Group>

            <ResponseViewer response={response} error={error}/>
        </Stack>
    );
}
