import {useMemo, useState} from 'react';
import {ActionIcon, Box, Group, Text, TextInput, UnstyledButton} from '@mantine/core';
import {IconChevronDown, IconChevronRight, IconFileDescription, IconFolderPlus} from '@tabler/icons-react';
import {main} from '../../../wailsjs/go/models';
import {ConfirmDelete} from '../../components/ConfirmDelete';
import {SectionLabel} from '../../components/SectionLabel';
import {EmptyState} from '../../components/EmptyState';
import {SidebarRow} from './SidebarRow';
import {MethodBadge} from '../../components/MethodBadge';

interface Props {
    collections: main.Collection[];
    selectedReqId: string | null;
    onSelect: (colId: string, req: main.SavedRequest) => void;
    onCreateCollection: (name: string) => void;
    onDeleteCollection: (id: string) => void;
    onCreateFolder: (colId: string, parentFolderId: string, name: string) => Promise<void>;
    onDeleteFolder: (colId: string, folderId: string) => Promise<void>;
    onCountFolder: (colId: string, folderId: string) => Promise<number>;
    onAddRequest: (colId: string, parentFolderId?: string) => void;
    onDeleteRequest: (colId: string, reqId: string) => void;
}

export function CollectionsSection(p: Props) {
    const [newColName, setNewColName] = useState<string | null>(null);
    const [newFolder, setNewFolder] = useState<{colId: string, parentId: string} | null>(null);
    const [folderName, setFolderName] = useState('');
    const [filter, setFilter] = useState('');
    // collapsed keys: colId for a collection, `${colId}/${folderId}` for a folder
    const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

    const toggle = (key: string) => setCollapsed(prev => {
        const next = new Set(prev);
        if (next.has(key)) next.delete(key); else next.add(key);
        return next;
    });

    /** Check if any request in a tree matches the filter query. */
    function treeMatchesFilter(folders: main.FolderNode[], reqs: main.SavedRequest[], q: string): boolean {
        if (reqs.some(r => r.name.toLowerCase().includes(q) || r.url.toLowerCase().includes(q)))
            return true;
        for (const f of folders) {
            if (f.name.toLowerCase().includes(q)) return true;
            if (treeMatchesFilter(f.folders, f.requests, q)) return true;
        }
        return false;
    }

    const filtered = useMemo(() => {
        if (!filter.trim()) return p.collections;
        const q = filter.toLowerCase();
        return p.collections.filter(col =>
            treeMatchesFilter(col.folders, col.requests, q)
        );
    }, [p.collections, filter]);

    /** Render a folder and its children recursively. */
    function renderFolder(colId: string, folder: main.FolderNode, depth: number) {
        const folderKey = `${colId}/${folder.id}`;
        const isCollapsed = collapsed.has(folderKey);

        return (
            <Box key={folder.id}>
                <Group gap={2} px="xs" className="hover-row" wrap="nowrap"
                    style={{paddingLeft: `${8 + depth * 16}px`}}>
                    <UnstyledButton onClick={() => toggle(folderKey)}
                        style={{flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: 4}}>
                        {isCollapsed
                            ? <IconChevronRight size={18} style={{flexShrink: 0}}/>
                            : <IconChevronDown size={18} style={{flexShrink: 0}}/>}
                        <Text size="xs" c="dark.2" truncate>{folder.name}</Text>
                    </UnstyledButton>
                    <ActionIcon size="sm" variant="subtle" color="gray" title="New request"
                        className="row-reveal"
                        onClick={() => p.onAddRequest(colId, folder.id)}>
                        <IconFileDescription size={18}/>
                    </ActionIcon>
                    <ActionIcon size="sm" variant="subtle" color="gray" title="New subfolder"
                        className="row-reveal"
                        onClick={() => { setNewFolder({colId, parentId: folder.id}); setFolderName(''); }}>
                        <IconFolderPlus size={18}/>
                    </ActionIcon>
                    <span className="row-reveal">
                        <ConfirmDelete title="Delete folder"
                            onConfirm={async () => {
                                const n = await p.onCountFolder(colId, folder.id);
                                if (n > 0 && !confirm(`Delete folder "${folder.name}" and its ${n} request(s)?`))
                                    return;
                                await p.onDeleteFolder(colId, folder.id);
                            }}/>
                    </span>
                </Group>

                {/* New folder form inside this folder */}
                {newFolder?.colId === colId && newFolder?.parentId === folder.id &&
                    <FolderNameForm name={folderName} onChange={setFolderName}
                        onCancel={() => setNewFolder(null)}
                        onSubmit={() => {
                            if (folderName.trim()) {
                                p.onCreateFolder(colId, folder.id, folderName.trim()).then(() => setNewFolder(null));
                            }
                        }}
                        depth={depth + 1}/>}

                {!isCollapsed && (folder.requests.length > 0 || folder.folders.length > 0) &&
                    <Box style={{
                        borderLeft: '1px solid var(--mantine-color-dark-4)',
                        marginLeft: `${16 + depth * 16}px`,
                        paddingLeft: 8,
                    }}>
                        {folder.requests.map(req =>
                            <Box key={req.id} className="tree-row">
                                <SidebarRow
                                    depth={0}
                                    selected={p.selectedReqId === req.id}
                                    onClick={() => p.onSelect(colId, req)}
                                    left={<MethodBadge method={req.method}/>}
                                    label={req.name}
                                    right={<span className="row-reveal">
                                        <ConfirmDelete title="Delete request"
                                            onConfirm={() => p.onDeleteRequest(colId, req.id)}/>
                                    </span>}
                                />
                            </Box>)}
                        {folder.folders.map(f => renderFolder(colId, f, depth + 1))}
                    </Box>}
                {!isCollapsed && folder.requests.length === 0 && folder.folders.length === 0 &&
                    <Text size="xs" c="dark.3" style={{paddingLeft: `${24 + depth * 16}px`}} py={4}>
                        Empty folder
                    </Text>}
            </Box>
        );
    }

    return (
        <Box>
            <Group justify="space-between" px="xs" mb={4}>
                <SectionLabel>Collections</SectionLabel>
                <ActionIcon size="sm" variant="subtle" color="gray" title="New collection"
                    onClick={() => setNewColName(newColName === null ? '' : null)}>
                    <IconFolderPlus size={18}/>
                </ActionIcon>
            </Group>
            {p.collections.length > 0 &&
                <TextInput
                    size="xs" px="xs" mb="xs"
                    value={filter}
                    onChange={e => setFilter(e.target.value)}
                    placeholder="Filter requests…"
                    aria-label="Filter requests"
                />}

            {newColName !== null &&
                <form onSubmit={e => {
                    e.preventDefault();
                    if (newColName.trim()) {
                        p.onCreateCollection(newColName.trim());
                        setNewColName(null);
                    }
                }}>
                    <TextInput
                        size="xs" px="xs" mb="xs"
                        value={newColName}
                        onChange={e => setNewColName(e.target.value)}
                        placeholder="Collection name"
                        autoFocus
                    />
                </form>}

            {filtered.length === 0 && newColName === null && !filter.trim() &&
                <EmptyState>No collections yet — create one to save requests</EmptyState>}
            {filtered.length === 0 && p.collections.length > 0 && filter.trim() &&
                <EmptyState>{`No requests match "${filter}"`}</EmptyState>}

            {filtered.map(col =>
                <Box key={col.id} mb="sm">
                    <Group gap={2} px="xs" className="hover-row" wrap="nowrap">
                        <UnstyledButton onClick={() => toggle(col.id)}
                            style={{flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: 4}}>
                            {collapsed.has(col.id)
                                ? <IconChevronRight size={18} style={{flexShrink: 0}}/>
                                : <IconChevronDown size={18} style={{flexShrink: 0}}/>}
                            <Text size="sm" fw={700} c="dark.1" truncate style={{flex: 1}}>
                                {col.name}
                            </Text>
                        </UnstyledButton>
                        <ActionIcon size="sm" variant="subtle" color="gray" title="New request"
                            className="row-reveal" onClick={() => p.onAddRequest(col.id)}>
                            <IconFileDescription size={18}/>
                        </ActionIcon>
                        <ActionIcon size="sm" variant="subtle" color="gray" title="New folder"
                            className="row-reveal"
                            onClick={() => { setNewFolder({colId: col.id, parentId: ''}); setFolderName(''); }}>
                            <IconFolderPlus size={18}/>
                        </ActionIcon>
                        <span className="row-reveal">
                            <ConfirmDelete title="Delete collection"
                                onConfirm={() => p.onDeleteCollection(col.id)}/>
                        </span>
                    </Group>

                    {/* New folder form at root */}
                    {newFolder?.colId === col.id && newFolder?.parentId === '' &&
                        <FolderNameForm name={folderName} onChange={setFolderName}
                            onCancel={() => setNewFolder(null)}
                            onSubmit={() => {
                                if (folderName.trim()) {
                                    p.onCreateFolder(col.id, '', folderName.trim()).then(() => setNewFolder(null));
                                }
                            }}
                            depth={0}/>}

                    {!collapsed.has(col.id) && <>
                        {col.requests.map(req =>
                            <SidebarRow
                                key={req.id}
                                depth={0}
                                selected={p.selectedReqId === req.id}
                                onClick={() => p.onSelect(col.id, req)}
                                left={<MethodBadge method={req.method}/>}
                                label={req.name}
                                right={<span className="row-reveal">
                                    <ConfirmDelete title="Delete request"
                                        onConfirm={() => p.onDeleteRequest(col.id, req.id)}/>
                                </span>}
                            />)}
                        {col.folders.map(f => renderFolder(col.id, f, 0))}
                    </>}
                </Box>)}
        </Box>
    );
}

/** Inline form for naming a new folder. */
function FolderNameForm({name, onChange, onCancel, onSubmit, depth}: {
    name: string; onChange: (v: string) => void; onCancel: () => void; onSubmit: () => void; depth: number;
}) {
    return (
        <form onSubmit={e => {
            e.preventDefault();
            if (name.trim()) onSubmit();
        }}>
            <Group gap={4} px="xs" py={2} wrap="nowrap"
                style={{paddingLeft: `${8 + (depth + 1) * 16}px`}}>
                <TextInput
                    size="xs"
                    style={{flex: 1}}
                    value={name}
                    onChange={e => onChange(e.target.value)}
                    placeholder="Folder name"
                    autoFocus
                />
                <ActionIcon size="xs" variant="subtle" color="gray" title="Cancel"
                    onClick={onCancel}>x</ActionIcon>
            </Group>
        </form>
    );
}
