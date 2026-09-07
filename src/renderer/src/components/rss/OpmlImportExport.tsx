import React, { useRef } from 'react'
import { useRssStore } from '@/stores/rssStore'
import { Download, Upload } from 'lucide-react'

export default function OpmlImportExport() {
  const { exportOpml, importOpml } = useRssStore()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleExport = async () => {
    const xml = await exportOpml()
    const blob = new Blob([xml], { type: 'text/xml' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'workpulse-feeds.opml'
    a.click()
    URL.revokeObjectURL(url)
  }

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const text = await file.text()
    await importOpml(text)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  return (
    <div className="flex items-center gap-1.5">
      <button
        onClick={handleExport}
        className="flex items-center gap-1 px-2 py-1 rounded-md text-[10px] text-[var(--color-text-tertiary)] hover:text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-inset)] transition-colors"
        title="导出 OPML"
      >
        <Download className="w-3 h-3" />
        导出
      </button>
      <button
        onClick={() => fileInputRef.current?.click()}
        className="flex items-center gap-1 px-2 py-1 rounded-md text-[10px] text-[var(--color-text-tertiary)] hover:text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-inset)] transition-colors"
        title="导入 OPML"
      >
        <Upload className="w-3 h-3" />
        导入
      </button>
      <input
        ref={fileInputRef}
        type="file"
        accept=".opml,.xml"
        onChange={handleImport}
        className="hidden"
      />
    </div>
  )
}
