import './style.css';
import { App } from './1-app/App';

const canvas: HTMLCanvasElement = <HTMLCanvasElement>document.getElementById('canvas');

async function main() {
  const app = await App.create(canvas);
  app.run();
}

main()