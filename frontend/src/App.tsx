import {useEffect, useMemo, useState} from 'react';
import {AppShell, Button, Group, NativeSelect, Text} from '@mantine/core';
import {main} from '../wailsjs/go/models';
import {Brand} from './components/Brand';
import {Sidebar} from './features/sidebar/Sidebar';
import {RequestView} from './features/request/RequestView';
import {EnvironmentsView} from './features/environments/EnvironmentsView';
import {HistoryDetail} from './features/history/HistoryDetail';
import {MockView} from './features/mocks/MockView';
import {useCollections} from './hooks/useCollections';
import {useEnvironments} from './hooks/useEnvironments';
import {useHistory} from './hooks/useHistory';
import {useMocks} from './hooks/useMocks';
import {CommandPalette, PaletteItem} from './components/CommandPalette';
import {MethodBadge} from './components/MethodBadge';
import {RunDot} from './components/RunDot';

type View = 'request' | 'environments' | 'mock' | 'history';

function App() {
    const cols = useCollections();
    const envs = useEnvironments();
    const mocks = useMocks();
    const hist = useHistory();

    const [view, setView] = useState<View>('request');
    const [selected, setSelected] = useState<{colId: string, req: main.SavedRequest} | null>(null);
    const [replay, setReplay] = useState<main.HistoryEntry | null>(null);
    const [histDetail, setHistDetail] = useState<main.HistoryEntry | null>(null);
    const [selectedMockId, setSelectedMockId] = useState('');
    const [selectedRouteId, setSelectedRouteId] = useState<string | null>(null);
    const [shellError, setShellError] = useState('');
    const [paletteOpen, setPaletteOpen] = useState(false);

    const environments = envs.envSet?.environments ?? [];
    const variables = Object.keys(
        environments.find(e => e.id === envs.envSet?.activeId)?.variables ?? {});
    const selectedMock = mocks.mocks.find(m => m.id === selectedMockId);
    const folders = [...new Set(cols.collections.flatMap(c =>
        (c.requests ?? []).map(r => r.folder).filter(Boolean)))];

    /** Runs a sidebar/topbar action, surfacing failures in the shell error strip. */
    const run = (p: Promise<unknown>) => {
        setShellError('');
        p.catch(e => setShellError(String(e)));
    };

    // Ctrl+K / Cmd+K opens the command palette
    useEffect(() => {
        function onKey(e: KeyboardEvent) {
            if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
                e.preventDefault();
                setPaletteOpen(o => !o);
            }
        }
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, []);

    const paletteItems: PaletteItem[] = useMemo(() => {
        const out: PaletteItem[] = [];
        for (const col of cols.collections) {
            for (const req of (col.requests ?? [])) {
                out.push({
                    id: `req:${req.id}`,
                    label: req.name,
                    detail: col.name,
                    left: <MethodBadge method={req.method}/>,
                    onSelect: () => selectRequest(col.id, req),
                });
            }
        }
        for (const m of mocks.mocks) {
            const port = mocks.running[m.id];
            out.push({
                id: `mock:${m.id}`,
                label: m.name,
                detail: port ? `Running on :${port}` : `Port ${m.port}`,
                left: <RunDot on={port !== undefined}/>,
                onSelect: () => selectMock(m),
            });
            for (const r of (m.routes ?? [])) {
                out.push({
                    id: `route:${r.id}`,
                    label: r.path,
                    detail: `${m.name} · ${r.status}`,
                    left: <MethodBadge method={r.method}/>,
                    onSelect: () => selectRoute(m, r.id),
                });
            }
        }
        for (const e of hist.entries.slice(0, 30)) {
            out.push({
                id: `hist:${e.id}`,
                label: e.request.url.split('?')[0],
                detail: `${e.request.method} · ${new Date(e.time).toLocaleTimeString()}`,
                left: <MethodBadge method={e.request.method}/>,
                onSelect: () => openHistoryInEditor(e),
            });
        }
        for (const env of environments) {
            out.push({
                id: `env:${env.id}`,
                label: env.name,
                detail: `${Object.keys(env.variables ?? {}).length} variables`,
                onSelect: () => { envs.setActive(env.id); setView('environments'); },
            });
        }
        return out;
    }, [cols.collections, mocks.mocks, mocks.running, hist.entries, environments]);

    function selectRequest(colId: string, req: main.SavedRequest) {
        setSelected({colId, req});
        setReplay(null);
        setView('request');
    }

    /** Shows a history entry's read-only details. */
    function selectHistory(e: main.HistoryEntry) {
        setHistDetail(e);
        setView('history');
    }

    /** Loads a history entry into the scratch editor with its recorded response. */
    function openHistoryInEditor(e: main.HistoryEntry) {
        setSelected(null);
        setReplay(e);
        setView('request');
    }

    async function addRequest(colId: string) {
        const req = await cols.saveRequest(colId, main.SavedRequest.createFrom({
            id: '', name: 'New Request', folder: '', method: 'GET', url: '',
            params: [], headers: [], body: '',
            auth: {type: '', token: '', username: '', password: ''},
        }));
        selectRequest(colId, req);
    }

    async function addMock() {
        const m = await mocks.save(main.MockServer.createFrom({
            id: '', name: 'New Mock Server', port: 9000, exposeOnNetwork: false, routes: [],
        }));
        setSelectedMockId(m.id);
        setView('mock');
    }

    function selectMock(m: main.MockServer) {
        setSelectedMockId(m.id);
        setSelectedRouteId(null);
        setView('mock');
        run(mocks.loadLog(m.id));
    }

    function selectRoute(m: main.MockServer, routeId: string) {
        if (selectedMockId !== m.id) run(mocks.loadLog(m.id));
        setSelectedMockId(m.id);
        setSelectedRouteId(routeId);
        setView('mock');
    }

    async function addRoute(m: main.MockServer) {
        const saved = await mocks.save(main.MockServer.createFrom({
            ...m,
            routes: [...(m.routes ?? []),
                {id: '', method: 'GET', path: '/', status: 200, headers: {}, body: ''}],
        }));
        selectRoute(saved, saved.routes[saved.routes.length - 1].id);
    }

    function deleteRoute(m: main.MockServer, routeId: string) {
        if (selectedRouteId === routeId) setSelectedRouteId(null);
        run(mocks.save(main.MockServer.createFrom({
            ...m,
            routes: (m.routes ?? []).filter(r => r.id !== routeId),
        })));
    }

    return (
        <AppShell header={{height: 52}} navbar={{width: 260, breakpoint: 0}} padding="md">
            <AppShell.Header className="topbar" withBorder={false} px="md">
                <Group justify="space-between" h="100%">
                    <Brand/>
                    <Group gap="xs">
                        <NativeSelect
                            size="xs"
                            value={envs.envSet?.activeId ?? ''}
                            onChange={e => run(envs.setActive(e.target.value))}
                            data={[
                                {value: '', label: 'No environment'},
                                ...environments.map(env => ({value: env.id, label: env.name})),
                            ]}
                        />
                        <Button
                            size="xs" variant="default"
                            onClick={() => setView(view === 'environments' ? 'request' : 'environments')}
                        >
                            {view === 'environments' ? 'Back to requests' : 'Manage environments'}
                        </Button>
                    </Group>
                </Group>
            </AppShell.Header>

            <AppShell.Navbar withBorder>
                <Sidebar
                    collections={cols.collections}
                    selectedReqId={view === 'request' ? selected?.req.id ?? null : null}
                    onSelectRequest={selectRequest}
                    onCreateCollection={name => run(cols.create(name))}
                    onDeleteCollection={id => {
                        if (selected?.colId === id) setSelected(null);
                        run(cols.remove(id));
                    }}
                    onAddRequest={id => run(addRequest(id))}
                    onDeleteRequest={(colId, reqId) => {
                        if (selected?.req.id === reqId) setSelected(null);
                        run(cols.removeRequest(colId, reqId));
                    }}
                    mocks={mocks.mocks}
                    running={mocks.running}
                    selectedMockId={view === 'mock' ? selectedMockId : null}
                    selectedRouteId={view === 'mock' ? selectedRouteId : null}
                    onSelectMock={selectMock}
                    onAddMock={() => run(addMock())}
                    onDeleteMock={id => {
                        if (selectedMockId === id) {
                            setSelectedMockId('');
                            setSelectedRouteId(null);
                            setView('request');
                        }
                        run(mocks.remove(id));
                    }}
                    onSelectRoute={selectRoute}
                    onAddRoute={m => run(addRoute(m))}
                    onDeleteRoute={deleteRoute}
                    history={hist.entries}
                    selectedHistoryId={
                        view === 'history' ? histDetail?.id ?? null
                        : view === 'request' && !selected ? replay?.id ?? null : null}
                    onSelectHistory={selectHistory}
                    onClearHistory={() => {
                        setReplay(null);
                        setHistDetail(null);
                        if (view === 'history') setView('request');
                        run(hist.clear());
                    }}
                />
            </AppShell.Navbar>

            <AppShell.Main style={{display: 'flex', flexDirection: 'column', height: '100vh'}}>
                {shellError &&
                    <Text size="sm" ff="monospace" c="red.4" mb="xs">{shellError}</Text>}
                {view === 'request' &&
                    <RequestView selected={selected} replay={replay} folders={folders}
                        variables={variables} onSave={cols.saveRequest}
                        onSent={() => hist.reload().catch(console.error)}/>}
                {view === 'environments' &&
                    <EnvironmentsView envSet={envs.envSet} onSave={envs.save} onDelete={envs.remove}/>}
                {view === 'history' && histDetail &&
                    <HistoryDetail entry={histDetail} onOpenInEditor={openHistoryInEditor}/>}
                {view === 'mock' && selectedMock &&
                    <MockView
                        mock={selectedMock}
                        selectedRouteId={selectedRouteId}
                        runningPort={mocks.running[selectedMock.id]}
                        log={mocks.logsByMock[selectedMock.id] ?? []}
                        onSave={mocks.save}
                        onStart={mocks.start}
                        onStop={mocks.stop}
                        onClearLog={id => run(mocks.clearLog(id))}
                    />}
            </AppShell.Main>
            <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} items={paletteItems}/>
        </AppShell>
    );
}

export default App
