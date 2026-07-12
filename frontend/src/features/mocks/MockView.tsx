import {useEffect, useRef, useState} from 'react';
import {ActionIcon, Badge, Button, Group, ScrollArea, Stack, Switch, Text, TextInput} from '@mantine/core';
import {ClipboardSetText} from '../../../wailsjs/runtime/runtime';
import {main} from '../../../wailsjs/go/models';
import {kvToText, parseKV} from '../../lib/kv';
import {ConfirmDelete} from '../../components/ConfirmDelete';
import {EmptyState} from '../../components/EmptyState';
import {SectionLabel} from '../../components/SectionLabel';
import {RequestLog} from './RequestLog';
import {RouteCard, RouteDraft} from './RouteCard';

interface Props {
    mock: main.MockServer;
    /** Route picked in the sidebar, or null when the server itself is selected. */
    selectedRouteId: string | null;
    /** Actual listening port when running, undefined when stopped. */
    runningPort: number | undefined;
    log: main.MockLogEntry[];
    onSave: (m: main.MockServer) => Promise<main.MockServer>;
    onStart: (id: string) => Promise<void>;
    onStop: (id: string) => Promise<void>;
    onClearLog: (id: string) => void;
}

function toDraft(r: main.MockRoute): RouteDraft {
    return {
        id: r.id,
        method: r.method,
        path: r.path,
        status: String(r.status || 200),
        headersText: kvToText(r.headers),
        body: r.body,
    };
}

function fromDraft(d: RouteDraft): main.MockRoute {
    return {
        id: d.id,
        method: d.method,
        path: d.path,
        status: parseInt(d.status, 10) || 200,
        headers: parseKV(d.headersText),
        body: d.body,
    };
}

export function MockView({mock, selectedRouteId, runningPort, log, onSave, onStart, onStop, onClearLog}: Props) {
    const [name, setName] = useState('');
    const [port, setPort] = useState('9000');
    const [expose, setExpose] = useState(false);
    const [route, setRoute] = useState<RouteDraft | null>(null);
    const [error, setError] = useState('');

    /** Debounced auto-save not yet written to disk. */
    const pending = useRef<{timer: number, def: main.MockServer} | null>(null);
    /** Set when fields load, so the field-change effect skips the load itself. */
    const justLoaded = useRef(false);

    function flushPending() {
        if (!pending.current) return;
        clearTimeout(pending.current.timer);
        const {def} = pending.current;
        pending.current = null;
        onSave(def).catch(console.error);
    }

    useEffect(() => {
        flushPending();
        justLoaded.current = true;
        setName(mock.name);
        setPort(String(mock.port));
        setExpose(mock.exposeOnNetwork);
        setError('');
    }, [mock.id]);

    useEffect(() => {
        // flush before switching routes: the next edit's save merges its draft
        // over mock.routes, which must already contain this route's edits
        flushPending();
        const r = (mock.routes ?? []).find(r => r.id === selectedRouteId);
        justLoaded.current = true;
        setRoute(r ? toDraft(r) : null);
        // routes live in the sidebar now; the draft reloads on selection change,
        // not on every mocks refresh, so in-progress edits survive saves
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [mock.id, selectedRouteId]);

    // flush on unmount (e.g. switching to the request view)
    useEffect(() => flushPending, []);

    const running = runningPort !== undefined;
    const baseUrl = running ? `http://127.0.0.1:${runningPort}` : '';

    // the selected route's edits are merged over the stored routes
    const def = (): main.MockServer => main.MockServer.createFrom({
        id: mock.id,
        name,
        port: parseInt(port, 10) || 0,
        exposeOnNetwork: expose,
        routes: (mock.routes ?? []).map(r =>
            route && r.id === route.id ? fromDraft(route) : r),
    });

    // debounced auto-save: any edit persists after 600ms of quiet (route edits
    // reach a running server live)
    useEffect(() => {
        if (justLoaded.current) {
            justLoaded.current = false;
            return;
        }
        if (pending.current) clearTimeout(pending.current.timer);
        const d = def();
        const timer = window.setTimeout(() => {
            pending.current = null;
            onSave(d).catch(e => setError(String(e)));
        }, 600);
        pending.current = {timer, def: d};
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [name, port, expose, route]);

    async function toggle() {
        setError('');
        if (pending.current) {
            clearTimeout(pending.current.timer);
            pending.current = null;
        }
        try {
            if (running) {
                await onStop(mock.id);
            } else {
                await onSave(def()); // start what's on screen, not a stale file
                await onStart(mock.id);
            }
        } catch (e) {
            setError(String(e));
        }
    }

    return (
        <Stack gap="sm" style={{flex: 1, minHeight: 0}}>
            <Group gap="xs" wrap="nowrap">
                <TextInput
                    style={{flex: 1}}
                    value={name}
                    onChange={e => setName(e.target.value)}
                    placeholder="Mock server name"
                />
                <TextInput
                    w={90} className="mono-input"
                    value={port}
                    onChange={e => setPort(e.target.value)}
                    placeholder="Port"
                    disabled={running}
                    title={running ? 'Stop the server to change the port' : 'Port (0 = auto)'}
                />
                <Switch
                    label="expose on network"
                    size="xs"
                    checked={expose}
                    onChange={e => setExpose(e.currentTarget.checked)}
                    disabled={running}
                />
                <Button color={running ? 'red' : 'teal'} variant={running ? 'outline' : 'filled'}
                    onClick={toggle}>
                    {running ? 'Stop' : 'Start'}
                </Button>
            </Group>
            {running &&
                <Group gap={4}>
                    <Text size="xs" ff="monospace" c="teal.4">{baseUrl}</Text>
                    <ActionIcon size="sm" variant="subtle" color="gray"
                        title="Copy base URL (paste it into an environment variable)"
                        onClick={() => ClipboardSetText(baseUrl)}>⧉</ActionIcon>
                </Group>}
            {error && <Text size="sm" ff="monospace" c="red.4">{error}</Text>}

            <ScrollArea style={{flex: 1}} type="auto">
                <Stack gap="sm">
                    {route
                        ? <>
                            <SectionLabel>Route</SectionLabel>
                            <RouteCard
                                draft={route}
                                onChange={patch => setRoute(r => r ? {...r, ...patch} : r)}
                            />
                        </>
                        : <EmptyState>
                            {(mock.routes ?? []).length === 0
                                ? 'No routes yet — use + on the server in the sidebar; unmatched requests get a 404'
                                : 'Select a route in the sidebar to edit it'}
                        </EmptyState>}

                    <Group gap="xs" mt="xs">
                        <SectionLabel>Request Log</SectionLabel>
                        {log.length > 0 &&
                            <Badge size="xs" variant="light" color="gray">{log.length}</Badge>}
                        {log.length > 0 &&
                            <ConfirmDelete title="Clear log" onConfirm={() => onClearLog(mock.id)}/>}
                    </Group>
                    <RequestLog entries={log} running={running}/>
                </Stack>
            </ScrollArea>
        </Stack>
    );
}
