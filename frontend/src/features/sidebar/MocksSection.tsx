import {useState} from 'react';
import {ActionIcon, Box, Group, Text, UnstyledButton} from '@mantine/core';
import {IconChevronDown, IconChevronRight, IconPlus, IconServer} from '@tabler/icons-react';
import {main} from '../../../wailsjs/go/models';
import {ConfirmDelete} from '../../components/ConfirmDelete';
import {SectionLabel} from '../../components/SectionLabel';
import {EmptyState} from '../../components/EmptyState';
import {RunDot} from '../../components/RunDot';
import {MethodBadge} from '../../components/MethodBadge';
import {SidebarRow} from './SidebarRow';

interface Props {
    mocks: main.MockServer[];
    running: Record<string, number>;
    selectedMockId: string | null;
    selectedRouteId: string | null;
    onSelect: (m: main.MockServer) => void;
    onAdd: () => void;
    onDelete: (id: string) => void;
    onSelectRoute: (m: main.MockServer, routeId: string) => void;
    onAddRoute: (m: main.MockServer) => void;
    onDeleteRoute: (m: main.MockServer, routeId: string) => void;
}

export function MocksSection(p: Props) {
    // collapsed mock-server ids; default expanded
    const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

    const toggle = (id: string) => setCollapsed(prev => {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id); else next.add(id);
        return next;
    });

    function addRoute(m: main.MockServer) {
        // reveal the route that's about to appear
        setCollapsed(prev => {
            if (!prev.has(m.id)) return prev;
            const next = new Set(prev);
            next.delete(m.id);
            return next;
        });
        p.onAddRoute(m);
    }

    return (
        <Box>
            <Group justify="space-between" px="xs" mb={4} className="side-sec-head">
                <SectionLabel>Mock Servers</SectionLabel>
                <ActionIcon size="sm" variant="subtle" color="gray" title="New mock server"
                    onClick={p.onAdd}>
                    <IconServer size={18}/>
                </ActionIcon>
            </Group>

            {p.mocks.length === 0 &&
                <EmptyState>No mock servers yet — create one to fake an API</EmptyState>}

            {p.mocks.map(m => {
                const open = !collapsed.has(m.id);
                return (
                    <Box key={m.id}>
                        <SidebarRow
                            rowId={`mock:${m.id}`}
                            selected={p.selectedMockId === m.id && p.selectedRouteId === null}
                            onClick={() => p.onSelect(m)}
                            onDelete={() => p.onDelete(m.id)}
                            contextActions={[{label: 'Delete', color: 'red', onClick: () => p.onDelete(m.id)}]}
                            leading={
                                <UnstyledButton
                                    py={4}
                                    aria-label={open ? 'Collapse routes' : 'Expand routes'}
                                    onClick={() => toggle(m.id)}
                                    style={{display: 'flex', alignItems: 'center'}}>
                                    <IconChevronRight size={18}
                                        className={`chevron${open ? ' open' : ''}`}/>
                                </UnstyledButton>}
                            left={<RunDot on={p.running[m.id] !== undefined}/>}
                            label={m.name}
                            right={<>
                                <Text size="xs" ff="monospace" c="dark.2">:{p.running[m.id] ?? m.port}</Text>
                                <ActionIcon size="sm" variant="subtle" color="gray" title="New route"
                                    className="row-reveal" onClick={() => addRoute(m)}>
                                    <IconPlus size={18}/>
                                </ActionIcon>
                                <span className="row-reveal">
                                    <ConfirmDelete title="Delete mock server" onConfirm={() => p.onDelete(m.id)}/>
                                </span>
                            </>}
                        />
                        {open && (m.routes ?? []).map(r =>
                            <SidebarRow
                                key={r.id}
                                rowId={`route:${m.id}:${r.id}`}
                                depth={1}
                                selected={p.selectedRouteId === r.id}
                                onClick={() => p.onSelectRoute(m, r.id)}
                                onDelete={() => p.onDeleteRoute(m, r.id)}
                                contextActions={[{label: 'Delete', color: 'red', onClick: () => p.onDeleteRoute(m, r.id)}]}
                                left={<MethodBadge method={r.method}/>}
                                label={r.path}
                                right={<span className="row-reveal">
                                    <ConfirmDelete title="Delete route"
                                        onConfirm={() => p.onDeleteRoute(m, r.id)}/>
                                </span>}
                            />)}
                        {/* hint indent 26 = route row indent (16) + row px (10): the route glyph rail */}
                        {open && (m.routes ?? []).length === 0 &&
                            <Text size="xs" c="dark.2" pl={26} py={2}>No routes</Text>}
                    </Box>
                );
            })}
        </Box>
    );
}
