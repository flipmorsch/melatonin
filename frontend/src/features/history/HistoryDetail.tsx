import {Button, Code, Group, Paper, Stack, Text} from '@mantine/core';
import {main} from '../../../wailsjs/go/models';
import {looksJson} from '../../lib/kv';
import {CodeEditor} from '../../components/CodeEditor';
import {MethodBadge} from '../../components/MethodBadge';
import {ResponseViewer} from '../request/ResponseViewer';

interface Props {
    entry: main.HistoryEntry;
    /** Loads this entry into the scratch editor, ready to tweak and resend. */
    onOpenInEditor: (e: main.HistoryEntry) => void;
}

/** Ordered KV rows as "key: value" lines (params use "="). */
function kvLines(rows: Array<{key: string, value: string}> | undefined, sep: string): string {
    return (rows ?? []).filter(r => r.key).map(r => `${r.key}${sep}${r.value}`).join('\n');
}

/** Read-only view of one recorded send: what went out, what came back. */
export function HistoryDetail({entry, onOpenInEditor}: Props) {
    const r = entry.request;
    const resolvedUrl = entry.response?.finalUrl;
    const params = kvLines(r.params, '=');
    const headers = kvLines(r.headers, ': ');
    const authLine = r.auth?.type === 'bearer' ? `Authorization: Bearer ${r.auth.token} (auth helper)`
        : r.auth?.type === 'basic' ? `Authorization: Basic — ${r.auth.username} (auth helper)`
        : '';

    return (
        <Stack gap="sm" style={{flex: 1, minHeight: 0}}>
            <Group gap="xs" wrap="nowrap">
                <MethodBadge method={r.method}/>
                <Text ff="monospace" size="sm" c="dark.0" truncate style={{flex: 1}}
                    title={resolvedUrl || r.url}>
                    {resolvedUrl || r.url}
                </Text>
                <Text size="xs" ff="monospace" c="dark.2" style={{flexShrink: 0}}>
                    {entry.time.replace('T', ' ').slice(0, 19)}
                </Text>
                <Button size="xs" variant="default" style={{flexShrink: 0}}
                    onClick={() => onOpenInEditor(entry)}>
                    Open in editor
                </Button>
            </Group>

            <Paper withBorder radius="lg" p="sm" bg="dark.6" style={{flexShrink: 0}}>
                <Stack gap={6}>
                    <Text size="xs" c="dark.2">Request as typed</Text>
                    <Text size="sm" ff="monospace" c="dark.1" style={{wordBreak: 'break-all'}}>
                        {r.method} {r.url}
                    </Text>
                    {params &&
                        <Code block bg="transparent" c="dark.2" fz="xs">{params}</Code>}
                    {(headers || authLine) &&
                        <Code block bg="transparent" c="dark.2" fz="xs">
                            {[headers, authLine].filter(Boolean).join('\n')}
                        </Code>}
                    {r.body &&
                        <CodeEditor
                            value={r.body}
                            readOnly variant="fill" json={looksJson(r.body)} fold
                            style={{maxHeight: 200, overflow: 'auto'}}
                        />}
                </Stack>
            </Paper>

            <ResponseViewer response={entry.response ?? null} error={entry.error ?? ''}/>
        </Stack>
    );
}
