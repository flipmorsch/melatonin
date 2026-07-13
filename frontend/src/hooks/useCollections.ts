import {useCallback, useEffect, useState} from 'react';
import {CreateCollection, CreateFolder, DeleteCollection, DeleteFolder, DeleteRequest, CountFolderDescendants, ListCollections, MoveFolder, MoveRequest, SaveRequest} from '../../wailsjs/go/main/App';
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

    const saveRequest = async (colId: string, req: main.SavedRequest, parentFolderId?: string) => {
        const saved = await SaveRequest(colId, req, parentFolderId ?? '');
        await refresh();
        return saved;
    };

    const removeRequest = async (colId: string, reqId: string) => {
        await DeleteRequest(colId, reqId);
        await refresh();
    };

    const createFolder = async (colId: string, parentFolderId: string, name: string) => {
        await CreateFolder(colId, parentFolderId, name);
        await refresh();
    };

    const removeFolder = async (colId: string, folderId: string) => {
        await DeleteFolder(colId, folderId);
        await refresh();
    };

    const countFolder = async (colId: string, folderId: string) => {
        return await CountFolderDescendants(colId, folderId);
    };

    const reorderRequest = async (colId: string, reqId: string, newPosition: number) => {
        await MoveRequest(colId, reqId, newPosition);
        await refresh();
    };

    const reorderFolder = async (colId: string, folderId: string, newPosition: number) => {
        await MoveFolder(colId, folderId, newPosition);
        await refresh();
    };

    return {collections, refresh, create, remove, saveRequest, removeRequest,
        createFolder, removeFolder, countFolder, reorderRequest, reorderFolder};
}
