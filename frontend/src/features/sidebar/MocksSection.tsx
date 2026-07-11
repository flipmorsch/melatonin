import {ActionIcon, Box, Group, Text} from '@mantine/core';
import {main} from '../../../wailsjs/go/models';
import {ConfirmDelete} from '../../components/ConfirmDelete';
import {SectionLabel} from '../../components/SectionLabel';
import {EmptyState} from '../../components/EmptyState';
import {RunDot} from '../../components/RunDot';
import {SidebarRow} from './SidebarRow';

interface Props {
    mocks: main.MockServer[];
    running: Record<string, number>;
    selectedMockId: string | null;
    onSelect: (m: main.MockServer) => void;
    onAdd: () => void;
    onDelete: (id: string) => void;
}

export function MocksSection(p: Props) {
    return (
        <Box mt="lg">
            <Group justify="space-between" px="xs" mb={4}>
                <SectionLabel>Mock Servers</SectionLabel>
                <ActionIcon size="sm" variant="subtle" color="gray" title="New mock server"
                    onClick={p.onAdd}>+</ActionIcon>
            </Group>

            {p.mocks.length === 0 &&
                <EmptyState>No mock servers yet — create one to fake an API</EmptyState>}

            {p.mocks.map(m =>
                <SidebarRow
                    key={m.id}
                    selected={p.selectedMockId === m.id}
                    onClick={() => p.onSelect(m)}
                    left={<RunDot on={p.running[m.id] !== undefined}/>}
                    label={m.name}
                    right={
                        <Group gap={4} wrap="nowrap">
                            <Text size="xs" ff="monospace" c="dark.2">:{p.running[m.id] ?? m.port}</Text>
                            <span className="row-reveal">
                                <ConfirmDelete title="Delete mock server" onConfirm={() => p.onDelete(m.id)}/>
                            </span>
                        </Group>
                    }
                />)}
        </Box>
    );
}
