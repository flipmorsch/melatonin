import {useSortable} from '@dnd-kit/sortable';
import {CSS} from '@dnd-kit/utilities';
import {Box} from '@mantine/core';
import {IconGripVertical} from '@tabler/icons-react';
import {ReactNode} from 'react';
import {ContextAction, SidebarRow} from './SidebarRow';

interface Props {
    id: string;
    label: string;
    left?: ReactNode;
    right?: ReactNode;
    selected?: boolean;
    depth?: number;
    onClick: () => void;
    onDelete?: () => void;
    contextActions?: ContextAction[];
}

/**
 * A SidebarRow with a grip handle for drag-and-drop reordering. The grip
 * receives the drag listeners so click-to-select still works on the row body.
 */
export function SortableSidebarRow({id, label, left, right, selected, depth, onClick, onDelete, contextActions}: Props) {
    const {
        attributes,
        listeners,
        setNodeRef,
        setActivatorNodeRef,
        transform,
        transition,
        isDragging,
    } = useSortable({id});

    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.3 : undefined,
    };

    return (
        <Box ref={setNodeRef} style={style}>
            <SidebarRow
                rowId={`${id}`}
                depth={depth}
                selected={selected}
                onClick={onClick}
                onDelete={onDelete}
                contextActions={contextActions}
                left={left}
                label={label}
                right={right}
                leading={
                    <Box
                        ref={setActivatorNodeRef}
                        {...attributes}
                        {...listeners}
                        style={{cursor: 'grab', display: 'flex', alignItems: 'center', touchAction: 'none'}}
                        className="drag-handle"
                    >
                        <IconGripVertical size={14} style={{color: 'var(--mantine-color-dark-3)'}}/>
                    </Box>
                }
            />
        </Box>
    );
}
