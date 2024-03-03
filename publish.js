import fetch from 'node-fetch'
import fs from 'fs'
import { singularize } from './utils.js'

const base = 'main'

function getHeaders() {
  return {
    Authorization: `token ${process.env.GITHUB_PERSONAL_TOKEN}`,
    Accept: 'application/vnd.github.v3+json',
    'Content-Type': 'application/json',
  }
}

async function createBranch(baseSha, branch) {
  const url = `https://api.github.com/repos/${process.env.GITHUB_REPO}/git/refs`
  const body = JSON.stringify({
    ref: `refs/heads/${branch}`,
    sha: baseSha,
  })

  const response = await fetch(url, { method: 'POST', headers: getHeaders(), body })
  return response.json()
}

async function createFile(branch, title, filePath, fileContent, commitSha = null) {
  const url = `https://api.github.com/repos/${process.env.GITHUB_REPO}/contents/${filePath}`
  const body = JSON.stringify({
    message: title,
    content: fileContent,
    branch,
    sha: commitSha,
  })

  const response = await fetch(url, { method: 'PUT', headers: getHeaders(), body })
  return response.json()
}

async function createPullRequest(branch, title, description = null) {
  const [owner] = process.env.GITHUB_REPO.split('/')
  const PRs = await (
    await fetch(`https://api.github.com/repos/${process.env.GITHUB_REPO}/pulls?head=${owner}:${branch}&state=all`, {
      headers: getHeaders(),
    })
  ).json()

  if (PRs.length > 0) {
    const PR = PRs[0]
    if (PR.state === 'closed') {
      const reopenUrl = `https://api.github.com/repos/${process.env.GITHUB_REPO}/pulls/${PR.number}`
      const body = JSON.stringify({ state: 'open' })
      const response = await fetch(reopenUrl, { method: 'PATCH', headers: getHeaders(), body })
      if (response.ok) {
        return PR
      }
    } else {
      return PR
    }
  }

  const url = `https://api.github.com/repos/${process.env.GITHUB_REPO}/pulls`
  const body = JSON.stringify({
    title,
    head: branch,
    base: base,
    body: description,
  })

  const response = await fetch(url, { method: 'POST', headers: getHeaders(), body })
  return response.json()
}

async function getBaseSha() {
  const response = await fetch(`https://api.github.com/repos/${process.env.GITHUB_REPO}/git/ref/heads/${base}`, {
    headers: getHeaders(),
  })
  const json = await response.json()

  return json.object.sha
}

function getTitle(basePath, id, isUpdate = false) {
  const [a, b] = basePath.split('/').map((part) => part.replace(/s$/, ''))

  if (!b) {
    return `${isUpdate ? 'Update' : 'New'} ${a} "${id}"`
  }

  return `${isUpdate ? 'Update' : 'New'} ${b}'s ${a} "${id}"`
}

async function getFileSha(path, branch) {
  const url = `https://api.github.com/repos/${process.env.GITHUB_REPO}/contents/${path}?ref=${branch}`
  const response = await fetch(url, { headers: getHeaders() })

  if (!response.ok) {
    return null
  }

  const fileInfo = await response.json()
  return fileInfo.sha || null
}

async function getBranchSha(branch) {
  const response = await fetch(`https://api.github.com/repos/${process.env.GITHUB_REPO}/git/ref/heads/${branch}`, {
    headers: getHeaders(),
  })
  const json = await response.json()

  return json.object.sha
}

async function getFiles(path, branch, jsonFile, pngFile) {
  const files = [
    {
      path: `${path}.json`,
      mode: '100644',
      type: 'blob',
      content: jsonFile,
      sha: await getFileSha(`${path}.json`, branch),
    },
  ]

  if (pngFile) {
    files.push({
      path: `${path}.png`,
      mode: '100644',
      type: 'blob',
      content: pngFile,
      sha: await getFileSha(`${path}.png`, branch),
    })
  }

  return files
}

