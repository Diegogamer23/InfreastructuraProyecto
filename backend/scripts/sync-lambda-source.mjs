import { readFile, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url))
const repositoryRoot = path.resolve(scriptDirectory, '../..')
const templatePath = path.join(repositoryRoot, 'Proyecto_Infra/template.yaml')
const writeMode = process.argv.includes('--write')
const lambdaSources = [
  {
    resource: 'DemoFunction',
    nextResource: 'TransactionsHttpApi',
    sourcePath: 'backend/src/transactions/handler.py',
  },
  {
    resource: 'BudgetsFunction',
    nextResource: 'BudgetsApiInvokeLambdaPermission',
    sourcePath: 'backend/src/budgets/handler.py',
  },
  {
    resource: 'PlanningFunction',
    nextResource: 'PlanningApiInvokePermissionGoals',
    sourcePath: 'backend/src/planning/handler.py',
  },
]

function locateCodeBlock(template, resourceName, nextResourceName) {
  const resourcePattern = new RegExp(`^  ${resourceName}:\\r?$`, 'm')
  const resourceMatch = resourcePattern.exec(template)
  if (!resourceMatch) throw new Error(`No se encontró el recurso ${resourceName}.`)

  const afterResource = template.slice(resourceMatch.index)
  const nextResourcePattern = new RegExp(`^  ${nextResourceName}:\\r?$`, 'm')
  const nextResourceMatch = nextResourcePattern.exec(afterResource)
  if (!nextResourceMatch) throw new Error(`No se encontró el recurso siguiente a ${resourceName}.`)

  const resourceBody = afterResource.slice(0, nextResourceMatch.index)
  const headerPattern = /^      Code:\r?\n        ZipFile: \|\r?\n/m
  const headerMatch = headerPattern.exec(resourceBody)
  if (!headerMatch) throw new Error(`No se encontró el bloque ZipFile de ${resourceName}.`)

  const codeStart = resourceMatch.index + headerMatch.index + headerMatch[0].length
  const resourceEnd = resourceMatch.index + nextResourceMatch.index
  const lines = template.slice(codeStart, resourceEnd).replace(/\r\n/g, '\n').split('\n')
  while (lines.length && lines.at(-1).trim() === '') lines.pop()

  const currentSource = lines.map((line) => {
    if (line.trim() === '') return ''
    if (!line.startsWith('          ')) {
      throw new Error(`El bloque ZipFile de ${resourceName} tiene una indentación inesperada.`)
    }
    return line.slice(10)
  }).join('\n')

  const hasWhitespaceOnlyBlankLines = lines.some((line) => line.trim() === '' && line.length > 0)
  return { codeStart, resourceEnd, currentSource, hasWhitespaceOnlyBlankLines }
}

async function main() {
  let template = await readFile(templatePath, 'utf8')
  const differences = []

  for (const lambda of lambdaSources) {
    const sourcePath = path.join(repositoryRoot, lambda.sourcePath)
    const sourceFile = await readFile(sourcePath, 'utf8')
    const source = sourceFile.replace(/\r\n/g, '\n').trimEnd()
    const { codeStart, resourceEnd, currentSource, hasWhitespaceOnlyBlankLines } = locateCodeBlock(
      template,
      lambda.resource,
      lambda.nextResource,
    )

    if (source === currentSource && !hasWhitespaceOnlyBlankLines) continue
    differences.push(lambda.resource)

    if (writeMode) {
      const inlineCode = source.split('\n').map((line) => line ? `          ${line}` : '').join('\n')
      template = `${template.slice(0, codeStart)}${inlineCode}\n\n${template.slice(resourceEnd)}`
    }
  }

  if (differences.length === 0) {
    console.log('Los códigos backend y sus bloques Lambda de CloudFormation están sincronizados.')
    return
  }

  if (!writeMode) {
    console.error(`Hay diferencias en: ${differences.join(', ')}. Ejecuta este script con --write para sincronizarlas.`)
    process.exitCode = 1
    return
  }

  await writeFile(templatePath, template, 'utf8')
  console.log(`Se sincronizaron las Lambdas: ${differences.join(', ')}.`)
}

main().catch((error) => {
  console.error(error.message)
  process.exitCode = 1
})
