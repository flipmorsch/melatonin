import {createTheme, MantineColorsTuple} from '@mantine/core';

// The nocturnal identity from DESIGN.md expressed as a Mantine theme.
// dark[7] is Mantine's body background; the scale below maps our night inks
// onto Mantine's slots (4 = borders, 6 = inputs, 7 = body).
const dark: MantineColorsTuple = [
    '#eceaf4', // 0 — primary text (moonlight)
    '#a09dbb', // 1 — secondary text
    '#8b88a3', // 2
    '#625f7d', // 3 — placeholders, micro-labels
    '#262a3b', // 4 — borders
    '#191c2a', // 5 — raised / hover
    '#12141f', // 6 — inputs, wells
    '#0c0e16', // 7 — app background
    '#0a0c12', // 8
    '#080a0f', // 9
];

const violet: MantineColorsTuple = [
    '#efecff',
    '#ded7fc',
    '#bcabf7',
    '#9a7ff2',
    '#8266f0', // 4 — primary actions (dark scheme)
    '#7557e6',
    '#6a48e0',
    '#5a3bc4',
    '#4a30a3',
    '#3a2582',
];

export const theme = createTheme({
    colors: {dark, violet},
    primaryColor: 'violet',
    primaryShade: {light: 6, dark: 4},
    fontFamily: "'Nunito', system-ui, sans-serif",
    fontFamilyMonospace: "'JetBrains Mono', ui-monospace, 'SF Mono', 'Fira Code', monospace",
    headings: {fontFamily: "'Nunito', system-ui, sans-serif", fontWeight: '700'},
    defaultRadius: 'sm',
    radius: {xs: '4px', sm: '6px', md: '8px', lg: '10px', xl: '14px'},
    fontSizes: {xs: '11px', sm: '12.5px', md: '13.5px', lg: '15px', xl: '18px'},
});
