import {Group, Paper, Select, Stack, Text, Textarea, TextInput} from '@mantine/core';
import {looksJson, METHODS} from '../../lib/kv';
import {CodeEditor} from '../../components/CodeEditor';

export interface RouteDraft {
    id: string;
    method: string;
    path: string;
    status: string;
    headersText: string;
    body: string;
}

interface Props {
    draft: RouteDraft;
    onChange: (patch: Partial<RouteDraft>) => void;
}

export function RouteCard({draft, onChange}: Props) {
    return (
        <Paper withBorder radius="lg" p="sm" bg="dark.6" style={{flexShrink: 0}}>
            <Stack gap="xs">
                <Group gap="xs" wrap="nowrap">
                    <Select
                        w={110} size="xs" className="mono-input"
                        value={draft.method}
                        onChange={v => v !== null && onChange({method: v})}
                        data={METHODS}
                        aria-label="Route method"
                    />
                    <TextInput
                        style={{flex: 1}} size="xs" className="mono-input"
                        value={draft.path}
                        onChange={e => onChange({path: e.target.value})}
                        placeholder="/users or /files/*"
                        aria-label="Route path"
                    />
                    <TextInput
                        w={70} size="xs" className="mono-input"
                        value={draft.status}
                        onChange={e => onChange({status: e.target.value})}
                        placeholder="200"
                        title="Response status code"
                        aria-label="Response status code"
                    />
                </Group>
                <Text size="xs" c="dark.2">Response headers</Text>
                <Textarea
                    size="xs" className="mono-input" autosize minRows={2} maxRows={6}
                    value={draft.headersText}
                    onChange={e => onChange({headersText: e.target.value})}
                    placeholder={'Content-Type: application/json'}
                />
                <Text size="xs" c="dark.2">Response body</Text>
                <CodeEditor
                    style={{minWidth: 0}}
                    value={draft.body}
                    onChange={v => onChange({body: v})}
                    json={looksJson(draft.body)}
                    minHeight={120}
                    placeholder="Response body"
                />
            </Stack>
        </Paper>
    );
}
