export type Category = 'all' | 'coding' | 'productivity' | 'knowledge' | 'creative' | 'integration' | 'interface' | 'models' | 'automation' | 'data';
export type Origin = 'official' | 'github' | 'index';
export interface Plugin {
  id: string; name: string; description: string; author: string; category: Category;
  origin: Origin; url: string; spec?: string; version?: string; stars?: number;
  updatedAt?: string; tags: string[]; color: string; icon: string;
  featured?: boolean; verified?: boolean; sourceName?: string; commit?: string;
  logo?: string; logoSource?: string; logoKind?: 'manifest' | 'repository' | 'host' | 'index';
  engines?: string; license?: string;
  registry?: string;
}
export interface Bundle {
  name: string; official: boolean; availability: 'installation' | 'profile' | 'missing';
  installed: boolean; enabled: boolean; optional: boolean; removable: boolean; updatable: boolean;
  version?: string; description?: string; listedByDefault?: boolean; source?: string;
  installTarget?: { spec: string; version: string };
  meta?: { title?: Localized; description?: Localized; icon?: string }; readOnlyReason?: string;
  error?: { code: string; reason?: string }; rows: { rowId: string; moduleName: string }[];
}
export type Localized = string | Record<string, string>;
export interface ChangeResult {
  application: 'applied' | 'restart-required' | 'overridden' | 'failed' | 'cancelled';
  changed: boolean; error?: { code: string; reason?: string }; packageResult?: { output: string; kind?: string };
  pendingBuilds?: string[]; bundle?: string;
}
export interface Version { version: string; prerelease: boolean; bundle: boolean; incompatible?: unknown; deprecated?: string }
export interface Manager {
  listBundles(): Promise<Bundle[]>;
  inspect(spec: string, options?: { registry?: string }): Promise<{ status: 'accepted' | 'refused'; reason?: string; name?: string; version?: string; bundle?: boolean | null }>;
  installBundle(spec: string, options?: { enabled?: boolean; saveExact?: boolean; requestId?: string; registry?: string }): Promise<ChangeResult>;
  setBundleEnabled(name: string, enabled: boolean): Promise<ChangeResult>;
  removeBundle(name: string): Promise<ChangeResult>;
  listVersions(name: string): Promise<{ status: 'listed' | 'refused'; reason?: string; registry?: string | null; versions?: Version[] }>;
  updateBundle(name: string, version: string, options?: { registry?: string | null; requestId?: string }): Promise<{ result: ChangeResult; restore?: ChangeResult }>;
}
export interface Bridge {
  mode: 'harness' | 'preview'; manager?: Manager;
  subscribe?(event: string, callback: (data: any) => void): () => void;
  openNative?(name: string): void;
}
export interface Source { id: string; name: string; url: string; enabled: boolean }
