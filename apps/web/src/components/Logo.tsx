export default function Logo({ variant = 'dark', height = 44 }: {
  variant?: 'dark' | 'light'
  height?: number
}) {
  const scale = height / 44
  const w = Math.round(120 * scale)
  const h = height

  const c1 = variant === 'dark' ? '#d4b8e8' : '#d4a5d8'
  const c2 = variant === 'dark' ? '#b07cc6' : '#8b5e9e'
  const c3 = variant === 'dark' ? '#c4a0d8' : '#b07cc6'
  const label1 = variant === 'dark' ? 'white' : '#2d1040'
  const label2 = variant === 'dark' ? '#d4b8e8' : '#8b5e9e'

  return (
    <svg width={w} height={h} viewBox="0 0 120 44" fill="none" xmlns="http://www.w3.org/2000/svg" aria-label="VårdNära">
      {/* Three overlapping family circles */}
      <circle cx="16" cy="22" r="13" fill={c1} opacity="0.65"/>
      <circle cx="29" cy="16" r="12" fill={c2} opacity="0.9"/>
      <circle cx="40" cy="25" r="10" fill={c3} opacity="0.75"/>
      {/* Shared heart in the overlap */}
      <path
        d="M28 24 C28 24 23 19 23 16 C23 14 24.5 13 26 13.5 C27 13.9 27.6 14.7 28 15.5 C28.4 14.7 29 13.9 30 13.5 C31.5 13 33 14 33 16 C33 19 28 24 28 24Z"
        fill="white"
        opacity="0.95"
      />
      {/* Wordmark */}
      <text x="58" y="17" fontFamily="-apple-system, 'Helvetica Neue', sans-serif" fontSize="9" fontWeight="800" fill={label1} letterSpacing="0.5">VÅRD</text>
      <text x="56" y="34" fontFamily="-apple-system, 'Helvetica Neue', sans-serif" fontSize="16" fontWeight="300" fill={label2} letterSpacing="1.5">NÄRA</text>
    </svg>
  )
}
