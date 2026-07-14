import {useCallback, useReducer, useRef} from 'react';
import {main} from '../../wailsjs/go/models';
import {KVRow, newKVRow, rowsFromKV, rowsToKV} from '../components/KVEditor';

// ── Tab state ──

export interface TabState {
    tabId: string;
    type: 'saved' | 'scratch' | 'history';

    // identity
    colId: string | null;
    reqId: string | null;
    histId: string | null;
    label: string; // shown in the tab strip

    // editor fields
    name: string;
    method: string;
    url: string;
    params: KVRow[];
    headers: KVRow[];
    body: string;
    authType: string;
    authToken: string;
    authUser: string;
    authPass: string;
    timeoutSec: number | string;
    noRedirects: boolean;
    skipTls: boolean;
    preScript: string;
    postScript: string;
    open: string[]; // accordion expansion

    // response
    response: main.ResponseData | null;
    error: string;
    sending: boolean;
    saveState: 'saved' | 'dirty' | 'saving';
}

export interface TabsState {
    tabs: TabState[];
    activeIdx: number;
    nextId: number;
}

// ── Actions ──

export type TabAction =
    | {type: 'OPEN_SAVED'; colId: string; req: main.SavedRequest}
    | {type: 'OPEN_SCRATCH'}
    | {type: 'OPEN_HISTORY'; entry: main.HistoryEntry}
    | {type: 'CLOSE_TAB'; tabIdx: number}
    | {type: 'SET_ACTIVE'; idx: number}
    | {type: 'UPDATE_FIELD'; field: string; value: unknown}
    | {type: 'LOAD_FIELDS'; r: main.SavedRequest | main.RequestInput}
    | {type: 'SET_RESPONSE'; response: main.ResponseData | null}
    | {type: 'SET_ERROR'; error: string}
    | {type: 'SET_SENDING'; sending: boolean}
    | {type: 'SET_SAVE_STATE'; saveState: 'saved' | 'dirty' | 'saving'}
    | {type: 'SET_ACCORDION'; open: string[]};

// ── Helpers ──

let nextScratchId = 0;

function newScratchTab(tabId: string): TabState {
    return {
        tabId,
        type: 'scratch',
        colId: null,
        reqId: null,
        histId: null,
        label: 'Scratch',
        name: '',
        method: 'GET',
        url: '',
        params: [newKVRow()],
        headers: [newKVRow()],
        body: '',
        authType: '',
        authToken: '',
        authUser: '',
        authPass: '',
        timeoutSec: 0,
        noRedirects: false,
        skipTls: false,
        preScript: '',
        postScript: '',
        open: ['params', 'headers'],
        response: null,
        error: '',
        sending: false,
        saveState: 'saved',
    };
}

function savedTabFrom(tabId: string, colId: string, req: main.SavedRequest): TabState {
    return {
        tabId,
        type: 'saved',
        colId,
        reqId: req.id,
        histId: null,
        label: req.name || req.url || 'Untitled',
        name: req.name,
        method: req.method,
        url: req.url,
        params: rowsFromKV(req.params),
        headers: rowsFromKV(req.headers),
        body: req.body,
        authType: req.auth?.type ?? '',
        authToken: req.auth?.token ?? '',
        authUser: req.auth?.username ?? '',
        authPass: req.auth?.password ?? '',
        timeoutSec: req.options?.timeoutSec || 0,
        noRedirects: req.options?.noFollowRedirects ?? false,
        skipTls: req.options?.skipTlsVerify ?? false,
        preScript: req.preRequestScript ?? '',
        postScript: req.postResponseScript ?? '',
        open: [
            ...(req.params?.length ? ['params'] : []),
            ...(req.headers?.length || req.auth?.type ? ['headers'] : []),
            ...(req.body ? ['body'] : []),
            ...(req.options?.timeoutSec || req.options?.noFollowRedirects || req.options?.skipTlsVerify
                ? ['options'] : []),
            ...(req.preRequestScript ? ['pre-script'] : []),
            ...(req.postResponseScript ? ['post-script'] : []),
        ],
        response: null,
        error: '',
        sending: false,
        saveState: 'saved',
    };
}

function historyTabFrom(tabId: string, entry: main.HistoryEntry): TabState {
    const r = entry.request;
    return {
        tabId,
        type: 'history',
        colId: null,
        reqId: null,
        histId: entry.id,
        label: `${r.method} ${r.url.split('?')[0]}`,
        name: '',
        method: r.method,
        url: r.url,
        params: rowsFromKV(r.params),
        headers: rowsFromKV(r.headers),
        body: r.body,
        authType: r.auth?.type ?? '',
        authToken: r.auth?.token ?? '',
        authUser: r.auth?.username ?? '',
        authPass: r.auth?.password ?? '',
        timeoutSec: r.options?.timeoutSec || 0,
        noRedirects: r.options?.noFollowRedirects ?? false,
        skipTls: r.options?.skipTlsVerify ?? false,
        preScript: r.preRequestScript ?? '',
        postScript: r.postResponseScript ?? '',
        open: [],
        response: entry.response ?? null,
        error: entry.error ?? '',
        sending: false,
        saveState: 'saved',
    };
}

