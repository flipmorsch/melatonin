import {useEffect, useRef, useState} from 'react';
import {ActionIcon, Box, Group, ScrollArea, Stack, Text, Textarea, TextInput, VisuallyHidden} from '@mantine/core';
import {IconPlus} from '@tabler/icons-react';
import {main} from '../../../wailsjs/go/models';
import {kvToText, parseKV} from '../../lib/kv';
import {ConfirmDelete} from '../../components/ConfirmDelete';
import {SectionLabel} from '../../components/SectionLabel';
import {EmptyState} from '../../components/EmptyState';
import {SidebarRow} from '../sidebar/SidebarRow';

interface Props {
    envSet: main.EnvironmentSet | null;
    onSave: (env: main.Environment) => Promise<main.Environment>;
    onDelete: (id: string) => Promise<void>;
}

export function EnvironmentsView({envSet, onSave, onDelete}: Props) {
    const [selectedId, setSelectedId] = useState('');
    const [name, setName] = useState('');
    const [varsText, setVarsText] = useState('');
    const [error, setError] = useState('');
    const [saveState, setSaveState] = useState<'saved' | 'dirty' | 'saving'>('saved');

    const environments = envSet?.environments ?? [];

    // Debounced auto-save, mirroring requests & mocks — no Save button, and no
    // silent loss when switching environments or navigating away.
    const pending = useRef<{timer: number; env: main.Environment} | null>(null);
    const justLoaded = useRef(false);

    function flushPending() {
        if (!pending.current) return;
        clearTimeout(pending.current.timer);
        const {env} = pending.current;
        pending.current = null;
        onSave(env).catch(e => setError(String(e)));
    }

    function select(env: main.Environment) {
        flushPending();
        justLoaded.current = true;
        setSelectedId(env.id);
        setName(env.name);
        setVarsText(kvToText(env.variables));
        setSaveState('saved');
        setError('');
    }

    async function add() {
        try {
            const env = await onSave({id: '', name: 'New Environment', variables: {}});
            select(env);
        } catch (e) {
            setError(String(e));
        }
    }

    async function remove() {
        flushPending();
        try {
            await onDelete(selectedId);
            setSelectedId('');
        } catch (e) {
            setError(String(e));
        }
    }

    // Auto-save 600ms after the last edit; skips the initial load of a record.
    useEffect(() => {
        if (!selectedId) return;
        if (justLoaded.current) { justLoaded.current = false; setSaveState('saved'); return; }
        setSaveState('dirty');
        if (pending.current) clearTimeout(pending.current.timer);
        const env: main.Environment = {id: selectedId, name, variables: parseKV(varsText)};
        const timer = window.setTimeout(() => {
            pending.current = null;
            setSaveState('saving');
            onSave(env).then(() => setSaveState('saved')).catch(e => setError(String(e)));
        }, 600);
        pending.current = {timer, env};
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [name, varsText]);

    // Flush on unmount (e.g. "Back to requests" leaves the view).
    useEffect(() => flushPending, []);

    return (
        <Group gap="md" align="stretch" wrap="nowrap" style={{flex: 1, minHeight: 0}}>
            <Box w={230} style={{borderRight: '1px solid var(--mantine-color-dark-4)'}} pr="sm">
                <Group justify="space-between" px="xs" mb={4}>
                    <SectionLabel>Environments</SectionLabel>
                    <ActionIcon size="sm" variant="subtle" color="gray" title="New environment"
                        onClick={add}><IconPlus size={16}/></ActionIcon>
                </Group>
                <ScrollArea type="never">
                    {environments.length === 0 &&
                        <EmptyState>No environments yet — create one to reuse variables</EmptyState>}
                    {environments.map(env =>
                        <SidebarRow
                            key={env.id}
                            rowId={`env:${env.id}`}
                            selected={selectedId === env.id}
                            onClick={() => select(env)}
                            label={env.name}
                            right={envSet?.activeId === env.id
                                ? <Text size="xs" c="teal.4">active</Text>
                                : undefined}
                        />)}
                </ScrollArea>
            </Box>

            <Stack gap="sm" style={{flex: 1}}>
                {selectedId ? <>
                    <Group gap="xs" wrap="nowrap">
                        <TextInput
                            style={{flex: 1}}
                            value={name}
                            onChange={e => setName(e.target.value)}
                            placeholder="Environment name"
                            aria-label="Environment name"
                        />
                        {saveState !== 'saved' &&
                            <Text size="xs" ff="monospace" c={saveState === 'saving' ? 'dark.2' : 'yellow.4'}
                                title={saveState === 'saving' ? 'Saving…' : 'Modified'}
                                style={{flexShrink: 0, userSelect: 'none'}}>●</Text>}
                        <VisuallyHidden role="status" aria-live="polite">
                            {saveState === 'saved' ? 'Saved' : saveState === 'saving' ? 'Saving' : 'Unsaved changes'}
                        </VisuallyHidden>
                        <ConfirmDelete variant="button" onConfirm={remove}/>
                    </Group>
                    {error && <Text size="sm" ff="monospace" c="red.4">{error}</Text>}
                    <Textarea
                        className="mono-input"
                        style={{flex: 1, display: 'flex', flexDirection: 'column'}}
                        styles={{wrapper: {flex: 1, display: 'flex'}, input: {flex: 1}}}
                        value={varsText}
                        onChange={e => setVarsText(e.target.value)}
                        placeholder={'Variables, one per line:\nbaseUrl: https://api.example.com\ntoken: abc123\n\nUse them anywhere as {{baseUrl}}'}
                        aria-label="Environment variables"
                    />
                </> : <EmptyState>Select or create an environment</EmptyState>}
            </Stack>
        </Group>
    );
}
