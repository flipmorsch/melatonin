import {Box, Text} from '@mantine/core';

interface Props {
    text: string;
}

/** Terminal-style script output with color-coded log levels. */
export function ScriptLog({text}: Props) {
    return (
        <Box
            py={6} px="xs"
            style={{
                background: 'var(--mantine-color-dark-7)',
                borderRadius: 'var(--mantine-radius-xs)',
                borderLeft: '2px solid var(--mantine-color-dark-4)',
                maxHeight: 100,
                overflow: 'auto',
            }}
        >
            {text.split('\n').map((line, i) => {
                let color = 'dark.1';
                if (line.startsWith('[warn]')) color = 'yellow.4';
                else if (line.startsWith('[error]')) color = 'red.4';
                else if (line.startsWith('[log]')) color = 'dark.0';
                return (
                    <Text
                        key={i}
                        component="pre"
                        size="xs"
                        ff="monospace"
                        c={color}
                        style={{margin: 0, lineHeight: '1.5'}}
                    >
                        {line}
                    </Text>
                );
            })}
        </Box>
    );
}
