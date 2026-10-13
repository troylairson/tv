import { render } from 'preact';
import { App } from './App';
import { Manager } from './manage/Manager';
import './styles.css';
import './manage/manage.css';

const isManager = location.pathname === '/manage' || location.pathname.startsWith('/manage/');
if (isManager) {
  document.documentElement.classList.add('manage');
  document.body.classList.add('manage');
  document.title = 'Retro TV · Channel manager';
}
render(isManager ? <Manager /> : <App />, document.getElementById('app')!);
