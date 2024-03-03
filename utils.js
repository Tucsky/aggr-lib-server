import crypto from 'crypto'

export function isValidSignature(ctx) {
  const rawBody = ctx.request.body[Symbol.for('unparsedBody')]
  const githubSecret = process.env.GITHUB_SECRET
  const requestSignature = ctx.request.headers['x-hub-signature']
  const hmac = crypto.createHmac('sha1', githubSecret)
  const digest = 'sha1=' + hmac.update(rawBody).digest('hex')
  return crypto.timingSafeEqual(Buffer.from(digest), Buffer.from(requestSignature))
}

export function singularize(word) {
  if (!word) return word
  if (word.toLowerCase().endsWith('ies')) {
    return word.slice(0, -3) + 'y'
  } else if (word.toLowerCase().endsWith('ves')) {
    return word.slice(0, -3) + 'f'
  } else if (
    word.toLowerCase().endsWith('oes') ||
    word.toLowerCase().endsWith('ses') ||
    word.toLowerCase().endsWith('xes') ||
    word.toLowerCase().endsWith('zes') ||
    word.toLowerCase().endsWith('ches') ||
    word.toLowerCase().endsWith('shes')
  ) {
    return word.slice(0, -2)
  } else if (word.toLowerCase().endsWith('s') && !word.toLowerCase().endsWith('ss')) {
    return word.slice(0, -1)
  } else {
    return word // Return the word as is if it doesn't match any of the conditions
  }
}
