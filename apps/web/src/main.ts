import { createPinia } from 'pinia';
import { createApp } from 'vue';
import App from './App.vue';
import { router } from './app/router';
import './shared/styles/main.css';

const app = createApp(App);

app.use(createPinia());
app.use(router);

void router.isReady().then(() => {
  app.mount('#app');
});
