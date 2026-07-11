import {useState} from 'react';
import {ScrollArea} from '@mantine/core';
import {main} from '../../../wailsjs/go/models';
import {CollectionsSection} from './CollectionsSection';
import {MocksSection} from './MocksSection';
import {HistorySection} from './HistorySection';

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

    history: main.HistoryEntry[];
    selectedHistoryId: string | null;
    onSelectHistory: (e: main.HistoryEntry) => void;
    onClearHistory: () => void;
}

export function Sidebar(p: Props) {
    const [historyCollapsed, setHistoryCollapsed] = useState(false);
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
            <HistorySection
                entries={p.history}
                selectedId={p.selectedHistoryId}
                collapsed={historyCollapsed}
                onToggle={() => setHistoryCollapsed(c => !c)}
                onSelect={p.onSelectHistory}
                onClear={p.onClearHistory}
            />
        </ScrollArea>
    );
}
