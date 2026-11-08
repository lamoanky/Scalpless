import { defineConfig } from "vite";
import {resolve} from 'node:path';
export default defineConfig({
  base: "./",
  build: { chunkSizeWarningLimit: 5500, rolldownOptions:{input:{main:resolve(import.meta.dirname,'index.html'),gestures:resolve(import.meta.dirname,'gesture-lab.html')}} },
});
