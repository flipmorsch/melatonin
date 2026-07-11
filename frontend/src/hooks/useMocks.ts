import {useCallback, useEffect, useState} from 'react';
import {
    DeleteMockServer,
    GetMockLog,
    ListMockServers,
    RunningMockServers,
    SaveMockServer,
    StartMockServer,
    StopMockServer,
} from '../../wailsjs/go/main/App';
import {main} from '../../wailsjs/go/models';
import {EventsOn} from '../../wailsjs/runtime/runtime';

/** Mock server definitions, run state, and live request logs.
 * Log entries stream in over the `mock:log` event. Actions throw. */
export function useMocks() {
    const [mocks, setMocks] = useState<main.MockServer[]>([]);
    const [running, setRunning] = useState<Record<string, number>>({});
    const [logsByMock, setLogsByMock] = useState<Record<string, main.MockLogEntry[]>>({});

    const refresh = useCallback(async () => {
        setMocks(await ListMockServers());
        setRunning(await RunningMockServers());
    }, []);

    useEffect(() => {
        refresh().catch(console.error);
        return EventsOn('mock:log', (payload: {serverId: string, entry: main.MockLogEntry}) => {
            setLogsByMock(prev => ({
                ...prev,
                [payload.serverId]: [...(prev[payload.serverId] ?? []), payload.entry],
            }));
        });
    }, [refresh]);

    const save = async (m: main.MockServer) => {
        const saved = await SaveMockServer(m);
        await refresh();
        return saved;
    };

    const remove = async (id: string) => {
        await DeleteMockServer(id);
        await refresh();
    };

    const start = async (id: string) => {
        await StartMockServer(id);
        setLogsByMock(prev => ({...prev, [id]: []}));
        await refresh();
    };

    const stop = async (id: string) => {
        await StopMockServer(id);
        await refresh();
    };

    const loadLog = async (id: string) => {
        const log = await GetMockLog(id);
        setLogsByMock(prev => ({...prev, [id]: log}));
    };

    return {mocks, running, logsByMock, refresh, save, remove, start, stop, loadLog};
}
