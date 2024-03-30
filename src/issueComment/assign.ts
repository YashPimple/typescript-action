import * as core from '@actions/core'
import * as github from '@actions/github'
import * as yaml from 'js-yaml'

async function run() {
  try {
    const token = process.env.BOT_TOKEN
    if (!token) {
      throw new Error('GitHub token not found')
    }

    const client = github.getOctokit(token)
    const { owner, repo, number } = github.context.issue

    // Fetch issue comments
    const comments = await client.rest.issues.listComments({
      owner,
      repo,
      issue_number: number
    })

    for (const comment of comments.data) {
      if (comment.body && comment.body.includes('/assign')) {
        const assignee = extractAssignee(comment.body)
        if (assignee) {
          await assignIssue(client, owner, repo, number, assignee)
          break
        }
      }
    }
  } catch (error: any) {
    core.setFailed(error.message)
  }
}

function extractAssignee(commentBody: string): string | null {
  const assigneeCommandIndex = commentBody.indexOf('/assign')
  if (assigneeCommandIndex !== -1) {
    const assigneeSubstring = commentBody
      .substring(assigneeCommandIndex + '/assign'.length)
      .trim()

    const usernameMatch = assigneeSubstring.match(/@[a-zA-Z0-9_-]+/)
    if (usernameMatch) {
      return usernameMatch[0].substring(1)
    }
  }
  return null
}

async function assignIssue(
  client: ReturnType<typeof github.getOctokit>,
  owner: string,
  repo: string,
  issueNumber: number,
  assignee: string
) {
  const configResponse = await client.rest.repos.getContent({
    owner,
    repo,
    path: 'maintainers.yaml'
  })

  if (
    Array.isArray(configResponse.data) ||
    typeof configResponse.data !== 'object' ||
    !('content' in configResponse.data)
  ) {
    throw new Error('Invalid config response')
  }
  const configContent = Buffer.from(
    configResponse.data.content,
    'base64'
  ).toString()

  const maintainersConfig = yaml.load(configContent) as Record<string, string[]>

  const userRole = Object.keys(maintainersConfig).find(role =>
    maintainersConfig[role].includes(assignee)
  )

  if (userRole) {
    // Assign the issue to the assignee
    await client.rest.issues.addAssignees({
      owner,
      repo,
      issue_number: issueNumber,
      assignees: [assignee]
    })
  } else {
    throw new Error(
      `User ${assignee} is not authorized to be assigned the issue.`
    )
  }
}

run()
