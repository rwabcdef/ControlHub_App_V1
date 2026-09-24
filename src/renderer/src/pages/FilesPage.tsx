import { useCallback, useEffect, useState } from 'react'
import {
  Alert, Box, Breadcrumbs, Button, Grid, IconButton, Link, List, ListItemButton, ListItemIcon, ListItemText,
  Stack, TextField, Tooltip, Typography
} from '@mui/material'
import AddIcon from '@mui/icons-material/CreateNewFolder'
import DeleteIcon from '@mui/icons-material/LinkOff'
import FolderIcon from '@mui/icons-material/Folder'
import FileIcon from '@mui/icons-material/InsertDriveFile'
import SaveIcon from '@mui/icons-material/Save'
import DownloadIcon from '@mui/icons-material/Download'
import type { DirEntry } from '@shared/types'
import { Panel } from '../components/Panel'
import { telemetry } from '../telemetry/store'
import { errorMessage } from '../util'

const join = (a: string, b: string): string => (a ? `${a}/${b}` : b)

/**
 * File access is limited to directories the user grants via the native picker.
 * The main process enforces this; paths here are always relative to a granted root.
 */
export function FilesPage(): React.JSX.Element {
  const [roots, setRoots] = useState<string[]>([])
  const [root, setRoot] = useState<string | null>(null)
  const [dir, setDir] = useState('')
  const [entries, setEntries] = useState<DirEntry[]>([])
  const [file, setFile] = useState<{ rel: string; content: string } | null>(null)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)

  const fail = (e: unknown): void => setMsg({ ok: false, text: errorMessage(e) })

  useEffect(() => {
    window.api.fs.listRoots().then((r) => {
      setRoots(r)
      setRoot(r[0] ?? null)
    }, fail)
  }, [])

  const refresh = useCallback(() => {
    if (!root) return setEntries([])
    window.api.fs.readDir(root, dir).then(setEntries, fail)
  }, [root, dir])
  useEffect(refresh, [refresh])

  const selectRoot = (r: string | null): void => {
    setRoot(r)
    setDir('')
    setFile(null)
  }

  const addRoot = async (): Promise<void> => {
    const r = await window.api.fs.addRoot()
    setRoots(r)
    if (!root && r.length) selectRoot(r[0])
  }

  const removeRoot = async (r: string): Promise<void> => {
    const rest = await window.api.fs.removeRoot(r)
    setRoots(rest)
    if (r === root) selectRoot(rest[0] ?? null)
  }

  const open = (e: DirEntry): void => {
    if (!root) return
    const rel = join(dir, e.name)
    if (e.isDir) {
      setDir(rel)
      return
    }
    window.api.fs.readText(root, rel).then((content) => setFile({ rel, content }), fail)
  }

  const save = (): void => {
    if (!root || !file) return
    window.api.fs.writeText(root, file.rel, file.content).then(() => setMsg({ ok: true, text: `Saved ${file.rel}` }), fail)
  }

  const exportCsv = (): void => {
    if (!root) return
    const lines = ['t_s,rpm,duty_pct,current_a']
    for (let i = 0; i < telemetry.t.length; i++) {
      lines.push(`${telemetry.t[i].toFixed(4)},${telemetry.rpm[i].toFixed(1)},${telemetry.duty[i].toFixed(2)},${telemetry.current[i].toFixed(4)}`)
    }
    const rel = join(dir, `telemetry-${new Date().toISOString().replace(/[:.]/g, '-')}.csv`)
    window.api.fs.writeText(root, rel, lines.join('\n')).then(() => {
      setMsg({ ok: true, text: `Exported ${lines.length - 1} samples to ${rel}` })
      refresh()
    }, fail)
  }

  const crumbs = dir ? dir.split('/') : []

  return (
    <Grid container spacing={1.5} sx={{ height: '100%' }}>
      <Grid size={{ xs: 12, md: 3 }} sx={{ display: 'flex' }}>
        <Panel title="Granted directories" sx={{ flex: 1 }}
          action={<Tooltip title="Grant access to a directory"><IconButton size="small" onClick={() => void addRoot()}><AddIcon fontSize="small" /></IconButton></Tooltip>}>
          {roots.length === 0 && <Typography variant="body2" color="text.secondary">No directories granted yet.</Typography>}
          <List dense disablePadding>
            {roots.map((r) => (
              <ListItemButton key={r} selected={r === root} onClick={() => selectRoot(r)}>
                <ListItemText primary={r.split(/[\\/]/).pop()} secondary={r} slotProps={{ secondary: { noWrap: true, title: r } }} />
                <IconButton size="small" edge="end" title="Revoke" onClick={(e) => { e.stopPropagation(); void removeRoot(r) }}>
                  <DeleteIcon fontSize="small" />
                </IconButton>
              </ListItemButton>
            ))}
          </List>
        </Panel>
      </Grid>

      <Grid size={{ xs: 12, md: 4 }} sx={{ display: 'flex' }}>
        <Panel sx={{ flex: 1 }}
          title={
            <Breadcrumbs sx={{ fontSize: 13 }}>
              <Link component="button" underline="hover" onClick={() => setDir('')}>{root?.split(/[\\/]/).pop() ?? '—'}</Link>
              {crumbs.map((c, i) => (
                <Link key={i} component="button" underline="hover" onClick={() => setDir(crumbs.slice(0, i + 1).join('/'))}>{c}</Link>
              ))}
            </Breadcrumbs>
          }
          action={<Button size="small" startIcon={<DownloadIcon />} disabled={!root} onClick={exportCsv}>Export CSV</Button>}>
          <Box sx={{ overflow: 'auto', flex: 1 }}>
            <List dense disablePadding>
              {entries.map((e) => (
                <ListItemButton key={e.name} onClick={() => open(e)} selected={file?.rel === join(dir, e.name)}>
                  <ListItemIcon sx={{ minWidth: 32 }}>{e.isDir ? <FolderIcon fontSize="small" /> : <FileIcon fontSize="small" />}</ListItemIcon>
                  <ListItemText primary={e.name} secondary={e.isDir ? null : `${(e.size / 1024).toFixed(1)} KB`} />
                </ListItemButton>
              ))}
            </List>
          </Box>
        </Panel>
      </Grid>

      <Grid size={{ xs: 12, md: 5 }} sx={{ display: 'flex' }}>
        <Panel sx={{ flex: 1 }} title={file?.rel ?? 'No file open'}
          action={<Button size="small" startIcon={<SaveIcon />} disabled={!file} onClick={save}>Save</Button>}>
          <Stack spacing={1} sx={{ flex: 1, minHeight: 0 }}>
            {msg && <Alert severity={msg.ok ? 'success' : 'error'} onClose={() => setMsg(null)}>{msg.text}</Alert>}
            {file && (
              <TextField multiline fullWidth value={file.content} onChange={(e) => setFile({ ...file, content: e.target.value })}
                sx={{ flex: 1, minHeight: 0, '& .MuiInputBase-root': { height: '100%', alignItems: 'flex-start', overflow: 'auto' } }}
                slotProps={{ htmlInput: { style: { fontFamily: 'monospace', fontSize: 12 } } }} />
            )}
          </Stack>
        </Panel>
      </Grid>
    </Grid>
  )
}
