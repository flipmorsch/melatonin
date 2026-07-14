import {useEffect, useMemo, useState} from 'react';
import {flushSync} from 'react-dom';
import {ActionIcon, AppShell, Box, Button, Group, Select, Text, Tooltip, UnstyledButton} from '@mantine/core';
import {IconSearch, IconX} from '@tabler/icons-react';
import {main} from '../wailsjs/go/models';
import {ClipboardSetText} from '../wailsjs/runtime/runtime';

// Show the platform's real palette shortcut (Linux/Windows: Ctrl, macOS: ⌘).
const MOD = typeof navigator !== 'undefined' && /mac/i.test(navigator.platform) ? '⌘' : 'Ctrl';

// Locate a request in a collection tree with its parent folder id ('' = root),
// so an undo can restore it in place.
function findRequestLoc(cols: main.Collection[], colId: string, reqId: string):
    {req: main.SavedRequest; parentFolderId: string} | null {
    const col = cols.find(c => c.id === colId);
    if (!col) return null;
    const root = (col.requests ?? []).find(r => r.id === reqId);
    if (root) return {req: root, parentFolderId: ''};
    const search = (folders: main.FolderNode[]): {req: main.SavedRequest; parentFolderId: string} | null => {
        for (const f of folders) {
            const hit = (f.requests ?? []).find(r => r.id === reqId);
            if (hit) return {req: hit, parentFolderId: f.id};
            const deep = search(f.folders ?? []);
            if (deep) return deep;
        }
        return null;
    };
    return search(col.folders ?? []);
}
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
import {useTabs} from './hooks/useTabs';
import {useEvent} from './hooks/useEvent';
import {TabStrip} from './features/tabs/TabStrip';
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
    const [histDetail, setHistDetail] = useState<main.HistoryEntry | null>(null);
    const [selectedMockId, setSelectedMockId] = useState('');
    const [selectedRouteId, setSelectedRouteId] = useState<string | null>(null);
    const [shellError, setShellError] = useState('');
    const [paletteOpen, setPaletteOpen] = useState(false);
    const [undoState, setUndoState] = useState<
        {label: string; restore: () => Promise<unknown>} | null>(null);
    const [sidebarCollapsed, setSidebarCollapsed] = useState(() => localStorage.getItem('sidebarCollapsed') === 'true');
    const [sidebarWidth, setSidebarWidth] = useState(() => {
        const saved = localStorage.getItem('sidebarWidth');
        return saved ? Math.max(180, Math.min(500, Number(saved))) : 260;
    });

    // ── Tabs ──
    const {state: tabsState, active, dispatch: tabDispatch,
        pendingRef, justLoadedRef, flushPending} = useTabs();

    function selectTab(idx: number) {
        if (idx === tabsState.activeIdx) return;
        if (tabsState.activeIdx >= 0 && tabsState.tabs[tabsState.activeIdx]?.type === 'saved') {
            flushPending(cols.saveRequest);
        }
        tabDispatch({type: 'SET_ACTIVE', idx});
    }

    // Auto-save makes closing safe: flush any pending edit, then close. No
    // "unsaved changes" prompt — there is no pre-edit snapshot to discard to.
    function requestCloseTab(idx: number) {
        if (tabsState.tabs[idx]?.type === 'scratch') return;
        if (idx === tabsState.activeIdx && tabsState.tabs[idx]?.type === 'saved') {
            flushPending(cols.saveRequest);
        }
        tabDispatch({type: 'CLOSE_TAB', tabIdx: idx});
    }

    // ── Shared data ──
    const environments = envs.envSet?.environments ?? [];
    const variables = Object.keys(
        environments.find(e => e.id === envs.envSet?.activeId)?.variables ?? {});
    const selectedMock = mocks.mocks.find(m => m.id === selectedMockId);

    const run = (p: Promise<unknown>) => {
        setShellError('');
        p.catch(e => setShellError(String(e)));
    };

    // ── Sidebar resize ──
    // The drag drives the AppShell CSS vars directly — setState per mousemove
    // re-rendered the whole shell (sidebar tree, tabs, editors) at 60Hz.
    function handleResizeStart(e: React.MouseEvent) {
        e.preventDefault();
        const root = (e.currentTarget as HTMLElement).closest('.mantine-AppShell-root') as HTMLElement | null;
        if (!root) return;
        const startX = e.clientX;
        const startW = sidebarWidth;
        let w = startW;
        root.dataset.resizing = 'true'; // Mantine zeroes its shell transitions on this
        const onMove = (ev: MouseEvent) => {
            w = Math.max(180, Math.min(500, startW + ev.clientX - startX));
            root.style.setProperty('--app-shell-navbar-width', `${w}px`);
            root.style.setProperty('--app-shell-navbar-offset', `${w}px`);
        };
        const onUp = () => {
            document.removeEventListener('mousemove', onMove);
            document.removeEventListener('mouseup', onUp);
            document.body.style.cursor = '';
            document.body.style.userSelect = '';
            // Commit synchronously, then drop the inline overrides so the
            // state-driven width takes over without a one-frame snap-back.
            flushSync(() => setSidebarWidth(w));
            root.style.removeProperty('--app-shell-navbar-width');
            root.style.removeProperty('--app-shell-navbar-offset');
            delete root.dataset.resizing;
            localStorage.setItem('sidebarWidth', String(w));
        };
        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onUp);
        document.body.style.cursor = 'col-resize';
        document.body.style.userSelect = 'none';
    }

    // ── Keyboard shortcuts ──
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

    // Undo bar auto-dismisses after a short window.
    useEffect(() => {
        if (!undoState) return;
        const t = setTimeout(() => setUndoState(null), 6000);
        return () => clearTimeout(t);
    }, [undoState]);

    // ── Command palette ──
    const paletteItems: PaletteItem[] = useMemo(() => {
        const out: PaletteItem[] = [];

        // Verbs first — the palette acts, it doesn't only navigate.
        out.push(
            {id: 'act:new-request', label: 'New request', detail: 'Open a scratch tab',
                onSelect: () => { setView('request'); tabDispatch({type: 'OPEN_SCRATCH'}); }},
            {id: 'act:new-mock', label: 'New mock server', detail: 'Create and edit a mock',
                onSelect: () => run(addMock())},
            {id: 'act:manage-envs', label: 'Manage environments', detail: 'Variables & active environment',
                onSelect: () => setView('environments')},
        );
        for (const m of mocks.mocks) {
            const p = mocks.running[m.id];
            if (p) {
                out.push({id: `act:stop:${m.id}`, label: `Stop mock: ${m.name}`,
                    detail: `Running on port ${p}`, left: <RunDot on={true}/>,
                    onSelect: () => run(mocks.stop(m.id))});
                out.push({id: `act:baseurl:${m.id}`, label: `Use as {{baseUrl}}: ${m.name}`,
                    detail: `http://127.0.0.1:${p} → active environment`,
                    onSelect: () => useAsBaseUrl(`http://127.0.0.1:${p}`)});
            } else {
                out.push({id: `act:start:${m.id}`, label: `Start mock: ${m.name}`,
                    detail: `Port ${m.port}`, left: <RunDot on={false}/>,
                    onSelect: () => run(mocks.start(m.id))});
            }
        }

        for (const col of cols.collections) {
            function addReq(item: any, prefix: string) {
                out.push({
                    id: `req:${item.id}`,
                    label: `${item.method} ${item.name || item.url}`,
                    detail: prefix,
                    left: <MethodBadge method={item.method}/>,
                    onSelect: () => selectRequest(col.id, item),
                });
            }
            for (const item of col.requests ?? []) addReq(item, col.name);
            for (const folder of col.folders ?? []) {
                function walk(f: any, prefix: string) {
                    for (const item of f.requests ?? []) addReq(item, `${prefix} › ${f.name}`);
                    for (const sub of f.folders ?? []) walk(sub, `${prefix} › ${f.name}`);
                }
                walk(folder, col.name);
            }
        }
        for (const e of hist.entries) {
            out.push({
                id: `hist:${e.id}`,
                label: e.request.url.split('?')[0],
                detail: `${e.request.method} · ${new Date(e.time).toLocaleTimeString()}`,
                left: <MethodBadge method={e.request.method}/>,
                onSelect: () => openHistoryInEditor(e),
            });
        }
        for (const m of mocks.mocks) {
            out.push({
                id: `mock:${m.id}`,
                label: m.name,
                detail: `Port ${m.port}${mocks.running[m.id] ? ' · running' : ''}`,
                left: <RunDot on={!!mocks.running[m.id]}/>,
                onSelect: () => selectMock(m),
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

    // ── Sidebar / tab actions ──
    function selectRequest(colId: string, req: main.SavedRequest) {
        justLoadedRef.current = true;
        setView('request');
        tabDispatch({type: 'OPEN_SAVED', colId, req});
    }

    function selectHistory(e: main.HistoryEntry) {
        setHistDetail(e);
        setView('history');
    }

    function openHistoryInEditor(e: main.HistoryEntry) {
        justLoadedRef.current = true;
        setView('request');
        tabDispatch({type: 'OPEN_HISTORY', entry: e});
    }

    async function addRequest(colId: string, parentFolderId?: string) {
        const req = await cols.saveRequest(colId, main.SavedRequest.createFrom({
            id: '', name: 'New Request', method: 'GET', url: '',
            params: [], headers: [], body: '',
            auth: {type: '', token: '', username: '', password: ''},
        }), parentFolderId);
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

    // One-click handoff: write a running mock's base URL into the active
    // environment's {{baseUrl}} so requests can reuse it. Falls back to the
    // clipboard when no environment is active. Returns a status line to show.
    function useAsBaseUrl(baseUrl: string): string {
        const active = environments.find(e => e.id === envs.envSet?.activeId);
        if (!active) {
            ClipboardSetText(baseUrl).catch(console.error);
            return 'No active environment — copied to clipboard instead';
        }
        run(envs.save(main.Environment.createFrom({
            ...active,
            variables: {...(active.variables ?? {}), baseUrl},
        })));
        return `Set {{baseUrl}} = ${baseUrl} in "${active.name}"`;
    }

    // ── Promote a scratch/history tab into a collection ──
    async function saveTabToCollection(colId: string, req: main.SavedRequest) {
        const saved = await cols.saveRequest(colId, req);
        selectRequest(colId, saved);
    }
    async function saveTabToNewCollection(req: main.SavedRequest) {
        const col = await cols.create('Requests');
        const saved = await cols.saveRequest(col.id, req);
        selectRequest(col.id, saved);
    }

    // ── Undo the last delete (re-save the captured record) ──
    function undoDelete() {
        if (!undoState) return;
        const {restore} = undoState;
        setUndoState(null);
        run(restore());
    }

    // Delete an environment, capturing an undo record (upsert-by-id restore).
    async function deleteEnv(id: string) {
        const env = environments.find(e => e.id === id);
        await envs.remove(id);
        if (env) setUndoState({label: env.name || 'environment', restore: () => envs.save(env)});
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
        const route = (m.routes ?? []).find(r => r.id === routeId);
        run(mocks.save(main.MockServer.createFrom({
            ...m,
            routes: (m.routes ?? []).filter(r => r.id !== routeId),
        })));
        setUndoState({
            label: route ? `route ${route.method} ${route.path}` : 'route',
            restore: () => mocks.save(m),
        });
    }

    // ── Sidebar handlers ──
    // useEvent-stable identities so the memoized Sidebar only re-renders on
    // data/selection changes, not on every keystroke of the tabs reducer.
    const sidebarHandlers = {
        onToggleCollapse: useEvent(() => setSidebarCollapsed(c => {
            const n = !c; localStorage.setItem('sidebarCollapsed', String(n)); return n;
        })),
        onSelectRequest: useEvent(selectRequest),
        onCreateCollection: useEvent((name: string) => run(cols.create(name))),
        onDeleteCollection: useEvent((id: string) => run(cols.remove(id))),
        onCreateFolder: useEvent((colId: string, parentId: string, name: string) =>
            cols.createFolder(colId, parentId, name)),
        onDeleteFolder: useEvent((colId: string, folderId: string) =>
            cols.removeFolder(colId, folderId)),
        onCountFolder: useEvent((colId: string, folderId: string) =>
            cols.countFolder(colId, folderId)),
        onAddRequest: useEvent((colId: string, parentFolderId?: string) =>
            run(addRequest(colId, parentFolderId))),
        onDeleteRequest: useEvent((colId: string, reqId: string) => {
            const loc = findRequestLoc(cols.collections, colId, reqId);
            run(cols.removeRequest(colId, reqId));
            if (loc) setUndoState({
                label: loc.req.name || 'request',
                restore: () => cols.saveRequest(colId, loc.req, loc.parentFolderId),
            });
        }),
        onReorderRequest: useEvent((colId: string, reqId: string, newParentID: string, newPos: number) =>
            run(cols.reorderRequest(colId, reqId, newParentID, newPos))),
        onReorderFolder: useEvent((colId: string, folderId: string, newParentID: string, newPos: number) =>
            run(cols.reorderFolder(colId, folderId, newParentID, newPos))),
        onSelectMock: useEvent(selectMock),
        onAddMock: useEvent(() => run(addMock())),
        onDeleteMock: useEvent((id: string) => {
            const mock = mocks.mocks.find(m => m.id === id);
            if (selectedMockId === id) {
                setSelectedMockId('');
                setSelectedRouteId(null);
                setView('request');
            }
            run(mocks.remove(id));
            if (mock) setUndoState({label: mock.name || 'mock server', restore: () => mocks.save(mock)});
        }),
        onSelectRoute: useEvent(selectRoute),
        onAddRoute: useEvent((m: main.MockServer) => run(addRoute(m))),
        onDeleteRoute: useEvent(deleteRoute),
        onSelectHistory: useEvent(selectHistory),
        onClearHistory: useEvent(() => {
            setHistDetail(null);
            if (view === 'history') setView('request');
            run(hist.clear());
        }),
    };

    // ── selectedReqId for sidebar highlight ──
    const selectedReqId = view === 'request' && active?.type === 'saved'
        ? active.reqId ?? null : null;

    // ── selectedHistoryId for sidebar highlight ──
    const selectedHistoryId = view === 'history' ? histDetail?.id ?? null
        : view === 'request' && active?.type === 'history' ? active.histId ?? null : null;

    return (
        <AppShell header={{height: 52}} navbar={{width: sidebarCollapsed ? 48 : sidebarWidth, breakpoint: 0}} padding="md">
            <AppShell.Header className="topbar" withBorder={false} px="md">
                <Group justify="space-between" h="100%">
                    <Brand/>
                    <Group gap="xs">
                        <Tooltip label={`Command palette (${MOD} K)`} openDelay={400}>
                            <UnstyledButton
                                onClick={() => setPaletteOpen(true)}
                                aria-label={`Open command palette, ${MOD} K`}
                                style={{
                                    display: 'flex', alignItems: 'center', gap: 6,
                                    padding: '3px 8px', borderRadius: 'var(--mantine-radius-sm)',
                                    border: '1px solid var(--mantine-color-dark-4)',
                                    color: 'var(--mantine-color-dark-2)',
                                }}
                            >
                                <IconSearch size={13}/>
                                <Text size="xs" ff="monospace">{MOD} K</Text>
                            </UnstyledButton>
                        </Tooltip>
                        <Select
                            size="xs"
                            aria-label="Active environment"
                            value={envs.envSet?.activeId ?? ''}
                            onChange={v => v !== null && run(envs.setActive(v))}
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
                <Box style={{position: 'relative', height: '100%'}}>
                    <Sidebar
                        collapsed={sidebarCollapsed}
                        collections={cols.collections}
                        selectedReqId={selectedReqId}
                        mocks={mocks.mocks}
                        running={mocks.running}
                        selectedMockId={view === 'mock' ? selectedMockId : null}
                        selectedRouteId={view === 'mock' ? selectedRouteId : null}
                        history={hist.entries}
                        selectedHistoryId={selectedHistoryId}
                        {...sidebarHandlers}
                    />
                    {!sidebarCollapsed && (
                        <Box onMouseDown={handleResizeStart} style={{
                            position: 'absolute', right: -2, top: 0, bottom: 0,
                            width: 5, cursor: 'col-resize', zIndex: 10,
                            background: 'transparent',
                        }}/>
                    )}
                </Box>
            </AppShell.Navbar>

            <AppShell.Main style={{display: 'flex', flexDirection: 'column', height: '100vh'}}>
                {shellError &&
                    <Text size="sm" ff="monospace" c="red.4" mb="xs">{shellError}</Text>}
                {undoState &&
                    <Group role="status" gap="sm" mb="xs" px="sm" py={6} wrap="nowrap"
                        style={{
                            background: 'var(--mantine-color-dark-5)',
                            border: '1px solid var(--mantine-color-dark-4)',
                            borderRadius: 'var(--mantine-radius-sm)',
                        }}>
                        <Text size="sm" c="dark.1" style={{flex: 1}} truncate>
                            Deleted <Text span c="dark.0" fw={600}>{undoState.label}</Text>
                        </Text>
                        <Button size="compact-xs" variant="subtle" onClick={undoDelete}>Undo</Button>
                        <ActionIcon size="sm" variant="subtle" color="gray"
                            aria-label="Dismiss" onClick={() => setUndoState(null)}>
                            <IconX size={15}/>
                        </ActionIcon>
                    </Group>}
                {view === 'request' &&
                    <TabStrip
                        tabs={tabsState.tabs}
                        activeIdx={tabsState.activeIdx}
                        onSelect={selectTab}
                        onClose={requestCloseTab}
                        onNewScratch={() => tabDispatch({type: 'OPEN_SCRATCH'})}
                    />}
                {view === 'request' && active &&
                    <RequestView
                        key={active.tabId}
                        tab={active}
                        dispatch={tabDispatch}
                        variables={variables}
                        onSave={(colId, req) => cols.saveRequest(colId, req)}
                        onSent={() => hist.reload().catch(console.error)}
                        justLoadedRef={justLoadedRef}
                        collections={cols.collections}
                        onSaveToCollection={(colId, req) => run(saveTabToCollection(colId, req))}
                        onSaveToNewCollection={req => run(saveTabToNewCollection(req))}
                    />}
                {view === 'environments' &&
                    <EnvironmentsView envSet={envs.envSet} onSave={envs.save} onDelete={deleteEnv}/>}
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
                        onUseAsBaseUrl={useAsBaseUrl}
                    />}
            </AppShell.Main>
            <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} items={paletteItems}/>
        </AppShell>
    );
}

export default App;
