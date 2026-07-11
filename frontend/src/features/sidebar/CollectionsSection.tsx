import {useState} from 'react';
import {ActionIcon, Box, Group, Text, TextInput} from '@mantine/core';
import {main} from '../../../wailsjs/go/models';
import {groupByFolder} from '../../lib/kv';
import {ConfirmDelete} from '../../components/ConfirmDelete';
import {SectionLabel} from '../../components/SectionLabel';
import {EmptyState} from '../../components/EmptyState';
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
                        <Text size="sm" fw={700} c="dark.1" truncate style={{flex: 1}}>{col.name}</Text>
                        <ActionIcon size="sm" variant="subtle" color="gray" title="New request"
                            className="row-reveal" onClick={() => p.onAddRequest(col.id)}>+</ActionIcon>
                        <span className="row-reveal">
                            <ConfirmDelete title="Delete collection" onConfirm={() => p.onDelete(col.id)}/>
                        </span>
                    </Group>
                    {groupByFolder(col.requests ?? []).map(([folderName, reqs]) =>
                        <Box key={folderName || '(root)'}>
                            {folderName &&
                                <Text size="xs" c="dark.2" px="xs" pt={4}>{folderName}</Text>}
                            {reqs.map(req =>
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
                        </Box>)}
                </Box>)}
        </Box>
    );
}
