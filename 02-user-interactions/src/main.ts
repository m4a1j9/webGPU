import { App } from "./control/app";

const canvas : HTMLCanvasElement = <HTMLCanvasElement> document.getElementById("canvas");

const app = new App(canvas);
app.InitializeRenderer();
app.run();
