/** Mock server run state: gray when stopped, glowing night-light when running. */
export function RunDot({on}: {on: boolean}) {
    return <span className={`dot ${on ? 'on' : ''}`}>●</span>;
}
