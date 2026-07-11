import {ScrollArea} from '@mantine/core';
import {main} from '../../../wailsjs/go/models';
import {CollectionsSection} from './CollectionsSection';
import {MocksSection} from './MocksSection';

interface Props {
    collections: main.Collection[];
    selectedReqId: string | null;
    onSelectRequest: (colId: string, req: main.SavedRequest) => void;
    onCreateCollection: (name: string) => void;
    onDeleteCollection: (id: string) => void;
    onAddRequest: (colId: string) => void;
    onDeleteRequest: (colId: string, reqId: string) => void;

    mocks: main.MockServer[];
    running: Record<string, number>;
    selectedMockId: string | null;
    selectedRouteId: string | null;
    onSelectMock: (m: main.MockServer) => void;
    onAddMock: () => void;
    onDeleteMock: (id: string) => void;
    onSelectRoute: (m: main.MockServer, routeId: string) => void;
    onAddRoute: (m: main.MockServer) => void;
    onDeleteRoute: (m: main.MockServer, routeId: string) => void;
}

export function Sidebar(p: Props) {
    return (
        <ScrollArea h="100%" p="xs" type="never">
            <CollectionsSection
                collections={p.collections}
                selectedReqId={p.selectedReqId}
                onSelect={p.onSelectRequest}
                onCreate={p.onCreateCollection}
                onDelete={p.onDeleteCollection}
                onAddRequest={p.onAddRequest}
                onDeleteRequest={p.onDeleteRequest}
            />
            <MocksSection
                mocks={p.mocks}
                running={p.running}
                selectedMockId={p.selectedMockId}
                selectedRouteId={p.selectedRouteId}
                onSelect={p.onSelectMock}
                onAdd={p.onAddMock}
                onDelete={p.onDeleteMock}
                onSelectRoute={p.onSelectRoute}
                onAddRoute={p.onAddRoute}
                onDeleteRoute={p.onDeleteRoute}
            />
        </ScrollArea>
    );
}
