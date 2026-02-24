const { env } = require('./env');
const { createApp } = require('./app');

const app = createApp();

app.listen(env.PORT, '0.0.0.0', () => {
  // eslint-disable-next-line no-console
  console.log(`API listening on http://0.0.0.0:${env.PORT}`);
});

