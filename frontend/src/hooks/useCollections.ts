import {useCallback, useEffect, useState} from 'react';
import {CreateCollection, DeleteCollection, DeleteRequest, ListCollections, SaveRequest} from '../../wailsjs/go/main/App';
import {main} from '../../wailsjs/go/models';

/** Collections state + persistence. Actions throw — callers surface errors. */
export function useCollections() {
    const [collections, setCollections] = useState<main.Collection[]>([]);

    const refresh = useCallback(async () => {
        setCollections(await ListCollections());
    }, []);

    useEffect(() => { refresh().catch(console.error); }, [refresh]);

    const create = async (name: string) => {
        await CreateCollection(name);
        await refresh();
    };

    const remove = async (id: string) => {
        await DeleteCollection(id);
        await refresh();
    };

    const saveRequest = async (colId: string, req: main.SavedRequest) => {
        const saved = await SaveRequest(colId, req);
        await refresh();
        return saved;
    };

    const removeRequest = async (colId: string, reqId: string) => {
        await DeleteRequest(colId, reqId);
        await refresh();
    };

    return {collections, refresh, create, remove, saveRequest, removeRequest};
}
