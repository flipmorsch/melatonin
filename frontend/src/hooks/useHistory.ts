import {useCallback, useEffect, useState} from 'react';
import {ClearHistory, GetHistory} from '../../wailsjs/go/main/App';
import {main} from '../../wailsjs/go/models';

/** Recorded sends, newest first. Callers reload after each send; actions throw. */
export function useHistory() {
    const [entries, setEntries] = useState<main.HistoryEntry[]>([]);

    const reload = useCallback(async () => {
        setEntries(await GetHistory());
    }, []);

    useEffect(() => { reload().catch(console.error); }, [reload]);

    const clear = async () => {
        await ClearHistory();
        setEntries([]);
    };

    return {entries, reload, clear};
}
