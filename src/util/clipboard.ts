export async function copyToClipboard(
  text: string,
  onSuccess?: () => void,
  onError?: (e: unknown) => void,
) {
  try {
    await navigator.clipboard.writeText(text)
    onSuccess?.()
  } catch (e) {
    console.error(e)
    onError?.(e)
  }
}
