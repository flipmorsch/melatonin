import {useEffect, useState} from 'react';
import {Button, Group, ScrollArea, Stack, Switch, Text, TextInput} from '@mantine/core';
import {main} from '../../../wailsjs/go/models';
import {kvToText, parseKV} from '../../lib/kv';
import {EmptyState} from '../../components/EmptyState';
import {SectionLabel} from '../../components/SectionLabel';
import {RequestLog} from './RequestLog';
import {RouteCard, RouteDraft} from './RouteCard';

interface Props {
    mock: main.MockServer;
    /** Actual listening port when running, undefined when stopped. */
    runningPort: number | undefined;
    log: main.MockLogEntry[];
    onSave: (m: main.MockServer) => Promise<main.MockServer>;
    onStart: (id: string) => Promise<void>;
    onStop: (id: string) => Promise<void>;
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

export function MockView({mock, runningPort, log, onSave, onStart, onStop}: Props) {
    const [name, setName] = useState('');
    const [port, setPort] = useState('9000');
    const [expose, setExpose] = useState(false);
    const [routes, setRoutes] = useState<RouteDraft[]>([]);
    const [error, setError] = useState('');

    useEffect(() => {
        setName(mock.name);
        setPort(String(mock.port));
        setExpose(mock.exposeOnNetwork);
        setRoutes((mock.routes ?? []).map(toDraft));
        setError('');
    }, [mock.id]);

    const running = runningPort !== undefined;

    const def = (): main.MockServer => main.MockServer.createFrom({
        id: mock.id,
        name,
        port: parseInt(port, 10) || 0,
        exposeOnNetwork: expose,
        routes: routes.map(fromDraft),
    });

    async function save() {
        try {
            await onSave(def());
        } catch (e) {
            setError(String(e));
        }
    }

    async function toggle() {
        setError('');
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

    function updateRoute(i: number, patch: Partial<RouteDraft>) {
        setRoutes(rs => rs.map((r, j) => j === i ? {...r, ...patch} : r));
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
                <Button onClick={save}>Save</Button>
                <Button color={running ? 'red' : 'teal'} variant={running ? 'outline' : 'filled'}
                    onClick={toggle}>
                    {running ? 'Stop' : 'Start'}
                </Button>
            </Group>
            {error && <Text size="sm" ff="monospace" c="red.4">{error}</Text>}

            <ScrollArea style={{flex: 1}} type="auto">
                <Stack gap="sm">
                    <Group justify="space-between">
                        <SectionLabel>Routes</SectionLabel>
                        <Button size="compact-xs" variant="default" onClick={() => setRoutes(rs =>
                            [...rs, {id: '', method: 'GET', path: '/', status: '200', headersText: '', body: ''}])}>
                            + Add route
                        </Button>
                    </Group>
                    {routes.length === 0 &&
                        <EmptyState>No routes yet — add one; unmatched requests get a 404</EmptyState>}
                    {routes.map((r, i) =>
                        <RouteCard
                            key={i}
                            draft={r}
                            onChange={patch => updateRoute(i, patch)}
                            onRemove={() => setRoutes(rs => rs.filter((_, j) => j !== i))}
                        />)}

                    <SectionLabel mt="xs">
                        Request Log {running ? '' : '(server stopped — log clears on start)'}
                    </SectionLabel>
                    <RequestLog entries={log}/>
                </Stack>
            </ScrollArea>
        </Stack>
    );
}
