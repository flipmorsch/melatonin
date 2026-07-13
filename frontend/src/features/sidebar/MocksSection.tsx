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
        <Box mt="lg">
            <Group justify="space-between" px="xs" mb={4}>
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
                            selected={p.selectedMockId === m.id && p.selectedRouteId === null}
                            onClick={() => p.onSelect(m)}
                            leading={
                                <UnstyledButton
                                    pl={8} py={4}
                                    aria-label={open ? 'Collapse routes' : 'Expand routes'}
                                    onClick={() => toggle(m.id)}
                                    style={{display: 'flex', alignItems: 'center'}}>
                                    {open
                                        ? <IconChevronDown size={18}/>
                                        : <IconChevronRight size={18}/>}
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
                                depth={1}
                                selected={p.selectedRouteId === r.id}
                                onClick={() => p.onSelectRoute(m, r.id)}
                                left={<MethodBadge method={r.method}/>}
                                label={r.path}
                                right={<span className="row-reveal">
                                    <ConfirmDelete title="Delete route"
                                        onConfirm={() => p.onDeleteRoute(m, r.id)}/>
                                </span>}
                            />)}
                        {open && (m.routes ?? []).length === 0 &&
                            <Text size="xs" c="dark.2" px="xs" pl={28} py={2}>No routes</Text>}
                    </Box>
                );
            })}
        </Box>
    );
}
