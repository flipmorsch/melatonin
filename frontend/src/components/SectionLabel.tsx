import {Text, TextProps} from '@mantine/core';

/** Micro section header: uppercase, tracked, quiet. */
export function SectionLabel({children, ...props}: Omit<TextProps, 'children'> & {children: React.ReactNode}) {
    return (
        <Text size="xs" fw={700} tt="uppercase" lts="0.08em" c="dark.2" {...props}>
            {children}
        </Text>
    );
}
