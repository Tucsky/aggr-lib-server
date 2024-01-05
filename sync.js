import fetch from 'node-fetch'
import fs from 'fs'
import { removeItem, saveMetadatas, updateItem } from './metadata.js'

export const STATIC_PATH = 'static'

async function fetchFile(path) {
  const url = `https://api.github.com/repos/${process.env.GITHUB_REPO}/contents/${path}`
  const headers = {
    Authorization: `token ${process.env.GITHUB_PERSONAL_TOKEN}`,
  }

  return fetch(url, { headers })
}

function processChange(remotePath, records, shouldClear = false) {
  if (!/(\.json|\.png)$/.test(remotePath)) {
    return
  }

  const path = remotePath.replace(/\.[^/.]+$/, '').split('/')
  const id = path.pop()
  const parentFolder = path.pop()
  const basePath = path.join('/')
  const authorPath = `${basePath}/${parentFolder}`
  const filePath = `${authorPath}/${id}`
  const isImage = /\.png$/i.test(remotePath)

  if (!basePath.length) {
    return
  }

  const record = records[basePath] || {
    id,
    basePath,
    authorPath,
    jsonPath: `${filePath}.json`,
    imagePath: `${filePath}.png`,
    method: 'sync',
  }

  if (!isImage) {
    record.method = shouldClear ? 'clear' : 'sync'
  }

  records[filePath] = record
}

export async function processCommits(commits) {
  const records = {}

  console.log(`Process ${commits.length} commit${commits.length > 1 ? 's' : ''}`)

  for (const commit of commits) {
    const addedOrModified = commit.added.concat(commit.modified)

    for (const filePath of addedOrModified) {
      processChange(filePath, records)
    }

    for (const filePath of commit.removed) {
      processChange(filePath, records, true)
    }
  }

  for (const id in records) {
    const record = records[id]

    console.log(`${record.method} ${record.jsonPath}`)
    try {
      if (record.method === 'sync') {
        await sync(record)
      } else {
        await clear(record)
      }
    } catch (error) {
      console.error(`Failed to ${record.method} ${record}: ${error.message}`)
    }
  }

  saveMetadatas()
}

export function readJson(path) {
  return new Promise((resolve) => {
    fs.readFile(`${STATIC_PATH}/${path}`, 'utf8', (readError, data) => {
      if (readError) {
        if (readError.code !== 'ENOENT') {
          console.error('Error reading JSON file:', readError)
        }
        resolve(null)
        return
      }

      try {
        const json = JSON.parse(data)
        resolve(json)
      } catch (parseError) {
        console.error('Error parsing JSON file:', parseError)
        resolve(null)
      }
    })
  })
}

export function writeJson(path, jsonContent) {
  return new Promise((resolve) => {
    fs.writeFile(`${STATIC_PATH}/${path}`, JSON.stringify(jsonContent), (err) => {
      if (err) {
        console.error(`Error writing JSON file: ${err}`)
      } else {
        console.log(`JSON file saved at: ${path}`)
      }

      resolve()
    })
  })
}

export function writeBlob(path, imageBlob) {
  return new Promise((resolve) => {
    fs.writeFile(`${STATIC_PATH}/${path}`, imageBlob, (err) => {
      if (err) {
        console.error(`Error writing image file: ${err}`)
        resolve(null)
        return
      }

      resolve(true)
    })
  })
}

export async function getCreationDate(path) {
  return new Promise((resolve) => {
    fs.stat(`${STATIC_PATH}/${path}`, (err, stats) => {
      if (err) {
        resolve(Date.now())
        return
      }

      const createdAt = stats.birthtime.getTime()
      
      resolve(createdAt)
    })
  })
}

export async function fetchImage(path) {
  try {
    const response = await fetchFile(path)

    if (response.status === 404) {
      return null
    }
    
    const json = await response.json()

    const imageBuffer = Buffer.from(json.content, 'base64')
    return imageBuffer
  } catch (error) {
    console.error(`Failed to fetch image: ${error.message}`)
    return null
  }
}

export async function fetchJson(path) {
  try {
    const response = await fetchFile(path)

    if (response.status === 404) {
      return null
    }

    const data = await response.json()

    return JSON.parse(Buffer.from(data.content, 'base64').toString('utf8'))
  } catch (error) {
    console.error(`Failed to fetch json: ${error.message}`)
    return null
  }
}

export async function removeFile(path) {
  return new Promise((resolve) => {
    fs.unlink(`${STATIC_PATH}/${path}`, (err, data) => {
      if (err) {
        console.error('Error unlinking file:', err)
      }

      resolve()
    })
  })
}

export async function removeDirIfEmpty(path) {
  return new Promise((resolve) => {
    fs.readdir(path, (err, files) => {
      if (err) {
        console.error('Error reading directory:', err)
        resolve()
        return
      }

      if (files.length === 0) {
        fs.rmdir(path, (err) => {
          if (err) {
            console.error('Error removing directory:', err)
            resolve()
            return
          }

          console.log(`Directory ${path} removed successfully.`)
          resolve()
        })
      } else {
        resolve()
      }
    })
  })
}

export async function ensureDirExists(basePath) {
  const staticPath = `${STATIC_PATH}/${basePath}`
  const folder = staticPath.substring(0, staticPath.lastIndexOf('/'))

  return new Promise((resolve, reject) => {
    fs.stat(folder, (err) => {
      if (!err) {
        resolve()
      } else if (err.code === 'ENOENT') {
        fs.mkdir(folder, { recursive: true }, (err) => {
          if (err) {
            reject(err)
          }

          resolve()
        })
      } else {
        reject(err)
      }
    })
  })
}

export async function sync({ id, basePath, jsonPath, imagePath, authorPath }) {
  await ensureDirExists(jsonPath)

  const json = await fetchJson(jsonPath)

  if (!json || !json.data) {
    console.error('Invalid payload')
    return
  }

  const image = await fetchImage(imagePath)
  json.createdAt = json.createdAt || await getCreationDate(jsonPath)
  json.updatedAt = json.updatedAt || Date.now()
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

export async function clear({ basePath, jsonPath, imagePath, authorPath }) {
  await removeFile(jsonPath)
  await removeFile(imagePath)
  await removeDirIfEmpty(authorPath)
  await removeItem(basePath, jsonPath)
}