import {Text} from '@mantine/core';

/** Rotating disclosure triangle for collapsible sidebar groups. */
export function Chevron({open}: {open: boolean}) {
    return (
        <Text component="span" size="xs" c="dark.2" lh={1}
            style={{
                display: 'inline-block', width: 12, textAlign: 'center', flexShrink: 0,
                transition: 'transform 130ms ease',
                transform: open ? 'rotate(90deg)' : 'none',
            }}>▸</Text>
    );
}
