import { removeItem, updateItem } from './metadata.js'
import {
  fetchJson,
  fetchImage,
  getCreationDate,
  writeJson,
  writeBlob,
  removeFile,
  ensureDirExists,
} from './sync.js'

async function sync({ id, basePath, jsonPath, imagePath, authorPath }) {
  await ensureDirExists(jsonPath)

  const json = await fetchJson(jsonPath)

  if (!json || !json.data) {
    console.error('Invalid payload')
    return
  }

  const image = await fetchImage(imagePath)
  json.createdAt = await getCreationDate(jsonPath)
  json.updatedAt = Date.now()
  const author = authorPath.split('/').pop()

  const metadata = {
    id,
    jsonPath,
    author,
    name: json.name.split(':').pop(),
    createdAt: json.createdAt,
    updatedAt: json.updatedAt,
    description: json.data.description,
  }

  if (image && (await writeBlob(imagePath, image))) {
    metadata.imagePath = imagePath
  }

  await writeJson(jsonPath, json)
  await updateItem(basePath, metadata)
}

async function clear({ basePath, jsonPath, imagePath, authorPath }) {
  await removeFile(jsonPath)
  await removeFile(imagePath)
  await removeDirIfEmpty(authorPath)
  await removeItem(basePath, jsonPath)
}

export default {
  sync,
  clear,
}
