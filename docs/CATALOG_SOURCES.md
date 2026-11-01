# Catalog discovery sources

## 2026-11-01 collection result

- Community packages: **860**, up from 152 (**708 added**).
- Root packages: **839**; explicit repository subpackages: **21**.
- Packages with original icon resources: **141**. Existing artwork is retained when optional resource retrieval fails.
- Candidate repositories across all search and directory sources: **1,231** after deduplication.
- Main broad pass checked 1,110 additional repositories, then a small supplemental pass checked five repositories / 14 explicit subpackage paths and four actual install-source repositories. All 14 explicitly requested subpackages and all four actual install-source repositories yielded valid bundle manifests.
- Every output install spec was checked for a matching full 40-hex commit SHA, correct optional `&path:/...` directory syntax, no `package.json` suffix, and unique package name.

These figures describe manifest verification, not an audit or runtime test of 860 implementations.

The catalog lists bundle packages whose own `package.json` declares `dsh.bundle.patch`. Discovery metadata is never treated as proof that a package loads or is safe. No plugin implementation, dependency installation, or package lifecycle script runs during collection.

## Sources and checked scope

| Source | Scope used in this update | How it is used |
| --- | --- | --- |
| [GitHub dsh-plugin topic](https://github.com/topics/dsh-plugin) | Repository-search star pages 3–8, supplementing the earlier top-page catalog | Candidate repositories only; root manifests are fetched again at a full Git commit. |
| [GitHub deepseek-harness topic](https://github.com/topics/deepseek-harness) | Top 100 non-fork, non-archived results by stars | Finds packages that omit the narrower topic. |
| GitHub repository-name and description searches | Recent `dsh-plugin` repositories, recently updated descriptions mentioning “DeepSeek Harness,” and descriptions containing “dsh plugins” | Adds recently created or differently named packages. |
| [HackSing directory JSON](https://raw.githubusercontent.com/HackSing/dsh-plugins/main/data/plugins.json) | All 311 directory rows inspected for repository candidates | Descriptions and directory inclusion alone do not admit a plugin. |
| [ZeroPointRepo directory JSON](https://raw.githubusercontent.com/ZeroPointRepo/awesome-dsh-plugins/main/plugins.json) | All 223 directory rows inspected, including actual Git install sources and explicit subpackage paths | An actual install repository can differ from the displayed project repository. |
| [k0ndrateff format-1 index](https://raw.githubusercontent.com/k0ndrateff/dsh-plugins/main/docs/market.json) | All 10 declared package directories in its small index | The package manifest at the checked Git commit must independently declare a bundle. |
| [dshworks registry](https://raw.githubusercontent.com/dshworks/awesome-dsh-plugins/main/data/plugins.json), [schema](https://raw.githubusercontent.com/dshworks/awesome-dsh-plugins/main/data/schema.json) | Only three previously observed explicit non-root paths used as candidates | The much larger registry was **not** exhaustively downloaded or traversed. Third-party `verified` status is not used as admission evidence. |

Exact candidate repositories and paths are retained in `scripts/catalog-extra-candidates.json` and `scripts/catalog-monorepo-candidates.json`. Search query, sort order and page are retained as per-repository discovery provenance in the research cache. Output entries retain their repository, full commit SHA and `manifestPath`; subpackages also retain `packagePath`.

## Admission and merge rules

1. Fetch public manifests without executing code. Reject ordinary repositories, missing bundle declarations, invalid package names and invalid relative patch paths.
2. Resolve a full 40-hex Git commit with bounded `git ls-remote`; reread the package manifest at that commit.
3. Use `git+https://github.com/owner/repository.git#<40-hex-sha>` for root packages. Append `&path:/packages/example` for a declared subpackage; never append `/package.json` to an install spec.
4. Keep one catalog entry per package name. Preserve the existing package and its original artwork when another repository claims the same name with weaker metadata, or when a source becomes unreachable.
5. Use only icons declared by the manifest or actual original icon resources; never substitute an author's avatar as a plugin logo. Subpackage icon paths are resolved from that package's directory.

The checked scope is bounded. Private packages, deleted repositories, non-bundle skills, unsupported hosting providers and repositories that fail network checks may be absent. A valid manifest does not prove that generated build artifacts are present, that a plugin supports the running Harness version, or that its implementation has been reviewed. The Harness host still owns compatibility and installation checks.

## Reproduce

```powershell
# Broad public searches plus curated root and subpackage candidates:
python scripts/expand-community.py

# Reuse the saved search candidates without issuing new GitHub searches:
python scripts/expand-community.py --skip-search

# Short pass restricted to explicit monorepo candidates:
python scripts/expand-community.py --monorepo-only

# Optional additional original-artwork discovery:
python scripts/enrich-logos.py

# Refresh categories using the application's nine-category classifier:
npx tsx scripts/normalize-catalog.ts
```

GitHub APIs have unauthenticated quotas. Failed discovery requests retain the existing catalog. Optional locale and icon lookups have shorter deadlines than package verification. Every source is public; no token, personal settings or local workspace file is uploaded.
