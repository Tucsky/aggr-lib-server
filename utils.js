import crypto from 'crypto'

export function isValidSignature(ctx) {
  const rawBody = ctx.request.body[Symbol.for('unparsedBody')];
  const githubSecret = process.env.GITHUB_SECRET
  const requestSignature = ctx.request.headers['x-hub-signature']
  const hmac = crypto.createHmac('sha1', githubSecret)
  const digest = 'sha1=' + hmac.update(rawBody).digest('hex')
  return crypto.timingSafeEqual(Buffer.from(digest), Buffer.from(requestSignature))
}