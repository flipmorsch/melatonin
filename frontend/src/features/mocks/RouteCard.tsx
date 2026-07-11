import {Group, NativeSelect, Paper, Textarea, TextInput} from '@mantine/core';
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
            <Group gap="xs" wrap="nowrap" mb="xs">
                <NativeSelect
                    w={110} size="xs" className="mono-input"
                    value={draft.method}
                    onChange={e => onChange({method: e.target.value})}
                    data={METHODS}
                />
                <TextInput
                    style={{flex: 1}} size="xs" className="mono-input"
                    value={draft.path}
                    onChange={e => onChange({path: e.target.value})}
                    placeholder="/users or /files/*"
                />
                <TextInput
                    w={70} size="xs" className="mono-input"
                    value={draft.status}
                    onChange={e => onChange({status: e.target.value})}
                    placeholder="200"
                />
            </Group>
            <Group gap="sm" align="stretch" wrap="nowrap">
                <Textarea
                    style={{flex: 1}} size="xs" className="mono-input" rows={2}
                    value={draft.headersText}
                    onChange={e => onChange({headersText: e.target.value})}
                    placeholder={'Response headers:\nContent-Type: application/json'}
                />
                <CodeEditor
                    style={{flex: 1, minWidth: 0}}
                    value={draft.body}
                    onChange={v => onChange({body: v})}
                    json={looksJson(draft.body)}
                    minHeight={50}
                    placeholder="Response body"
                />
            </Group>
        </Paper>
    );
}
