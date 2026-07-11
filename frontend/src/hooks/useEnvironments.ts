import {useCallback, useEffect, useState} from 'react';
import {DeleteEnvironment, GetEnvironments, SaveEnvironment, SetActiveEnvironment} from '../../wailsjs/go/main/App';
import {main} from '../../wailsjs/go/models';

/** Environments state + persistence. Actions throw — callers surface errors. */
export function useEnvironments() {
    const [envSet, setEnvSet] = useState<main.EnvironmentSet | null>(null);

    const refresh = useCallback(async () => {
        setEnvSet(await GetEnvironments());
    }, []);

    useEffect(() => { refresh().catch(console.error); }, [refresh]);

    const save = async (env: main.Environment) => {
        const saved = await SaveEnvironment(env);
        await refresh();
        return saved;
    };

    const remove = async (id: string) => {
        await DeleteEnvironment(id);
        await refresh();
    };

    const setActive = async (id: string) => {
        await SetActiveEnvironment(id);
        await refresh();
    };

    return {envSet, refresh, save, remove, setActive};
}
