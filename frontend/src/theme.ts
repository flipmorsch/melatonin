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
    fontFamilyMonospace: "'Iosevka', 'JetBrains Mono', ui-monospace, 'SF Mono', 'Fira Code', monospace",
    headings: {fontFamily: "'Nunito', system-ui, sans-serif", fontWeight: '700'},
    defaultRadius: 'xs',
    radius: {xs: '3px', sm: '4px', md: '6px', lg: '8px', xl: '10px'},
    fontSizes: {xs: '12px', sm: '13.5px', md: '15px', lg: '17px', xl: '20px'},
    spacing: {xs: '4px', sm: '8px', md: '12px', lg: '16px', xl: '24px'},

    // Inject known CSS hooks on every component so app.css can target them.
    // Mantine v9 uses hashed CSS module classes; classNames adds stable extras.
    components: {
        Button: {
            classNames: {root: 'p-btn'},
        },
        TextInput: {
            classNames: {input: 'p-inp'},
        },
        Select: {
            classNames: {input: 'p-sel', dropdown: 'p-drop', option: 'p-opt'},
        },
        NumberInput: {
            classNames: {input: 'p-num'},
        },
        PasswordInput: {
            classNames: {input: 'p-pwd', innerInput: 'p-pwd-inner'},
        },
        Textarea: {
            classNames: {input: 'p-area'},
        },
        Checkbox: {
            classNames: {input: 'p-chk'},
        },
        Badge: {
            classNames: {root: 'p-badge'},
        },
        Tabs: {
            classNames: {tab: 'p-tab', list: 'p-tab-list'},
        },
        Accordion: {
            classNames: {control: 'p-acc', item: 'p-acc-item'},
        },
        AppShell: {
            classNames: {navbar: 'p-shell-nav'},
        },
        Combobox: {
            classNames: {dropdown: 'p-drop', option: 'p-opt'},
        },
    },
});
