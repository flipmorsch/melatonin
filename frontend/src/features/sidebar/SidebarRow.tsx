import {ReactNode, useCallback} from 'react';
import {Box, Text} from '@mantine/core';

export interface ContextAction {
    label: string;
    color?: string;
    onClick: () => void;
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

    const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
        if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onClick();
        } else if (e.key === 'Delete' && onDelete) {
            e.preventDefault();
            onDelete();
        }
    }, [onClick, onDelete]);

    const handleContextMenu = useCallback((e: React.MouseEvent) => {
        if (!contextActions || contextActions.length === 0) return;
        e.preventDefault();
        // The parent Sidebar reads this event and positions a single Menu.
        // We dispatch a custom event so the sidebar-level handler can pick it up.
        const detail = {x: e.clientX, y: e.clientY, actions: contextActions, rowId};
        window.dispatchEvent(new CustomEvent('sidebar-contextmenu', {detail}));
    }, [contextActions, rowId]);

    return (
        <Box
            component="div"
            role="button"
            tabIndex={-1}
            data-sidebar-row={rowId}
            onClick={onClick}
            onKeyDown={handleKeyDown}
            onContextMenu={handleContextMenu}
            className="side-row"
            w={hasDepth ? `calc(100% - ${d * 16}px)` : '100%'}
            ml={d * 16}
            px={4}
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

            {/* Right slot: action buttons, status — stop propagation */}
            {right && (
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
