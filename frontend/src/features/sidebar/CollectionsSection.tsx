import {useState} from 'react';
import {ActionIcon, Box, Group, Text, TextInput, UnstyledButton} from '@mantine/core';
import {main} from '../../../wailsjs/go/models';
import {groupByFolder} from '../../lib/kv';
import {ConfirmDelete} from '../../components/ConfirmDelete';
import {SectionLabel} from '../../components/SectionLabel';
import {EmptyState} from '../../components/EmptyState';
import {Chevron} from '../../components/Chevron';
import {SidebarRow} from './SidebarRow';
import {MethodBadge} from '../../components/MethodBadge';

interface Props {
    collections: main.Collection[];
    selectedReqId: string | null;
    onSelect: (colId: string, req: main.SavedRequest) => void;
    onCreate: (name: string) => void;
    onDelete: (id: string) => void;
    onAddRequest: (colId: string) => void;
    onDeleteRequest: (colId: string, reqId: string) => void;
}

export function CollectionsSection(p: Props) {
    const [newName, setNewName] = useState<string | null>(null);
    // collapsed collection ids and `${colId}/${folder}` keys; default expanded
    const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

    const toggle = (key: string) => setCollapsed(prev => {
        const next = new Set(prev);
        if (next.has(key)) next.delete(key); else next.add(key);
        return next;
    });

    function addRequest(colId: string) {
        // reveal the request that's about to appear
        setCollapsed(prev => {
            if (!prev.has(colId)) return prev;
            const next = new Set(prev);
            next.delete(colId);
            return next;
        });
        p.onAddRequest(colId);
    }

    return (
        <Box>
            <Group justify="space-between" px="xs" mb={4}>
                <SectionLabel>Collections</SectionLabel>
                <ActionIcon size="sm" variant="subtle" color="gray" title="New collection"
                    onClick={() => setNewName(newName === null ? '' : null)}>+</ActionIcon>
            </Group>

            {newName !== null &&
                <form onSubmit={e => {
                    e.preventDefault();
                    if (newName.trim()) {
                        p.onCreate(newName.trim());
                        setNewName(null);
                    }
                }}>
                    <TextInput
                        size="xs" px="xs" mb="xs"
                        value={newName}
                        onChange={e => setNewName(e.target.value)}
                        placeholder="Collection name"
                        autoFocus
                    />
                </form>}

            {p.collections.length === 0 && newName === null &&
                <EmptyState>No collections yet — create one to save requests</EmptyState>}

            {p.collections.map(col =>
                <Box key={col.id} mb="sm">
                    <Group gap={2} px="xs" className="hover-row" wrap="nowrap">
                        <UnstyledButton onClick={() => toggle(col.id)}
                            style={{flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: 4}}>
                            <Chevron open={!collapsed.has(col.id)}/>
                            <Text size="sm" fw={700} c="dark.1" truncate style={{flex: 1}}>{col.name}</Text>
                        </UnstyledButton>
                        <ActionIcon size="sm" variant="subtle" color="gray" title="New request"
                            className="row-reveal" onClick={() => addRequest(col.id)}>+</ActionIcon>
                        <span className="row-reveal">
                            <ConfirmDelete title="Delete collection" onConfirm={() => p.onDelete(col.id)}/>
                        </span>
                    </Group>
                    {!collapsed.has(col.id) && groupByFolder(col.requests ?? []).map(([folderName, reqs]) => {
                        const folderKey = `${col.id}/${folderName}`;
                        return (
                            <Box key={folderName || '(root)'}>
                                {folderName &&
                                    <UnstyledButton onClick={() => toggle(folderKey)} className="hover-row"
                                        px="xs" pt={4}
                                        style={{
                                            display: 'flex', alignItems: 'center', gap: 4, width: '100%',
                                            borderRadius: 'var(--mantine-radius-sm)',
                                        }}>
                                        <Chevron open={!collapsed.has(folderKey)}/>
                                        <Text size="xs" c="dark.2" truncate>{folderName}</Text>
                                    </UnstyledButton>}
                                {(!folderName || !collapsed.has(folderKey)) && reqs.map(req =>
                                    <SidebarRow
                                        key={req.id}
                                        indent={!!folderName}
                                        selected={p.selectedReqId === req.id}
                                        onClick={() => p.onSelect(col.id, req)}
                                        left={<MethodBadge method={req.method}/>}
                                        label={req.name}
                                        right={<span className="row-reveal">
                                            <ConfirmDelete title="Delete request"
                                                onConfirm={() => p.onDeleteRequest(col.id, req.id)}/>
                                        </span>}
                                    />)}
                            </Box>
                        );
                    })}
                </Box>)}
        </Box>
    );
}
