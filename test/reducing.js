const test = require('tape')
const Omega = require('omega')
const ram = require('random-access-memory')

const { indexedValues } = require('./helpers')
const Autobase = require('..')

test('rebase with stateless reducer', async t => {
  const output = new Omega(ram)
  const writerA = new Omega(ram)
  const writerB = new Omega(ram)
  const writerC = new Omega(ram)

  const base = new Autobase([writerA, writerB, writerC])

  // Create three independent forks
  for (let i = 0; i < 1; i++) {
    await base.append(writerA, `a${i}`, await base.latest(writerA))
  }
  for (let i = 0; i < 2; i++) {
    await base.append(writerB, `b${i}`, await base.latest(writerB))
  }
  for (let i = 0; i < 3; i++) {
    await base.append(writerC, `c${i}`, await base.latest(writerC))
  }

  {
    await base.localRebase(output, {
      reduce: function (indexNode) {
        return Buffer.from(indexNode.node.value.toString('utf-8').toUpperCase(), 'utf-8')
      }
    })
    const indexed = await indexedValues(base, output)
    t.same(indexed.map(v => v.value), ['A0', 'B1', 'B0', 'C2', 'C1', 'C0'])
  }

  t.end()
})

test('rebase with stateful reducer, reinitializes state correctly', async t => {
  const output = new Omega(ram)
  const writerA = new Omega(ram)
  const writerB = new Omega(ram)
  const writerC = new Omega(ram)

  const base = new Autobase([writerA, writerB, writerC])

  // Create three independent forks
  for (let i = 0; i < 1; i++) {
    await base.append(writerA, `a${i}`, await base.latest(writerA))
  }
  for (let i = 0; i < 3; i++) {
    await base.append(writerB, `b${i}`, await base.latest(writerB))
  }
  for (let i = 0; i < 5; i++) {
    await base.append(writerC, `c${i}`, await base.latest(writerC))
  }

  let reinitialized = 0
  const reducer = {
    init: function () {
      reinitialized++
    },
    reduce: function (indexNode) {
      return Buffer.from(indexNode.node.value.toString('utf-8').toUpperCase(), 'utf-8')
    }
  }

  {
    await base.localRebase(output, {
      init: reducer.init,
      reduce: reducer.reduce
    })
    const indexed = await indexedValues(base, output)
    t.same(indexed.map(v => v.value), ['A0', 'B2', 'B1', 'B0', 'C4', 'C3', 'C2', 'C1', 'C0'])
    t.same(reinitialized, 1)
  }

  // This should not trigger any reordering, so init should not be called again.
  await base.append(writerA, 'a1', await base.latest(writerA))

  {
    await base.localRebase(output, {
      init: reducer.init,
      reduce: reducer.reduce
    })
    const indexed = await indexedValues(base, output)
    t.same(indexed.map(v => v.value), ['A1', 'A0', 'B2', 'B1', 'B0', 'C4', 'C3', 'C2', 'C1', 'C0'])
    t.same(reinitialized, 1)
  }

  // This should reorder A to come before B, triggering a reordering, so init should be called again.
  await base.append(writerA, 'a2', await base.latest(writerA))
  await base.append(writerA, 'a3', await base.latest(writerA))

  {
    await base.localRebase(output, {
      init: reducer.init,
      reduce: reducer.reduce
    })
    const indexed = await indexedValues(base, output)
    t.same(indexed.map(v => v.value), ['B2', 'B1', 'B0', 'A3', 'A2', 'A1', 'A0', 'C4', 'C3', 'C2', 'C1', 'C0'])
    t.same(reinitialized, 2)
  }

  t.end()
})