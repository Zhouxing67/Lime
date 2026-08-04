import SearchRoundedIcon from "@mui/icons-material/SearchRounded"
import { TextField, type SxProps, type Theme } from "@mui/material"
import type { KeyboardEvent, ReactNode } from "react"

/** The app's one search-box look: outlined small, radius 1, 0.8rem, leading
 *  search icon. Layout (width/flex/position) comes from the caller via `sx`. */
interface SearchFieldProps {
  placeholder: string
  value?: string
  defaultValue?: string
  onChange?: (v: string) => void
  onKeyDown?: (e: KeyboardEvent<HTMLInputElement>) => void
  minWidth?: number
  sx?: SxProps<Theme>
  endAdornment?: ReactNode
}

export default function SearchField({
  placeholder,
  value,
  defaultValue,
  onChange,
  onKeyDown,
  minWidth = 200,
  sx,
  endAdornment
}: SearchFieldProps) {
  return (
    <TextField
      size="small"
      variant="outlined"
      placeholder={placeholder}
      value={value}
      defaultValue={defaultValue}
      onChange={
        onChange ? (e) => onChange(e.target.value) : undefined
      }
      onKeyDown={onKeyDown}
      sx={{
        minWidth,
        ...sx,
        "& .MuiOutlinedInput-root": {
          borderRadius: 1,
          fontSize: "0.8rem"
        }
      }}
      InputProps={{
        startAdornment: (
          <SearchRoundedIcon
            sx={{ fontSize: 16, mr: 0.5, color: "text.disabled" }}
          />
        ),
        endAdornment
      }}
    />
  )
}
