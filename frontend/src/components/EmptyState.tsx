import {Text} from '@mantine/core';

/** Empty states direct the user toward the next action — copy should say what
 * to do, not just what's missing (DESIGN.md rule 4). */
export function EmptyState({children}: {children: string}) {
    return <Text size="sm" c="dark.2" px="xs" py={4}>{children}</Text>;
}
