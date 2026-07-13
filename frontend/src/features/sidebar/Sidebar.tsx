import {memo, useCallback, useEffect, useRef, useState} from 'react';
import {ActionIcon, Badge, Box, Menu, ScrollArea, Tooltip} from '@mantine/core';
import {
    IconClock,
    IconFolders,
    IconLayoutSidebarLeftExpand,
    IconLayoutSidebarRightExpand,
    IconServer,
} from '@tabler/icons-react';
import {main} from '../../../wailsjs/go/models';
import {ContextAction} from './SidebarRow';
import {CollectionsSection} from './CollectionsSection';
import {MocksSection} from './MocksSection';
import {HistorySection} from './HistorySection';

interface Props {
    collapsed: boolean;
    onToggleCollapse: () => void;

    collections: main.Collection[];
    selectedReqId: string | null;
    onSelectRequest: (colId: string, req: main.SavedRequest) => void;
    onCreateCollection: (name: string) => void;
    onDeleteCollection: (id: string) => void;
    onCreateFolder: (colId: string, parentFolderId: string, name: string) => Promise<void>;
    onDeleteFolder: (colId: string, folderId: string) => Promise<void>;
    onCountFolder: (colId: string, folderId: string) => Promise<number>;
    onAddRequest: (colId: string, parentFolderId?: string) => void;
    onDeleteRequest: (colId: string, reqId: string) => void;
    onReorderRequest: (colId: string, reqId: string, newParentID: string, newPosition: number) => void;
    onReorderFolder: (colId: string, folderId: string, newParentID: string, newPosition: number) => void;

    mocks: main.MockServer[];
    running: Record<string, number>;
    selectedMockId: string | null;
    selectedRouteId: string | null;
    onSelectMock: (m: main.MockServer) => void;
    onAddMock: () => void;
    onDeleteMock: (id: string) => void;
    onSelectRoute: (m: main.MockServer, routeId: string) => void;
    onAddRoute: (m: main.MockServer) => void;
    onDeleteRoute: (m: main.MockServer, routeId: string) => void;

    history: main.HistoryEntry[];
    selectedHistoryId: string | null;
    onSelectHistory: (e: main.HistoryEntry) => void;
    onClearHistory: () => void;
}

/** Count total requests across all collections (including folders). */
function totalRequests(cols: main.Collection[]): number {
    let n = 0;
    for (const c of cols) {
        n += c.requests.length;
        const stack = [...c.folders];
        while (stack.length) {
            const f = stack.pop()!;
            n += f.requests.length;
            stack.push(...f.folders);
        }
    }
    return n;
}

/** Context menu state — set by custom events from SidebarRow. */
interface MenuState {
    x: number;
    y: number;
    actions: ContextAction[];
}

