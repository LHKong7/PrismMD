export function ReadingProgress() {
  // Progress is set via CSS variable from useReadingProgress hook
  return (
    <div
      className="absolute top-0 left-0 right-0 z-40 h-[3px]"
      style={{ backgroundColor: 'transparent' }}
    >
      <div
        className="h-full transition-[width] duration-150 ease-out"
        id="reading-progress-bar"
        style={{
          width: '0%',
          backgroundColor: 'var(--progress-bar)',
        }}
      />
    </div>
  )
}
