# Design QA — Taller

## Source visual truth

- References: the three selected workshop concepts supplied in the conversation on 2026-09-04.
- Source assets:
  - Orders: `C:\Users\luism\.codex\generated_images\019fec66-7422-7cf3-ba98-5280e81c172f\exec-98ac11eb-fc15-4147-82b6-906ca71cddc7.png`
  - Reception: `C:\Users\luism\.codex\generated_images\019fec66-7422-7cf3-ba98-5280e81c172f\exec-e0b0a773-7867-48d9-8e30-9892ef9c6ff7.png`
  - Workshop board: `C:\Users\luism\.codex\generated_images\019fec66-7422-7cf3-ba98-5280e81c172f\exec-8a355d07-b812-49e5-bf4b-fa99da7cc8f0.png`
- Reference viewport: 1487 × 1057 px, desktop web application.
- Target state: authenticated workshop dashboard with operational metrics, stage-based orders, filters, and a right-side daily rail.

## Implementation evidence

- Intended routes: `/workshop` (orders), `/workshop/reception` (reception), and `/workshop/board` (workshop board).
- Vehicle directory: `/workshop/vehicles`.
- Implementation screenshot: unavailable.
- Browser-rendered DOM, console inspection, and same-viewport screenshot: unavailable in this session because no controllable browser surface is provided.
- HTTP availability only: every intended route plus `/workshop/vehicles`, `/pos`, and `/settings/fiscal-sequences` returned HTTP 200 after the production frontend build and restart. This is not visual evidence and is not used as a fidelity pass.

## Required fidelity surfaces

The source and a browser-rendered implementation could not be placed into one comparison input. Therefore fonts/typography, spacing/layout rhythm, colors/tokens, image/icon fidelity, and visible copy/content have not been visually assessed for pass/fail.

## Findings

- [P1] Visual comparison is blocked.
  - Location: `/workshop` desktop view.
  - Evidence: the selected reference is available, but there is no implementation screenshot at the same viewport and authenticated state.
  - Impact: fidelity to the selected operational table layout cannot be verified.
  - Fix: capture an authenticated desktop screenshot of `/workshop`, compare it alongside the selected reference, then correct any P1/P2 differences.

## Open questions

- The selected reference contains example orders and mechanics while the local database may be empty; the populated-state visual comparison needs safe representative data or an existing operational dataset.

## Implementation checklist

1. Open `/workshop` while authenticated at the reference desktop viewport.
2. Capture the populated order-board state and inspect the browser console.
3. Compare it with the source reference and record any P0/P1/P2 fixes.
4. Repeat capture after fixes.

## Comparison history

- No visual iteration has run because implementation capture is blocked.

**final result: blocked**
