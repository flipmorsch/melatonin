import {ActionIcon, Box, Group, Scroller, Text, Tooltip} from '@mantine/core';
import {TabState} from '../../hooks/useTabs';

interface Props {
    tabs: TabState[];
    activeIdx: number;
    onSelect: (idx: number) => void;
    onClose: (idx: number) => void;
    onNewScratch: () => void;
}

const methodColor = (m: string) => {
    const c: Record<string, string> = {
        GET: 'var(--m-get)',
        POST: 'var(--m-post)',
        PUT: 'var(--m-put)',
        PATCH: 'var(--m-patch)',
        DELETE: 'var(--m-delete)',
    };
    return c[m.toUpperCase()] ?? 'var(--mantine-color-dark-1)';
};

export function TabStrip({tabs, activeIdx, onSelect, onClose, onNewScratch}: Props) {
    return (
        <Box
            style={{
                display: 'flex',
                alignItems: 'stretch',
                height: 34,
                borderBottom: '1px solid var(--mantine-color-dark-4)',
                background: 'var(--mantine-color-dark-7)',
                flexShrink: 0,
            }}
        >
            <Scroller h="100%">
                <Group gap={0} wrap="nowrap" h="100%" style={{alignItems: 'stretch'}}>
                    {tabs.map((tab, i) => {
                        const active = i === activeIdx;
                        return (
                            <Tooltip key={tab.tabId} label={tab.label} openDelay={600} disabled={active}>
                                <Box
                                    onClick={() => onSelect(i)}
                                    style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: 6,
                                        height: '100%',
                                        padding: '0 12px',
                                        cursor: 'pointer',
                                        borderBottom: active
                                            ? '2px solid var(--mantine-color-violet-4)'
                                            : '2px solid transparent',
                                        background: active
                                            ? 'var(--mantine-color-dark-6)'
                                            : 'transparent',
                                        transition: 'background 130ms ease, border-color 130ms ease',
                                        whiteSpace: 'nowrap',
                                        userSelect: 'none',
                                        flexShrink: 0,
                                        maxWidth: 200,
                                    }}
                                >
                                    {tab.type !== 'scratch' && (
                                        <Text
                                            span
                                            ff="monospace"
                                            fz={10}
                                            fw={700}
                                            c={methodColor(tab.method)}
                                            style={{lineHeight: 1}}
                                        >
                                            {tab.method}
                                        </Text>
                                    )}
                                    <Text
                                        span
                                        size="xs"
                                        fw={active ? 600 : 400}
                                        c={active ? 'dark.0' : 'dark.2'}
                                        truncate
                                        style={{maxWidth: 130}}
                                    >
                                        {tab.label}
                                    </Text>
                                    {tab.saveState === 'dirty' && (
                                        <Text span size="xs" c="yellow.4" style={{lineHeight: 1}}>
                                            ●
                                        </Text>
                                    )}
                                    {tab.type !== 'scratch' && (
                                        <ActionIcon
                                            size={16}
                                            variant="subtle"
                                            color="gray"
                                            onClick={e => {
                                                e.stopPropagation();
                                                onClose(i);
                                            }}
                                            title="Close tab"
                                            style={{flexShrink: 0}}
                                        >
                                            <Text span size="xs" c="dark.3">✕</Text>
                                        </ActionIcon>
                                    )}
                                </Box>
                            </Tooltip>
                        );
                    })}
                </Group>
            </Scroller>
            <ActionIcon
                size={34}
                variant="subtle"
                color="gray"
                onClick={onNewScratch}
                title="New scratch tab"
                style={{flexShrink: 0, borderLeft: '1px solid var(--mantine-color-dark-4)'}}
            >
                <Text span size="sm" c="dark.2">+</Text>
            </ActionIcon>
        </Box>
    );
}
