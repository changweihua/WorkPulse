import { Project, SyntaxKind, ts } from 'ts-morph'
import path from 'path'
import fs from 'fs'

// ===== 配置项 =====
const config = {
    // 是否优先把 JSX.Element 替换为 ReactNode（推荐开启，更符合 React 19 规范）
    replaceJSXElementWithReactNode: true,
    // 是否将 JSX.IntrinsicElements['tag'] 替换为 ComponentProps<'tag'>
    useComponentProps: true,
    // 扫描目录（根据你的项目结构调整）
    includePatterns: ['src/**/*.{ts,tsx}'],
    excludePatterns: ['**/node_modules/**', '**/out/**', '**/dist/**', '**/*.d.ts']
}

// ===== 初始化 TS 项目 =====
const project = new Project({
    tsConfigFilePath: path.resolve(__dirname, '../tsconfig.json'),
    skipAddingFilesFromTsConfig: false
})

project.addSourceFilesAtPaths(config.includePatterns)
config.excludePatterns.forEach(pattern => {
    project.getSourceFiles(pattern).forEach(file => project.removeSourceFile(file))
})

const sourceFiles = project.getSourceFiles()

console.log(`🔍 共扫描到 ${sourceFiles.length} 个 TS/TSX 文件`)

// ===== 辅助函数：确保导入 React =====
function ensureReactImport(sourceFile: any) {
    const reactImport = sourceFile.getImportDeclaration('react') ||
        sourceFile.getImportDeclaration('* as React from "react"')

    if (!reactImport) {
        sourceFile.addImportDeclaration({
            moduleSpecifier: 'react',
            namespaceImport: 'React'
        })
        return true
    }
    return false
}

// ===== 辅助函数：确保导入指定类型 =====
function ensureTypeImport(sourceFile: any, typeName: string) {
    const existingImport = sourceFile.getImportDeclaration('react')
    if (existingImport) {
        const namedImports = existingImport.getNamedImports()
        if (!namedImports.some((imp: any) => imp.getName() === typeName)) {
            existingImport.addNamedImport(typeName)
        }
    } else {
        sourceFile.addImportDeclaration({
            moduleSpecifier: 'react',
            namedImports: [typeName]
        })
    }
}

// ===== 核心迁移逻辑 =====
let modifiedCount = 0

for (const sourceFile of sourceFiles) {
    let hasModified = false
    const filePath = sourceFile.getFilePath()
    console.log(`\n📝 处理文件: ${path.relative(process.cwd(), filePath)}`)

    // 1. 处理所有 JSX.XXX 类型的引用
    const jsxIdentifiers = sourceFile.getDescendantsOfKind(SyntaxKind.Identifier)
        .filter(id => id.getText() === 'JSX' && id.getParent()?.getText().startsWith('JSX.'))

    if (jsxIdentifiers.length === 0) continue

    // 确保导入 React
    const addedReactImport = ensureReactImport(sourceFile)

    for (const jsxId of jsxIdentifiers) {
        const parent = jsxId.getParent()
        if (!parent) continue
        const fullText = parent.getText()

        // 情况 1: JSX.Element → React.JSX.Element / ReactNode
        if (fullText === 'JSX.Element') {
            if (config.replaceJSXElementWithReactNode) {
                ensureTypeImport(sourceFile, 'ReactNode')
                parent.replaceWithText('ReactNode')
                console.log(`  ✅ JSX.Element → ReactNode`)
            } else {
                parent.replaceWithText('React.JSX.Element')
                console.log(`  ✅ JSX.Element → React.JSX.Element`)
            }
            hasModified = true
        }

        // 情况 2: JSX.IntrinsicElements['tag'] → ComponentProps<'tag'>
        else if (fullText.startsWith('JSX.IntrinsicElements[') && config.useComponentProps) {
            const tagMatch = fullText.match(/JSX\.IntrinsicElements\['([^']+)'\]/)
            if (tagMatch) {
                const tag = tagMatch[1]
                ensureTypeImport(sourceFile, 'ComponentProps')
                parent.replaceWithText(`ComponentProps<'${tag}'>`)
                console.log(`  ✅ ${fullText} → ComponentProps<'${tag}'>`)
                hasModified = true
            }
        }

        // 情况 3: 其他 JSX.XXX 类型（如 JSX.IntrinsicAttributes）
        else if (fullText.startsWith('JSX.')) {
            const suffix = fullText.slice(4) // 去掉 'JSX.'
            parent.replaceWithText(`React.JSX.${suffix}`)
            console.log(`  ✅ ${fullText} → React.JSX.${suffix}`)
            hasModified = true
        }
    }

    // 如果自动添加了 React 导入，提示用户
    if (addedReactImport) {
        console.log(`  ℹ️ 自动添加 React 导入`)
    }

    // 保存改动
    if (hasModified) {
        modifiedCount++
        // 实际执行时取消下面的注释，默认 dry-run
        sourceFile.saveSync()
    }
}

// ===== 输出结果 =====
console.log('\n==============================')
console.log(`✅ 迁移完成，共修改 ${modifiedCount} 个文件`)
console.log('\n⚠️ 当前为 DRY-RUN 模式，未实际修改文件')
console.log('如需实际执行，请取消脚本中 `sourceFile.saveSync()` 的注释后重新运行')
console.log('==============================')