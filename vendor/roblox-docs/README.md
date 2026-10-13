# Roblox Creator Docs index

`chunks.json.gz` is a search index of the [Roblox Creator Docs](https://create.roblox.com/docs) (English guides and the Engine API reference), used by Roblox Studio mode's `roblox_docs` tool (`src/lib/studio/roblox-docs.ts`, answered by `/api/studio/docs`).

- **Source:** https://github.com/Roblox/creator-docs. The commit is recorded inside the file (`commit`) and shown in every lookup.
- **Licence:** the documentation is © Roblox Corporation under [Creative Commons Attribution 4.0](https://creativecommons.org/licenses/by/4.0/) (`LICENSE`), and its code samples are under the MIT licence (`LICENSE-CODE`). The text is reformatted into sections (links and images removed, cross-references simplified). It is not otherwise changed, and every result links back to its page on create.roblox.com.

## Rebuild

```bash
git clone --depth 1 --filter=blob:none --sparse https://github.com/Roblox/creator-docs.git
git -C creator-docs sparse-checkout set --no-cone "/content/en-us/**/*.md" "/content/en-us/reference/engine/**/*.yaml" "/LICENSE*"
node scripts/build-roblox-docs.mjs creator-docs
```

Rebuild when Roblox ships API changes. The tests in `tests/studio-roblox-docs.test.ts` check the result.
