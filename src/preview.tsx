import { createRoot } from 'react-dom/client';
import { App } from './App';
import './styles.css';
import './paper.css';
const bridge = { mode: 'preview' as const };
createRoot(document.getElementById('root')!).render(<App bridge={bridge}/>);
