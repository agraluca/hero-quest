import './style.css';
import { Game } from './core/Game';
import { loadModels } from './game/models';

const app = document.getElementById('app')!;
const canvas = document.getElementById('scene') as HTMLCanvasElement;
const ui = document.getElementById('ui')!;

// tiny loading indicator while the KayKit models (~1.8 MB, all local) load
const loading = document.createElement('div');
loading.className = 'loading';
loading.innerHTML = '<img src="./fox.webp" alt="" /><div class="bar"><i></i></div>';
ui.append(loading);
const bar = loading.querySelector('i') as HTMLElement;

await loadModels((done, total) => {
  bar.style.width = `${(done / total) * 100}%`;
});
loading.remove();

const game = new Game(app, canvas, ui);
game.start();
