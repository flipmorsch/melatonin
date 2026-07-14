import {useMemo} from 'react';
import {ActionIcon, Code, Group, Paper, ScrollArea, Text, VisuallyHidden} from '@mantine/core';
import {IconCopy} from '@tabler/icons-react';
import {ClipboardSetText} from '../../../wailsjs/runtime/runtime';
import {main} from '../../../wailsjs/go/models';
import {headersToLines, isJsonBody, prettyBody} from '../../lib/kv';
import {CodeEditor} from '../../components/CodeEditor';

/** Turn a raw Go transport error into one line of guidance. Returns null when
 *  nothing matches, so the caller keeps the raw text as the technical detail. */
function humanizeSendError(raw: string): string | null {
    const s = raw.toLowerCase();
    if (s.includes('connection refused')) return 'Connection refused — is a server listening at that URL?';
    if (s.includes('no such host') || s.includes('server misbehaving'))
        return "Can't resolve the host — check the domain in the URL.";
    if (s.includes('deadline exceeded') || s.includes('timeout') || s.includes('timed out'))
        return 'Request timed out — the server took too long to respond.';
    if (s.includes('x509') || s.includes('certificate') || s.includes('tls'))
        return 'TLS certificate error — turn on "Skip TLS verify" in Options for a local or self-signed server.';
    if (s.includes('unsupported protocol scheme') || s.includes('missing protocol scheme'))
        return 'Add http:// or https:// to the URL.';
    return null;
}

interface Props {
    response: main.ResponseData | null;
    error: string;
    /** Drops the Paper wrapper when rendered inside an accordion panel. */
    compact?: boolean;
}

export function ResponseViewer({response, error, compact}: Props) {
    // Pretty-printing parses up to 5 MB of JSON — memoized so the per-keystroke
    // re-renders of RequestView don't redo it while a response is on screen.
    const pretty = useMemo(() => response ? prettyBody(response) : '', [response]);
    const errorHint = error ? humanizeSendError(error) : null;

    const body = (
        <>
            {/* Announce the outcome to screen readers when it changes. */}
            <VisuallyHidden role="status" aria-live="polite">
                {response
                    ? `Response ${response.status} ${response.statusText}, ${response.durationMs} milliseconds, ${response.size} bytes`
                    : ''}
            </VisuallyHidden>
            {error &&
                <div role="alert">
                    <Text size="sm" fw={600} c="red.4">{errorHint ?? 'Request failed'}</Text>
                    <Text size="xs" ff="monospace" c="dark.2" mt={errorHint ? 2 : 0}
                        style={{whiteSpace: 'pre-wrap'}}>{error}</Text>
                </div>}
            {response && <>
                {response.finalUrl &&
                    <Text size="xs" ff="monospace" c="dark.2" mb={4} truncate
                        title={response.finalUrl}>
                        {response.finalUrl}
                    </Text>}
                <Group gap="md" mb="xs" ff="monospace" fz="sm">
                    <Text ff="monospace" fz="sm" fw={700}
                        c={response.status < 400 ? 'teal.4' : 'red.4'}>
                        {response.status < 400 ? '\u2713' : '\u2717'} {response.status} {response.statusText}
                    </Text>
                    <Text ff="monospace" fz="sm" c="dark.2">{response.durationMs} ms</Text>
                    <Text ff="monospace" fz="sm" c="dark.2">{response.size} B</Text>
                    {response.truncated &&
                        <Text ff="monospace" fz="sm" c="red.4">truncated at 20 MB</Text>}
                    <ActionIcon size="sm" variant="subtle" color="gray" ml="auto"
                        title="Copy response body"
                        onClick={() => ClipboardSetText(pretty)}><IconCopy size={15}/></ActionIcon>
                </Group>
                <details className="resp-headers">
                    <summary style={{cursor: 'pointer', color: 'var(--mantine-color-dark-2)', fontSize: 'var(--mantine-font-size-sm)'}}>
                        Headers ({Object.keys(response.headers).length})
                    </summary>
                    <Code block bg="transparent" c="dark.2" fz="sm">
                        {headersToLines(response.headers)}
                    </Code>
                </details>
                {isJsonBody(response)
                    ? <CodeEditor
                        value={pretty}
                        readOnly variant="fill" json fold
                        style={{flex: 1, minHeight: 0, marginTop: 4}}
                    />
                    : <ScrollArea style={{flex: 1, minHeight: 0}} type="auto">
                        <Code block bg="transparent" c="dark.0" fz="sm" style={{lineHeight: 1.55}}>
                            {response.body}
                        </Code>
                    </ScrollArea>}
            </>}
            {!response && !error &&
                <Text size="sm" c="dark.2">Send a request to see the response here</Text>}
        </>
    );

    if (compact) return body;

    return (
        <Paper withBorder radius="lg" p="sm" bg="dark.6"
            style={{flex: 1, minHeight: 0, minWidth: 0, display: 'flex', flexDirection: 'column'}}>
            {body}
        </Paper>
    );
}
