import { readJson, writeJson } from './sync.js'

const METADATA_CACHE = {}
const METADATA_CACHE_EXPIRATION = 1000 * 60 * 30

function getMetadataPath(basePath) {
  return `${basePath}/metadata.json`
}

/**
 * Get metadata.json content
 * @param {string} basePath metadata id
 */
export async function getMetadata(basePath) {
  if (!METADATA_CACHE[basePath]) {
    await cacheMetadata(basePath)
  }

  METADATA_CACHE[basePath].timestamp = Date.now()
  return METADATA_CACHE[basePath].data
}

/**
 * Read metadata.json content and cache it
 * @param {string} basePath metadata id
 */
async function cacheMetadata(basePath) {
  const data = (await readJson(getMetadataPath(basePath))) || []

  console.log(`Cache ${basePath} metadata`)

  METADATA_CACHE[basePath] = {
    timestamp: Date.now(),
    saved: true,
    data,
  }
}

/**
 * Persist unsaved metadata changes
 */
export async function saveMetadatas() {
  for (const basePath in METADATA_CACHE) {
    const { saved } = METADATA_CACHE[basePath]

    if (!saved) {
      console.log(`Save ${basePath} metadata`)

      await writeJson(getMetadataPath(basePath), METADATA_CACHE[basePath].data)

      METADATA_CACHE[basePath].saved = true
      METADATA_CACHE[basePath].timestamp = Date.now()
    }
  }
}

/**
 * Update an item in the metadata file
 * @param {string} basePath metadata id
 * @param {string} jsonPath path to json file
 */
export async function updateItem(basePath, metadataItem) {
  if (!METADATA_CACHE[basePath]) {
    await cacheMetadata(basePath)
  }

  const index = METADATA_CACHE[basePath].data.findIndex((row) => row.filename === metadataItem.filename)

  if (index !== -1) {
    METADATA_CACHE[basePath].data.splice(index, 1)
  }

  METADATA_CACHE[basePath].data.push(metadataItem)
  METADATA_CACHE[basePath].saved = false
}

/**
 * Remove an item from the metadata file
 * @param {string} basePath metadata id
 * @param {string} jsonPath path to json file
 */
export async function removeItem(basePath, jsonPath) {
  if (!METADATA_CACHE[basePath]) {
    await cacheMetadata(basePath)
  }

  const index = METADATA_CACHE[basePath].data.findIndex((row) => row.jsonPath === jsonPath)

  if (index !== -1) {
    METADATA_CACHE[basePath].data.splice(index, 1)
    METADATA_CACHE[basePath].saved = false
  }
}

/**
 * Check for expired metadata caches
 */
function reviewCache() {
  const now = Date.now()

  for (const basePath in METADATA_CACHE) {
    const { saved, timestamp } = METADATA_CACHE[basePath]

    if (!saved || now - timestamp > METADATA_CACHE_EXPIRATION) {
      delete METADATA_CACHE[basePath]
    }
  }
}

setInterval(reviewCache, METADATA_CACHE_EXPIRATION)
