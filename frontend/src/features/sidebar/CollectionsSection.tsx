import {useMemo, useState, ReactNode, useRef} from 'react';
import {ActionIcon, Box, Group, Stack, Text, TextInput, UnstyledButton} from '@mantine/core';
import {IconChevronRight, IconDotsVertical, IconFolderPlus, IconGripVertical} from '@tabler/icons-react';
import {
    CollisionDetection,
    DndContext,
    DragEndEvent,
    DragOverlay,
    DragStartEvent,
    KeyboardSensor,
    PointerSensor,
    closestCenter,
    pointerWithin,
    useDroppable,
    useSensor,
    useSensors,
} from '@dnd-kit/core';
import {SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy} from '@dnd-kit/sortable';
import {CSS} from '@dnd-kit/utilities';
import {main} from '../../../wailsjs/go/models';
import {ConfirmDelete} from '../../components/ConfirmDelete';
import {SectionLabel} from '../../components/SectionLabel';
import {EmptyState} from '../../components/EmptyState';
import {ContextAction, openSidebarMenu} from './SidebarRow';
import {SortableSidebarRow} from './SortableSidebarRow';
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
    onReorderRequest: (colId: string, reqId: string, newParentID: string, newPosition: number) => void;
    onReorderFolder: (colId: string, folderId: string, newParentID: string, newPosition: number) => void;
}

// ── Sortable folder wrapper ──────────────────────────────────────────

function SortableFolderRow({folder, colId, depth, collapsed, onToggle, onAddRequest, onDeleteFolder, onCountFolder, onCreateFolder, newFolder, setNewFolder, folderName, setFolderName, requestRows, subfolderRows}: {
    folder: main.FolderNode;
    colId: string;
    depth: number;
    collapsed: boolean;
    onToggle: () => void;
    onAddRequest: (colId: string, parentFolderId?: string) => void;
    onDeleteFolder: (colId: string, folderId: string) => Promise<void>;
    onCountFolder: (colId: string, folderId: string) => Promise<number>;
    onCreateFolder: (colId: string, parentFolderId: string, name: string) => Promise<void>;
    newFolder: {colId: string, parentId: string} | null;
    setNewFolder: (v: {colId: string, parentId: string} | null) => void;
    folderName: string;
    setFolderName: (v: string) => void;
    /** Requests rendered inside this folder (sortable list). */
    requestRows: ReactNode;
    /** Subfolders rendered inside this folder (sortable list). */
    subfolderRows: ReactNode;
}) {
    const {
        attributes,
        listeners,
        setNodeRef,
        setActivatorNodeRef,
        transform,
        transition,
        isDragging,
    } = useSortable({id: folder.id});

    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.3 : undefined,
    };

    const isCollapsed = collapsed;

    const actions: ContextAction[] = [
        {label: 'New request', onClick: () => onAddRequest(colId, folder.id)},
        {label: 'New subfolder', onClick: () => { setNewFolder({colId, parentId: folder.id}); setFolderName(''); }},
        {label: 'Delete', color: 'red', onClick: async () => {
            const n = await onCountFolder(colId, folder.id);
            if (n > 0 && !confirm(`Delete folder "${folder.name}" and its ${n} request(s)?`))
                return;
            await onDeleteFolder(colId, folder.id);
        }},
    ];

    return (
        <Box ref={setNodeRef} style={style}>
            {/* pr not px: Mantine style props override the style prop, so px would kill the depth indent */}
            <Group gap={4} pr="xs" className="side-row" wrap="nowrap"
                style={{paddingLeft: `${10 + depth * 16}px`, minHeight: 32, borderRadius: 'var(--mantine-radius-sm)'}}
                onContextMenu={e => { e.preventDefault(); openSidebarMenu(e.clientX, e.clientY, actions); }}>
                <Box
                    ref={setActivatorNodeRef}
                    {...attributes}
                    {...listeners}
                    style={{cursor: 'grab', display: 'flex', alignItems: 'center', touchAction: 'none'}}
                    className="drag-handle"
                >
                    <IconGripVertical size={14} style={{color: 'var(--mantine-color-dark-3)'}}/>
                </Box>
                <UnstyledButton onClick={onToggle}
                    style={{flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: 4}}>
                    <IconChevronRight size={18} className={isCollapsed ? 'chevron' : 'chevron open'} style={{flexShrink: 0}}/>
                    <Text size="xs" c="dark.2" truncate>{folder.name}</Text>
                </UnstyledButton>
                <ActionIcon size="sm" variant="subtle" color="gray" title="Folder actions"
                    className="row-reveal"
                    onClick={e => {
                        const r = e.currentTarget.getBoundingClientRect();
                        openSidebarMenu(r.left, r.bottom, actions);
                    }}>
                    <IconDotsVertical size={18}/>
                </ActionIcon>
            </Group>

            {/* New folder form inside this folder */}
            {newFolder?.colId === colId && newFolder?.parentId === folder.id &&
                <FolderNameForm name={folderName} onChange={setFolderName}
                    onCancel={() => setNewFolder(null)}
                    onSubmit={() => {
                        if (folderName.trim()) {
                            onCreateFolder(colId, folder.id, folderName.trim()).then(() => setNewFolder(null));
                        }
                    }}
                    depth={depth + 1}/>}

            {requestRows}
            {subfolderRows}
            {/* hint indent 26 = child row indent (16) + row px (10): the child glyph rail */}
            {!isCollapsed && folder.requests.length === 0 && folder.folders.length === 0 &&
                <Text size="xs" c="dark.2" style={{paddingLeft: `${26 + depth * 16}px`}} py={2}>
                    Empty folder
                </Text>}
        </Box>
    );
}

