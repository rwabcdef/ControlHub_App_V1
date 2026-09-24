import { createTheme } from '@mui/material/styles'

// Series colours used consistently by gauges and charts.
export const SERIES_COLORS = {
  rpm: '#4fc3f7',
  duty: '#ffb74d',
  current: '#e57373'
} as const

export const theme = createTheme({
  palette: {
    mode: 'dark',
    primary: { main: '#4fc3f7' },
    background: { default: '#0e1116', paper: '#161b22' }
  },
  typography: {
    // System fonts: no network fetches, consistent on Windows and Linux.
    fontFamily: 'system-ui, "Segoe UI", Ubuntu, "Helvetica Neue", Arial, sans-serif',
    fontSize: 13
  },
  shape: { borderRadius: 6 },
  components: {
    MuiPaper: { styleOverrides: { root: { backgroundImage: 'none' } } },
    MuiButton: { defaultProps: { size: 'small' } },
    MuiTextField: { defaultProps: { size: 'small' } },
    MuiSelect: { defaultProps: { size: 'small' } }
  }
})