async function createCommitWithMultipleFiles(baseSha, branch, files, commitMessage) {
  const repoUrl = `https://api.github.com/repos/${process.env.GITHUB_REPO}`

  const blobs = await Promise.all(
    files.map((file) => {
      return fetch(`${repoUrl}/git/blobs`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({ encoding: 'base64', content: file.content }),
      }).then((res) => res.json())
    })
  )

  const tree = blobs.map((blob, index) => ({
    path: files[index].path,
    mode: '100644',
    type: 'blob',
    sha: blob.sha,
  }))

  const newTree = await fetch(`${repoUrl}/git/trees`, {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify({ base_tree: baseSha, tree }),
  }).then((res) => res.json())

  const newCommit = await fetch(`${repoUrl}/git/commits`, {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify({
      message: commitMessage,
      tree: newTree.sha,
      parents: [baseSha],
    }),
  }).then((res) => res.json())

  await fetch(`${repoUrl}/git/refs/heads/${branch}`, {
    method: 'PATCH',
    headers: getHeaders(),
    body: JSON.stringify({ sha: newCommit.sha }),
  })

  return newCommit
}

export async function publish(basePath, files) {
  const jsonData = JSON.parse(fs.readFileSync(files.jsonFile.filepath, 'utf8'))
  const author = jsonData.author
  const description = jsonData.description
  const id = jsonData.id
  const type = singularize(basePath.split(/\//g)[0])
  const singularizedType = singularize(type)
  const wrappedJsonData = {
    type: singularizedType,
    name: `${basePath.replace(new RegExp(`^${type}/`), `${singularizedType}/`).replace(/\//g, ':').split(':')}:${jsonData.name}`,
    data: jsonData,
  }

  delete jsonData.name // moved to wrapper
  delete jsonData.id // moved to filename

  const jsonFile = Buffer.from(JSON.stringify(wrappedJsonData, null, 2)).toString('base64')
  const pngFile = fs.readFileSync(files.pngFile.filepath, 'base64')

  const baseSha = await getBaseSha()
  const path = `${basePath}/${author}/${id}`
  const branchName = `publish/${path}`
  const branchResponse = await createBranch(baseSha, branchName)
  const branchSha = !branchResponse.object ? await getBranchSha(branchName) : branchResponse.object.sha
  const filesRefs = await getFiles(path, branchName, jsonFile, pngFile)
  const isUpdate = !!filesRefs.find(file => file.sha)
  const title = getTitle(basePath, id, isUpdate)
  await createCommitWithMultipleFiles(branchSha, branchName, filesRefs, title)

  const pullRequestResponse = await createPullRequest(branchName, title, description, !!branchResponse.object)

  return pullRequestResponse.html_url
}

export async function fetchCommitHistory(path) {
  const url = `https://api.github.com/repos/${process.env.GITHUB_REPO}/commits?path=${path}`;
  console.log('fetch commit history', path)

  try {
    const response = await fetch(url, {
      headers: getHeaders()
    });

    if (!response.ok) {
      throw new Error(`GitHub API responded with a status code of ${response.status}`);
    }

    const data = await response.json();
    
    return data.map(record => ({
      date: record.commit?.committer?.date,
      sha: record.sha,
    }))
  } catch (error) {
    console.error('Error fetching commit history:', error.message);
    return [];
  }
}

export async function fetchFileAtCommit(path, sha) {
  const fileContentUrl = `https://api.github.com/repos/${process.env.GITHUB_REPO}/contents/${path}?ref=${sha}`;
  console.log('fetch file at commit', path, sha)
  try {
    const response = await fetch(fileContentUrl, {
      headers: getHeaders()
    });

    if (!response.ok) {
      throw new Error(`GitHub API responded with a status code of ${response.status}`);
    }

    const data = await response.json();

    return Buffer.from(data.content, 'base64').toString('utf8')
  } catch (error) {
    console.error(`Error fetching file content for commit ${sha}:`, error.message);
  }
}