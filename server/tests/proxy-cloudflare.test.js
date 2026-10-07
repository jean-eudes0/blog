import { test } from 'node:test'
import assert from 'node:assert/strict'
import Fastify from 'fastify'
import { loadConfig } from '../src/config.js'

// Sur Render, le visiteur passe par Cloudflare puis par le proxy de Render avant d'atteindre l'application :
//   visiteur -> Cloudflare -> proxy Render (adresse privée) -> application
// X-Forwarded-For contient alors "visiteur, adresse-de-Cloudflare". Si TRUST_PROXY ne cite que le proxy
// de Render, l'application prend l'adresse de Cloudflare pour celle du visiteur : tout le monde partage alors
// la même limite de connexion.

const CLOUDFLARE = '172.64.0.0/13,2606:4700::/32'
const PROXY_RENDER = '10.193.15.1'
const VISITEUR = '137.255.207.24'
const CHAINE = `${VISITEUR}, 172.68.103.55`

async function ipVue(trustProxy, xForwardedFor) {
  const trust = loadConfig({ DATABASE_URL: 'postgresql://u:p@h/d', TRUST_PROXY: trustProxy }).trustProxy
  const app = Fastify({ trustProxy: trust })
  app.get('/ip', async (request) => request.ip)
  const res = await app.inject({
    url: '/ip',
    remoteAddress: PROXY_RENDER,
    headers: xForwardedFor ? { 'x-forwarded-for': xForwardedFor } : {},
  })
  await app.close()
  return res.body
}

test('sans les plages Cloudflare, l\'application prend Cloudflare pour le visiteur (le défaut à éviter)', async () => {
  assert.equal(await ipVue('loopback,uniquelocal', CHAINE), '172.68.103.55')
})

test('avec les plages Cloudflare, l\'application voit la vraie adresse du visiteur', async () => {
  assert.equal(await ipVue(`loopback,uniquelocal,${CLOUDFLARE}`, CHAINE), VISITEUR)
})

test('des adresses forgées en tête de X-Forwarded-For ne changent pas l\'adresse retenue', async () => {
  const trust = `loopback,uniquelocal,${CLOUDFLARE}`
  assert.equal(await ipVue(trust, `1.1.1.1, ${CHAINE}`), VISITEUR)
  assert.equal(await ipVue(trust, `9.9.9.9, 8.8.8.8, ${CHAINE}`), VISITEUR)
  assert.equal(await ipVue(trust, `172.68.1.1, ${CHAINE}`), VISITEUR)
})

test('un visiteur en IPv6 passant par Cloudflare est reconnu', async () => {
  assert.equal(await ipVue(`uniquelocal,${CLOUDFLARE}`, '2a02:8071:1234::1, 2606:4700:1::5'), '2a02:8071:1234::1')
})