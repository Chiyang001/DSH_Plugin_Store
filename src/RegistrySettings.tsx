import { useState } from 'react';
import { Icon } from './icons';
import { mirrorRegistry, officialRegistry, normalizeRegistry, registrySettings, selectedRegistry, type RegistryMode, type RegistrySettings as Settings } from './registry';

export function RegistrySettings({ value, onSave, busy }: { value: Settings; onSave: (settings: Settings) => void; busy: boolean }) {
  const [mode, setMode] = useState<RegistryMode>(value.mode);
  const [customUrl, setCustomUrl] = useState(value.customUrl);
  const [error, setError] = useState('');
  return <section className="store-registry-section" aria-labelledby="store-registry-heading">
    <div className="store-section-heading"><div><h2 id="store-registry-heading"><Icon name="download" size={21}/>插件安装源</h2><p className="store-section-description">选择下载 npm 插件与依赖时使用的镜像，每次只启用一个。</p></div></div>
    <form className="store-registry-panel" onSubmit={event => {
      event.preventDefault();
      try {
        const url = mode === 'custom' ? normalizeRegistry(customUrl) : registrySettings({ mode, customUrl }).customUrl;
        if (mode === 'custom' && !url) throw new Error('请填写自定义安装源地址。');
        const settings = { mode, customUrl: url }; setCustomUrl(url); setError(''); onSave(settings);
      } catch (error) { setError(error instanceof Error ? error.message : String(error)); }
    }}>
      <fieldset disabled={busy}>
        <legend className="store-sr-only">插件安装镜像</legend>
        {[{ id: 'mirror', label: '中国大陆镜像源', url: mirrorRegistry }, { id: 'official', label: 'npm 官方源', url: officialRegistry }, { id: 'custom', label: '自定义地址', url: '' }].map(option => <div className={`store-registry-option ${mode === option.id ? 'selected' : ''}`} key={option.id}>
          <label className="store-registry-choice"><input type="radio" name="store-install-registry" value={option.id} checked={mode === option.id} onChange={() => { setMode(option.id as RegistryMode); setError(''); }}/><span>{option.label}</span>{option.id === 'mirror' && <span className="store-badge">默认</span>}{option.url && <code>{new URL(option.url).hostname}</code>}</label>
          {option.id === 'custom' && <div className="store-registry-custom"><input aria-label="自定义安装源地址" aria-describedby="store-registry-note" aria-invalid={!!error} type="text" inputMode="url" placeholder="https://npm.example.com/" disabled={mode !== 'custom'} value={customUrl} onChange={event => { setCustomUrl(event.target.value); setError(''); }}/><p id="store-registry-note">支持 http:// 或 https:// 内网及私有 npm 源。需要登录时，请将凭据配置在本机 ~/.npmrc 中。</p></div>}
        </div>)}
      </fieldset>
      {error && <p className="store-registry-error" role="alert">{error}</p>}
      <div className="store-registry-save"><span>当前生效 <code>{selectedRegistry(value)}</code></span><button className="store-button primary" disabled={busy} type="submit"><Icon name="check" size={15}/>保存安装源</button></div>
      <p className="store-registry-footnote">用于本商店发起的安装；订阅目录指定了专用安装源时，优先使用目录中的地址。GitHub 仓库本身仍通过 GitHub 下载。</p>
    </form>
  </section>;
}
