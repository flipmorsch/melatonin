import {ReactNode, useCallback, useEffect, useState} from 'react';
import {Box, Text} from '@mantine/core';

export interface ContextAction {
    label: string;
    color?: string;
    onClick: () => void;
}

/** Opens the single sidebar-level Menu (rendered in Sidebar) at a screen point. */
export function openSidebarMenu(x: number, y: number, actions: ContextAction[]) {
    window.dispatchEvent(new CustomEvent('sidebar-contextmenu', {detail: {x, y, actions}}));
}

interface Props {
    label: string;
    /** Stable id for keyboard navigation focus tracking. */
    rowId: string;
    /** Rendered before the label (badge, run dot). */
    left?: ReactNode;
    /** Rendered before the clickable area as a sibling (chevron toggle). */
    leading?: ReactNode;
    /** Rendered after the label — action buttons, status text, etc. */
    right?: ReactNode;
    selected?: boolean;
    /** Nested depth in the folder tree. 0 = root, 1 = first-level folder, etc. */
    depth?: number;
    onClick: () => void;
    /** Fires on Delete key and the context-menu Delete action. */
    onDelete?: () => void;
    /** Actions shown in the right-click context menu (handled by parent). */
    contextActions?: ContextAction[];
}

/**
 * Dense, keyboard-navigable row for sidebar lists.
 *
 * The row itself is the interactive surface — a single `role="button"` element
 * that handles click, Enter/Space, Delete, and right-click context menus.
 * Action buttons in the `right` slot stop propagation so they don't trigger the
 * row's onClick.
 */
export function SidebarRow({label, rowId, left, leading, right, selected, depth, onClick, onDelete, contextActions}: Props) {
    const d = depth ?? 0;
    const hasDepth = d > 0;

    // Delete is two-press so a stray keystroke can't destroy a request: the
    // first Delete arms (visible red cue), a second within 3s fires, Esc cancels.
    const [armed, setArmed] = useState(false);
    useEffect(() => {
        if (!armed) return;
        const t = setTimeout(() => setArmed(false), 3000);
        return () => clearTimeout(t);
    }, [armed]);

    const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
        if (e.key === 'Escape' && armed) {
            e.preventDefault();
            setArmed(false);
        } else if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            if (armed) setArmed(false);
            onClick();
        } else if (e.key === 'Delete' && onDelete) {
            e.preventDefault();
            if (armed) { setArmed(false); onDelete(); }
            else setArmed(true);
        }
    }, [onClick, onDelete, armed]);

    const handleContextMenu = useCallback((e: React.MouseEvent) => {
        if (!contextActions || contextActions.length === 0) return;
        e.preventDefault();
        openSidebarMenu(e.clientX, e.clientY, contextActions);
    }, [contextActions]);

    return (
        <Box
            component="div"
            role="button"
            tabIndex={-1}
            data-sidebar-row={rowId}
            onClick={onClick}
            onKeyDown={handleKeyDown}
            onContextMenu={handleContextMenu}
            onBlur={e => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setArmed(false); }}
            className="side-row"
            w={hasDepth ? `calc(100% - ${d * 16}px)` : '100%'}
            ml={d * 16}
            px="xs"
            py={3}
            style={{
                display: 'flex',
                alignItems: 'center',
                gap: 4,
                minHeight: 32,
                borderRadius: 'var(--mantine-radius-sm)',
                cursor: 'default',
                ...(selected ? {
                    background: 'var(--selected-bg)',
                    color: 'var(--mantine-color-dark-0)',
                } : {
                    color: 'var(--mantine-color-dark-1)',
                }),
                ...(armed ? {
                    background: 'color-mix(in srgb, var(--mantine-color-red-4) 16%, transparent)',
                } : {}),
            }}
        >
            {/* Leading slot: chevron, toggle — outside the click target's flow */}
            {leading && (
                <Box style={{flexShrink: 0, display: 'flex', alignItems: 'center'}}
                    onClick={e => e.stopPropagation()}>
                    {leading}
                </Box>
            )}

            {/* Main content: badge + label */}
            <Box style={{flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: 8}}>
                {left}
                <Text size="sm" truncate style={{flex: 1}}>
                    {label}
                </Text>
            </Box>

            {/* Right slot: armed-delete hint, else action buttons — stop propagation */}
            {armed ? (
                <Box style={{flexShrink: 0}}>
                    <Text role="status" size="xs" fw={600} c="red.4" style={{userSelect: 'none'}}
                        aria-label="Press Delete again to confirm, or Escape to cancel">
                        Delete? ⌦
                    </Text>
                </Box>
            ) : right && (
                <Box
                    style={{flexShrink: 0, display: 'flex', alignItems: 'center', gap: 4}}
                    onClick={e => e.stopPropagation()}
                    onKeyDown={e => e.stopPropagation()}
                >
                    {right}
                </Box>
            )}
        </Box>
    );
}