// pointerWithin resolves to the smallest row rect under the pointer, which is
// deterministic in a nested tree where a folder's rect spans its whole subtree
// (closestCenter picks erratically there). Fall back to closestCenter for
// keyboard drags, which have no pointer coordinates.
const treeCollision: CollisionDetection = (args) => {
    const hits = pointerWithin(args);
    return hits.length ? hits : closestCenter(args);
};

/** Makes the collection header a drop target for "move back to root". */
function RootDropZone({colId, children}: {colId: string; children: ReactNode}) {
    const {setNodeRef, isOver} = useDroppable({id: `colroot:${colId}`});
    return (
        <Box ref={setNodeRef}
            style={isOver ? {outline: '1px solid var(--mantine-color-violet-4)', borderRadius: 'var(--mantine-radius-sm)'} : undefined}>
            {children}
        </Box>
    );
}

// ── Main component ───────────────────────────────────────────────────

export function CollectionsSection(p: Props) {
    const [newColName, setNewColName] = useState<string | null>(null);
    const [newFolder, setNewFolder] = useState<{colId: string, parentId: string} | null>(null);
    const [folderName, setFolderName] = useState('');
    const [filter, setFilter] = useState('');
    const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
    const [activeId, setActiveId] = useState<string | null>(null);

    const toggle = (key: string) => setCollapsed(prev => {
        const next = new Set(prev);
        if (next.has(key)) next.delete(key); else next.add(key);
        return next;
    });

    const sensors = useSensors(
        useSensor(PointerSensor, {activationConstraint: {distance: 5}}),
        useSensor(KeyboardSensor, {coordinateGetter: sortableKeyboardCoordinates}),
    );

    function handleDragStart(event: DragStartEvent) {
        setActiveId(event.active.id as string);
    }

    function handleDragEnd(event: DragEndEvent) {
        setActiveId(null);
        const {active, over} = event;
        if (!over || active.id === over.id) return;

        const activeId = active.id as string;
        const overId = over.id as string;

        // Find which collection contains the active item.
        const col = findOwningCollection(p.collections, activeId);
        if (!col) return;
        const activeIsRequest = isRequest(col, activeId);

        // Dropped on a collection header → move to that collection's root.
        if (overId.startsWith('colroot:')) {
            if (overId !== `colroot:${col.id}`) return; // cross-collection: unsupported
            if (activeIsRequest) p.onReorderRequest(col.id, activeId, 'root', 0);
            else p.onReorderFolder(col.id, activeId, 'root', 0);
            return;
        }

        const activeContainer = active.data.current?.sortable?.containerId;
        const overContainer = over.data.current?.sortable?.containerId;

        // Same parent → within-parent reorder ('' keeps the current parent).
        // ponytail: hovering a sibling folder always reorders, so nesting into an
        // empty sibling needs its children visible; add row top/middle/bottom zones if asked.
        if (activeContainer && activeContainer === overContainer) {
            const [kind, parent] = activeContainer.split(':');
            const newPos = getSiblingIds(col, kind as 'reqs' | 'folders', parent).indexOf(overId);
            if (newPos < 0) return;
            if (activeIsRequest) p.onReorderRequest(col.id, activeId, '', newPos);
            else p.onReorderFolder(col.id, activeId, '', newPos);
            return;
        }

        // Dropped ON a folder in a different parent → move INTO it at the top.
        const overFolder = findFolder(col, overId);
        if (overFolder) {
            if (activeIsRequest) {
                p.onReorderRequest(col.id, activeId, overFolder.id, 0);
            } else {
                const activeFolder = findFolder(col, activeId);
                if (activeFolder && findFolderRec(activeFolder, overId)) return; // no self-nesting
                p.onReorderFolder(col.id, activeId, overFolder.id, 0);
            }
            return;
        }

        // Dropped over a row in a different parent → move next to that row.
        if (!overContainer) return;
        const [overKind, overParent] = overContainer.split(':');
        const newPos = getSiblingIds(col, overKind as 'reqs' | 'folders', overParent).indexOf(overId);
        if (newPos < 0) return;
        const newParent = overParent === 'root' ? 'root' : overParent;
        if (activeIsRequest) p.onReorderRequest(col.id, activeId, newParent, newPos);
        else p.onReorderFolder(col.id, activeId, newParent, newPos);
    }

    const filtered = useMemo(() => {
        if (!filter.trim()) return p.collections;
        const q = filter.toLowerCase();
        return p.collections.filter(col =>
            treeMatchesFilter(col.folders, col.requests, q)
        );
    }, [p.collections, filter]);


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
    /** Render folder children — the sortable lists inside a folder. */
    function renderFolderChildren(colId: string, folder: main.FolderNode, depth: number) {
        const isCollapsed = collapsed.has(`${colId}/${folder.id}`);

        return (
            <SortableFolderRow
                key={folder.id}
                folder={folder}
                colId={colId}
                depth={depth}
                collapsed={isCollapsed}
                onToggle={() => toggle(`${colId}/${folder.id}`)}
                onAddRequest={p.onAddRequest}
                onDeleteFolder={p.onDeleteFolder}
                onCountFolder={p.onCountFolder}
                onCreateFolder={p.onCreateFolder}
                newFolder={newFolder}
                setNewFolder={setNewFolder}
                folderName={folderName}
                setFolderName={setFolderName}
                requestRows={
                    folder.requests.length > 0 && !isCollapsed ? (
                        <SortableContext
                            id={`reqs:${folder.id}`}
                            items={folder.requests.map(r => r.id)}
                            strategy={verticalListSortingStrategy}
                        >
                            {folder.requests.map(req =>
                                <Box key={req.id}>
                                    <SortableSidebarRow
                                        id={req.id}
                                        depth={depth + 1}
                                        selected={p.selectedReqId === req.id}
                                        onClick={() => p.onSelect(colId, req)}
                                        onDelete={() => p.onDeleteRequest(colId, req.id)}
                                        contextActions={[{label: 'Delete', color: 'red', onClick: () => p.onDeleteRequest(colId, req.id)}]}
                                        left={<MethodBadge method={req.method}/>}
                                        label={req.name}
                                        right={<span className="row-reveal">
                                            <ConfirmDelete title="Delete request"
                                                onConfirm={() => p.onDeleteRequest(colId, req.id)}/>
                                        </span>}
                                    />
                                </Box>
                            )}
                        </SortableContext>
                    ) : null
                }
                subfolderRows={
                    folder.folders.length > 0 && !isCollapsed ? (
                        <SortableContext
                            id={`folders:${folder.id}`}
                            items={folder.folders.map(f => f.id)}
                            strategy={verticalListSortingStrategy}
                        >
                            {folder.folders.map(f =>
                                renderFolderChildren(colId, f, depth + 1)
                            )}
                        </SortableContext>
                    ) : null
                }
            />
        );
    }

    return (
        <DndContext
            sensors={sensors}
            collisionDetection={treeCollision}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
            onDragCancel={() => setActiveId(null)}
        >
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
                        data-sidebar-filter=""
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

                <Stack gap="sm">
                {filtered.map(col => {
                    const colActions: ContextAction[] = [
                        {label: 'New request', onClick: () => p.onAddRequest(col.id)},
                        {label: 'New folder', onClick: () => { setNewFolder({colId: col.id, parentId: ''}); setFolderName(''); }},
                        {label: 'Delete', color: 'red', onClick: () => {
                            const n = countTree(col.folders, col.requests);
                            if (n > 0 && !confirm(`Delete collection "${col.name}" and its ${n} request(s)?`))
                                return;
                            p.onDeleteCollection(col.id);
                        }},
                    ];
                    return (
                    <Box key={col.id}>
                        <RootDropZone colId={col.id}>
                        <Group gap={4} px="xs" py={3} className="side-row" wrap="nowrap"
                            data-sidebar-row={`col:${col.id}`} tabIndex={-1}
                            style={{minHeight: 32, borderRadius: 'var(--mantine-radius-sm)'}}
                            onContextMenu={e => { e.preventDefault(); openSidebarMenu(e.clientX, e.clientY, colActions); }}>
                            <UnstyledButton onClick={() => toggle(col.id)}
                                style={{flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: 4}}
                                tabIndex={-1}>
                                <IconChevronRight size={18} className={collapsed.has(col.id) ? 'chevron' : 'chevron open'} style={{flexShrink: 0}}/>
                                <Text size="sm" fw={700} c="dark.1" truncate style={{flex: 1}}>
                                    {col.name}
                                </Text>
                            </UnstyledButton>
                            <ActionIcon size="sm" variant="subtle" color="gray" title="Collection actions"
                                className="row-reveal"
                                onClick={e => {
                                    const r = e.currentTarget.getBoundingClientRect();
                                    openSidebarMenu(r.left, r.bottom, colActions);
                                }}>
                                <IconDotsVertical size={18}/>
                            </ActionIcon>
                        </Group>
                        </RootDropZone>

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
                            {col.requests.length > 0 && (
                                <SortableContext
                                    id="reqs:root"
                                    items={col.requests.map(r => r.id)}
                                    strategy={verticalListSortingStrategy}
                                >
                                    {col.requests.map(req =>
                                        <SortableSidebarRow
                                            key={req.id}
                                            id={req.id}
                                            depth={0}
                                            selected={p.selectedReqId === req.id}
                                            onClick={() => p.onSelect(col.id, req)}
                                            onDelete={() => p.onDeleteRequest(col.id, req.id)}
                                            contextActions={[{label: 'Delete', color: 'red', onClick: () => p.onDeleteRequest(col.id, req.id)}]}
                                            left={<MethodBadge method={req.method}/>}
                                            label={req.name}
                                            right={<span className="row-reveal">
                                                <ConfirmDelete title="Delete request"
                                                    onConfirm={() => p.onDeleteRequest(col.id, req.id)}/>
                                            </span>}
                                        />
                                    )}
                                </SortableContext>
                            )}
                            {col.folders.length > 0 && (
                                <SortableContext
                                    id="folders:root"
                                    items={col.folders.map(f => f.id)}
                                    strategy={verticalListSortingStrategy}
                                >
                                    {col.folders.map(f =>
                                        renderFolderChildren(col.id, f, 0)
                                    )}
                                </SortableContext>
                            )}
                        </>}
                    </Box>
                    );
                })}
                </Stack>
            </Box>

            <DragOverlay dropAnimation={null}>
                {activeId ? <DragPreview activeId={activeId} collections={p.collections} /> : null}
            </DragOverlay>
        </DndContext>
    );
}

