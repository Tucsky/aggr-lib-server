import dotenv from 'dotenv'
import Koa from 'koa'
import Router from 'koa-router'
import cors from '@koa/cors';
import serve from 'koa-static';
import { koaBody } from 'koa-body'
import { fileURLToPath } from 'url';
import path, { dirname } from 'path';
import { isValidSignature } from './utils.js'
import { processCommits } from './sync.js'
import { getMetadata } from './metadata.js'

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config()

const app = new Koa()

app.use(cors({
  origin: process.env.ORIGIN,
  allowMethods: ['GET', 'POST'],
}));

const router = new Router()

router.post(
  '/webhook',
  koaBody({
    includeUnparsed: true,
  }),
  async (ctx) => {
    if (!isValidSignature(ctx)) {
      ctx.status = 401
      return
    }

    const payload = JSON.parse(ctx.request.body.payload)

    if (payload && payload.commits) {
      processCommits(payload.commits)
    }

    ctx.status = 200
  }
)

router.get('/library/:path*', async (ctx) => {
  const basePath = ctx.params.path;

  if (!basePath) {
    ctx.status = 400;
    ctx.body = 'Metadata path is required';
    return
  }

  try {
    const metadata = await getMetadata(basePath);

    ctx.body = metadata;
    ctx.type = 'application/json';
  } catch (error) {
    ctx.status = 500;
    ctx.body = 'Error retrieving metadata';
    console.error('Error in /metadata route:', error);
  }
});

app.use(serve(path.join(__dirname, '/static')));

app.use(router.routes()).use(router.allowedMethods())

const PORT = process.env.PORT || 3000
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`)
})
