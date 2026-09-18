# Design QA — Cotización OT: carrito y asistente de daños

## Source visual truth

- Source: las dos capturas adjuntas por el usuario en la conversación actual.
- Source pixel dimensions: 1041 × 727 px y 1070 × 512 px.
- Intended viewport: aplicación web de escritorio, modal de orden de trabajo.
- Target state: cotización editable con buscadores, carrito con partidas y mapa de daños con una zona seleccionada.

## Implementation evidence

- Components: `apps/web/components/operations/workshop-view.tsx` y `apps/web/components/operations/vehicle-damage-map.tsx`.
- Route: `/workshop`, etapa Cotización de una OT editable.
- Implementation screenshot: unavailable.
- Browser-rendered DOM, interaction capture and console inspection: unavailable because this session does not expose a controllable browser surface.
- Static verification: TypeScript passed, all 14 workshop UI tests passed, and the production Next.js build completed successfully. These checks are not used as visual evidence.

## Required fidelity surfaces

Fonts and typography, spacing/layout rhythm, colors/tokens, vehicle illustration fidelity, icon fidelity, and visible copy could not be compared against a browser-rendered implementation at the same viewport and state.

## Findings

- [P1] Visual and interaction comparison is blocked.
  - Location: `/workshop`, Cotización → Mapa de daños → asistente por pasos and quote cart.
  - Evidence: source screenshots are available, but no implementation screenshot or controllable browser session is available.
  - Impact: responsive fit, modal height, cart density, focus behavior and the selected-zone summary cannot receive a visual pass.
  - Fix: capture the authenticated editable quote state, test all four steps, add one part and one service, open the cart, and compare that result with the references.

## Implementation checklist

1. Open an editable OT quotation at a 1366–1920 px desktop width.
2. Select a vehicle zone and complete Condición, Hallazgo, Nota técnica and Partidas.
3. Verify the same concepts appear in the selected-zone summary and quote cart.
4. Inspect responsive overflow, focus order and browser console.
5. Capture and compare the final state with both source screenshots.

## Comparison history

- No browser visual iteration could run in this session.

**final result: blocked**
