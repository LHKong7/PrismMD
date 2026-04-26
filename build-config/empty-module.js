// Empty stub for uninstalled optional peer dependencies.
// Used by vite.main.config.ts to alias modules that are imported at the
// top level of bundled code but never actually called at runtime.
// Exports named stubs that throw if actually invoked.
function stub() {
  throw new Error('Stub: optional dependency not installed')
}
export const S3Client = stub
export const GetObjectCommand = stub
export const PutObjectCommand = stub
export const ListObjectsV2Command = stub
export default stub