function updateActiveTab(state: TabsState, patch: Partial<TabState>): TabsState {
    if (state.activeIdx < 0) return state;
    const cur = state.tabs[state.activeIdx] as unknown as Record<string, unknown>;
    // No-op patches return the same state so React skips the re-render —
    // the auto-save effect re-dispatches 'dirty' on every keystroke.
    if (Object.entries(patch).every(([k, v]) => Object.is(cur[k], v))) return state;
    const tabs = [...state.tabs];
    tabs[state.activeIdx] = {...tabs[state.activeIdx], ...patch};
    return {...state, tabs};
}

// ── Reducer ──

function tabsReducer(state: TabsState, action: TabAction): TabsState {
    switch (action.type) {
        case 'OPEN_SCRATCH': {
            // If a scratch tab already exists, focus it.
            const existing = state.tabs.findIndex(t => t.type === 'scratch');
            if (existing >= 0) return {...state, activeIdx: existing};
            const id = `scratch-${++nextScratchId}`;
            const tab = newScratchTab(id);
            return {
                tabs: [tab, ...state.tabs],
                activeIdx: 0,
                nextId: state.nextId + 1,
            };
        }
        case 'OPEN_SAVED': {
            // Dedup: if already open, focus it.
            const existing = state.tabs.findIndex(
                t => t.type === 'saved' && t.colId === action.colId && t.reqId === action.req.id,
            );
            if (existing >= 0) return {...state, activeIdx: existing};
            const id = `tab-${state.nextId}`;
            const tab = savedTabFrom(id, action.colId, action.req);
            return {
                tabs: [...state.tabs, tab],
                activeIdx: state.tabs.length,
                nextId: state.nextId + 1,
            };
        }
        case 'OPEN_HISTORY': {
            const existing = state.tabs.findIndex(
                t => t.type === 'history' && t.histId === action.entry.id,
            );
            if (existing >= 0) return {...state, activeIdx: existing};
            const id = `hist-${state.nextId}`;
            const tab = historyTabFrom(id, action.entry);
            return {
                tabs: [...state.tabs, tab],
                activeIdx: state.tabs.length,
                nextId: state.nextId + 1,
            };
        }
        case 'CLOSE_TAB': {
            if (state.tabs.length === 0) return state;
            const tabs = [...state.tabs];
            tabs.splice(action.tabIdx, 1);
            // If we closed the active tab (or one before it), pick the nearest.
            let activeIdx = state.activeIdx;
            if (tabs.length === 0) {
                // All closed — auto-open a scratch tab.
                const id = `scratch-${++nextScratchId}`;
                return {
                    tabs: [newScratchTab(id)],
                    activeIdx: 0,
                    nextId: state.nextId,
                };
            }
            if (action.tabIdx <= state.activeIdx) {
                activeIdx = Math.min(state.activeIdx, tabs.length - 1);
                if (action.tabIdx < state.activeIdx) activeIdx = state.activeIdx - 1;
            }
            return {...state, tabs, activeIdx: Math.max(0, activeIdx)};
        }
        case 'SET_ACTIVE':
            return {...state, activeIdx: action.idx};
        case 'UPDATE_FIELD':
            return updateActiveTab(state, {[action.field]: action.value, saveState: 'dirty'});
        case 'LOAD_FIELDS': {
            const r = action.r;
            return updateActiveTab(state, {
                method: r.method,
                url: r.url,
                params: rowsFromKV(r.params),
                headers: rowsFromKV(r.headers),
                body: r.body,
                authType: r.auth?.type ?? '',
                authToken: r.auth?.token ?? '',
                authUser: r.auth?.username ?? '',
                authPass: r.auth?.password ?? '',
                timeoutSec: r.options?.timeoutSec || 0,
                noRedirects: r.options?.noFollowRedirects ?? false,
                skipTls: r.options?.skipTlsVerify ?? false,
                preScript: r.preRequestScript ?? '',
                postScript: r.postResponseScript ?? '',
                saveState: 'saved',
            });
        }
        case 'SET_RESPONSE':
            return updateActiveTab(state, {response: action.response});
        case 'SET_ERROR':
            return updateActiveTab(state, {error: action.error});
        case 'SET_SENDING':
            return updateActiveTab(state, {sending: action.sending});
        case 'SET_SAVE_STATE':
            return updateActiveTab(state, {saveState: action.saveState});
        case 'SET_ACCORDION':
            return updateActiveTab(state, {open: action.open});
        default:
            return state;
    }
}

// ── Hook ──

export function useTabs() {
    const initId = `scratch-${++nextScratchId}`;
    const [state, dispatch] = useReducer(tabsReducer, {
        tabs: [newScratchTab(initId)],
        activeIdx: 0,
        nextId: 1,
    } as TabsState);

    const active = state.activeIdx >= 0 ? state.tabs[state.activeIdx] : null;

    // Auto-save pending timer (mirrors the old RequestView pattern)
    const pendingRef = useRef<{
        timer: number;
        tabIdx: number;
        colId: string;
        req: main.SavedRequest;
    } | null>(null);

    // Flag to skip auto-save on the first load (mirrors old justLoaded)
    const justLoadedRef = useRef(false);

    const flushPending = useCallback(
        (onSave: (colId: string, req: main.SavedRequest) => Promise<unknown>) => {
            if (!pendingRef.current) return;
            clearTimeout(pendingRef.current.timer);
            const {colId, req} = pendingRef.current;
            pendingRef.current = null;
            onSave(colId, req).catch(console.error);
        },
        [],
    );

    return {state, active, dispatch, pendingRef, justLoadedRef, flushPending};
}
