/** Mock server run state: gray when stopped, glowing night-light when running.
 *  Colour + glow are reinforced with an accessible label so the state isn't
 *  conveyed by colour alone (matters under reduced-motion and for SR users). */
export function RunDot({on}: {on: boolean}) {
    return (
        <span className={`dot ${on ? 'on' : ''}`} role="img" aria-label={on ? 'running' : 'stopped'}>●</span>
    );
}
