import {Button, Group, Modal, Text} from '@mantine/core';

interface Props {
    open: boolean;
    tabName: string;
    onSave: () => void;
    onDiscard: () => void;
    onCancel: () => void;
}

export function TabCloseModal({open, tabName, onSave, onDiscard, onCancel}: Props) {
    return (
        <Modal
            opened={open}
            onClose={onCancel}
            title="Unsaved changes"
            centered
            size="sm"
        >
            <Text size="sm" c="dark.1" mb="md">
                Save changes to <Text component="span" fw={600} c="dark.0">{tabName || 'Untitled'}</Text> before closing?
            </Text>
            <Group justify="flex-end" gap="xs">
                <Button variant="default" size="sm" onClick={onCancel}>Cancel</Button>
                <Button variant="outline" color="red" size="sm" onClick={onDiscard}>Discard</Button>
                <Button size="sm" onClick={onSave}>Save</Button>
            </Group>
        </Modal>
    );
}
