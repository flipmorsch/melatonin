import {ActionIcon, Box, Group, Text} from '@mantine/core';
import {IconChevronDown, IconChevronRight} from '@tabler/icons-react';
import {main} from '../../../wailsjs/go/models';
import {ConfirmDelete} from '../../components/ConfirmDelete';
import {SectionLabel} from '../../components/SectionLabel';
import {EmptyState} from '../../components/EmptyState';
import {MethodBadge} from '../../components/MethodBadge';
import {SidebarRow} from './SidebarRow';

interface Props {
    entries: main.HistoryEntry[];
    selectedId: string | null;
    collapsed: boolean;
    onToggle: () => void;
    onSelect: (e: main.HistoryEntry) => void;
    onClear: () => void;
}

/** Just the path of an as-typed URL: strips scheme+host or a {{var}} prefix,
 * and the query string. Unrecognized shapes are shown as-is. */
function pathOf(url: string): string {
    const noQuery = url.split('?')[0];
    const m = noQuery.match(/^(?:https?:\/\/[^/]*|\{\{[^}]*\}\})(\/.*)?$/);
    return m ? (m[1] || '/') : noQuery;
}

/** Outcome column: status code colored by class, or ERR for failed sends. */
function outcome(e: main.HistoryEntry) {
    if (!e.response) return <Text size="xs" ff="monospace" c="red.4">ERR</Text>;
    return (
        <Text size="xs" ff="monospace" c={e.response.status < 400 ? 'teal.4' : 'red.4'}>
            {e.response.status}
        </Text>
    );
}

export function HistorySection(p: Props) {
    return (
        <Box mt="lg">
            <Group justify="space-between" px="xs" mb={4}>
                <SectionLabel>History</SectionLabel>
                <Group gap={4}>
                    {p.entries.length > 0 &&
                        <ConfirmDelete title="Clear history" onConfirm={p.onClear}/>}
                    <ActionIcon size="sm" variant="subtle" color="gray"
                        title={p.collapsed ? 'Show history' : 'Hide history'}
                        onClick={p.onToggle}>
                        {p.collapsed
                            ? <IconChevronRight size={18}/>
                            : <IconChevronDown size={18}/>}
                    </ActionIcon>
                </Group>
            </Group>

            {!p.collapsed && p.entries.length === 0 &&
                <EmptyState>Sent requests will show up here</EmptyState>}

            {!p.collapsed && p.entries.map(e =>
                <SidebarRow
                    key={e.id}
                    selected={p.selectedId === e.id}
                    onClick={() => p.onSelect(e)}
                    left={<MethodBadge method={e.request.method}/>}
                    label={pathOf(e.request.url)}
                    right={<>
                        {outcome(e)}
                        <Text size="xs" ff="monospace" c="dark.2">{e.time.slice(11, 16)}</Text>
                    </>}
                />)}
        </Box>
    );
}
