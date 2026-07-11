import {Group, Text} from '@mantine/core';

export function Brand() {
    return (
        <Group gap={8}>
            <span className="moon" aria-hidden="true"/>
            <Text fw={700} c="violet.2" lts="0.02em">melatonin</Text>
        </Group>
    );
}
