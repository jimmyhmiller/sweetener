import { mount } from "svelte";
import "../../macro-suite/theme.css";
import App from "./App.svelte";
mount(App, { target: document.getElementById("app")! });
