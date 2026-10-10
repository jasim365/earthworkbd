<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

## Architecture rules
- `src/lib/earthwork/calc.ts` is the locked calculation engine; every other layer (UI, store, import/export, charts, reports) only calls it and never duplicates its formulas — the user requires calculation results to stay identical unless they explicitly approve a change.
- `src/lib/earthwork/__tests__/calc-baseline.test.ts` must pass unchanged (`bun test src/lib/earthwork`) — it proves quantities are identical to the approved baseline.
- Cross-section interaction uses d3-zoom on a canvas with fixed axes; drawing and export are presentation-only and consume the locked engine's profiles/interpolation/results to prevent calculation drift.