// memo: the tabs reducer lives in App, so every keystroke re-renders it; the
// sidebar's props only change on real data/selection changes (App passes
// useEvent-stable handlers to keep that true).
export const Sidebar = memo(function Sidebar(p: Props) {
    const [historyCollapsed, setHistoryCollapsed] = useState(false);
    const sidebarRef = useRef<HTMLDivElement>(null);
    const [menu, setMenu] = useState<MenuState | null>(null);

    // Listen for context-menu events from SidebarRow instances.
    useEffect(() => {
        function onMenu(e: Event) {
            const {x, y, actions} = (e as CustomEvent).detail;
            setMenu({x, y, actions});
        }
        window.addEventListener('sidebar-contextmenu', onMenu);
        return () => window.removeEventListener('sidebar-contextmenu', onMenu);
    }, []);

    // Auto-focus the sidebar when it expands so keyboard nav works immediately.
    useEffect(() => {
        if (!p.collapsed && sidebarRef.current) {
            sidebarRef.current.focus();
        }
    }, [p.collapsed]);

    /** Keyboard navigation: arrow keys between rows, / to filter. */
    const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
        const container = sidebarRef.current;
        if (!container) return;

        // / focuses the filter input
        if (e.key === '/' && !e.ctrlKey && !e.metaKey && document.activeElement?.tagName !== 'INPUT') {
            e.preventDefault();
            const filter = container.querySelector<HTMLInputElement>('[data-sidebar-filter]');
            filter?.focus();
            return;
        }

        const rows = Array.from(container.querySelectorAll<HTMLElement>('[data-sidebar-row]'));
        if (rows.length === 0) return;

        const currentIdx = rows.findIndex(r => r === document.activeElement || r.contains(document.activeElement));

        if (e.key === 'ArrowDown') {
            e.preventDefault();
            const next = currentIdx < 0 ? rows[0] : rows[Math.min(currentIdx + 1, rows.length - 1)];
            next.focus();
            next.scrollIntoView({block: 'nearest'});
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            const prev = currentIdx < 0 ? rows[rows.length - 1] : rows[Math.max(currentIdx - 1, 0)];
            prev.focus();
            prev.scrollIntoView({block: 'nearest'});
        }
    }, []);

    const runningCount = Object.keys(p.running).length;
    const reqCount = totalRequests(p.collections);

    // ── Collapsed icon strip ──

    if (p.collapsed) {
        return (
            <Box h="100%" style={{display: 'flex', flexDirection: 'column', alignItems: 'center'}} py="xs">
                {/* Expand toggle */}
                <Tooltip label="Expand sidebar" position="right" withArrow openDelay={400}>
                    <ActionIcon variant="subtle" color="gray" size="md"
                        onClick={p.onToggleCollapse}
                        className="side-icon-btn">
                        <IconLayoutSidebarRightExpand size={18}/>
                    </ActionIcon>
                </Tooltip>

                <Box style={{flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 2}}>
                    {/* Collections */}
                    <Tooltip label={`Collections`} position="right" withArrow openDelay={400}>
                        <ActionIcon variant="subtle" color="gray" size="md"
                            onClick={p.onToggleCollapse}
                            className="side-icon-btn">
                            <IconFolders size={18}/>
                        </ActionIcon>
                    </Tooltip>
                    {reqCount > 0 && <Box className="side-icon-dot"/>}

                    {/* Thin divider */}
                    <Box style={{width: 24, height: 1, background: 'var(--mantine-color-dark-4)', margin: '6px 0', opacity: 0.5}}/>

                    {/* Mocks */}
                    <Tooltip label={`Mock servers`} position="right" withArrow openDelay={400}>
                        <ActionIcon variant="subtle" color={runningCount > 0 ? 'teal' : 'gray'} size="md"
                            onClick={p.onToggleCollapse}
                            className="side-icon-btn">
                            <IconServer size={18}/>
                        </ActionIcon>
                    </Tooltip>
                    {runningCount > 0 && <Box className="side-icon-dot on"/>}

                    <Box style={{width: 24, height: 1, background: 'var(--mantine-color-dark-4)', margin: '6px 0', opacity: 0.5}}/>

                    {/* History */}
                    <Tooltip label={`History`} position="right" withArrow openDelay={400}>
                        <ActionIcon variant="subtle" color="gray" size="md"
                            onClick={p.onToggleCollapse}
                            className="side-icon-btn">
                            <IconClock size={18}/>
                        </ActionIcon>
                    </Tooltip>
                    {p.history.length > 0 && <Box className="side-icon-dot"/>}
                </Box>
            </Box>
        );
    }

    // ── Expanded sidebar ──

    return (
        <Box h="100%" style={{display: 'flex', flexDirection: 'column', overflow: 'hidden'}} onKeyDown={handleKeyDown}>
            {/* Collapse toggle — px lg = ScrollArea inset (xs) + row px (xs), the shared icon rail */}
            <Box px="lg" pt="xs" pb={4} style={{display: 'flex', justifyContent: 'flex-end'}}>
                <Tooltip label="Collapse sidebar" position="left" withArrow openDelay={400}>
                    <ActionIcon variant="subtle" color="gray" size="sm"
                        onClick={p.onToggleCollapse}>
                        <IconLayoutSidebarLeftExpand size={18}/>
                    </ActionIcon>
                </Tooltip>
            </Box>

            <ScrollArea h="100%" px="xs" type="never" className="side-scroll" style={{flex: 1}}>
                <div ref={sidebarRef} tabIndex={-1} data-sidebar-container style={{outline: 'none'}}>
                    <div className="side-sec">
                        <CollectionsSection
                            collections={p.collections}
                            selectedReqId={p.selectedReqId}
                            onSelect={p.onSelectRequest}
                            onCreateCollection={p.onCreateCollection}
                            onDeleteCollection={p.onDeleteCollection}
                            onCreateFolder={p.onCreateFolder}
                            onDeleteFolder={p.onDeleteFolder}
                            onCountFolder={p.onCountFolder}
                            onAddRequest={p.onAddRequest}
                            onDeleteRequest={p.onDeleteRequest}
                            onReorderRequest={p.onReorderRequest}
                            onReorderFolder={p.onReorderFolder}
                        />
                    </div>
                    <div className="side-sec">
                        <MocksSection
                            mocks={p.mocks}
                            running={p.running}
                            selectedMockId={p.selectedMockId}
                            selectedRouteId={p.selectedRouteId}
                            onSelect={p.onSelectMock}
                            onAdd={p.onAddMock}
                            onDelete={p.onDeleteMock}
                            onSelectRoute={p.onSelectRoute}
                            onAddRoute={p.onAddRoute}
                            onDeleteRoute={p.onDeleteRoute}
                        />
                    </div>
                    <div className="side-sec">
                        <HistorySection
                            entries={p.history}
                            selectedId={p.selectedHistoryId}
                            collapsed={historyCollapsed}
                            onToggle={() => setHistoryCollapsed(c => !c)}
                            onSelect={p.onSelectHistory}
                            onClear={p.onClearHistory}
                        />
                    </div>
                </div>
            </ScrollArea>

            {/* Unified context menu — one Menu instance for the whole sidebar */}
            <Menu opened={menu !== null} onClose={() => setMenu(null)}
                position="bottom-start"
                styles={{dropdown: {minWidth: 140}}}>
                <Menu.Target>
                    <Box style={{position: 'fixed', pointerEvents: 'none', visibility: 'hidden'}}
                        left={menu?.x ?? 0} top={menu?.y ?? 0}/>
                </Menu.Target>
                <Menu.Dropdown>
                    {menu?.actions.map((a, i) => (
                        <Menu.Item key={i} color={a.color} onClick={() => { setMenu(null); a.onClick(); }}>
                            {a.label}
                        </Menu.Item>
                    ))}
                </Menu.Dropdown>
            </Menu>
        </Box>
    );
});
