import {useState} from 'react';
import {ActionIcon, Box, Button, Group, ScrollArea, Stack, Text, Textarea, TextInput} from '@mantine/core';
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

    const environments = envSet?.environments ?? [];

    function select(env: main.Environment) {
        setSelectedId(env.id);
        setName(env.name);
        setVarsText(kvToText(env.variables));
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

    async function save() {
        try {
            await onSave({id: selectedId, name, variables: parseKV(varsText)});
        } catch (e) {
            setError(String(e));
        }
    }

    async function remove() {
        try {
            await onDelete(selectedId);
            setSelectedId('');
        } catch (e) {
            setError(String(e));
        }
    }

    return (
        <Group gap="md" align="stretch" wrap="nowrap" style={{flex: 1, minHeight: 0}}>
            <Box w={230} style={{borderRight: '1px solid var(--mantine-color-dark-4)'}} pr="sm">
                <Group justify="space-between" px="xs" mb={4}>
                    <SectionLabel>Environments</SectionLabel>
                    <ActionIcon size="sm" variant="subtle" color="gray" title="New environment"
                        onClick={add}>+</ActionIcon>
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
                        <Button onClick={save}>Save</Button>
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
