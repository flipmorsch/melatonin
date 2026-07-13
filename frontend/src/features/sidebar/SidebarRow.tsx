import {ReactNode} from 'react';
import {Group, Text, UnstyledButton} from '@mantine/core';

interface Props {
    label: string;
    /** Rendered inside the main click target, before the label (badge, run dot). */
    left?: ReactNode;
    /** Rendered before the main click target as a sibling (e.g. a chevron button). */
    leading?: ReactNode;
    /** Rendered after the main click target as a sibling — may contain buttons. */
    right?: ReactNode;
    selected?: boolean;
    indent?: boolean;
    onClick: () => void;
}

/** Dense clickable row for sidebar lists (requests, mock servers, environments).
 * The label is a button; `leading`/`right` are siblings so rows never nest buttons. */
export function SidebarRow({label, left, leading, right, selected, indent, onClick}: Props) {
    return (
        <Group
            gap={0}
            wrap="nowrap"
            className="hover-row side-row"
            w={indent ? 'calc(100% - 12px)' : '100%'}
            ml={indent ? 12 : 0}
            style={{
                borderRadius: 'var(--mantine-radius-sm)',
                background: selected ? 'var(--selected-bg)' : undefined,
            }}
        >
            {leading}
            <UnstyledButton onClick={onClick} px={8} py={4} style={{flex: 1, minWidth: 0}}>
                <Group gap={8} wrap="nowrap">
                    {left}
                    <Text size="sm" c={selected ? 'dark.0' : 'dark.1'} truncate style={{flex: 1}}>
                        {label}
                    </Text>
                </Group>
            </UnstyledButton>
            {right &&
                <Group gap={4} wrap="nowrap" pr={8} style={{flexShrink: 0}}>{right}</Group>}
        </Group>
    );
}
