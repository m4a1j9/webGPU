import './style.css';
import { App } from './1-app/App';

const canvas: HTMLCanvasElement = <HTMLCanvasElement>document.getElementById('canvas');
const startButton: HTMLButtonElement = <HTMLButtonElement>document.getElementById('startButton');

async function main() {
  const app = await App.create(canvas);

  startButton.onclick = app.run.bind(app);

  app.renderFirstFrame();
}

main()