// ── Helpers ──────────────────────────────────────────────────────────

/** DragOverlay preview — a compact ghost of the row being dragged. */
function DragPreview({activeId, collections}: {activeId: string; collections: main.Collection[]}) {
    for (const col of collections) {
        const req = col.requests.find(r => r.id === activeId);
        if (req) {
            return (
                <Box
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                        padding: '4px 8px',
                        borderRadius: 'var(--mantine-radius-sm)',
                        background: `var(--mantine-color-dark-5)`,
                        border: '1px solid var(--mantine-color-violet-4)',
                        boxShadow: '0 0 12px color-mix(in srgb, var(--mantine-color-violet-4) 30%, transparent)',
                    }}
                >
                    <MethodBadge method={req.method}/>
                    <Text size="sm" c="dark.0">{req.name}</Text>
                </Box>
            );
        }
        const folder = findFolder(col, activeId);
        if (folder) {
            return (
                <Box
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 6,
                        padding: '4px 8px',
                        borderRadius: 'var(--mantine-radius-sm)',
                        background: `var(--mantine-color-dark-5)`,
                        border: '1px solid var(--mantine-color-violet-4)',
                        boxShadow: '0 0 12px color-mix(in srgb, var(--mantine-color-violet-4) 30%, transparent)',
                    }}
                >
                    <IconGripVertical size={14} style={{color: 'var(--mantine-color-dark-3)'}}/>
                    <Text size="xs" c="dark.0">{folder.name}</Text>
                </Box>
            );
        }
    }
    return null;
}

