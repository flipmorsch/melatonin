import {ReactNode, useEffect, useMemo, useRef, useState} from 'react';
import {Group, Modal, ScrollArea, Text, TextInput, UnstyledButton} from '@mantine/core';

export interface PaletteItem {
    id: string;
    label: string;
    detail: string;
    left?: ReactNode;
    onSelect: () => void;
}

interface Props {
    open: boolean;
    onClose: () => void;
    items: PaletteItem[];
}

export function CommandPalette({open, onClose, items}: Props) {
    const [query, setQuery] = useState('');
    const [index, setIndex] = useState(0);
    const inputRef = useRef<HTMLInputElement>(null);

    const filtered = useMemo(() => {
        if (!query.trim()) return items.slice(0, 20);
        const q = query.toLowerCase();
        return items
            .filter(i => i.label.toLowerCase().includes(q) || i.detail.toLowerCase().includes(q))
            .slice(0, 20);
    }, [items, query]);

    // Reset on open
    useEffect(() => {
        if (open) {
            setQuery('');
            setIndex(0);
            setTimeout(() => inputRef.current?.focus(), 50);
        }
    }, [open]);

    // Clamp index after filter changes
    const safeIndex = Math.min(index, Math.max(0, filtered.length - 1));

    function onKey(e: React.KeyboardEvent) {
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            setIndex(i => Math.min(i + 1, filtered.length - 1));
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setIndex(i => Math.max(i - 1, 0));
        } else if (e.key === 'Enter') {
            e.preventDefault();
            if (filtered[safeIndex]) {
                filtered[safeIndex].onSelect();
                onClose();
            }
        } else if (e.key === 'Escape') {
            onClose();
        }
    }

    return (
        <Modal
            opened={open}
            onClose={onClose}
            title="Search or run a command"
            size="lg"
            padding={0}
            withCloseButton={false}
            overlayProps={{backgroundOpacity: 0.35}}
            styles={{
                header: {padding: '12px 16px 0'},
                body: {padding: 0},
            }}
        >
            <TextInput
                ref={inputRef}
                placeholder="Search requests & mocks, or run a command…"
                value={query}
                onChange={e => { setQuery(e.target.value); setIndex(0); }}
                onKeyDown={onKey}
                role="combobox"
                aria-expanded={filtered.length > 0}
                aria-controls="cmd-palette-list"
                aria-activedescendant={filtered[safeIndex] ? `cmd-opt-${safeIndex}` : undefined}
                aria-label="Search or run a command"
                styles={{input: {border: 'none', borderRadius: 0, fontSize: 'var(--mantine-font-size-md)'}}}
                px="md"
                pb="xs"
            />
            {filtered.length === 0 && (
                <Text size="sm" c="dark.2" px="md" py="md">No matches</Text>
            )}
            <ScrollArea h={320} type="auto">
                <div role="listbox" id="cmd-palette-list" aria-label="Results">
                {filtered.map((item, i) => (
                    <UnstyledButton
                        key={item.id}
                        id={`cmd-opt-${i}`}
                        role="option"
                        aria-selected={i === safeIndex}
                        onClick={() => { item.onSelect(); onClose(); }}
                        px="md"
                        py={8}
                        w="100%"
                        style={{
                            background: i === safeIndex ? 'var(--mantine-color-dark-5)' : undefined,
                            transition: 'background 80ms ease',
                        }}
                    >
                        <Group gap="sm" wrap="nowrap">
                            {item.left}
                            <div style={{flex: 1, minWidth: 0}}>
                                <Text size="sm" truncate>{item.label}</Text>
                                <Text size="xs" c="dark.2" truncate>{item.detail}</Text>
                            </div>
                        </Group>
                    </UnstyledButton>
                ))}
                </div>
            </ScrollArea>
        </Modal>
    );
}
