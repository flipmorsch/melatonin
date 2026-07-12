import {Box, Code, Group, Text} from '@mantine/core';
import {main} from '../../../wailsjs/go/models';
import {headersToLines} from '../../lib/kv';
import {MethodBadge} from '../../components/MethodBadge';
import {EmptyState} from '../../components/EmptyState';

interface Props {
    entries: main.MockLogEntry[];
    running: boolean;
}

/** Incoming requests, newest first. Entries expand to show headers and body. */
export function RequestLog({entries, running}: Props) {
    if (entries.length === 0) {
        return <EmptyState>
            {running
                ? 'No requests yet — anything sent to this server will appear here'
                : 'Log is empty — it fills while the server runs and clears on start'}
        </EmptyState>;
    }
    return (
        <Box>
            {[...entries].reverse().map((entry, i) =>
                <Box key={entries.length - i}
                    style={{borderBottom: '1px solid var(--mantine-color-dark-5)'}} py={4}>
                    <details>
                        <summary className="log-summary" style={{cursor: 'pointer', listStyle: 'none'}}>
                            <Group gap="sm" wrap="nowrap" px={4} py={2}>
                                <Text size="xs" ff="monospace" c="dark.2">{entry.time}</Text>
                                <MethodBadge method={entry.method}/>
                                <Text size="sm" ff="monospace" c="dark.1" truncate style={{flex: 1}}>
                                    {entry.path}
                                </Text>
                                {!entry.matched &&
                                    <Text size="xs" ff="monospace" c="red.4">no match</Text>}
                                {entry.status > 0 &&
                                    <Text size="xs" ff="monospace"
                                        c={entry.status < 400 ? 'teal.4' : 'red.4'}>
                                        → {entry.status}
                                    </Text>}
                            </Group>
                        </summary>
                        <Code block bg="transparent" c="dark.2" fz="xs" ml="md">
                            {headersToLines(entry.headers)}
                        </Code>
                        {entry.body &&
                            <Code block bg="transparent" c="dark.0" fz="xs" ml="md">
                                {entry.body}
                            </Code>}
                    </details>
                </Box>)}
        </Box>
    );
}
