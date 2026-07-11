import {ActionIcon, Group, Stack, Text, TextInput} from '@mantine/core';

/** One editable key/value row; id is a client-side React key only. */
export interface KVRow {
    id: number;
    key: string;
    value: string;
}

let nextId = 1;

export const newKVRow = (key = '', value = ''): KVRow => ({id: nextId++, key, value});

export const rowsFromKV = (kv: {key: string, value: string}[] | undefined): KVRow[] =>
    (kv ?? []).map(p => newKVRow(p.key, p.value));

/** Strips row ids and drops empty-key draft rows — the shape saved and sent. */
export const rowsToKV = (rows: KVRow[]): {key: string, value: string}[] =>
    rows.filter(r => r.key.trim()).map(r => ({key: r.key.trim(), value: r.value}));

interface Props {
    rows: KVRow[];
    onChange: (rows: KVRow[]) => void;
    keyPlaceholder: string;
    valuePlaceholder: string;
    /** Tooltip for rows the request won't actually send (row renders dimmed). */
    deadTitle?: (row: KVRow) => string | undefined;
}

export function KVEditor({rows, onChange, keyPlaceholder, valuePlaceholder, deadTitle}: Props) {
    const update = (id: number, patch: Partial<KVRow>) =>
        onChange(rows.map(r => r.id === id ? {...r, ...patch} : r));

    if (rows.length === 0) {
        return <Text size="xs" c="dimmed">Nothing here — use + to add a row.</Text>;
    }

    return (
        <Stack gap={6}>
            {rows.map(row => {
                const dead = deadTitle?.(row);
                return (
                    <Group key={row.id} gap="xs" wrap="nowrap"
                        title={dead} style={dead ? {opacity: 0.45} : undefined}>
                        <TextInput
                            size="xs" className="mono-input" w="35%"
                            value={row.key}
                            onChange={e => update(row.id, {key: e.target.value})}
                            placeholder={keyPlaceholder}
                            autoFocus={!row.key && !row.value}
                        />
                        <TextInput
                            size="xs" className="mono-input" style={{flex: 1}}
                            value={row.value}
                            onChange={e => update(row.id, {value: e.target.value})}
                            placeholder={valuePlaceholder}
                        />
                        <ActionIcon size="sm" variant="subtle" color="gray" title="Remove row"
                            onClick={() => onChange(rows.filter(r => r.id !== row.id))}>✕</ActionIcon>
                    </Group>
                );
            })}
        </Stack>
    );
}
