'use strict';
/**
 * 应用入口：装配中间件与路由
 * 顺序：body 解析 → 身份装载 → 业务路由 → 静态资源
 */
const path = require('node:path');
const { App, parseBody } = require('./lib/http');
const { attachUser } = require('./lib/auth');

const app = new App({ publicDir: path.resolve(__dirname, '..', 'public') });

app.use(parseBody);
app.use(attachUser);

require('./routes/auth')(app);
require('./routes/items')(app);
require('./routes/orders')(app);
require('./routes/messages')(app);
require('./routes/common')(app);

const PORT = Number(process.env.PORT) || 3000;
const HOST = process.env.HOST || '127.0.0.1'; // 云部署时设 HOST=0.0.0.0

if (require.main === module) {
  app.listen(PORT, HOST);
}

module.exports = { app, PORT };
