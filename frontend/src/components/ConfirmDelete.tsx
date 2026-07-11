import {useEffect, useState} from 'react';
import {ActionIcon, Button} from '@mantine/core';

interface Props {
    onConfirm: () => void;
    /** 'icon' renders a small ✕ that arms into "sure?"; 'button' renders a labelled Delete button. */
    variant?: 'icon' | 'button';
    title?: string;
}

/** Two-click destructive action: first click arms, second click (within 3s) fires. */
export function ConfirmDelete({onConfirm, variant = 'icon', title = 'Delete'}: Props) {
    const [armed, setArmed] = useState(false);

    useEffect(() => {
        if (!armed) return;
        const t = setTimeout(() => setArmed(false), 3000);
        return () => clearTimeout(t);
    }, [armed]);

    const click = (e: React.MouseEvent) => {
        e.stopPropagation();
        if (armed) {
            setArmed(false);
            onConfirm();
        } else {
            setArmed(true);
        }
    };

    if (variant === 'button' || armed) {
        return (
            <Button
                size={variant === 'button' ? 'sm' : 'compact-xs'}
                color="red"
                variant="outline"
                onClick={click}
            >
                {armed ? 'sure?' : title}
            </Button>
        );
    }
    return (
        <ActionIcon size="sm" variant="subtle" color="gray" title={title} onClick={click}>
            ✕
        </ActionIcon>
    );
}
