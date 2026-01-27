/**
 * Benchmark finalizeBlock optimizations
 */

// Current implementation - O(n²) string concatenation
function finalizeBlockCurrent(rows: { bases: string; length: number }[], columns: string[]) {
  for (let j = 0; j < rows.length; j++) {
    const row = rows[j]!
    let bases = ''
    let length = 0

    for (let i = 0; i < columns.length; i++) {
      const col = columns[i]!
      const base = col[j] ?? '-'
      bases += base  // O(n²) - creates new string each iteration
      if (base !== '-') {
        length++
      }
    }

    row.bases = bases
    row.length = length
  }
}

// Optimized - collect into array, join once
function finalizeBlockArrayJoin(rows: { bases: string; length: number }[], columns: string[]) {
  const numCols = columns.length

  for (let j = 0; j < rows.length; j++) {
    const row = rows[j]!
    const basesArr: string[] = new Array(numCols)
    let length = 0

    for (let i = 0; i < numCols; i++) {
      const col = columns[i]!
      const base = col[j] ?? '-'
      basesArr[i] = base
      if (base !== '-') {
        length++
      }
    }

    row.bases = basesArr.join('')
    row.length = length
  }
}

// Optimized - pre-allocate typed array for bases
function finalizeBlockTypedArray(rows: { bases: string; length: number }[], columns: string[]) {
  const numCols = columns.length
  const buffer = new Uint8Array(numCols)
  const DASH = 45 // '-'.charCodeAt(0)

  for (let j = 0; j < rows.length; j++) {
    const row = rows[j]!
    let length = 0

    for (let i = 0; i < numCols; i++) {
      const col = columns[i]!
      const charCode = col.charCodeAt(j)
      buffer[i] = isNaN(charCode) ? DASH : charCode
      if (buffer[i] !== DASH) {
        length++
      }
    }

    row.bases = String.fromCharCode(...buffer)
    row.length = length
  }
}

// Optimized - TextDecoder from typed array
function finalizeBlockTextDecoder(rows: { bases: string; length: number }[], columns: string[]) {
  const numCols = columns.length
  const buffer = new Uint8Array(numCols)
  const decoder = new TextDecoder('ascii')
  const DASH = 45

  for (let j = 0; j < rows.length; j++) {
    const row = rows[j]!
    let length = 0

    for (let i = 0; i < numCols; i++) {
      const col = columns[i]!
      const charCode = col.charCodeAt(j)
      buffer[i] = isNaN(charCode) ? DASH : charCode
      if (buffer[i] !== DASH) {
        length++
      }
    }

    row.bases = decoder.decode(buffer)
    row.length = length
  }
}

// Generate test data similar to real TAF
function generateTestData(numRows: number, numColumns: number): { rows: { bases: string; length: number }[]; columns: string[] } {
  const bases = 'ACGT-'
  const columns: string[] = []

  for (let i = 0; i < numColumns; i++) {
    let col = ''
    for (let j = 0; j < numRows; j++) {
      col += bases[Math.floor(Math.random() * bases.length)]
    }
    columns.push(col)
  }

  const rows: { bases: string; length: number }[] = []
  for (let j = 0; j < numRows; j++) {
    rows.push({ bases: '', length: 0 })
  }

  return { rows, columns }
}

function cloneRows(rows: { bases: string; length: number }[]): { bases: string; length: number }[] {
  return rows.map(r => ({ bases: '', length: 0 }))
}

async function runBenchmark() {
  console.log('='.repeat(60))
  console.log('finalizeBlock OPTIMIZATION BENCHMARK')
  console.log('='.repeat(60))
  console.log('')

  const configs = [
    { name: '7 rows, 1000 cols (7-way, 1kb)', rows: 7, cols: 1000 },
    { name: '7 rows, 10000 cols (7-way, 10kb)', rows: 7, cols: 10000 },
    { name: '447 rows, 1000 cols (447-way, 1kb)', rows: 447, cols: 1000 },
    { name: '447 rows, 10000 cols (447-way, 10kb)', rows: 447, cols: 10000 },
  ]

  for (const config of configs) {
    console.log(`\n${config.name}:`)
    console.log('-'.repeat(50))

    const { rows: templateRows, columns } = generateTestData(config.rows, config.cols)
    const iterations = 100

    // Current
    let totalCurrent = 0
    for (let i = 0; i < iterations; i++) {
      const rows = cloneRows(templateRows)
      const start = performance.now()
      finalizeBlockCurrent(rows, columns)
      totalCurrent += performance.now() - start
    }
    const avgCurrent = totalCurrent / iterations
    console.log(`  Current (+=):        ${avgCurrent.toFixed(3)} ms`)

    // Array join
    let totalArrayJoin = 0
    for (let i = 0; i < iterations; i++) {
      const rows = cloneRows(templateRows)
      const start = performance.now()
      finalizeBlockArrayJoin(rows, columns)
      totalArrayJoin += performance.now() - start
    }
    const avgArrayJoin = totalArrayJoin / iterations
    console.log(`  Array + join():      ${avgArrayJoin.toFixed(3)} ms (${(avgCurrent / avgArrayJoin).toFixed(2)}x faster)`)

    // Typed array + fromCharCode
    let totalTyped = 0
    for (let i = 0; i < iterations; i++) {
      const rows = cloneRows(templateRows)
      const start = performance.now()
      finalizeBlockTypedArray(rows, columns)
      totalTyped += performance.now() - start
    }
    const avgTyped = totalTyped / iterations
    console.log(`  TypedArray:          ${avgTyped.toFixed(3)} ms (${(avgCurrent / avgTyped).toFixed(2)}x faster)`)

    // TextDecoder
    let totalDecoder = 0
    for (let i = 0; i < iterations; i++) {
      const rows = cloneRows(templateRows)
      const start = performance.now()
      finalizeBlockTextDecoder(rows, columns)
      totalDecoder += performance.now() - start
    }
    const avgDecoder = totalDecoder / iterations
    console.log(`  TextDecoder:         ${avgDecoder.toFixed(3)} ms (${(avgCurrent / avgDecoder).toFixed(2)}x faster)`)
  }

  console.log('')
}

runBenchmark().catch(console.error)
