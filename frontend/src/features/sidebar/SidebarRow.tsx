import {ReactNode} from 'react';
import {Group, Text, UnstyledButton} from '@mantine/core';

interface Props {
    label: string;
    left?: ReactNode;
    right?: ReactNode;
    selected?: boolean;
    indent?: boolean;
    onClick: () => void;
}

/** Dense clickable row for sidebar lists (requests, mock servers, environments). */
export function SidebarRow({label, left, right, selected, indent, onClick}: Props) {
    return (
        <UnstyledButton
            onClick={onClick}
            className="hover-row side-row"
            w={indent ? 'calc(100% - 12px)' : '100%'}
            ml={indent ? 12 : 0}
            px={8}
            py={4}
            style={{
                display: 'block',
                borderRadius: 'var(--mantine-radius-sm)',
                background: selected ? 'rgba(130, 102, 240, 0.16)' : undefined,
            }}
        >
            <Group gap={8} wrap="nowrap">
                {left}
                <Text size="sm" c={selected ? 'dark.0' : 'dark.1'} truncate style={{flex: 1}}>
                    {label}
                </Text>
                {right && <span onClick={e => e.stopPropagation()} style={{display: 'flex'}}>{right}</span>}
            </Group>
        </UnstyledButton>
    );
}
