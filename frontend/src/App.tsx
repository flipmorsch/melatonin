import {useState} from 'react';
import {AppShell, Button, Group, NativeSelect, Text} from '@mantine/core';
import {main} from '../wailsjs/go/models';
import {Brand} from './components/Brand';
import {Sidebar} from './features/sidebar/Sidebar';
import {RequestView} from './features/request/RequestView';
import {EnvironmentsView} from './features/environments/EnvironmentsView';
import {MockView} from './features/mocks/MockView';
import {useCollections} from './hooks/useCollections';
import {useEnvironments} from './hooks/useEnvironments';
import {useMocks} from './hooks/useMocks';

type View = 'request' | 'environments' | 'mock';

function App() {
    const cols = useCollections();
    const envs = useEnvironments();
    const mocks = useMocks();

    const [view, setView] = useState<View>('request');
    const [selected, setSelected] = useState<{colId: string, req: main.SavedRequest} | null>(null);
    const [selectedMockId, setSelectedMockId] = useState('');
    const [shellError, setShellError] = useState('');

    const environments = envs.envSet?.environments ?? [];
    const selectedMock = mocks.mocks.find(m => m.id === selectedMockId);
    const folders = [...new Set(cols.collections.flatMap(c =>
        (c.requests ?? []).map(r => r.folder).filter(Boolean)))];

    /** Runs a sidebar/topbar action, surfacing failures in the shell error strip. */
    const run = (p: Promise<unknown>) => {
        setShellError('');
        p.catch(e => setShellError(String(e)));
    };

    function selectRequest(colId: string, req: main.SavedRequest) {
        setSelected({colId, req});
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
        setView('mock');
        run(mocks.loadLog(m.id));
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
                    onSelectMock={selectMock}
                    onAddMock={() => run(addMock())}
                    onDeleteMock={id => {
                        if (selectedMockId === id) {
                            setSelectedMockId('');
                            setView('request');
                        }
                        run(mocks.remove(id));
                    }}
                />
            </AppShell.Navbar>

            <AppShell.Main style={{display: 'flex', flexDirection: 'column', height: '100vh'}}>
                {shellError &&
                    <Text size="sm" ff="monospace" c="red.4" mb="xs">{shellError}</Text>}
                {view === 'request' &&
                    <RequestView selected={selected} folders={folders} onSave={cols.saveRequest}/>}
                {view === 'environments' &&
                    <EnvironmentsView envSet={envs.envSet} onSave={envs.save} onDelete={envs.remove}/>}
                {view === 'mock' && selectedMock &&
                    <MockView
                        mock={selectedMock}
                        runningPort={mocks.running[selectedMock.id]}
                        log={mocks.logsByMock[selectedMock.id] ?? []}
                        onSave={mocks.save}
                        onStart={mocks.start}
                        onStop={mocks.stop}
                    />}
            </AppShell.Main>
        </AppShell>
    );
}

export default App
