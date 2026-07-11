import {Code, Group, Paper, ScrollArea, Text} from '@mantine/core';
import {main} from '../../../wailsjs/go/models';
import {headersToLines, prettyBody} from '../../lib/kv';

interface Props {
    response: main.ResponseData | null;
    error: string;
}

export function ResponseViewer({response, error}: Props) {
    return (
        <Paper withBorder radius="lg" p="sm" bg="dark.6" style={{flex: 1, minHeight: 0}}>
            <ScrollArea h="100%" type="auto">
                {error &&
                    <Text size="sm" ff="monospace" c="red.4" style={{whiteSpace: 'pre-wrap'}}>{error}</Text>}
                {response && <>
                    <Group gap="md" mb="xs" ff="monospace" fz="sm">
                        <Text ff="monospace" fz="sm" fw={700}
                            c={response.status < 400 ? 'teal.4' : 'red.4'}>
                            {response.status} {response.statusText}
                        </Text>
                        <Text ff="monospace" fz="sm" c="dark.2">{response.durationMs} ms</Text>
                        <Text ff="monospace" fz="sm" c="dark.2">{response.size} B</Text>
                        {response.truncated &&
                            <Text ff="monospace" fz="sm" c="red.4">truncated at 20 MB</Text>}
                    </Group>
                    <details>
                        <summary style={{cursor: 'pointer', color: 'var(--mantine-color-dark-2)', fontSize: 'var(--mantine-font-size-sm)'}}>
                            Headers ({Object.keys(response.headers).length})
                        </summary>
                        <Code block bg="transparent" c="dark.2" fz="sm">
                            {headersToLines(response.headers)}
                        </Code>
                    </details>
                    <Code block bg="transparent" c="dark.0" fz="sm" style={{lineHeight: 1.55}}>
                        {prettyBody(response)}
                    </Code>
                </>}
                {!response && !error &&
                    <Text size="sm" c="dark.2">Send a request to see the response here</Text>}
            </ScrollArea>
        </Paper>
    );
}