/** Count requests in a subtree (collection root or folder). */
function countTree(folders: main.FolderNode[], reqs: main.SavedRequest[]): number {
    return reqs.length + folders.reduce((n, f) => n + countTree(f.folders, f.requests), 0);
}

function findFolder(col: main.Collection, id: string): main.FolderNode | null {
    for (const f of col.folders) {
        const found = findFolderRec(f, id);
        if (found) return found;
    }
    return null;
}

function findFolderRec(f: main.FolderNode, id: string): main.FolderNode | null {
    if (f.id === id) return f;
    for (const child of f.folders) {
        const found = findFolderRec(child, id);
        if (found) return found;
    }
    return null;
}

function isRequest(col: main.Collection, id: string): boolean {
    if (col.requests.some(r => r.id === id)) return true;
    function check(folders: main.FolderNode[]): boolean {
        for (const f of folders) {
            if (f.requests.some(r => r.id === id)) return true;
            if (check(f.folders)) return true;
        }
        return false;
    }
    return check(col.folders);
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
            <Group gap={4} pr="xs" py={2} wrap="nowrap"
                style={{paddingLeft: `${10 + depth * 16}px`}}>
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

/** Find which collection contains a given request or folder ID. */
function findOwningCollection(cols: main.Collection[], id: string): main.Collection | null {
    for (const col of cols) {
        if (col.requests.some(r => r.id === id)) return col;
        if (col.folders.some(f => f.id === id)) return col;
        if (idInFolders(col.folders, id)) return col;
    }
    return null;
}

function idInFolders(folders: main.FolderNode[], id: string): boolean {
    for (const f of folders) {
        if (f.id === id) return true;
        if (f.requests.some(r => r.id === id)) return true;
        if (f.folders.some(c => c.id === id)) return true;
        if (idInFolders(f.folders, id)) return true;
    }
    return false;
}

/** Get the ordered sibling IDs for a given container. */
function getSiblingIds(col: main.Collection, kind: 'reqs' | 'folders', parentId: string): string[] {
    if (parentId === 'root') {
        if (kind === 'reqs') return col.requests.map(r => r.id);
        return col.folders.map(f => f.id);
    }
    const f = findFolder(col, parentId);
    if (!f) return [];
    if (kind === 'reqs') return f.requests.map(r => r.id);
    return f.folders.map(f2 => f2.id);
}
