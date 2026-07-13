import {useCallback, useEffect, useState} from 'react';
import {
    ClearMockLog,
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

const LOG_CAP = 200; // mirrors mockLogCap in mock.go — the backend keeps no more

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
        // Events burst under load (one per request hitting a mock); batching per
        // animation frame keeps that at one render per frame, and LOG_CAP keeps
        // memory and the log render bounded.
        let buf: {serverId: string, entry: main.MockLogEntry}[] = [];
        let raf = 0;
        const flush = () => {
            raf = 0;
            const batch = buf;
            buf = [];
            setLogsByMock(prev => {
                const next = {...prev};
                for (const {serverId, entry} of batch) {
                    const log = [...(next[serverId] ?? []), entry];
                    next[serverId] = log.length > LOG_CAP ? log.slice(-LOG_CAP) : log;
                }
                return next;
            });
        };
        const off = EventsOn('mock:log', (payload: {serverId: string, entry: main.MockLogEntry}) => {
            buf.push(payload);
            if (!raf) raf = requestAnimationFrame(flush);
        });
        return () => {
            if (raf) cancelAnimationFrame(raf);
            off();
        };
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

    const clearLog = async (id: string) => {
        await ClearMockLog(id);
        setLogsByMock(prev => ({...prev, [id]: []}));
    };

    return {mocks, running, logsByMock, refresh, save, remove, start, stop, loadLog, clearLog};
}
