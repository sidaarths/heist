/**
 * RulesPanel — role-specific HOW TO PLAY briefing shown in the lobby.
 *
 * Render <RulesPanel role={me?.role} /> inside a collapsible container.
 * Shows general overview when role is unassigned/undefined, otherwise
 * shows role-specific controls, objectives, and watchouts.
 */
import type { PlayerRole } from '@heist/shared'

// ─── Design tokens (match Lobby.tsx) ─────────────────────────────────────────
const B = '#00cfff'
const G = '#00ff88'
const R = '#ff003c'
const P = '#bf00ff'
const D = '#4a7a4a'

// ─── Shared helpers ───────────────────────────────────────────────────────────
function RulesRow({ icon, text, col = '#7aaa7a' }: { icon: string; text: string; col?: string }) {
  return (
    <div style={{ display: 'flex', gap: '8px', marginBottom: '5px', alignItems: 'flex-start' }}>
      <span style={{ color: col, flexShrink: 0 }}>{icon}</span>
      <span style={{ color: '#8ab88a' }}>{text}</span>
    </div>
  )
}

function SectionHeader({ label, col }: { label: string; col: string }) {
  return (
    <div style={{ color: col, marginBottom: '8px', letterSpacing: '2px', fontSize: '15px' }}>
      {label}
    </div>
  )
}

// ─── Role panels ──────────────────────────────────────────────────────────────
function RulesGeneral() {
  return (
    <div>
      <SectionHeader label="OVERVIEW" col={B} />
      <RulesRow icon="◈" text="1 Security officer vs up to 4 Thieves." col={B} />
      <RulesRow icon="◈" text="Thieves steal 3 loot items from rooms and escape through the EXIT." col={P} />
      <RulesRow icon="◈" text="Security must catch every thief before they escape." col={R} />
      <div style={{ color: D, marginTop: '8px', letterSpacing: '2px', fontSize: '15px' }}>
        SELECT A ROLE TO SEE YOUR BRIEFING
      </div>
    </div>
  )
}

function RulesThief() {
  return (
    <div>
      <SectionHeader label="THIEF BRIEFING" col={P} />
      <RulesRow icon="▶" text="Steal 3 loot items — they auto-pickup when you walk close." col={G} />
      <RulesRow icon="▶" text="Reach the EXIT tile while carrying loot to win." col={G} />
      <RulesRow icon="▶" text="Each item you carry slows you down — 3 is the max." col={P} />
      <SectionHeader label="CONTROLS" col={B} />
      <RulesRow icon="⌨" text="WASD or Arrow Keys to move." col={B} />
      <RulesRow icon="⌨" text="Click a locked door nearby to pick the lock (4 sec)." col={B} />
      <RulesRow icon="⌨" text="Click a camera nearby to destroy it (5 sec) before it spots you." col={B} />
      <RulesRow icon="⌨" text="Click an alarm panel (!) to disable an active alarm." col={B} />
      <SectionHeader label="WATCH OUT" col={R} />
      <RulesRow icon="!" text="Camera spots you → alarm triggers. Disable it or the timer shrinks fast." col={R} />
      <RulesRow icon="!" text="Guard within 1.5 tiles → frozen for 5 seconds." col={R} />
    </div>
  )
}

function RulesSecurity() {
  return (
    <div>
      <SectionHeader label="SECURITY BRIEFING" col={B} />
      <RulesRow icon="▶" text="You see the entire map — thieves only see a limited radius." col={B} />
      <RulesRow icon="▶" text="Freeze thieves by deploying a guard near them (1.5-tile range)." col={B} />
      <RulesRow icon="▶" text="Win by catching all thieves before any escape with 3 loot." col={R} />
      <SectionHeader label="ABILITIES" col={B} />
      <RulesRow icon="◉" text="CUT LIGHTS — blinds all thieves for 8 seconds (3 uses per game)." col={P} />
      <RulesRow icon="◉" text="TRIGGER ALARM — activates the alarm immediately; shrinks escape timer." col={R} />
      <RulesRow icon="◉" text="Cameras auto-alert when thieves walk into their field of view." col={B} />
    </div>
  )
}

// ─── Public component ─────────────────────────────────────────────────────────
export function RulesPanel({ role }: { role: PlayerRole | undefined }) {
  return (
    <div style={{
      padding: '14px 16px',
      background: '#06080f',
      border: `1px solid ${B}22`,
      fontSize: '17px', lineHeight: '1.6',
      fontFamily: "'VT323', monospace",
    }}>
      {(!role || role === 'unassigned') && <RulesGeneral />}
      {role === 'thief'    && <RulesThief />}
      {role === 'security' && <RulesSecurity />}
    </div>
  )
}
