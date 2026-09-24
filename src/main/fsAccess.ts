import { BrowserWindow, dialog, ipcMain, OpenDialogOptions } from 'electron'
import { mkdir, readdir, readFile, realpath, stat, writeFile } from 'fs/promises'
import { dirname, isAbsolute, relative, resolve } from 'path'
import { DirEntry, IPC } from '@shared/types'
import { getSettings, updateSettings } from './settings'

const MAX_READ_BYTES = 10 * 1024 * 1024

/**
 * Sandboxed file access: the renderer can only touch paths inside directories
 * the user explicitly picked via the native dialog. Every request is resolved
 * (including symlinks) and rejected if it escapes its root.
 */

const isInside = (root: string, target: string): boolean => {
  const rel = relative(root, target)
  return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel))
}

function checkRoot(root: string): string {
  if (!getSettings().allowedDirs.includes(root)) throw new Error('Directory not granted: ' + root)
  return root
}

/** Resolve `rel` under `root`, following symlinks of the deepest existing ancestor. */
async function resolveInRoot(root: string, rel: string): Promise<string> {
  const realRoot = await realpath(checkRoot(root))
  const target = resolve(realRoot, rel || '.')
  if (!isInside(realRoot, target)) throw new Error('Path outside granted directory')

  let existing = target
  for (;;) {
    try {
      const real = await realpath(existing)
      if (!isInside(realRoot, real)) throw new Error('Path outside granted directory')
      return target
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err
      const parent = dirname(existing)
      if (parent === existing) throw err
      existing = parent
    }
  }
}

export function registerFsIpc(): void {
  ipcMain.handle(IPC.fsListRoots, () => getSettings().allowedDirs)

  ipcMain.handle(IPC.fsAddRoot, async (e) => {
    const win = BrowserWindow.fromWebContents(e.sender)
    const opts: OpenDialogOptions = { title: 'Grant access to a directory', properties: ['openDirectory', 'createDirectory'] }
    const res = win ? await dialog.showOpenDialog(win, opts) : await dialog.showOpenDialog(opts)
    const dirs = getSettings().allowedDirs
    if (res.canceled || res.filePaths.length === 0) return dirs
    const picked = res.filePaths[0]
    return dirs.includes(picked) ? dirs : updateSettings({ allowedDirs: [...dirs, picked] }).allowedDirs
  })

  ipcMain.handle(IPC.fsRemoveRoot, (_e, root: string) => {
    return updateSettings({ allowedDirs: getSettings().allowedDirs.filter((d) => d !== root) }).allowedDirs
  })

  ipcMain.handle(IPC.fsReadDir, async (_e, root: string, rel: string): Promise<DirEntry[]> => {
    const dir = await resolveInRoot(root, rel)
    const entries = await readdir(dir, { withFileTypes: true })
    const out: DirEntry[] = []
    for (const d of entries) {
      try {
        const s = await stat(resolve(dir, d.name))
        out.push({ name: d.name, isDir: s.isDirectory(), size: s.size, mtimeMs: s.mtimeMs })
      } catch {
        // skip entries we can't stat (broken links, permissions)
      }
    }
    return out.sort((a, b) => Number(b.isDir) - Number(a.isDir) || a.name.localeCompare(b.name))
  })

  ipcMain.handle(IPC.fsReadText, async (_e, root: string, rel: string) => {
    const file = await resolveInRoot(root, rel)
    if ((await stat(file)).size > MAX_READ_BYTES) throw new Error('File too large to open')
    return readFile(file, 'utf-8')
  })

  ipcMain.handle(IPC.fsWriteText, async (_e, root: string, rel: string, content: string) => {
    const file = await resolveInRoot(root, rel)
    await mkdir(dirname(file), { recursive: true })
    await writeFile(file, content, 'utf-8')
  })
}
